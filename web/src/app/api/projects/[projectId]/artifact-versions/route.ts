import {
  artifactVersionsResponseSchema,
  projectIdSchema,
} from "@/lib/lesson-authoring-contract";
import { listArtifactVersionsByProject } from "@/lib/persistence/artifact-version-history";
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
    return Response.json(
      artifactVersionsResponseSchema.parse({
        projectId: parsedProjectId.data,
        versions: [],
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
      artifactVersionsResponseSchema.parse({
        projectId: parsedProjectId.data,
        versions: [],
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
