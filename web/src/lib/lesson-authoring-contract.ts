import type { UIMessage } from "ai";
import { z } from "zod";

import { competitionLessonPlanSchema } from "@/lib/competition-lesson-contract";

export const STRUCTURED_ARTIFACT_PROTOCOL_VERSION = "structured-v1" as const;

export const generationModeSchema = z.enum(["lesson", "html"]);
export type GenerationMode = z.infer<typeof generationModeSchema>;
export const artifactContentTypeSchema = z.enum(["html", "lesson-json"]);
export type ArtifactContentType = z.infer<typeof artifactContentTypeSchema>;

export const projectIdSchema = z.string().uuid();

export const standardsMarketSchema = z.enum(["cn-compulsory-2022", "us-shape-k12"]);
export type StandardsMarket = z.infer<typeof standardsMarketSchema>;

export const DEFAULT_STANDARDS_MARKET: StandardsMarket = "cn-compulsory-2022";

export const lessonScreenSupportModuleSchema = z.enum(["tacticalBoard", "scoreboard", "rotation", "formation"]);
export type LessonScreenSupportModule = z.infer<typeof lessonScreenSupportModuleSchema>;

export const lessonScreenSectionPlanSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    durationSeconds: z.number().int().positive().max(14_400).optional(),
    supportModule: lessonScreenSupportModuleSchema,
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export type LessonScreenSectionPlan = z.infer<typeof lessonScreenSectionPlanSchema>;

export const lessonScreenPlanSchema = z
  .object({
    sections: z.array(lessonScreenSectionPlanSchema).min(1).max(24),
  })
  .strict();

export type LessonScreenPlan = z.infer<typeof lessonScreenPlanSchema>;

export const peTeacherContextSchema = z
  .object({
    grade: z.string().trim().min(1).optional(),
    teacherName: z.string().trim().min(1).optional(),
    schoolName: z.string().trim().min(1).optional(),
    teachingGrade: z.string().trim().min(1).optional(),
    teachingLevel: z.string().trim().min(1).optional(),
    topic: z.string().trim().min(1).optional(),
    duration: z.number().int().positive().max(240).optional(),
    venue: z.string().trim().min(1).optional(),
    equipment: z.array(z.string().trim().min(1)).max(32).optional(),
  })
  .strict();

export type PeTeacherContext = z.infer<typeof peTeacherContextSchema>;

export const workflowTraceStatusSchema = z.enum(["success", "blocked", "running", "failed"]);

export const workflowTraceEntrySchema = z.object({
  step: z.string().trim().min(1),
  status: workflowTraceStatusSchema,
  detail: z.string().trim().min(1),
  timestamp: z.string().datetime().optional(),
});

export type WorkflowTraceEntry = z.infer<typeof workflowTraceEntrySchema>;

export const workflowStandardsReferenceSchema = z
  .object({
    id: z.string().trim().min(1),
    title: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    citation: z.string().trim().min(1),
    module: z.string().trim().min(1),
    gradeBands: z.array(z.string().trim().min(1)),
    sectionPath: z.array(z.string().trim().min(1)),
    score: z.number(),
  })
  .strict();

export type WorkflowStandardsReference = z.infer<typeof workflowStandardsReferenceSchema>;

export const workflowStandardsSnapshotSchema = z
  .object({
    corpusId: z.string().trim().min(1),
    displayName: z.string().trim().min(1),
    sourceName: z.string().trim().min(1),
    issuer: z.string().trim().min(1),
    version: z.string().trim().min(1),
    url: z.string().url(),
    references: z.array(workflowStandardsReferenceSchema),
  })
  .strict();

export type WorkflowStandardsSnapshot = z.infer<typeof workflowStandardsSnapshotSchema>;

export const structuredArtifactDataSchema = z.object({
  protocolVersion: z.literal(STRUCTURED_ARTIFACT_PROTOCOL_VERSION),
  stage: generationModeSchema,
  contentType: artifactContentTypeSchema,
  content: z.string(),
  isComplete: z.boolean(),
  status: z.enum(["streaming", "ready", "error"]),
  source: z.literal("data-part"),
  title: z.string().optional(),
  warningText: z.string().optional(),
  updatedAt: z.string().datetime(),
});

