/**
 * @module persistence
 * 数据持久化层 - 封装 Supabase/S3 的存储操作。
 */

// ---- artifact-content-store ----
export type { OffloadedArtifactContent } from "./artifact-content-store";
export { uploadArtifactContent, deleteOffloadedArtifactContent } from "./artifact-content-store";

// ---- artifact-restore-store ----
export { ArtifactRestoreError, restoreArtifactVersionByProject } from "./artifact-restore-store";

// ---- artifact-version-history ----
export { listArtifactVersionsByProject } from "./artifact-version-history";

// ---- artifact-version-manifest ----
export {
  saveArtifactVersionToS3Manifest,
  listArtifactVersionsFromS3Manifest,
  restoreArtifactVersionInS3Manifest,
  resolveCurrentLessonPlanFromS3Manifest,
} from "./artifact-version-manifest";

// ---- conversation-message-manifest ----
export {
  buildConversationMessagesKey,
  saveConversationMessagesToS3,
  listConversationMessagesFromS3,
} from "./conversation-message-manifest";

// ---- current-lesson-plan ----
export { resolveRequestedLessonPlan } from "./current-lesson-plan";

// ---- lesson-authoring-store ----
export type { LessonAuthoringPersistence } from "./lesson-authoring-store";
export { saveArtifactVersionToS3, createLessonAuthoringPersistence } from "./lesson-authoring-store";

// ---- lesson-memory-store ----
export type { LessonMemoryPersistence } from "./lesson-memory-store";
export { createLessonMemoryPersistence } from "./lesson-memory-store";

// ---- project-authorization ----
export { ProjectAuthorizationError, normalizeProjectAuthorizationError, requireProjectWriteAccess } from "./project-authorization";

// ---- project-chat-store ----
export type { ProjectChatPersistence } from "./project-chat-store";
export {
  getPersistedMessageContent,
  deriveConversationTitle,
  createProjectChatPersistence,
} from "./project-chat-store";

// ---- project-directory-manifest ----
export type { ProjectDirectoryManifest } from "./project-directory-manifest";
export {
  buildProjectDirectoryManifestKey,
  canUseProjectDirectoryManifest,
  readProjectDirectoryManifest,
  writeProjectDirectoryManifest,
} from "./project-directory-manifest";

// ---- project-workspace-history ----
export {
  deriveProjectDisplayTitle,
  listProjectsForUserFromDatabase,
  refreshProjectDirectoryManifest,
  listProjectsForUser,
  getProjectWorkspaceHistory,
  toPersistedConversation,
  toPersistedProjectSummary,
} from "./project-workspace-history";