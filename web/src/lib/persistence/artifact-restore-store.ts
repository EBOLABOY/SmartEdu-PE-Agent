import { listArtifactVersionsByProject } from "@/lib/persistence/artifact-version-history";
import type { SmartEduSupabaseClient } from "@/lib/supabase/typed-client";

export class ArtifactRestoreError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ArtifactRestoreError";
    this.status = status;
  }
}

function normalizeRestoreError(message: string) {
  switch (message) {
    case "authentication required":
      return new ArtifactRestoreError("当前会话未登录，无法恢复 Artifact 版本。", 401);
    case "project access denied":
    case "project write access denied":
      return new ArtifactRestoreError("当前账号无权恢复该项目版本。", 403);
    case "project not found":
      return new ArtifactRestoreError("目标项目不存在。", 404);
    case "artifact version not found":
      return new ArtifactRestoreError("目标 Artifact 版本不存在或不属于当前项目。", 404);
    case "artifact not found":
      return new ArtifactRestoreError("目标 Artifact 不存在或已失效。", 404);
    default:
      return new ArtifactRestoreError(
        message || "恢复 Artifact 版本失败。",
        500,
      );
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
  const { error } = await supabase.rpc("restore_artifact_version", {
    target_project_id: input.projectId,
    target_version_id: input.versionId,
    restore_request_id: input.requestId ?? null,
  });

  if (error) {
    throw normalizeRestoreError(error.message);
  }

  return listArtifactVersionsByProject(supabase, input.projectId);
}