export type StructuredArtifactData = z.infer<typeof structuredArtifactDataSchema>;

export const workflowTraceDataSchema = z.object({
  protocolVersion: z.literal(STRUCTURED_ARTIFACT_PROTOCOL_VERSION),
  requestId: z.string().trim().min(1),
  mode: generationModeSchema,
  phase: z.enum(["workflow", "generation", "completed", "failed"]),
  responseTransport: z.literal("structured-data-part"),
  requestedMarket: standardsMarketSchema,
  resolvedMarket: standardsMarketSchema,
  warnings: z.array(z.string()),
  standards: workflowStandardsSnapshotSchema.optional(),
  trace: z.array(workflowTraceEntrySchema),
  updatedAt: z.string().datetime(),
});

export type WorkflowTraceData = z.infer<typeof workflowTraceDataSchema>;

export type SmartEduUIData = {
  artifact: StructuredArtifactData;
  trace: WorkflowTraceData;
};

export type SmartEduUIMessage = UIMessage<unknown, SmartEduUIData>;

export const persistedArtifactVersionSchema = z.object({
  id: z.string().uuid(),
  artifactId: z.string().uuid(),
  stage: generationModeSchema,
  title: z.string().trim().min(1).optional(),
  contentType: artifactContentTypeSchema,
  content: z.string(),
  status: z.enum(["streaming", "ready", "error"]),
  protocolVersion: z.string().trim().min(1),
  versionNumber: z.number().int().positive(),
  createdAt: z.string().datetime(),
  isCurrent: z.boolean().optional(),
  warningText: z.string().optional(),
  trace: workflowTraceDataSchema.optional(),
});

export type PersistedArtifactVersion = z.infer<typeof persistedArtifactVersionSchema>;

export const persistenceStateSchema = z.object({
  enabled: z.boolean(),
  authenticated: z.boolean(),
  reason: z.string().optional(),
});

export type PersistenceState = z.infer<typeof persistenceStateSchema>;

export const persistedProjectSummarySchema = z.object({
  id: projectIdSchema,
  title: z.string().trim().min(1),
  description: z.string().optional(),
  market: z.string().trim().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type PersistedProjectSummary = z.infer<typeof persistedProjectSummarySchema>;

export const persistedConversationSchema = z.object({
  id: z.string().uuid(),
  title: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type PersistedConversation = z.infer<typeof persistedConversationSchema>;

export const persistedProjectMessageSchema = z.object({
  id: z.string().uuid(),
  uiMessageId: z.string().trim().min(1),
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
  createdAt: z.string().datetime(),
  uiMessage: z.unknown(),
});

export type PersistedProjectMessage = z.infer<typeof persistedProjectMessageSchema>;

export const artifactVersionsResponseSchema = z.object({
  projectId: projectIdSchema,
  versions: z.array(persistedArtifactVersionSchema),
  persistence: persistenceStateSchema,
});

export type ArtifactVersionsResponse = z.infer<typeof artifactVersionsResponseSchema>;

export const saveLessonArtifactVersionRequestBodySchema = z
  .object({
    lessonPlan: competitionLessonPlanSchema,
    title: z.string().trim().min(1).max(120).optional(),
    summary: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export type SaveLessonArtifactVersionRequestBody = z.infer<
  typeof saveLessonArtifactVersionRequestBodySchema
>;

export const projectDirectoryResponseSchema = z.object({
  projects: z.array(persistedProjectSummarySchema),
  persistence: persistenceStateSchema,
});

export type ProjectDirectoryResponse = z.infer<typeof projectDirectoryResponseSchema>;

export const projectWorkspaceResponseSchema = z.object({
  project: persistedProjectSummarySchema,
  conversation: persistedConversationSchema.nullable(),
  messages: z.array(persistedProjectMessageSchema),
  persistence: persistenceStateSchema,
});

export type ProjectWorkspaceResponse = z.infer<typeof projectWorkspaceResponseSchema>;

export const memberRoleSchema = z.enum(["owner", "admin", "teacher", "viewer"]);
export type MemberRole = z.infer<typeof memberRoleSchema>;

export const accountWorkspaceMemberSchema = z.object({
  userId: z.string().uuid(),
  role: memberRoleSchema,
  createdAt: z.string().datetime(),
  profile: z.object({
    displayName: z.string().nullable(),
    avatarUrl: z.string().nullable(),
  }),
});

export type AccountWorkspaceMember = z.infer<typeof accountWorkspaceMemberSchema>;

export const accountWorkspaceInvitationSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: memberRoleSchema,
  status: z.enum(["pending", "accepted", "revoked", "expired"]),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});

export type AccountWorkspaceInvitation = z.infer<typeof accountWorkspaceInvitationSchema>;

export const accountWorkspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1),
  slug: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  currentUserRole: memberRoleSchema,
  invitations: z.array(accountWorkspaceInvitationSchema),
  members: z.array(accountWorkspaceMemberSchema),
});

export type AccountWorkspace = z.infer<typeof accountWorkspaceSchema>;

export const accountWorkspacesResponseSchema = z.object({
  workspaces: z.array(accountWorkspaceSchema),
  persistence: persistenceStateSchema,
});

export type AccountWorkspacesResponse = z.infer<typeof accountWorkspacesResponseSchema>;

export const updateWorkspaceRequestBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
  })
  .strict();

