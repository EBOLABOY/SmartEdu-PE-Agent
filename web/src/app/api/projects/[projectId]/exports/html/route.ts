import { createHash } from "node:crypto";

import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import {
  exportHtmlRequestBodySchema,
  exportHtmlResponseSchema,
  projectIdSchema,
} from "@/lib/lesson-authoring-contract";
import { EXPORT_HTML_REQUEST_MAX_BYTES, jsonRequestErrorResponse, readJsonRequest } from "@/lib/api/request";
import { toIsoDateTime } from "@/lib/date-time";
import {
  ProjectAuthorizationError,
  requireProjectWriteAccess,
} from "@/lib/persistence/project-authorization";
import {
  createSupabaseServerClient,
  hasSupabasePublicEnv,
} from "@/lib/supabase/server";
import type { SmartEduSupabaseClient } from "@/lib/supabase/typed-client";

export const runtime = "nodejs";

const HTML_CONTENT_TYPE = "text/html;charset=utf-8" as const;
const R2_PROVIDER = "cloudflare-r2" as const;

type ExportFileRow = {
  artifact_version_id: string | null;
  bucket: string;
  byte_size: number | null;
  checksum: string | null;
  content_type: string;
  created_at: string;
  id: string;
  object_key: string;
  project_id: string;
  provider: typeof R2_PROVIDER;
};

class ExportHtmlRouteError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ExportHtmlRouteError";
  }
}

function getR2Config() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const bucket = process.env.CLOUDFLARE_R2_EXPORT_BUCKET;
  const endpoint =
    process.env.CLOUDFLARE_R2_ENDPOINT ??
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;

  if (!accountId || !bucket || !endpoint || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return {
    accessKeyId,
    bucket,
    endpoint,
    secretAccessKey,
  };
}

function sanitizeFilename(filename: string | undefined) {
  const normalized = filename?.trim() || "smartedu-pe-screen.html";
  const withExtension = normalized.toLowerCase().endsWith(".html")
    ? normalized
    : `${normalized}.html`;

  return withExtension
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 120);
}

function buildObjectKey(projectId: string, filename: string) {
  const now = new Date();
  const datePath = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `projects/${projectId}/exports/${datePath}/${crypto.randomUUID()}-${filename}`;
}

async function assertArtifactVersionBelongsToProject({
  artifactVersionId,
  projectId,
  supabase,
}: {
  artifactVersionId: string | undefined;
  projectId: string;
  supabase: SmartEduSupabaseClient;
}) {
  if (!artifactVersionId) {
    return;
  }

  const { data, error } = await supabase
    .from("artifact_versions")
    .select("id")
    .eq("id", artifactVersionId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new ExportHtmlRouteError("目标 Artifact 版本不存在或不属于当前项目。", 404);
  }
}

async function removeUploadedObject({
  bucket,
  objectKey,
  s3,
}: {
  bucket: string;
  objectKey: string;
  s3: S3Client;
}) {
  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      }),
    );
  } catch (error) {
    console.warn("[export-html] cleanup-uploaded-object-failed", {
      message: error instanceof Error ? error.message : "unknown-error",
      objectKey,
    });
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
    return Response.json({ error: "当前会话未登录，无法云端导出大屏。" }, { status: 401 });
  }

  let rawBody: unknown;

  try {
    rawBody = await readJsonRequest(request, { maxBytes: EXPORT_HTML_REQUEST_MAX_BYTES });
  } catch (error) {
    return jsonRequestErrorResponse(error, "请求体必须是 JSON。");
  }

  const parsedBody = exportHtmlRequestBodySchema.safeParse(rawBody);

  if (!parsedBody.success) {
    return Response.json(
      {
        error: "大屏导出参数不合法。",
        details: parsedBody.error.flatten(),
      },
      { status: 400 },
    );
  }

  const r2Config = getR2Config();

  if (!r2Config) {
    return Response.json(
      {
        error:
          "当前环境未配置 Cloudflare R2 写入凭证，已保留本地导出兜底。",
      },
      { status: 503 },
    );
  }

  const s3 = new S3Client({
    credentials: {
      accessKeyId: r2Config.accessKeyId,
      secretAccessKey: r2Config.secretAccessKey,
    },
    endpoint: r2Config.endpoint,
    forcePathStyle: true,
    region: "auto",
  });
  let uploadedObjectKey: string | null = null;

  try {
    await requireProjectWriteAccess(supabase, parsedProjectId.data);

    await assertArtifactVersionBelongsToProject({
      artifactVersionId: parsedBody.data.artifactVersionId,
      projectId: parsedProjectId.data,
      supabase,
    });

    const htmlBuffer = Buffer.from(parsedBody.data.html, "utf8");
    const checksum = createHash("sha256").update(htmlBuffer).digest("hex");
    const filename = sanitizeFilename(parsedBody.data.filename);
    const objectKey = buildObjectKey(parsedProjectId.data, filename);

    await s3.send(
      new PutObjectCommand({
        Body: htmlBuffer,
        Bucket: r2Config.bucket,
        ContentType: HTML_CONTENT_TYPE,
        Key: objectKey,
      }),
    );
    uploadedObjectKey = objectKey;

    const { data: exportFile, error: exportFileError } = await supabase
      .from("export_files")
      .insert({
        artifact_version_id: parsedBody.data.artifactVersionId ?? null,
        bucket: r2Config.bucket,
        byte_size: htmlBuffer.byteLength,
        checksum,
        content_type: HTML_CONTENT_TYPE,
        created_by: user.id,
        object_key: objectKey,
        project_id: parsedProjectId.data,
        provider: R2_PROVIDER,
      })
      .select("*")
      .single();

    if (exportFileError) {
      throw exportFileError;
    }

    const row = exportFile as ExportFileRow;

    return Response.json(
      exportHtmlResponseSchema.parse({
        exportFile: {
          id: row.id,
          projectId: row.project_id,
          artifactVersionId: row.artifact_version_id,
          provider: row.provider,
          bucket: row.bucket,
          objectKey: row.object_key,
          contentType: HTML_CONTENT_TYPE,
          byteSize: row.byte_size ?? htmlBuffer.byteLength,
          checksum: row.checksum ?? checksum,
          createdAt: toIsoDateTime(row.created_at, "export_files.created_at"),
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
    if (uploadedObjectKey) {
      await removeUploadedObject({
        bucket: r2Config.bucket,
        objectKey: uploadedObjectKey,
        s3,
      });
    }

    const status =
      error instanceof ProjectAuthorizationError || error instanceof ExportHtmlRouteError
        ? error.status
        : 500;

    return Response.json(
      {
        error: error instanceof Error ? error.message : "云端导出大屏失败。",
      },
      { status },
    );
  }
}
