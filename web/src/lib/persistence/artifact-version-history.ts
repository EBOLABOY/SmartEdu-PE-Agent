/**
 * @module artifact-version-history
 * 产物版本历史查询。按项目 ID 从 S3 版本清单中
 * 列出所有历史版本，供版本管理 UI 使用。
 */
import type { SmartEduSupabaseClient } from "@/lib/supabase/typed-client";

import { listArtifactVersionsFromS3Manifest } from "./artifact-version-manifest";

export async function listArtifactVersionsByProject(
  _supabase: SmartEduSupabaseClient,
  projectId: string,
) {
  return (await listArtifactVersionsFromS3Manifest(projectId)) ?? [];
}
