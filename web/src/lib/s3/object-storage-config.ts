/**
 * @module object-storage-config
 * S3 对象存储配置读取。根据用途（artifact/export/workspace）
 * 从环境变量读取对应的 S3 连接配置，支持多桶分离部署。
 */
import type { S3RestConfig } from "./s3-rest-client";

type ObjectStoragePurpose = "artifact" | "export" | "workspace";

export const DEFAULT_S3_USER_AGENT = "S3 Browser";

function getBucketForPurpose(purpose: ObjectStoragePurpose) {
  if (purpose === "artifact") {
    return process.env.S3_ARTIFACT_BUCKET ?? process.env.S3_BUCKET;
  }

  if (purpose === "workspace") {
    return process.env.S3_WORKSPACE_BUCKET ?? process.env.S3_BUCKET;
  }

  return process.env.S3_EXPORT_BUCKET ?? process.env.S3_BUCKET;
}

function getS3UserAgent() {
  return process.env.S3_USER_AGENT?.trim() || DEFAULT_S3_USER_AGENT;
}

export function getS3ObjectStorageConfig(
  purpose: ObjectStoragePurpose,
): S3RestConfig | null {
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const bucket = getBucketForPurpose(purpose);
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const userAgent = getS3UserAgent();

  if (!accessKeyId || !bucket || !endpoint || !region || !secretAccessKey) {
    return null;
  }

  return {
    accessKeyId,
    bucket,
    endpoint,
    region,
    secretAccessKey,
    userAgent,
  };
}
