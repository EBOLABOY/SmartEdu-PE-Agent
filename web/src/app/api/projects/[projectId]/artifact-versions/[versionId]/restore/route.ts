import {
  artifactVersionsResponseSchema,
  projectIdSchema,
} from "@/lib/lesson-authoring-contract";
import {
  ArtifactRestoreError,
  restoreArtifactVersionByProject,
} from "@/lib/persistence/artifact-restore-store";
import {
  createSupabaseServerClient,
  hasSupabasePublicEnv,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ projectId: string; versionId: string }> },
) {
  const { projectId, versionId } = await context.params;
  const parsedProjectId = projectIdSchema.safeParse(projectId);
  const parsedVersionId = projectIdSchema.safeParse(versionId);

  if (!parsedProjectId.success || !parsedVersionId.success) {
    return Response.json(
      {
        error: "项目 ID 或版本 ID 不合法。",
        details: {
          projectId: parsedProjectId.success ? undefined : parsedProjectId.error.flatten(),
          versionId: parsedVersionId.success ? undefined : parsedVersionId.error.flatten(),
        },
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
    return Response.json({ error: "当前会话未登录，无法恢复项目 Artifact 版本。" }, { status: 401 });
  }

  try {
    const versions = await restoreArtifactVersionByProject(supabase, {
      projectId: parsedProjectId.data,
      versionId: parsedVersionId.data,
      requestId: crypto.randomUUID(),
    });

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
    const status =
      error instanceof ArtifactRestoreError ? error.status : 500;

    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "恢复 Artifact 版本失败。",
      },
      { status },
    );
  }
}
