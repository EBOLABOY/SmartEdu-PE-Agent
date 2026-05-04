/**
 * @module lesson-authoring-store
 * 教案创作产物的持久化。将结构化产物版本保存到 S3，
 * 维护版本清单，创建教案创作持久化服务实例。
 */
import type {
  StructuredArtifactData,
  WorkflowTraceData,
} from "@/lib/lesson/authoring-contract";
import type { SmartEduSupabaseClient } from "@/lib/supabase/typed-client";

import { saveArtifactVersionToS3Manifest } from "./artifact-version-manifest";
import { refreshProjectDirectoryManifest } from "./project-workspace-history";

export type LessonAuthoringPersistence = {
  saveArtifactVersion: (input: {
    artifact: StructuredArtifactData;
    projectId: string;
    requestId: string;
    trace?: WorkflowTraceData;
  }) => Promise<void>;
};

export async function saveArtifactVersionToS3(
  supabase: SmartEduSupabaseClient,
  {
    artifact,
    projectId,
    requestId,
    trace,
    userId,
  }: {
    artifact: StructuredArtifactData;
    projectId: string;
    requestId: string;
    trace?: WorkflowTraceData;
    userId?: string;
  },
) {
  try {
    await saveArtifactVersionToS3Manifest({
      artifact,
      projectId,
      trace,
    });

    if (userId) {
      await refreshProjectDirectoryManifest(supabase, userId);
    }
    return;
  } catch (error) {
    console.error("[lesson-authoring:persistence] s3-manifest-save-failed", {
      message: error instanceof Error ? error.message : "unknown-error",
      projectId,
      requestId,
      stage: artifact.stage,
    });
    throw new Error(
      `Artifact 版本只允许写入 S3，但 S3 manifest 保存失败：${
        error instanceof Error ? error.message : "unknown-error"
      }`,
    );
  }
}

export function createLessonAuthoringPersistence(
  supabase: SmartEduSupabaseClient | null,
  userId?: string,
): LessonAuthoringPersistence | null {
  if (!supabase) {
    return null;
  }

  return {
    async saveArtifactVersion({ artifact, projectId, requestId, trace }) {
      await saveArtifactVersionToS3(supabase, {
        artifact,
        projectId,
        requestId,
        trace,
        userId,
      });
    },
  };
}
