import type { SmartEduSupabaseClient } from "@/lib/supabase/typed-client";

import { listArtifactVersionsFromS3Manifest } from "./artifact-version-manifest";

export async function listArtifactVersionsByProject(
  _supabase: SmartEduSupabaseClient,
  projectId: string,
) {
  return (await listArtifactVersionsFromS3Manifest(projectId)) ?? [];
}
