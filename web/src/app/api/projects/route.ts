import { z } from "zod";

import {
  DEFAULT_STANDARDS_MARKET,
  projectDirectoryResponseSchema,
  projectWorkspaceResponseSchema,
} from "@/lib/lesson-authoring-contract";
import {
  listProjectsForUser,
  toPersistedProjectSummary,
} from "@/lib/persistence/project-workspace-history";
import {
  createSupabaseServerClient,
  hasSupabasePublicEnv,
} from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type ExistingProjectOrganization = Pick<ProjectRow, "organization_id">;
type RpcClient = {
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: string | null; error: Error | null }>;
};
type LooseQueryClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

const createProjectBodySchema = z
  .object({
    title: z.string().trim().min(1).max(160),
  })
  .strict();

export async function GET() {
  if (!hasSupabasePublicEnv()) {
    return Response.json(
      projectDirectoryResponseSchema.parse({
        projects: [],
        persistence: {
          enabled: false,
          authenticated: false,
          reason: "missing-supabase-env",
        },
      }),
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return Response.json(
      projectDirectoryResponseSchema.parse({
        projects: [],
        persistence: {
          enabled: false,
          authenticated: false,
          reason: "supabase-client-unavailable",
        },
      }),
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return Response.json(
      projectDirectoryResponseSchema.parse({
        projects: [],
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
    const projects = await listProjectsForUser(supabase);

    return Response.json(
      projectDirectoryResponseSchema.parse({
        projects,
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
        error: error instanceof Error ? error.message : "读取项目列表失败。",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
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
    return Response.json({ error: "当前会话未登录，无法创建项目。" }, { status: 401 });
  }

  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "请求体必须是 JSON。" }, { status: 400 });
  }

  const parsedBody = createProjectBodySchema.safeParse(rawBody);

  if (!parsedBody.success) {
    return Response.json(
      {
        error: "项目创建参数不合法。",
        details: parsedBody.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const client = supabase as unknown as LooseQueryClient;
    const { data: existingProjects, error: existingProjectsError } = await client
      .from("projects")
      .select("organization_id")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1);

    if (existingProjectsError) {
      throw existingProjectsError;
    }

    let organizationId =
      (existingProjects as ExistingProjectOrganization[] | null | undefined)?.[0]?.organization_id ?? null;

    if (!organizationId) {
      const rpcClient = supabase as unknown as RpcClient;
      const { data: newOrganizationId, error: newOrganizationError } = await rpcClient.rpc(
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

    const { data: project, error: projectError } = await client
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

    return Response.json(
      projectWorkspaceResponseSchema.parse({
        project: toPersistedProjectSummary(project as ProjectRow),
        conversation: null,
        messages: [],
        persistence: {
          enabled: true,
          authenticated: true,
        },
      }),
      {
        status: 201,
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "创建项目失败。",
      },
      { status: 500 },
    );
  }
}
