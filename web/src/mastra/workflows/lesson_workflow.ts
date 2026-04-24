import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

import { buildPeTeacherSystemPrompt, type GenerationMode, type PeTeacherContext } from "../agents/pe_teacher";
import { buildStandardsContextFromReferences, searchStandards } from "../tools/search_standards";

export const lessonWorkflowInputSchema = z.object({
  query: z.string(),
  mode: z.enum(["lesson", "html"]),
  context: z
    .object({
      grade: z.string().optional(),
      topic: z.string().optional(),
      duration: z.number().optional(),
      venue: z.string().optional(),
      equipment: z.array(z.string()).optional(),
    })
    .optional(),
  lessonPlan: z.string().optional(),
});

export const lessonWorkflowOutputSchema = z.object({
  system: z.string(),
  standardsContext: z.string(),
  generationPlan: z.object({
    mode: z.enum(["lesson", "html"]),
    confirmedLessonRequired: z.boolean(),
    outputProtocol: z.enum(["markdown", "html-artifact"]),
    maxSteps: z.number(),
  }),
  safety: z.object({
    htmlSandboxRequired: z.boolean(),
    externalNetworkAllowed: z.boolean(),
    forbiddenCapabilities: z.array(z.string()),
    warnings: z.array(z.string()),
  }),
  trace: z.array(
    z.object({
      step: z.string(),
      status: z.enum(["success", "blocked"]),
      detail: z.string(),
    }),
  ),
});

export type LessonWorkflowInput = z.infer<typeof lessonWorkflowInputSchema> & {
  context?: PeTeacherContext;
  mode: GenerationMode;
};

export type LessonWorkflowOutput = z.infer<typeof lessonWorkflowOutputSchema>;

const standardsRetrievalOutputSchema = lessonWorkflowInputSchema.extend({
  standardsContext: z.string(),
  standardsReferenceCount: z.number(),
  trace: lessonWorkflowOutputSchema.shape.trace,
});

const promptConstructionOutputSchema = standardsRetrievalOutputSchema.extend({
  system: z.string(),
  generationPlan: lessonWorkflowOutputSchema.shape.generationPlan,
});

const retrieveStandardsStep = createStep({
  id: "retrieve-standards-context",
  description: "检索《义务教育体育与健康课程标准（2022年版）》结构化参考条目。",
  inputSchema: lessonWorkflowInputSchema,
  outputSchema: standardsRetrievalOutputSchema,
  execute: async ({ inputData }) => {
    const references = searchStandards(inputData.query);
    const standardsContext = buildStandardsContextFromReferences(references);

    return {
      ...inputData,
      standardsContext,
      standardsReferenceCount: references.length,
      trace: [
        {
          step: "retrieve-standards-context",
          status: "success" as const,
          detail: `命中 ${references.length} 条义务教育体育与健康课标结构化条目。`,
        },
      ],
    };
  },
});

const constructPromptStep = createStep({
  id: "construct-generation-prompt",
  description: "根据生成阶段、课堂上下文和课标片段构造 Agent 系统提示词。",
  inputSchema: standardsRetrievalOutputSchema,
  outputSchema: promptConstructionOutputSchema,
  execute: async ({ inputData }) => {
    const system = `${buildPeTeacherSystemPrompt(inputData.context, {
      mode: inputData.mode,
      lessonPlan: inputData.lessonPlan,
    })}\n\n可参考的课程标准片段：\n${inputData.standardsContext}`;
    const outputProtocol: "markdown" | "html-artifact" = inputData.mode === "html" ? "html-artifact" : "markdown";

    return {
      ...inputData,
      system,
      generationPlan: {
        mode: inputData.mode,
        confirmedLessonRequired: inputData.mode === "html",
        outputProtocol,
        maxSteps: 3,
      },
      trace: [
        ...inputData.trace,
        {
          step: "construct-generation-prompt",
          status: "success" as const,
          detail: `已构造 ${outputProtocol} 阶段提示词。`,
        },
      ],
    };
  },
});

const validateSafetyStep = createStep({
  id: "validate-generation-safety",
  description: "校验分阶段生成前置条件，并注入 HTML 沙箱安全策略。",
  inputSchema: promptConstructionOutputSchema,
  outputSchema: lessonWorkflowOutputSchema,
  execute: async ({ inputData }) => {
    const warnings: string[] = [];

    if (inputData.mode === "html" && !inputData.lessonPlan?.trim()) {
      throw new Error("生成互动大屏前必须提供已确认教案。请先完成教案确认，再进入 HTML 生成阶段。");
    }

    if (inputData.standardsReferenceCount === 0) {
      warnings.push("未命中《义务教育体育与健康课程标准（2022年版）》结构化条目，生成内容需以教育部正式课标文本为准。");
    }

    return {
      system: inputData.system,
      standardsContext: inputData.standardsContext,
      generationPlan: inputData.generationPlan,
      safety: {
        htmlSandboxRequired: inputData.mode === "html",
        externalNetworkAllowed: false,
        forbiddenCapabilities: [
          "读取 cookie/localStorage/sessionStorage",
          "发起 fetch/XHR/WebSocket 网络请求",
          "引入外部脚本、样式或 CDN 资源",
          "提交表单或打开新窗口",
        ],
        warnings,
      },
      trace: [
        ...inputData.trace,
        {
          step: "validate-generation-safety",
          status: "success" as const,
          detail: inputData.mode === "html" ? "已通过 HTML 生成前置校验，并要求前端沙箱渲染。" : "已通过 Markdown 教案生成前置校验。",
        },
      ],
    };
  },
});

export const lessonAuthoringWorkflow = createWorkflow({
  id: "lesson-authoring-workflow",
  description: "编排课标检索、系统提示词构建、分阶段生成计划和 HTML 沙箱安全校验。",
  inputSchema: lessonWorkflowInputSchema,
  outputSchema: lessonWorkflowOutputSchema,
})
  .then(retrieveStandardsStep)
  .then(constructPromptStep)
  .then(validateSafetyStep)
  .commit();
