import { createHash } from "node:crypto";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import {
  exportHtmlRequestBodySchema,
  exportHtmlResponseSchema,
  projectIdSchema,
} from "@/lib/lesson-authoring-contract";
import {
  createSupabaseServerClient,
  hasSupabasePublicEnv,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

const HTML_CONTENT_TYPE = "text/html;charset=utf-8" as const;
const R2_PROVIDER = "cloudflare-r2" as const;

type LooseQueryClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

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
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "请求体必须是 JSON。" }, { status: 400 });
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

  const htmlBuffer = Buffer.from(parsedBody.data.html, "utf8");
  const checksum = createHash("sha256").update(htmlBuffer).digest("hex");
  const filename = sanitizeFilename(parsedBody.data.filename);
  const objectKey = buildObjectKey(parsedProjectId.data, filename);

  try {
    const s3 = new S3Client({
      credentials: {
        accessKeyId: r2Config.accessKeyId,
        secretAccessKey: r2Config.secretAccessKey,
      },
      endpoint: r2Config.endpoint,
      forcePathStyle: true,
      region: "auto",
    });

    await s3.send(
      new PutObjectCommand({
        Body: htmlBuffer,
        Bucket: r2Config.bucket,
        ContentType: HTML_CONTENT_TYPE,
        Key: objectKey,
      }),
    );

    const client = supabase as unknown as LooseQueryClient;
    const { data: exportFile, error: exportFileError } = await client
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
          createdAt: row.created_at,
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
        error: error instanceof Error ? error.message : "云端导出大屏失败。",
      },
      { status: 500 },
    );
  }
}
