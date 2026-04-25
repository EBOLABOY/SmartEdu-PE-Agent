import type { UIMessage } from "ai";
import { z } from "zod";

export const STRUCTURED_ARTIFACT_PROTOCOL_VERSION = "structured-v1" as const;

export const generationModeSchema = z.enum(["lesson", "html"]);
export type GenerationMode = z.infer<typeof generationModeSchema>;

export const projectIdSchema = z.string().uuid();

export const standardsMarketSchema = z.enum(["cn-compulsory-2022", "us-shape-k12"]);
export type StandardsMarket = z.infer<typeof standardsMarketSchema>;

export const DEFAULT_STANDARDS_MARKET: StandardsMarket = "cn-compulsory-2022";

export const peTeacherContextSchema = z
  .object({
    grade: z.string().trim().min(1).optional(),
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

export const structuredArtifactDataSchema = z.object({
  protocolVersion: z.literal(STRUCTURED_ARTIFACT_PROTOCOL_VERSION),
  stage: generationModeSchema,
  contentType: z.enum(["markdown", "html"]),
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
  contentType: z.enum(["markdown", "html"]),
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
    market: standardsMarketSchema.optional(),
  })
  .strict();

export type ChatRequestBody = z.infer<typeof chatRequestBodySchema>;
