/**
 * @module lesson-authoring-contract
 * @description 面向 AI 工作流的接口层。定义 authoring 流程的输入/输出类型：
 *              - 用户上下文（PeTeacherContext）、意图采集（LessonIntake*）
 *              - 工作流追踪（WorkflowTrace*）、结构化产物（StructuredArtifact*）
 *              - 持久化与 API 请求/响应类型
 *              本模块按需 import competition-lesson-contract 的 schema（如
 *              competitionLessonPlanSchema），但不再 re-export，消费者应直接从
 *              各原始模块导入业务/协议类型。
 */
import type { UIMessage } from "ai";
import { z } from "zod";

// ---- 业务数据类型（来自 competition-lesson-contract）----
import { competitionLessonPlanSchema } from "@/lib/lesson/contract";

export const STRUCTURED_ARTIFACT_PROTOCOL_VERSION = "structured-v1" as const;

export const generationModeSchema = z.enum(["lesson", "html"]);
export type GenerationMode = z.infer<typeof generationModeSchema>;
export const artifactContentTypeSchema = z.enum(["html", "lesson-json"]);
export type ArtifactContentType = z.infer<typeof artifactContentTypeSchema>;
export const artifactViewSchema = z.enum(["lesson", "canvas", "versions"]);
export type ArtifactView = z.infer<typeof artifactViewSchema>;

export const projectIdSchema = z.string().uuid();

export const standardsMarketSchema = z.enum(["cn-compulsory-2022", "us-shape-k12"]);
export type StandardsMarket = z.infer<typeof standardsMarketSchema>;

export const DEFAULT_STANDARDS_MARKET: StandardsMarket = "cn-compulsory-2022";

export const peTeacherContextSchema = z
  .object({
    grade: z.string().trim().min(1).max(80).optional(),
    teacherName: z.string().trim().min(1).max(80).optional(),
    schoolName: z.string().trim().min(1).max(160).optional(),
    teachingGrade: z.string().trim().min(1).max(80).optional(),
    teachingLevel: z.string().trim().min(1).max(80).optional(),
    topic: z.string().trim().min(1).max(160).optional(),
    duration: z.number().int().positive().max(240).optional(),
    venue: z.string().trim().min(1).max(160).optional(),
    equipment: z.array(z.string().trim().min(1).max(120)).max(32).optional(),
  })
  .strict();

export type PeTeacherContext = z.infer<typeof peTeacherContextSchema>;

export const lessonIntakeFieldSchema = z.enum([
  "grade",
  "topic",
  "duration",
  "studentCount",
  "venue",
  "equipment",
  "teachingLevel",
  "objectives",
  "constraints",
]);

export type LessonIntakeField = z.infer<typeof lessonIntakeFieldSchema>;

export const lessonIntakeKnownInfoSchema = z
  .object({
    grade: z.string().trim().min(1).max(80).optional(),
    teachingLevel: z.string().trim().min(1).max(80).optional(),
    topic: z.string().trim().min(1).max(160).optional(),
    durationMinutes: z.number().int().positive().max(240).optional(),
    studentCount: z.number().int().positive().max(300).optional(),
    venue: z.string().trim().min(1).max(160).optional(),
    equipment: z.array(z.string().trim().min(1).max(120)).max(32).optional(),
    objectives: z.array(z.string().trim().min(1).max(160)).max(5).optional(),
    constraints: z.array(z.string().trim().min(1).max(160)).max(8).optional(),
  })
  .strict();

export type LessonIntakeKnownInfo = z.infer<typeof lessonIntakeKnownInfoSchema>;

export const lessonIntakeClarificationSchema = z
  .object({
    field: lessonIntakeFieldSchema,
    question: z.string().trim().min(1).max(180),
  })
  .strict();

export type LessonIntakeClarification = z.infer<typeof lessonIntakeClarificationSchema>;

export const lessonAuthoringMemorySchema = z
  .object({
    defaults: lessonIntakeKnownInfoSchema.default({}),
    updatedAt: z.string().datetime().optional(),
  })
  .strict();

export type LessonAuthoringMemory = z.infer<typeof lessonAuthoringMemorySchema>;

