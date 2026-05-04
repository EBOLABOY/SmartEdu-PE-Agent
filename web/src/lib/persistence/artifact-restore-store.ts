/**
 * @module artifact-restore-store
 * 产物版本恢复。根据项目 ID 和版本 ID，从 S3 版本清单中
 * 恢复历史产物版本为当前版本，提供恢复错误处理。
 */
import { listArtifactVersionsByProject } from "@/lib/persistence/artifact-version-history";
import { restoreArtifactVersionInS3Manifest } from "@/lib/persistence/artifact-version-manifest";
import type { SmartEduSupabaseClient } from "@/lib/supabase/typed-client";

export class ArtifactRestoreError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ArtifactRestoreError";
    this.status = status;
  }
}

export async function restoreArtifactVersionByProject(
  supabase: SmartEduSupabaseClient,
  input: {
    projectId: string;
    versionId: string;
    requestId?: string;
  },
) {
  const s3Versions = await restoreArtifactVersionInS3Manifest({
    projectId: input.projectId,
    versionId: input.versionId,
  });

  if (!s3Versions) {
    throw new ArtifactRestoreError("目标 Artifact 版本不存在或 S3 版本清单不可用。", 404);
  }

  return listArtifactVersionsByProject(supabase, input.projectId);
}
