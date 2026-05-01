"use server";

import { randomUUID } from "node:crypto";

import type { FullOutput } from "@mastra/core/stream";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { allowsAnonymousAiRequests } from "@/lib/api/ai-guard";
import { takeRateLimitToken } from "@/lib/api/rate-limit";
import type { CompetitionLessonPlan } from "@/lib/competition-lesson-contract";
import {
  competitionLessonPatchRequestBodySchema,
  competitionLessonPatchResponseSchema,
  type CompetitionLessonPatchResponse,
} from "@/lib/competition-lesson-patch";
import {
  DEFAULT_STANDARDS_MARKET,
  STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
  projectIdSchema,
  saveLessonArtifactVersionRequestBodySchema,
  type PersistedArtifactVersion,
  type PersistedProjectSummary,
  type UiHint,
} from "@/lib/lesson-authoring-contract";
import { listArtifactVersionsByProject } from "@/lib/persistence/artifact-version-history";
import {
  ArtifactRestoreError,
  restoreArtifactVersionByProject,
} from "@/lib/persistence/artifact-restore-store";
import { saveArtifactVersionToS3 } from "@/lib/persistence/lesson-authoring-store";
import {
  ProjectAuthorizationError,
  requireProjectWriteAccess,
} from "@/lib/persistence/project-authorization";
import {
  listProjectsForUserFromDatabase,
  refreshProjectDirectoryManifest,
  toPersistedProjectSummary,
} from "@/lib/persistence/project-workspace-history";
import type { Database } from "@/lib/supabase/database.types";
import {
  createSupabaseServerClient,
  hasSupabasePublicEnv,
} from "@/lib/supabase/server";
import { mastra } from "@/mastra";
import {
  runCompetitionLessonPatchSkill,
  type LessonPatchAgentRunner,
} from "@/mastra/skills";

export type WorkspaceActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type ExistingProjectOrganization = Pick<ProjectRow, "organization_id">;
type OrganizationMembershipRow = Database["public"]["Tables"]["organization_members"]["Row"];
type ExistingOrganizationMembership = Pick<OrganizationMembershipRow, "organization_id">;

const PATCH_RATE_LIMIT = 30;
const PATCH_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

const createProjectBodySchema = z
  .object({
    title: z.string().trim().min(1).max(160),
  })
  .strict();

function ok<T>(data: T): WorkspaceActionResult<T> {
  return { ok: true, data };
}

function fail<T>(error: string, status: number): WorkspaceActionResult<T> {
  return { ok: false, error, status };
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message || fallback;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
}

function getErrorDiagnostic(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return { message: getErrorMessage(error, "unknown-error") };
  }

  const postgrestLikeError = error as {
    code?: unknown;
    details?: unknown;
    hint?: unknown;
    message?: unknown;
    name?: unknown;
  };

  return {
    code: typeof postgrestLikeError.code === "string" ? postgrestLikeError.code : undefined,
    details: typeof postgrestLikeError.details === "string" ? postgrestLikeError.details : undefined,
    hint: typeof postgrestLikeError.hint === "string" ? postgrestLikeError.hint : undefined,
    message: getErrorMessage(error, "unknown-error"),
    name: typeof postgrestLikeError.name === "string" ? postgrestLikeError.name : undefined,
  };
}

function normalizeCreateProjectError(error: unknown) {
  const message = getErrorMessage(error, "创建项目失败。");

  if (message.includes("create_personal_workspace") || message.includes("PGRST202")) {
    return {
      message: "数据库工作区初始化函数 create_personal_workspace 尚未应用。请执行最新 Supabase migration 并刷新 schema cache。",
      status: 503,
    };
  }

  if (message === "authentication required") {
    return { message: "当前会话未登录，无法创建项目。", status: 401 };
  }

  if (message.includes("row-level security") || message.includes("violates row-level security")) {
    return { message: "数据库 RLS 拒绝创建项目，请检查组织成员关系和 projects 插入策略。", status: 403 };
  }

  return { message, status: 500 };
}

function buildRestoreUiHints(versions: PersistedArtifactVersion[]): UiHint[] {
  const restoredVersion = versions.find((version) => version.isCurrent);

  if (!restoredVersion) {
    return [
      {
        action: "show_toast",
        params: {
          level: "success",
          title: "版本已恢复",
        },
      },
    ];
  }

  const versionTitle = restoredVersion.title ?? "课时计划版本";
  const isLesson = restoredVersion.stage === "lesson";

  return [
    {
      action: "show_toast",
      params: {
        level: "success",
        title: "版本已恢复",
        description: isLesson
          ? `已将“${versionTitle}”恢复为当前课时计划版本，原互动大屏已失效，请重新生成。`
          : `已将“${versionTitle}”恢复为当前互动大屏版本。`,
      },
    },
    {
      action: "switch_tab",
      params: {
        tab: isLesson ? "lesson" : "canvas",
      },
    },
  ];
}

