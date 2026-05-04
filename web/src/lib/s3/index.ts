/**
 * @module s3
 * S3 对象存储层 - 封装 S3 兼容存储的读写与配置操作。
 */

// ---- artifact-image-url ----
export { ARTIFACT_IMAGE_KINDS } from "./artifact-image-url";
export type { ArtifactImageKind } from "./artifact-image-url";
export {
  ArtifactImagePathError,
  buildArtifactImageObjectKey,
  buildArtifactImageProxyUrl,
  isArtifactImageProxyUrl,
  parseArtifactImageProxyUrl,
  parseArtifactImageProxyPath,
} from "./artifact-image-url";

// ---- object-storage-config ----
export { DEFAULT_S3_USER_AGENT, getS3ObjectStorageConfig } from "./object-storage-config";

// ---- s3-rest-client ----
export type { S3RestConfig } from "./s3-rest-client";
export {
  S3ObjectError,
  S3ObjectNotFoundError,
  putS3Object,
  deleteS3Object,
  getS3ObjectText,
  getS3Object,
} from "./s3-rest-client";