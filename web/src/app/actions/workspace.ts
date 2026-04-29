"use server";

import {
  createProjectAction as createProjectActionImpl,
  deleteProjectAction as deleteProjectActionImpl,
  generateCompetitionLessonPatchAction as generateCompetitionLessonPatchActionImpl,
  restoreArtifactVersionAction as restoreArtifactVersionActionImpl,
  saveLessonArtifactVersionAction as saveLessonArtifactVersionActionImpl,
} from "@/lib/workspace/server-actions";

export async function createProjectAction(
  ...args: Parameters<typeof createProjectActionImpl>
) {
  return createProjectActionImpl(...args);
}

export async function deleteProjectAction(
  ...args: Parameters<typeof deleteProjectActionImpl>
) {
  return deleteProjectActionImpl(...args);
}

export async function generateCompetitionLessonPatchAction(
  ...args: Parameters<typeof generateCompetitionLessonPatchActionImpl>
) {
  return generateCompetitionLessonPatchActionImpl(...args);
}

export async function restoreArtifactVersionAction(
  ...args: Parameters<typeof restoreArtifactVersionActionImpl>
) {
  return restoreArtifactVersionActionImpl(...args);
}

export async function saveLessonArtifactVersionAction(
  ...args: Parameters<typeof saveLessonArtifactVersionActionImpl>
) {
  return saveLessonArtifactVersionActionImpl(...args);
}

export type { WorkspaceActionResult } from "@/lib/workspace/server-actions";
