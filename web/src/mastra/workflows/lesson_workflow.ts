import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

import {
  DEFAULT_STANDARDS_MARKET,
  STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
  generationModeSchema,
  lessonScreenPlanSchema,
  peTeacherContextSchema,
  standardsMarketSchema,
  workflowTraceEntrySchema,
  workflowStandardsReferenceSchema,
  type GenerationMode,
  type LessonScreenPlan,
  type PeTeacherContext,
} from "@/lib/lesson-authoring-contract";

import { buildPeTeacherSystemPrompt } from "../agents/pe_teacher";
import { runStandardsRetrievalSkill } from "../skills/standards_retrieval_skill";

export const lessonWorkflowInputSchema = z.object({
  query: z.string().trim().min(1),
  mode: generationModeSchema,
  context: peTeacherContextSchema.optional(),
  market: standardsMarketSchema.default(DEFAULT_STANDARDS_MARKET),
  lessonPlan: z.string().optional(),
  screenPlan: lessonScreenPlanSchema.optional(),
});

export const lessonWorkflowOutputSchema = z.object({
  system: z.string(),
  standardsContext: z.string(),
  standards: z.object({
    requestedMarket: standardsMarketSchema,
    resolvedMarket: standardsMarketSchema,
    corpusId: z.string(),
    displayName: z.string(),
    officialStatus: z.string(),
    sourceName: z.string(),
    issuer: z.string(),
    version: z.string(),
    url: z.string().url(),
    availability: z.enum(["ready", "planned"]),
    referenceCount: z.number(),
    references: z.array(workflowStandardsReferenceSchema).optional(),
    warning: z.string().optional(),
  }),
  generationPlan: z.object({
    mode: generationModeSchema,
    confirmedLessonRequired: z.boolean(),
    outputProtocol: z.enum(["lesson-json", "html-document"]),
    responseTransport: z.literal("structured-data-part"),
    assistantTextPolicy: z.enum(["mirror-json-text", "suppress-json-text", "suppress-html-text"]),
    maxSteps: z.number(),
    protocolVersion: z.literal(STRUCTURED_ARTIFACT_PROTOCOL_VERSION),
  }),
  safety: z.object({
    htmlSandboxRequired: z.boolean(),
    externalNetworkAllowed: z.boolean(),
    forbiddenCapabilities: z.array(z.string()),
    warnings: z.array(z.string()),
  }),
  trace: z.array(workflowTraceEntrySchema),
});

export type LessonWorkflowInput = z.infer<typeof lessonWorkflowInputSchema> & {
  context?: PeTeacherContext;
  mode: GenerationMode;
  screenPlan?: LessonScreenPlan;
};

export type LessonWorkflowOutput = z.infer<typeof lessonWorkflowOutputSchema>;

const standardsRetrievalOutputSchema = lessonWorkflowInputSchema.extend({
  standardsContext: z.string(),
  standards: lessonWorkflowOutputSchema.shape.standards,
  trace: lessonWorkflowOutputSchema.shape.trace,
});

const promptConstructionOutputSchema = standardsRetrievalOutputSchema.extend({
  system: z.string(),
});

const deliveryPlanningOutputSchema = promptConstructionOutputSchema.extend({
  generationPlan: lessonWorkflowOutputSchema.shape.generationPlan,
});

const retrieveStandardsStep = createStep({
  id: "retrieve-standards-context",
  description: "解析目标市场并检索对应体育课程标准结构化条目。",
  inputSchema: lessonWorkflowInputSchema,
  outputSchema: standardsRetrievalOutputSchema,
  execute: async ({ inputData }) => {
    const standardsResult = runStandardsRetrievalSkill({
      query: inputData.query,
      market: inputData.market,
    });

    const trace = [
      {
        step: "retrieve-standards-context",
        status: "success" as const,
        detail: `目标市场 ${standardsResult.requestedMarket} 已解析为 ${standardsResult.resolvedMarket}，命中 ${standardsResult.references.length} 条课标条目。`,
      },
      ...(standardsResult.warning
        ? [
            {
              step: "resolve-standards-market",
              status: "blocked" as const,
              detail: standardsResult.warning,
            },
          ]
        : []),
    ];

    return {
      ...inputData,
      standardsContext: standardsResult.context,
      standards: {
        requestedMarket: standardsResult.requestedMarket,
        resolvedMarket: standardsResult.resolvedMarket,
        corpusId: standardsResult.corpus.corpusId,
        displayName: standardsResult.corpus.displayName,
        officialStatus: standardsResult.corpus.officialStatus,
        sourceName: standardsResult.corpus.sourceName,
        issuer: standardsResult.corpus.issuer,
        version: standardsResult.corpus.version,
        url: standardsResult.corpus.url,
        availability: standardsResult.corpus.availability,
        referenceCount: standardsResult.references.length,
        references: standardsResult.references.map((reference) => ({
          id: reference.id,
          title: reference.title,
          summary: reference.summary,
          citation: reference.citation,
          module: reference.module,
          gradeBands: reference.gradeBands,
          sectionPath: reference.sectionPath,
          score: reference.score,
        })),
        ...(standardsResult.warning ? { warning: standardsResult.warning } : {}),
      },
      trace,
    };
  },
});

