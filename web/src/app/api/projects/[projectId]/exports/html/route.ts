import { createHash } from "node:crypto";

import { getS3ObjectStorageConfig } from "@/lib/s3/object-storage-config";
import {
  deleteS3Object,
  putS3Object,
  type S3RestConfig,
} from "@/lib/s3/s3-rest-client";
import {
  exportHtmlRequestBodySchema,
  exportHtmlResponseSchema,
  projectIdSchema,
} from "@/lib/lesson-authoring-contract";
import {
  EXPORT_HTML_REQUEST_MAX_BYTES,
  jsonRequestErrorResponse,
  readJsonRequest,
} from "@/lib/api/request";
import { injectBrowserSandboxCsp } from "@/lib/browser-sandbox-html";
import { toIsoDateTime } from "@/lib/date-time";
import {
  ProjectAuthorizationError,
  requireProjectWriteAccess,
} from "@/lib/persistence/project-authorization";
import {
  createSupabaseServerClient,
  hasSupabasePublicEnv,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

const HTML_CONTENT_TYPE = "text/html;charset=utf-8" as const;
const S3_PROVIDER = "s3-compatible" as const;

type ExportFileRow = {
  bucket: string;
  byte_size: number | null;
  checksum: string | null;
  content_type: string;
  created_at: string;
  id: string;
  object_key: string;
  project_id: string;
  provider: typeof S3_PROVIDER;
};

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

function buildAttachmentContentDisposition(filename: string) {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

async function removeUploadedObject({
  bucket,
  config,
  objectKey,
}: {
  bucket: string;
  objectKey: string;
  config: S3RestConfig;
}) {
  try {
    await deleteS3Object({
      config: {
        ...config,
        bucket,
      },
      key: objectKey,
    });
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

  const s3Config = getS3ObjectStorageConfig("export");

  if (!s3Config) {
    return Response.json(
      {
        error:
          "当前环境未配置 S3 对象存储写入凭证，已保留本地导出兜底。",
      },
      { status: 503 },
    );
  }

  let uploadedObjectKey: string | null = null;

  try {
    await requireProjectWriteAccess(supabase, parsedProjectId.data);

    const filename = sanitizeFilename(parsedBody.data.filename);
    const securedHtml = injectBrowserSandboxCsp(parsedBody.data.html, {
      imageSourceOrigin: new URL(request.url).origin,
    });
    const htmlBuffer = Buffer.from(securedHtml, "utf8");
    const checksum = createHash("sha256").update(htmlBuffer).digest("hex");
    const objectKey = buildObjectKey(parsedProjectId.data, filename);

    await putS3Object({
      body: htmlBuffer,
      config: s3Config,
      contentDisposition: buildAttachmentContentDisposition(filename),
      contentType: HTML_CONTENT_TYPE,
      key: objectKey,
    });
    uploadedObjectKey = objectKey;

    const { data: exportFile, error: exportFileError } = await supabase
      .from("export_files")
      .insert({
        bucket: s3Config.bucket,
        byte_size: htmlBuffer.byteLength,
        checksum,
        content_type: HTML_CONTENT_TYPE,
        created_by: user.id,
        object_key: objectKey,
        project_id: parsedProjectId.data,
        provider: S3_PROVIDER,
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
        bucket: s3Config.bucket,
        config: s3Config,
        objectKey: uploadedObjectKey,
      });
    }

    const status = error instanceof ProjectAuthorizationError ? error.status : 500;

    return Response.json(
      {
        error: error instanceof Error ? error.message : "云端导出大屏失败。",
      },
      { status },
    );
  }
}
