import {
  artifactVersionsResponseSchema,
  type ArtifactContentType,
  projectIdSchema,
  saveLessonArtifactVersionRequestBodySchema,
  STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
} from "@/lib/lesson-authoring-contract";
import { listArtifactVersionsByProject } from "@/lib/persistence/artifact-version-history";
import { saveArtifactVersionWithSupabase } from "@/lib/persistence/lesson-authoring-store";
import {
  createSupabaseServerClient,
  hasSupabasePublicEnv,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

function persistenceUnavailableResponse(projectId: string, reason: string) {
  return Response.json(
    artifactVersionsResponseSchema.parse({
      projectId,
      versions: [],
      persistence: {
        enabled: false,
        authenticated: false,
        reason,
      },
    }),
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const parsedProjectId = projectIdSchema.safeParse(projectId);

  if (!parsedProjectId.success) {
    return Response.json(
      {
        error: "项目 ID 不合法。",
        details: parsedProjectId.error.flatten(),
      },
      { status: 400 },
    );
  }

  if (!hasSupabasePublicEnv()) {
    return persistenceUnavailableResponse(parsedProjectId.data, "missing-supabase-env");
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return persistenceUnavailableResponse(parsedProjectId.data, "supabase-client-unavailable");
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return Response.json(
      artifactVersionsResponseSchema.parse({
        projectId: parsedProjectId.data,
        versions: [],
        persistence: {
          enabled: true,
          authenticated: false,
          reason: "missing-auth-session",
        },
      }),
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  }

  try {
    const versions = await listArtifactVersionsByProject(
      supabase,
      parsedProjectId.data,
    );

    return Response.json(
      artifactVersionsResponseSchema.parse({
        projectId: parsedProjectId.data,
        versions,
        persistence: {
          enabled: true,
          authenticated: true,
        },
      }),
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "读取 Artifact 历史失败。",
      },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const parsedProjectId = projectIdSchema.safeParse(projectId);

  if (!parsedProjectId.success) {
    return Response.json(
      {
        error: "项目 ID 不合法。",
        details: parsedProjectId.error.flatten(),
      },
      { status: 400 },
    );
  }

  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "请求体必须是 JSON。" }, { status: 400 });
  }

  const parsedBody = saveLessonArtifactVersionRequestBodySchema.safeParse(rawBody);

  if (!parsedBody.success) {
    return Response.json(
      {
        error: "保存教案版本请求体结构不合法。",
        details: parsedBody.error.flatten(),
      },
      { status: 400 },
    );
  }

  if (!hasSupabasePublicEnv()) {
    return Response.json({ error: "当前环境未启用 Supabase。" }, { status: 503 });
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return Response.json({ error: "Supabase 客户端不可用。" }, { status: 503 });
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return Response.json({ error: "当前会话未登录，无法保存教案版本。" }, { status: 401 });
  }

  const requestId = crypto.randomUUID();
  const contentType: ArtifactContentType = parsedBody.data.lessonPlan ? "lesson-json" : "markdown";
  const content =
    contentType === "lesson-json"
      ? JSON.stringify(parsedBody.data.lessonPlan)
      : parsedBody.data.markdown ?? "";

  try {
    await saveArtifactVersionWithSupabase(supabase, {
      projectId: parsedProjectId.data,
      requestId,
      artifact: {
        protocolVersion: STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
        stage: "lesson",
        contentType,
        content,
        isComplete: true,
        status: "ready",
        source: "data-part",
        title: parsedBody.data.title ?? "教案 Artifact",
        warningText: parsedBody.data.summary,
        updatedAt: new Date().toISOString(),
      },
    });

    const versions = await listArtifactVersionsByProject(supabase, parsedProjectId.data);

    return Response.json(
      artifactVersionsResponseSchema.parse({
        projectId: parsedProjectId.data,
        versions,
        persistence: {
          enabled: true,
          authenticated: true,
        },
      }),
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "保存教案版本失败。",
      },
      { status: 500 },
    );
  }
}
