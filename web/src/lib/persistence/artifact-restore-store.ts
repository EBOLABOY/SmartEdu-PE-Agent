import type { SupabaseClient } from "@supabase/supabase-js";

import { listArtifactVersionsByProject } from "@/lib/persistence/artifact-version-history";
import type { Database } from "@/lib/supabase/database.types";

type RpcClient = {
  rpc: (
    functionName: "restore_artifact_version",
    args: Database["public"]["Functions"]["restore_artifact_version"]["Args"],
  ) => Promise<{ data: string | null; error: { message: string } | null }>;
};

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
      return new ArtifactRestoreError("当前账号无权恢复该项目版本。", 403);
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
  supabase: SupabaseClient<Database>,
  input: {
    projectId: string;
    versionId: string;
    requestId?: string;
  },
) {
  const client = supabase as unknown as RpcClient;
  const { error } = await client.rpc("restore_artifact_version", {
    target_project_id: input.projectId,
    target_version_id: input.versionId,
    restore_request_id: input.requestId ?? null,
  });

  if (error) {
    throw normalizeRestoreError(error.message);
  }

  return listArtifactVersionsByProject(supabase, input.projectId);
}