function resolveLessonArtifactTitle(...candidates: Array<string | undefined>) {
  const genericTitles = new Set(["XXX", "课时计划 Artifact"]);
  const title = candidates
    .map((candidate) => candidate?.replace(/\s+/g, " ").trim())
    .find(
      (candidate): candidate is string =>
        typeof candidate === "string" &&
        candidate.length > 0 &&
        !genericTitles.has(candidate),
    );

  if (!title) {
    return "课时计划 Artifact";
  }

  if (title.length <= 120) {
    return title;
  }

  return `${title.slice(0, 119).trimEnd()}…`;
}

async function getAuthenticatedSupabaseContext() {
  if (!hasSupabasePublicEnv()) {
    return fail<never>("当前环境未启用 Supabase。", 503);
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return fail<never>("Supabase 客户端不可用。", 503);
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return fail<never>("当前会话未登录。", 401);
  }

  return ok({ supabase, user });
}

async function takePatchRateLimitForActor(userId?: string) {
  const headerStore = await headers();
  const forwardedFor = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = headerStore.get("x-real-ip")?.trim();
  const actorKey = userId ? `user:${userId}` : `ip:${forwardedFor || realIp || "unknown"}`;

  return takeRateLimitToken({
    key: actorKey,
    limit: PATCH_RATE_LIMIT,
    windowMs: PATCH_RATE_LIMIT_WINDOW_MS,
  });
}

export async function createProjectAction(
  title: string,
): Promise<
  WorkspaceActionResult<{
    project: PersistedProjectSummary;
    projects: PersistedProjectSummary[];
  }>
> {
  const parsedBody = createProjectBodySchema.safeParse({ title });

  if (!parsedBody.success) {
    return fail("项目创建参数不合法。", 400);
  }

  const context = await getAuthenticatedSupabaseContext();

  if (!context.ok) {
    return context;
  }

  const { supabase, user } = context.data;

  try {
    const { data: existingProjects, error: existingProjectsError } = await supabase
      .from("projects")
      .select("organization_id")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1);

    if (existingProjectsError) {
      throw existingProjectsError;
    }

    let organizationId = (existingProjects as ExistingProjectOrganization[] | null | undefined)?.[0]
      ?.organization_id;

    if (!organizationId) {
      const { data: existingMemberships, error: existingMembershipsError } = await supabase
        .from("organization_members")
        .select("organization_id")
        .order("created_at", { ascending: true })
        .limit(1);

      if (existingMembershipsError) {
        throw existingMembershipsError;
      }

      organizationId = (existingMemberships as ExistingOrganizationMembership[] | null | undefined)?.[0]
        ?.organization_id;
    }

    if (!organizationId) {
      const { data: newOrganizationId, error: newOrganizationError } = await supabase.rpc(
        "create_personal_workspace",
        {
          workspace_name: "个人工作区",
        },
      );

      if (newOrganizationError || !newOrganizationId) {
        throw newOrganizationError ?? new Error("创建个人工作区失败。");
      }

      organizationId = newOrganizationId;
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert({
        organization_id: organizationId,
        owner_id: user.id,
        title: parsedBody.data.title,
        market: DEFAULT_STANDARDS_MARKET,
      })
      .select("*")
      .single();

    if (projectError) {
      throw projectError;
    }

    const projects = await refreshProjectDirectoryManifest(
      supabase,
      user.id,
      await listProjectsForUserFromDatabase(supabase),
    );
    revalidatePath("/");

    return ok({
      project: toPersistedProjectSummary(project as ProjectRow),
      projects,
    });
  } catch (error) {
    const normalizedError = normalizeCreateProjectError(error);

    console.warn("[workspace-action] create-project-failed", {
      ...getErrorDiagnostic(error),
      userId: user.id,
    });

    return fail(normalizedError.message, normalizedError.status);
  }
}

export async function deleteProjectAction(
  projectId: string,
): Promise<WorkspaceActionResult<{ projects: PersistedProjectSummary[] }>> {
  const parsedProjectId = projectIdSchema.safeParse(projectId);

  if (!parsedProjectId.success) {
    return fail("项目 ID 不合法。", 400);
  }

  const context = await getAuthenticatedSupabaseContext();

  if (!context.ok) {
    return context;
  }

  const { supabase, user } = context.data;

  try {
    await requireProjectWriteAccess(supabase, parsedProjectId.data);

    const archivedAt = new Date().toISOString();
    const { error: archiveError } = await supabase
      .from("projects")
      .update({
        archived_at: archivedAt,
        updated_at: archivedAt,
      })
      .eq("id", parsedProjectId.data)
      .is("archived_at", null);

    if (archiveError) {
      throw archiveError;
    }

    const projects = await refreshProjectDirectoryManifest(
      supabase,
      user.id,
      await listProjectsForUserFromDatabase(supabase),
    );
    revalidatePath("/");

    return ok({ projects });
  } catch (error) {
    if (error instanceof ProjectAuthorizationError) {
      return fail(error.message, error.status);
    }

    return fail(error instanceof Error ? error.message : "删除项目失败。", 500);
  }
}

