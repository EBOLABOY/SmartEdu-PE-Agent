/**
 * @module artifact-content-store
 * 产物内容的 S3 对象存储。将产物 JSON/HTML 内容上传到 S3，
 * 支持内容寻址（checksum 去重）和对象删除。
 */
import { createHash } from "node:crypto";

import { getS3ObjectStorageConfig } from "@/lib/s3/object-storage-config";
import {
  deleteS3Object,
  putS3Object,
  type S3RestConfig,
} from "@/lib/s3/s3-rest-client";
import type { StructuredArtifactData } from "@/lib/lesson/authoring-contract";

const ARTIFACT_CONTENT_S3_PROVIDER = "s3-compatible" as const;

type ArtifactContentStorageConfig = S3RestConfig;

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
  contentType: StructuredArtifactData["contentType"],
) {
  return contentType === "html"
    ? "text/html;charset=utf-8"
    : "application/json;charset=utf-8";
}

function getArtifactPayloadExtension(
  contentType: StructuredArtifactData["contentType"],
) {
  return contentType === "html" ? "html" : "json";
}

function buildArtifactContentObjectKey(input: {
  contentType: StructuredArtifactData["contentType"];
  projectId: string;
  stage: StructuredArtifactData["stage"];
  versionId: string;
}) {
  const extension = getArtifactPayloadExtension(input.contentType);

  return `projects/${input.projectId}/versions/${input.versionId}/${input.stage}.${extension}`;
}

export async function uploadArtifactContent(input: {
  content: string;
  contentType: StructuredArtifactData["contentType"];
  projectId: string;
  stage: StructuredArtifactData["stage"];
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
