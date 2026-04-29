import { createHash } from "node:crypto";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import type { Database } from "@/lib/supabase/database.types";

const ARTIFACT_CONTENT_R2_PROVIDER = "cloudflare-r2" as const;
const INLINE_CONTENT_PROVIDER = "inline" as const;

type ArtifactVersionRow = Database["public"]["Tables"]["artifact_versions"]["Row"];

type ArtifactContentStorageConfig = {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  secretAccessKey: string;
};

export type ArtifactContentStorageProvider =
  | typeof ARTIFACT_CONTENT_R2_PROVIDER
  | typeof INLINE_CONTENT_PROVIDER;

export type OffloadedArtifactContent = {
  bucket: string;
  byteSize: number;
  checksum: string;
  objectKey: string;
  provider: typeof ARTIFACT_CONTENT_R2_PROVIDER;
};

function getArtifactContentStorageConfig():
  | ArtifactContentStorageConfig
  | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const bucket =
    process.env.CLOUDFLARE_R2_ARTIFACT_BUCKET ??
    process.env.CLOUDFLARE_R2_EXPORT_BUCKET;
  const endpoint =
    process.env.CLOUDFLARE_R2_ENDPOINT ??
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;

  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return {
    accessKeyId,
    bucket,
    endpoint,
    secretAccessKey,
  };
}

function createR2Client(config: ArtifactContentStorageConfig) {
  return new S3Client({
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    endpoint: config.endpoint,
    forcePathStyle: true,
    region: "auto",
  });
}

function getArtifactPayloadContentType(
  contentType: ArtifactVersionRow["content_type"],
) {
  return contentType === "html"
    ? "text/html;charset=utf-8"
    : "application/json;charset=utf-8";
}

function getArtifactPayloadExtension(
  contentType: ArtifactVersionRow["content_type"],
) {
  return contentType === "html" ? "html" : "json";
}

function buildArtifactContentObjectKey(input: {
  contentType: ArtifactVersionRow["content_type"];
  projectId: string;
  stage: ArtifactVersionRow["stage"];
  versionId: string;
}) {
  const extension = getArtifactPayloadExtension(input.contentType);

  return `projects/${input.projectId}/versions/${input.versionId}/${input.stage}.${extension}`;
}

async function streamBodyToString(
  body:
    | AsyncIterable<Uint8Array | string>
    | {
        transformToString?: (encoding?: string) => Promise<string>;
      }
    | undefined,
) {
  if (!body) {
    return "";
  }

  if ("transformToString" in body && typeof body.transformToString === "function") {
    return body.transformToString("utf8");
  }

  const chunks: Uint8Array[] = [];

  for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
    if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk));
      continue;
    }

    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

export function canOffloadArtifactContent() {
  return getArtifactContentStorageConfig() !== null;
}

export async function uploadArtifactContent(input: {
  content: string;
  contentType: ArtifactVersionRow["content_type"];
  projectId: string;
  stage: ArtifactVersionRow["stage"];
  versionId: string;
}): Promise<OffloadedArtifactContent | null> {
  const config = getArtifactContentStorageConfig();

  if (!config) {
    return null;
  }

  const buffer = Buffer.from(input.content, "utf8");
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const objectKey = buildArtifactContentObjectKey(input);
  const client = createR2Client(config);

  await client.send(
    new PutObjectCommand({
      Body: buffer,
      Bucket: config.bucket,
      ContentType: getArtifactPayloadContentType(input.contentType),
      Key: objectKey,
    }),
  );

  return {
    provider: ARTIFACT_CONTENT_R2_PROVIDER,
    bucket: config.bucket,
    objectKey,
    byteSize: buffer.byteLength,
    checksum,
  };
}

export async function deleteOffloadedArtifactContent(
  content: OffloadedArtifactContent,
) {
  const config = getArtifactContentStorageConfig();

  if (!config) {
    return;
  }

  const client = createR2Client(config);

  await client.send(
    new DeleteObjectCommand({
      Bucket: content.bucket,
      Key: content.objectKey,
    }),
  );
}

export async function resolveArtifactVersionContent(
  row: Pick<
    ArtifactVersionRow,
    | "content"
    | "content_storage_bucket"
    | "content_storage_object_key"
    | "content_storage_provider"
  >,
) {
  if (
    row.content_storage_provider !== ARTIFACT_CONTENT_R2_PROVIDER ||
    !row.content_storage_bucket ||
    !row.content_storage_object_key
  ) {
    return row.content;
  }

  const config = getArtifactContentStorageConfig();

  if (!config) {
    if (row.content) {
      return row.content;
    }

    throw new Error("artifact payload storage is not configured");
  }

  const client = createR2Client(config);
  const response = await client.send(
    new GetObjectCommand({
      Bucket: row.content_storage_bucket,
      Key: row.content_storage_object_key,
    }),
  );

  return streamBodyToString(response.Body);
}
