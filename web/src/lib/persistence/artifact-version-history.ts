import {
  persistedArtifactVersionSchema,
  workflowTraceDataSchema,
  type PersistedArtifactVersion,
} from "@/lib/lesson-authoring-contract";
import { toIsoDateTime } from "@/lib/date-time";
import type { Database } from "@/lib/supabase/database.types";
import type { SmartEduSupabaseClient } from "@/lib/supabase/typed-client";

type ArtifactVersionRow = Database["public"]["Tables"]["artifact_versions"]["Row"];
type ArtifactRow = Database["public"]["Tables"]["artifacts"]["Row"];

function toPersistedArtifactVersion(
  row: ArtifactVersionRow,
  artifact?: ArtifactRow,
): PersistedArtifactVersion {
  const parsedTrace = workflowTraceDataSchema.safeParse(row.workflow_trace);

  return persistedArtifactVersionSchema.parse({
    id: row.id,
    artifactId: row.artifact_id,
    stage: row.stage,
    ...(artifact?.title ? { title: artifact.title } : {}),
    contentType: row.content_type,
    content: row.content,
    status: row.status,
    protocolVersion: row.protocol_version,
    versionNumber: row.version_number,
    createdAt: toIsoDateTime(row.created_at, "artifact_versions.created_at"),
    ...(artifact ? { isCurrent: artifact.current_version_id === row.id } : {}),
    ...(row.warning_text ? { warningText: row.warning_text } : {}),
    ...(parsedTrace.success ? { trace: parsedTrace.data } : {}),
  });
}

export async function listArtifactVersionsByProject(
  supabase: SmartEduSupabaseClient,
  projectId: string,
) {
  const [{ data: versionRows, error: versionRowsError }, { data: artifactRows, error: artifactRowsError }] =
    await Promise.all([
      supabase
        .from("artifact_versions")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true }),
      supabase.from("artifacts").select("*").eq("project_id", projectId),
    ]);

  if (versionRowsError) {
    throw versionRowsError;
  }

  if (artifactRowsError) {
    throw artifactRowsError;
  }

  const artifactById = new Map((artifactRows ?? []).map((row) => [row.id, row]));

  return (versionRows ?? []).map((row) =>
    toPersistedArtifactVersion(row, artifactById.get(row.artifact_id)),
  );
}

export { toPersistedArtifactVersion };
