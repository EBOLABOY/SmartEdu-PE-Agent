import { resolveArtifactVersionContent } from "./artifact-content-store";

import type { SmartEduSupabaseClient } from "@/lib/supabase/typed-client";

export async function resolveRequestedLessonPlan(input: {
  explicitLessonPlan?: string;
  projectId?: string;
  supabase: SmartEduSupabaseClient | null;
}) {
  if (input.explicitLessonPlan?.trim()) {
    return input.explicitLessonPlan;
  }

  if (!input.supabase || !input.projectId) {
    return undefined;
  }

  try {
    const { data: artifact, error: artifactError } = await input.supabase
      .from("artifacts")
      .select("current_version_id")
      .eq("project_id", input.projectId)
      .eq("stage", "lesson")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (artifactError) {
      throw artifactError;
    }

    const versionQuery = artifact?.current_version_id
      ? input.supabase
          .from("artifact_versions")
          .select("content, content_storage_provider, content_storage_bucket, content_storage_object_key")
          .eq("id", artifact.current_version_id)
          .maybeSingle()
      : input.supabase
          .from("artifact_versions")
          .select("content, content_storage_provider, content_storage_bucket, content_storage_object_key")
          .eq("project_id", input.projectId)
          .eq("stage", "lesson")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

    const { data: version, error: versionError } = await versionQuery;

    if (versionError) {
      throw versionError;
    }

    if (!version) {
      return undefined;
    }

    const content = await resolveArtifactVersionContent(version);
    return content.trim() ? content : undefined;
  } catch (error) {
    console.warn("[current-lesson-plan] resolve-requested-lesson-plan-failed", {
      projectId: input.projectId,
      message: error instanceof Error ? error.message : "unknown-error",
    });
    return undefined;
  }
}
