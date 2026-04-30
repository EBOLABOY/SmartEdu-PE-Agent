import { randomUUID } from "node:crypto";

import { extractJsonObjectText } from "@/lib/artifact-protocol";
import { competitionLessonPlanSchema } from "@/lib/competition-lesson-contract";
import type {
  StructuredArtifactData,
  WorkflowTraceData,
} from "@/lib/lesson-authoring-contract";
import type { Json } from "@/lib/supabase/database.types";
import type { SmartEduSupabaseClient } from "@/lib/supabase/typed-client";

import {
  deleteOffloadedArtifactContent,
  uploadArtifactContent,
} from "./artifact-content-store";
import { refreshProjectDirectoryManifest } from "./project-workspace-history";

export type LessonAuthoringPersistence = {
  saveArtifactVersion: (input: {
    artifact: StructuredArtifactData;
    projectId: string;
    requestId: string;
    trace?: WorkflowTraceData;
  }) => Promise<void>;
};

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function deriveArtifactTitle(artifact: StructuredArtifactData) {
  if (artifact.title?.trim()) {
    return artifact.title;
  }

  if (artifact.contentType === "lesson-json") {
    try {
      const lessonPlan = competitionLessonPlanSchema.parse(
        JSON.parse(extractJsonObjectText(artifact.content)),
      );
      const title = lessonPlan.title.trim();

      if (title) {
        return title;
      }
    } catch {
      // Fall through to generic titles when generated content is malformed.
    }
  }

  return artifact.stage === "html"
    ? "互动大屏 Artifact"
    : "课时计划 Artifact";
}

export async function saveArtifactVersionWithSupabase(
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
  const versionId = randomUUID();
  let offloadedContent = null;

  try {
    offloadedContent = await uploadArtifactContent({
      content: artifact.content,
      contentType: artifact.contentType,
      projectId,
      stage: artifact.stage,
      versionId,
    });
  } catch (error) {
    console.warn("[lesson-authoring:persistence] artifact-content-offload-failed", {
      message: error instanceof Error ? error.message : "unknown-error",
      projectId,
      requestId,
      stage: artifact.stage,
    });
  }

  const artifactVersionArgs = {
    target_project_id: projectId,
    artifact_stage: artifact.stage,
    artifact_title: deriveArtifactTitle(artifact),
    artifact_content_type: artifact.contentType,
    artifact_content: offloadedContent ? "" : artifact.content,
    artifact_status: artifact.status,
    artifact_protocol_version: artifact.protocolVersion,
    artifact_workflow_trace: trace ? toJson(trace) : {},
    artifact_request_id: requestId,
    artifact_version_id: versionId,
    artifact_content_storage_provider: offloadedContent?.provider ?? "inline",
    ...(artifact.warningText ? { artifact_warning_text: artifact.warningText } : {}),
    ...(offloadedContent
      ? {
          artifact_content_storage_bucket: offloadedContent.bucket,
          artifact_content_storage_object_key: offloadedContent.objectKey,
          artifact_content_byte_size: offloadedContent.byteSize,
          artifact_content_checksum: offloadedContent.checksum,
        }
      : {}),
  };

  const { error } = await supabase.rpc("create_artifact_version", artifactVersionArgs);

  if (error) {
    if (offloadedContent) {
      try {
        await deleteOffloadedArtifactContent(offloadedContent);
      } catch (cleanupError) {
        console.warn("[lesson-authoring:persistence] artifact-content-cleanup-failed", {
          message: cleanupError instanceof Error ? cleanupError.message : "unknown-error",
          objectKey: offloadedContent.objectKey,
          projectId,
          requestId,
        });
      }
    }

    throw new Error(error.message);
  }

  if (userId) {
    await refreshProjectDirectoryManifest(supabase, userId);
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
      await saveArtifactVersionWithSupabase(supabase, {
        artifact,
        projectId,
        requestId,
        trace,
        userId,
      });
    },
  };
}
