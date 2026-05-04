/**
 * @module current-lesson-plan
 * 当前教案版本的解析。优先使用显式传入的教案文本，
 * 否则从 S3 版本清单中解析项目当前的教案内容。
 */
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
