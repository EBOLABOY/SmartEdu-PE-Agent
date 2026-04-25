import {
  projectIdSchema,
  projectWorkspaceResponseSchema,
} from "@/lib/lesson-authoring-contract";
import { getProjectWorkspaceHistory } from "@/lib/persistence/project-workspace-history";
import {
  createSupabaseServerClient,
  hasSupabasePublicEnv,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

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
    return Response.json({ error: "当前会话未登录，无法读取项目工作区历史。" }, { status: 401 });
  }

  try {
    const workspace = await getProjectWorkspaceHistory(supabase, parsedProjectId.data);

    return Response.json(
      projectWorkspaceResponseSchema.parse({
        ...workspace,
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
        error: error instanceof Error ? error.message : "读取项目工作区历史失败。",
      },
      { status: 500 },
    );
  }
}
