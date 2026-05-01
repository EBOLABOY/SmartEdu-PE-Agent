import { resolveCurrentLessonPlanFromS3Manifest } from "./artifact-version-manifest";

import type { SmartEduSupabaseClient } from "@/lib/supabase/typed-client";

export async function resolveRequestedLessonPlan(input: {
  explicitLessonPlan?: string;
  projectId?: string;
  supabase: SmartEduSupabaseClient | null;
}) {
  if (input.explicitLessonPlan?.trim()) {
    return input.explicitLessonPlan;
  }

  if (!input.projectId) {
    return undefined;
  }

  try {
    return await resolveCurrentLessonPlanFromS3Manifest(input.projectId);
  } catch (error) {
    console.warn("[current-lesson-plan] resolve-s3-lesson-plan-failed", {
      projectId: input.projectId,
      message: error instanceof Error ? error.message : "unknown-error",
    });
    return undefined;
  }
}