export const lessonIntakeResultSchema = z
  .object({
    readyToGenerate: z.boolean(),
    known: lessonIntakeKnownInfoSchema.optional(),
    missing: z.array(lessonIntakeFieldSchema).max(9),
    clarifications: z.array(lessonIntakeClarificationSchema).max(5).default([]),
    summary: z.string().trim().min(1).max(1200).optional(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export type LessonIntakeResult = z.infer<typeof lessonIntakeResultSchema>;

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
    issuer: z.string().trim().min(1),
    version: z.string().trim().min(1),
    url: z.string().url().nullable(),
    references: z.array(workflowStandardsReferenceSchema),
  })
  .strict();

export type WorkflowStandardsSnapshot = z.infer<typeof workflowStandardsSnapshotSchema>;

export const workflowTextbookReferenceSchema = z
  .object({
    id: z.string().trim().min(1),
    title: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    citation: z.string().trim().min(1),
    publisher: z.string().trim().min(1),
    textbookName: z.string().trim().min(1),
    edition: z.string().trim().min(1).nullable(),
    grade: z.string().trim().min(1).nullable(),
    level: z.string().trim().min(1).nullable(),
    module: z.string().trim().min(1),
    sectionPath: z.array(z.string().trim().min(1)),
    sourceKind: z.string().trim().min(1),
    score: z.number(),
  })
  .strict();

export type WorkflowTextbookReference = z.infer<typeof workflowTextbookReferenceSchema>;

export const workflowTextbookSnapshotSchema = z
  .object({
    market: standardsMarketSchema,
    stage: z.string().trim().min(1),
    publisher: z.string().trim().min(1).optional(),
    grade: z.string().trim().min(1).optional(),
    referenceCount: z.number().int().nonnegative(),
    references: z.array(workflowTextbookReferenceSchema),
    warning: z.string().trim().min(1).optional(),
  })
  .strict();

export type WorkflowTextbookSnapshot = z.infer<typeof workflowTextbookSnapshotSchema>;

export const uiHintToastLevelSchema = z.enum(["info", "success", "warning", "error"]);
export type UiHintToastLevel = z.infer<typeof uiHintToastLevelSchema>;

export const uiHintSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("switch_tab"),
      params: z
        .object({
          tab: artifactViewSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal("show_toast"),
      params: z
        .object({
          level: uiHintToastLevelSchema,
          title: z.string().trim().min(1).max(120),
          description: z.string().trim().min(1).max(240).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal("trigger_print"),
      params: z
        .object({
          target: z.literal("lesson"),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal("scroll_to"),
      params: z
        .object({
          target: z.enum(["artifact-top", "artifact-content", "versions-panel"]),
        })
        .strict(),
    })
    .strict(),
]);

export type UiHint = z.infer<typeof uiHintSchema>;

export const htmlArtifactPageSchema = z
  .object({
    pageIndex: z.number().int().nonnegative(),
    pageRole: z.string().trim().min(1).max(64).optional(),
    pageTitle: z.string().trim().min(1).max(160).optional(),
    sectionHtml: z.string().trim().min(1),
  })
  .strict();

export type HtmlArtifactPage = z.infer<typeof htmlArtifactPageSchema>;

const htmlArtifactPagesSchema = z.array(htmlArtifactPageSchema).min(1).max(64);

const structuredArtifactDataBaseSchema = z.object({
  protocolVersion: z.literal(STRUCTURED_ARTIFACT_PROTOCOL_VERSION),
  content: z.string(),
  isComplete: z.boolean(),
  status: z.enum(["streaming", "ready", "error"]),
  source: z.literal("data-part"),
  title: z.string().optional(),
  warningText: z.string().optional(),
  updatedAt: z.string().datetime(),
});

export const structuredArtifactDataSchema = z.discriminatedUnion("stage", [
  structuredArtifactDataBaseSchema.extend({
    stage: z.literal("lesson"),
    contentType: z.literal("lesson-json"),
  }).strict(),
  structuredArtifactDataBaseSchema.extend({
    stage: z.literal("html"),
    contentType: z.literal("html"),
    htmlPages: htmlArtifactPagesSchema.optional(),
  }).strict(),
]);

export type StructuredArtifactData = z.infer<typeof structuredArtifactDataSchema>;
export type LessonStructuredArtifactData = Extract<StructuredArtifactData, { stage: "lesson" }>;
export type HtmlStructuredArtifactData = Extract<StructuredArtifactData, { stage: "html" }>;

export const workflowTraceDataSchema = z.object({
  protocolVersion: z.literal(STRUCTURED_ARTIFACT_PROTOCOL_VERSION),
  requestId: z.string().trim().min(1),
  mode: generationModeSchema,
  phase: z.enum(["workflow", "generation", "completed", "failed"]),
  responseTransport: z.literal("structured-data-part"),
  requestedMarket: standardsMarketSchema,
  resolvedMarket: standardsMarketSchema,
  warnings: z.array(z.string()),
  uiHints: z.array(uiHintSchema).default([]),
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

const persistedArtifactVersionBaseSchema = z.object({
  id: z.string().uuid(),
  artifactId: z.string().uuid(),
  title: z.string().trim().min(1).optional(),
  content: z.string(),
  status: z.enum(["streaming", "ready", "error"]),
  protocolVersion: z.string().trim().min(1),
  versionNumber: z.number().int().positive(),
  createdAt: z.string().datetime(),
  isCurrent: z.boolean().optional(),
  warningText: z.string().optional(),
  trace: workflowTraceDataSchema.optional(),
});

export const persistedArtifactVersionSchema = z.discriminatedUnion("stage", [
  persistedArtifactVersionBaseSchema.extend({
    stage: z.literal("lesson"),
    contentType: z.literal("lesson-json"),
  }).strict(),
  persistedArtifactVersionBaseSchema.extend({
    stage: z.literal("html"),
    contentType: z.literal("html"),
    htmlPages: htmlArtifactPagesSchema.optional(),
  }).strict(),
]);

export type PersistedArtifactVersion = z.infer<typeof persistedArtifactVersionSchema>;
export type LessonPersistedArtifactVersion = Extract<PersistedArtifactVersion, { stage: "lesson" }>;
export type HtmlPersistedArtifactVersion = Extract<PersistedArtifactVersion, { stage: "html" }>;

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
  uiHints: z.array(uiHintSchema).default([]),
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
    filename: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export type ExportHtmlRequestBody = z.infer<typeof exportHtmlRequestBodySchema>;

export const exportHtmlResponseSchema = z.object({
  exportFile: z.object({
    id: z.string().uuid(),
    projectId: projectIdSchema,
    provider: z.literal("s3-compatible"),
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
    messages: z.array(z.unknown()).max(60),
    projectId: projectIdSchema.optional(),
    context: peTeacherContextSchema.optional(),
    mode: generationModeSchema.optional(),
    lessonPlan: z.string().max(1_000_000).optional(),
    market: standardsMarketSchema.optional(),
  })
  .strict();

export type ChatRequestBody = z.infer<typeof chatRequestBodySchema>;
