/**
 * @module project-directory-manifest
 * 项目目录清单的 S3 存取。管理 S3 上的用户工作区项目目录，
 * 支持读取、写入和可用性检查，供项目列表聚合使用。
 */
import { z } from "zod";

import {
  persistedProjectSummarySchema,
  type PersistedProjectSummary,
} from "@/lib/lesson/authoring-contract";
import { getS3ObjectStorageConfig } from "@/lib/s3/object-storage-config";
import {
  getS3ObjectText,
  putS3Object,
  S3ObjectNotFoundError,
} from "@/lib/s3/s3-rest-client";

const PROJECT_DIRECTORY_MANIFEST_VERSION = 1;

const projectDirectoryManifestSchema = z.object({
  generatedAt: z.string().datetime(),
  projects: z.array(persistedProjectSummarySchema),
  schemaVersion: z.literal(PROJECT_DIRECTORY_MANIFEST_VERSION),
  userId: z.string().uuid(),
});

export type ProjectDirectoryManifest = z.infer<
  typeof projectDirectoryManifestSchema
>;

export function buildProjectDirectoryManifestKey(userId: string) {
  return `users/${userId}/workspace/projects.json`;
}

export function canUseProjectDirectoryManifest() {
  return getS3ObjectStorageConfig("workspace") !== null;
}

export async function readProjectDirectoryManifest(userId: string) {
  const config = getS3ObjectStorageConfig("workspace");

  if (!config) {
    return null;
  }

  try {
    const rawManifest = await getS3ObjectText({
      config,
      key: buildProjectDirectoryManifestKey(userId),
    });
    const manifest = projectDirectoryManifestSchema.parse(
      JSON.parse(rawManifest),
    );

    return manifest.userId === userId ? manifest : null;
  } catch (error) {
    if (error instanceof S3ObjectNotFoundError) {
      return null;
    }

    throw error;
  }
}

export async function writeProjectDirectoryManifest(input: {
  projects: PersistedProjectSummary[];
  userId: string;
}) {
  const config = getS3ObjectStorageConfig("workspace");

  if (!config) {
    return false;
  }

  const manifest: ProjectDirectoryManifest = {
    generatedAt: new Date().toISOString(),
    projects: input.projects,
    schemaVersion: PROJECT_DIRECTORY_MANIFEST_VERSION,
    userId: input.userId,
  };

  await putS3Object({
    body: JSON.stringify(manifest),
    config,
    contentType: "application/json;charset=utf-8",
    key: buildProjectDirectoryManifestKey(input.userId),
  });

  return true;
}