export const updateWorkspaceMemberRequestBodySchema = z
  .object({
    role: memberRoleSchema,
  })
  .strict();

export const createWorkspaceInvitationRequestBodySchema = z
  .object({
    email: z.string().trim().email(),
    role: memberRoleSchema.exclude(["owner"]).default("teacher"),
  })
  .strict();

export const createWorkspaceInvitationResponseSchema = z.object({
  emailSent: z.boolean(),
  invitationUrl: z.string().url(),
});

export const workspaceInvitationActionResponseSchema = z.object({
  emailSent: z.boolean().optional(),
  invitationUrl: z.string().url().optional(),
  ok: z.boolean(),
});

export const acceptWorkspaceInvitationRequestBodySchema = z
  .object({
    token: z.string().trim().min(16),
  })
  .strict();

export const exportHtmlRequestBodySchema = z
  .object({
    html: z.string().trim().min(1).max(5 * 1024 * 1024),
    artifactVersionId: z.string().uuid().optional(),
    filename: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export type ExportHtmlRequestBody = z.infer<typeof exportHtmlRequestBodySchema>;

export const exportHtmlResponseSchema = z.object({
  exportFile: z.object({
    id: z.string().uuid(),
    projectId: projectIdSchema,
    artifactVersionId: z.string().uuid().nullable(),
    provider: z.literal("cloudflare-r2"),
    bucket: z.string().trim().min(1),
    objectKey: z.string().trim().min(1),
    contentType: z.literal("text/html;charset=utf-8"),
    byteSize: z.number().int().nonnegative(),
    checksum: z.string().trim().min(1),
    createdAt: z.string().datetime(),
  }),
});

export type ExportHtmlResponse = z.infer<typeof exportHtmlResponseSchema>;

export const smartEduDataSchemas = {
  artifact: structuredArtifactDataSchema,
  trace: workflowTraceDataSchema,
} as const;

export const chatRequestBodySchema = z
  .object({
    messages: z.unknown(),
    projectId: projectIdSchema.optional(),
    context: peTeacherContextSchema.optional(),
    mode: generationModeSchema.optional(),
    lessonPlan: z.string().optional(),
    screenPlan: lessonScreenPlanSchema.optional(),
    market: standardsMarketSchema.optional(),
  })
  .strict();

export type ChatRequestBody = z.infer<typeof chatRequestBodySchema>;
