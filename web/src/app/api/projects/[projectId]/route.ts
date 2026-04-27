import {
  projectDirectoryResponseSchema,
  projectIdSchema,
} from "@/lib/lesson-authoring-contract";
import {
  listProjectsForUser,
} from "@/lib/persistence/project-workspace-history";
import {
  ProjectAuthorizationError,
  requireProjectWriteAccess,
} from "@/lib/persistence/project-authorization";
import {
  createSupabaseServerClient,
  hasSupabasePublicEnv,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function DELETE(
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
    return Response.json({ error: "当前会话未登录，无法删除历史教案。" }, { status: 401 });
  }

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
    if (error instanceof ProjectAuthorizationError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    return Response.json(
      {
        error: error instanceof Error ? error.message : "删除历史教案失败。",
      },
      { status: 500 },
    );
  }
}
