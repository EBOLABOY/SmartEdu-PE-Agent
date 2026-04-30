import { createHash } from "node:crypto";

import {
  deleteR2Object,
  getR2ObjectText,
  putR2Object,
  type R2S3RestConfig,
} from "@/lib/r2/s3-rest-client";
import type { Database } from "@/lib/supabase/database.types";

const ARTIFACT_CONTENT_R2_PROVIDER = "cloudflare-r2" as const;
export const INLINE_CONTENT_PROVIDER = "inline" as const;

type ArtifactVersionRow = Database["public"]["Tables"]["artifact_versions"]["Row"];

type ArtifactContentStorageConfig = R2S3RestConfig;

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
  await putR2Object({
    body: buffer,
    config,
    contentType: getArtifactPayloadContentType(input.contentType),
    key: objectKey,
  });

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

  await deleteR2Object({
    config: {
      ...config,
      bucket: content.bucket,
    },
    key: content.objectKey,
  });
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

  return getR2ObjectText({
    config: {
      ...config,
      bucket: row.content_storage_bucket,
    },
    key: row.content_storage_object_key,
  });
}