export async function saveLessonArtifactVersionAction(input: {
  lessonPlan: CompetitionLessonPlan;
  projectId: string;
  summary?: string;
  title?: string;
}): Promise<WorkspaceActionResult<{ versions: PersistedArtifactVersion[] }>> {
  const parsedProjectId = projectIdSchema.safeParse(input.projectId);

  if (!parsedProjectId.success) {
    return fail("项目 ID 不合法。", 400);
  }

  const parsedBody = saveLessonArtifactVersionRequestBodySchema.safeParse({
    lessonPlan: input.lessonPlan,
    summary: input.summary,
    title: input.title,
  });

  if (!parsedBody.success) {
    return fail("保存课时计划版本的请求体不合法。", 400);
  }

  const context = await getAuthenticatedSupabaseContext();

  if (!context.ok) {
    return context;
  }

  const { supabase, user } = context.data;

  try {
    await requireProjectWriteAccess(supabase, parsedProjectId.data);

    await saveArtifactVersionToS3(supabase, {
      projectId: parsedProjectId.data,
      requestId: randomUUID(),
      userId: user.id,
      artifact: {
        protocolVersion: STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
        stage: "lesson",
        contentType: "lesson-json",
        content: JSON.stringify(parsedBody.data.lessonPlan),
        isComplete: true,
        status: "ready",
        source: "data-part",
        title: resolveLessonArtifactTitle(
          parsedBody.data.title,
          parsedBody.data.lessonPlan.title,
        ),
        warningText: parsedBody.data.summary,
        updatedAt: new Date().toISOString(),
      },
    });

    const versions = await listArtifactVersionsByProject(supabase, parsedProjectId.data);
    revalidatePath("/");

    return ok({ versions });
  } catch (error) {
    if (error instanceof ProjectAuthorizationError) {
      return fail(error.message, error.status);
    }

    return fail(error instanceof Error ? error.message : "保存课时计划版本失败。", 500);
  }
}

export async function restoreArtifactVersionAction(input: {
  projectId: string;
  versionId: string;
}): Promise<
  WorkspaceActionResult<{
    uiHints: UiHint[];
    versions: PersistedArtifactVersion[];
  }>
> {
  const parsedProjectId = projectIdSchema.safeParse(input.projectId);
  const parsedVersionId = projectIdSchema.safeParse(input.versionId);

  if (!parsedProjectId.success || !parsedVersionId.success) {
    return fail("项目 ID 或版本 ID 不合法。", 400);
  }

  const context = await getAuthenticatedSupabaseContext();

  if (!context.ok) {
    return context;
  }

  const { supabase, user } = context.data;

  try {
    const versions = await restoreArtifactVersionByProject(supabase, {
      projectId: parsedProjectId.data,
      requestId: randomUUID(),
      versionId: parsedVersionId.data,
    });
    await refreshProjectDirectoryManifest(supabase, user.id);
    revalidatePath("/");

    return ok({
      uiHints: buildRestoreUiHints(versions),
      versions,
    });
  } catch (error) {
    if (error instanceof ArtifactRestoreError) {
      return fail(error.message, error.status);
    }

    return fail(error instanceof Error ? error.message : "恢复 Artifact 版本失败。", 500);
  }
}

export async function generateCompetitionLessonPatchAction(input: {
  instruction: string;
  lessonPlan: CompetitionLessonPlan;
  targetPaths?: string[];
}): Promise<WorkspaceActionResult<CompetitionLessonPatchResponse>> {
  const parsedBody = competitionLessonPatchRequestBodySchema.safeParse(input);

  if (!parsedBody.success) {
    return fail("结构化课时计划局部修改请求体不合法。", 400);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

    if (!user && !allowsAnonymousAiRequests()) {
      return fail("Please sign in before using AI patch generation.", 401);
    }

    const rateLimit = await takePatchRateLimitForActor(user?.id);

    if (!rateLimit.ok) {
      return fail("AI patch requests are too frequent. Please retry later.", 429);
    }

    const patchAgent = mastra.getAgent("lessonPatchAgent");
    const agentGenerate: LessonPatchAgentRunner = async (messages, options) =>
      (await patchAgent.generate(messages, options)) as FullOutput<unknown>;
    const response = await runCompetitionLessonPatchSkill(parsedBody.data, {
      agentGenerate,
      maxSteps: 2,
      requestId: randomUUID(),
    });

    return ok(competitionLessonPatchResponseSchema.parse(response));
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "结构化课时计划局部修改失败。",
      502,
    );
  }
}
