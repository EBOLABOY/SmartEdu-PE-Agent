import type { SupabaseClient } from "@supabase/supabase-js";

import {
  persistedArtifactVersionSchema,
  workflowTraceDataSchema,
  type PersistedArtifactVersion,
} from "@/lib/lesson-authoring-contract";
import { toIsoDateTime } from "@/lib/date-time";
import type { Database } from "@/lib/supabase/database.types";

type ArtifactVersionRow = Database["public"]["Tables"]["artifact_versions"]["Row"];
type ArtifactRow = Database["public"]["Tables"]["artifacts"]["Row"];
type ArtifactQueryClient = {
  from: (table: "artifact_versions" | "artifacts") => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        order?: (
          column: string,
          options: { ascending: boolean },
        ) => Promise<{ data: ArtifactVersionRow[] | null; error: Error | null }>;
      } & Promise<{ data: ArtifactRow[] | null; error: Error | null }>;
    };
  };
};

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
  supabase: SupabaseClient<Database>,
  projectId: string,
) {
  const client = supabase as unknown as ArtifactQueryClient;
  const [{ data: versionRows, error: versionRowsError }, { data: artifactRows, error: artifactRowsError }] =
    await Promise.all([
      client
        .from("artifact_versions")
        .select("*")
        .eq("project_id", projectId)
        .order!("created_at", { ascending: true }),
      client.from("artifacts").select("*").eq("project_id", projectId),
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
