import { randomUUID } from "node:crypto";

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

export async function saveArtifactVersionWithSupabase(
  supabase: SmartEduSupabaseClient,
  {
    artifact,
    projectId,
    requestId,
    trace,
  }: {
    artifact: StructuredArtifactData;
    projectId: string;
    requestId: string;
    trace?: WorkflowTraceData;
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
    artifact_title:
      artifact.title ??
      (artifact.stage === "html"
        ? "互动大屏 Artifact"
        : "课时计划 Artifact"),
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
}

export function createLessonAuthoringPersistence(
  supabase: SmartEduSupabaseClient | null,
): LessonAuthoringPersistence | null {
  if (!supabase) {
    return null;
  }

  return {
    async saveArtifactVersion({ artifact, projectId, requestId, trace }) {
      try {
        await saveArtifactVersionWithSupabase(supabase, {
          artifact,
          projectId,
          requestId,
          trace,
        });
      } catch (error) {
        console.warn("[lesson-authoring:persistence]", {
          message: error instanceof Error ? error.message : "unknown-error",
          projectId,
          requestId,
          stage: artifact.stage,
        });
      }
    },
  };
}
