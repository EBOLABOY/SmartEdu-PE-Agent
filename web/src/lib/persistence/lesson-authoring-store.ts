import type { SupabaseClient } from "@supabase/supabase-js";

import type { StructuredArtifactData, WorkflowTraceData } from "@/lib/lesson-authoring-contract";
import type { Database, Json } from "@/lib/supabase/database.types";

type RpcClient = {
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: { code?: string; message: string } | null }>;
};

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

export function createLessonAuthoringPersistence(
  supabase: SupabaseClient<Database, "public"> | null,
): LessonAuthoringPersistence | null {
  if (!supabase) {
    return null;
  }

  return {
    async saveArtifactVersion({ artifact, projectId, requestId, trace }) {
      const client = supabase as unknown as RpcClient;
      const { error } = await client.rpc("create_artifact_version", {
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
        console.warn("[lesson-authoring:persistence]", {
          code: error.code,
          message: error.message,
          projectId,
          requestId,
          stage: artifact.stage,
        });
      }
    },
  };
}
