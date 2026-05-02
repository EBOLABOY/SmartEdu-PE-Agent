import { projectIdSchema } from "@/lib/lesson-authoring-contract";
import {
  ProjectAuthorizationError,
  requireProjectWriteAccess,
} from "@/lib/persistence/project-authorization";
import {
  ArtifactImagePathError,
  parseArtifactImageProxyPath,
} from "@/lib/s3/artifact-image-url";
import { getS3ObjectStorageConfig } from "@/lib/s3/object-storage-config";
import {
  getS3Object,
  S3ObjectNotFoundError,
} from "@/lib/s3/s3-rest-client";
import {
  createSupabaseServerClient,
  hasSupabasePublicEnv,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

const DEFAULT_IMAGE_CONTENT_TYPE = "image/png";

function jsonError(error: string, status: number, details?: unknown) {
  return Response.json(
    {
      error,
      ...(details ? { details } : {}),
    },
    { status },
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ path?: string[]; projectId: string }> },
) {
  const { path = [], projectId } = await context.params;
  const parsedProjectId = projectIdSchema.safeParse(projectId);

  if (!parsedProjectId.success) {
    return jsonError("项目 ID 不合法。", 400, parsedProjectId.error.flatten());
  }

  let parsedPath: ReturnType<typeof parseArtifactImageProxyPath>;

  try {
    parsedPath = parseArtifactImageProxyPath({
      path,
      projectId: parsedProjectId.data,
    });
  } catch (error) {
    if (error instanceof ArtifactImagePathError) {
      return jsonError(error.message, 400);
    }

    throw error;
  }

  if (!hasSupabasePublicEnv()) {
    return jsonError("当前环境未启用 Supabase。", 503);
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return jsonError("Supabase 客户端不可用。", 503);
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return jsonError("当前会话未登录，无法读取项目图片。", 401);
  }

  const s3Config = getS3ObjectStorageConfig("artifact");

  if (!s3Config) {
    return jsonError("当前环境未配置 S3 artifact 对象存储读取凭证。", 503);
  }

  try {
    await requireProjectWriteAccess(supabase, parsedProjectId.data);

    const object = await getS3Object({
      config: s3Config,
      key: parsedPath.objectKey,
    });
    const contentType = object.contentType?.startsWith("image/")
      ? object.contentType
      : DEFAULT_IMAGE_CONTENT_TYPE;
    const headers = new Headers({
      "cache-control": "private, max-age=3600",
      "content-type": contentType,
      "x-content-type-options": "nosniff",
    });

    if (object.contentLength) {
      headers.set("content-length", object.contentLength);
    }

    return new Response(new Uint8Array(object.body), {
      headers,
      status: 200,
    });
  } catch (error) {
    if (error instanceof ProjectAuthorizationError) {
      return jsonError(error.message, error.status);
    }

    if (error instanceof S3ObjectNotFoundError) {
      return jsonError("项目图片不存在或已被清理。", 404);
    }

    console.error("[artifact-images] read-failed", {
      message: error instanceof Error ? error.message : "unknown-error",
      objectKey: parsedPath.objectKey,
    });

    return jsonError("项目图片读取失败。", 500);
  }
}
