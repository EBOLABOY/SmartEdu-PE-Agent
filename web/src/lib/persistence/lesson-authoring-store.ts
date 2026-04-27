import type { StructuredArtifactData, WorkflowTraceData } from "@/lib/lesson-authoring-contract";
import type { Json } from "@/lib/supabase/database.types";
import type { SmartEduSupabaseClient } from "@/lib/supabase/typed-client";

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
  const { error } = await supabase.rpc("create_artifact_version", {
    target_project_id: projectId,
    artifact_stage: artifact.stage,
    artifact_title: artifact.title ?? (artifact.stage === "html" ? "互动大屏 Artifact" : "教案 Artifact"),
    artifact_content_type: artifact.contentType,
    artifact_content: artifact.content,
    artifact_status: artifact.status,
    artifact_protocol_version: artifact.protocolVersion,
    artifact_workflow_trace: trace ? toJson(trace) : {},
    artifact_warning_text: artifact.warningText ?? null,
    artifact_request_id: requestId,
  });

  if (error) {
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
