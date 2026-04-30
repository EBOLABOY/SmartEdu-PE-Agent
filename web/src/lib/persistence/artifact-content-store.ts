import { createHash } from "node:crypto";

import { getS3ObjectStorageConfig } from "@/lib/s3/object-storage-config";
import {
  deleteS3Object,
  getS3ObjectText,
  putS3Object,
  S3ObjectNotFoundError,
  type S3RestConfig,
} from "@/lib/s3/s3-rest-client";
import type { Database } from "@/lib/supabase/database.types";

const ARTIFACT_CONTENT_S3_PROVIDER = "s3-compatible" as const;
const LEGACY_ARTIFACT_CONTENT_R2_PROVIDER = "cloudflare-r2" as const;
export const INLINE_CONTENT_PROVIDER = "inline" as const;

type ArtifactVersionRow = Database["public"]["Tables"]["artifact_versions"]["Row"];

type ArtifactContentStorageConfig = S3RestConfig;

export type ArtifactContentStorageProvider =
  | typeof ARTIFACT_CONTENT_S3_PROVIDER
  | typeof LEGACY_ARTIFACT_CONTENT_R2_PROVIDER
  | typeof INLINE_CONTENT_PROVIDER;

export type OffloadedArtifactContent = {
  bucket: string;
  byteSize: number;
  checksum: string;
  objectKey: string;
  provider: typeof ARTIFACT_CONTENT_S3_PROVIDER;
};

function getArtifactContentStorageConfig():
  | ArtifactContentStorageConfig
  | null {
  return getS3ObjectStorageConfig("artifact");
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
  await putS3Object({
    body: buffer,
    config,
    contentType: getArtifactPayloadContentType(input.contentType),
    key: objectKey,
  });

  return {
    provider: ARTIFACT_CONTENT_S3_PROVIDER,
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

  await deleteS3Object({
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
    !isExternalObjectStorageProvider(row.content_storage_provider) ||
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

  return getS3ObjectText({
    config: {
      ...config,
      bucket: row.content_storage_bucket,
    },
    key: row.content_storage_object_key,
  });
}

export async function tryResolveArtifactVersionContent(
  row: Pick<
    ArtifactVersionRow,
    | "content"
    | "content_storage_bucket"
    | "content_storage_object_key"
    | "content_storage_provider"
  >,
) {
  try {
    return await resolveArtifactVersionContent(row);
  } catch (error) {
    if (error instanceof S3ObjectNotFoundError) {
      console.warn("[artifact-content-store] external-content-missing", {
        bucket: error.details.bucket,
        key: error.details.key,
        provider: row.content_storage_provider,
        status: error.details.status,
      });

      return row.content || null;
    }

    throw error;
  }
}

function isExternalObjectStorageProvider(value: string | null | undefined) {
  return (
    value === ARTIFACT_CONTENT_S3_PROVIDER ||
    value === LEGACY_ARTIFACT_CONTENT_R2_PROVIDER
  );
}