const constructPromptStep = createStep({
  id: "construct-generation-prompt",
  description: "根据生成阶段、课堂上下文与课标解析结果构造 Agent 系统提示词。",
  inputSchema: standardsRetrievalOutputSchema,
  outputSchema: promptConstructionOutputSchema,
  execute: async ({ inputData }) => {
    const system = [
      buildPeTeacherSystemPrompt(inputData.context, {
        mode: inputData.mode,
        lessonPlan: inputData.lessonPlan,
        screenPlan: inputData.screenPlan,
      }),
      `\n目标市场：${inputData.standards.resolvedMarket}`,
      `使用语料：${inputData.standards.displayName}`,
      `官方状态：${inputData.standards.officialStatus}`,
      `可参考的课程标准片段：\n${inputData.standardsContext}`,
    ].join("\n\n");

    return {
      ...inputData,
      system,
      trace: [
        ...inputData.trace,
        {
          step: "construct-generation-prompt",
          status: "success" as const,
          detail: `已构造 ${inputData.mode} 阶段系统提示词，并注入目标市场与课标上下文。`,
        },
      ],
    };
  },
});

const planDeliveryStep = createStep({
  id: "plan-structured-delivery",
  description: "规划结构化 Artifact 推流策略、文本可见性与协议版本。",
  inputSchema: promptConstructionOutputSchema,
  outputSchema: deliveryPlanningOutputSchema,
  execute: async ({ inputData }) => {
    return {
      ...inputData,
      generationPlan: {
        mode: inputData.mode,
        confirmedLessonRequired: inputData.mode === "html",
        outputProtocol: inputData.mode === "html" ? ("html-document" as const) : ("lesson-json" as const),
        responseTransport: "structured-data-part" as const,
        assistantTextPolicy: inputData.mode === "html" ? ("suppress-html-text" as const) : ("suppress-json-text" as const),
        maxSteps: 3,
        protocolVersion: STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
      },
      trace: [
        ...inputData.trace,
        {
          step: "plan-structured-delivery",
          status: "success" as const,
          detail:
            inputData.mode === "html"
              ? "已规划 HTML 结构化 Artifact 推流，并抑制原始 HTML 文本进入会话历史。"
              : "已规划 CompetitionLessonPlan JSON 实时推流，并抑制原始 JSON 文本进入会话历史。",
        },
      ],
    };
  },
});

const validateSafetyStep = createStep({
  id: "validate-generation-safety",
  description: "校验分阶段生成前置条件，并注入结构化渲染与 HTML 沙箱安全策略。",
  inputSchema: deliveryPlanningOutputSchema,
  outputSchema: lessonWorkflowOutputSchema,
  execute: async ({ inputData }) => {
    const warnings = [...(inputData.standards.warning ? [inputData.standards.warning] : [])];

    if (inputData.mode === "html" && !inputData.lessonPlan?.trim()) {
      throw new Error("生成互动大屏前必须提供已确认教案。请先完成教案确认，再进入 HTML 生成阶段。");
    }

    if (inputData.standards.referenceCount === 0) {
      warnings.push("未命中目标市场课标结构化条目，生成内容需以正式现行课标文本为准。");
    }

    return {
      system: inputData.system,
      standardsContext: inputData.standardsContext,
      standards: inputData.standards,
      generationPlan: inputData.generationPlan,
      safety: {
        htmlSandboxRequired: inputData.mode === "html",
        externalNetworkAllowed: false,
        forbiddenCapabilities: [
          "读取 cookie/localStorage/sessionStorage",
          "发起 fetch/XHR/WebSocket/EventSource 网络请求",
          "引入外部脚本、样式、媒体或 CDN 资源",
          "提交表单或打开新窗口",
        ],
        warnings,
      },
      trace: [
        ...inputData.trace,
        {
          step: "validate-generation-safety",
          status: "success" as const,
          detail:
            inputData.mode === "html"
              ? "已通过 HTML 结构化推流前置校验，并要求前端沙箱渲染。"
              : "已通过 CompetitionLessonPlan JSON 结构化推流前置校验。",
        },
      ],
    };
  },
});

export const lessonAuthoringWorkflow = createWorkflow({
  id: "lesson-authoring-workflow",
  description: "编排市场解析、课标检索、提示词构建、结构化推流计划与 HTML 沙箱安全校验。",
  inputSchema: lessonWorkflowInputSchema,
  outputSchema: lessonWorkflowOutputSchema,
})
  .then(retrieveStandardsStep)
  .then(constructPromptStep)
  .then(planDeliveryStep)
  .then(validateSafetyStep)
  .commit();
