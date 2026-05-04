import {
  convertToModelMessages,
  generateText,
  Output,
  stepCountIs,
} from "ai";
import { z } from "zod";

import type { GenerationMode, SmartEduUIMessage } from "@/lib/lesson/authoring-contract";

import { createChatModel } from "../../models";
import { runModelOperationWithRetry } from "./lesson_generation_skill";

export const lessonIntentTypeSchema = z.enum([
  "clarify",
  "generate_lesson",
  "patch_lesson",
  "generate_html",
  "consult_standards",
]);

export const lessonIntentSchema = z
  .object({
    intent: lessonIntentTypeSchema,
    confidence: z.number().min(0).max(1),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export type LessonIntent = z.infer<typeof lessonIntentSchema>;

type AgentModelMessages = Awaited<ReturnType<typeof convertToModelMessages>>;

type LessonIntentGenerateOptions = {
  lessonPlan?: string;
  messages: AgentModelMessages;
  mode: GenerationMode;
  modelId: string;
};

export type LessonIntentGenerateRunner = (
  options: LessonIntentGenerateOptions,
) => Promise<LessonIntent>;

const DEFAULT_LESSON_INTENT_MODEL_ID = "gpt-4.1-mini";
const htmlIntentPattern = /互动大屏|大屏|投屏|html|页面|课件|幻灯|屏幕|展示页/i;
const patchLessonPattern =
  /修改|调整|补充|优化|完善|删改|删除|替换|改成|修正|更新|局部|润色|重写其中/;
const standardsConsultPattern =
  /课标|标准|依据|要求|核心素养|合规|安全性|安全吗|是否符合|适不适合|评价依据|政策/;
const standardsGenerationPattern = /生成|写|设计|输出|产出|大屏|html/;
const vagueClarifyPattern = /这个|那个|看一个|看看|先帮我/;
const explicitLessonTermsPattern = /(课时计划|教案|大屏|课标|标准)/;

function getLessonIntentModelId() {
  return process.env.AI_LESSON_INTENT_MODEL ?? process.env.AI_MODEL ?? DEFAULT_LESSON_INTENT_MODEL_ID;
}

function hasConfirmedLessonPlan(lessonPlan?: string) {
  return Boolean(lessonPlan?.trim());
}

function isHtmlIntentQuery(query: string) {
  return htmlIntentPattern.test(query);
}

function isStandardsConsultQuery(query: string) {
  return standardsConsultPattern.test(query) && !standardsGenerationPattern.test(query);
}

function resolveDeterministicIntent(input: {
  lessonPlan?: string;
  mode: GenerationMode;
  query: string;
}): LessonIntent | null {
  if (input.mode === "html" || hasConfirmedLessonPlan(input.lessonPlan)) {
    return null;
  }

  if (isHtmlIntentQuery(input.query) || isStandardsConsultQuery(input.query)) {
    return null;
  }

  return {
    intent: "generate_lesson",
    confidence: 1,
    reason: "当前工作区还没有已确认的课时计划，直接进入新课时生成流程。",
  };
}

function buildIntentSystemPrompt() {
  return [
    "你是体育教学智能体的入口意图分类器。",
    "你在以下意图中选择一个并返回结构化对象：clarify、generate_lesson、patch_lesson、generate_html、consult_standards。",
    "判定规则：",
    "1. 用户要新写、补全、重写课时计划或教案时，返回 generate_lesson。",
    "2. 用户要修改、调整、补充现有课时计划，且当前已有 lessonPlan 时，返回 patch_lesson。",
    "3. 用户要生成互动大屏、投屏 HTML、页面或课件时，返回 generate_html。",
    "4. 用户主要在咨询课标、安全、合规、评价依据时，返回 consult_standards。",
    "5. 用户意图过于模糊、缺少任务方向时，返回 clarify。",
    "6. confidence 使用 0 到 1 的小数；reason 用一句简洁的话说明依据。",
  ].join("\n");
}

export async function generateLessonIntentWithAiSdk({
  lessonPlan,
  messages,
  mode,
  modelId,
}: LessonIntentGenerateOptions): Promise<LessonIntent> {
  const result = await generateText({
    model: createChatModel(modelId),
    system: buildIntentSystemPrompt(),
    messages: [
      ...messages,
      {
        role: "user",
        content: [
          `当前 UI 模式提示：${mode}`,
          `当前是否已有已确认课时计划：${lessonPlan?.trim() ? "是" : "否"}`,
          "请基于完整对话与当前状态，返回本轮最合适的意图分类。",
        ].join("\n"),
      },
    ],
    stopWhen: stepCountIs(1),
    temperature: 0,
    output: Output.object({
      schema: lessonIntentSchema,
      name: "LessonAuthoringIntent",
      description: "Structured intent classification for the lesson authoring entrypoint.",
    }),
  });

  return result.output;
}

function inferLessonIntentHeuristically(input: {
  lessonPlan?: string;
  mode: GenerationMode;
  query: string;
}): LessonIntent {
  const normalized = input.query.trim().toLowerCase();
  const hasLessonPlan = hasConfirmedLessonPlan(input.lessonPlan);

  if (input.mode === "html" || isHtmlIntentQuery(input.query)) {
    return {
      intent: "generate_html",
      confidence: 0.86,
      reason: "用户明确要求生成互动大屏或 HTML 展示内容。",
    };
  }

  if (hasLessonPlan && patchLessonPattern.test(input.query)) {
    return {
      intent: "patch_lesson",
      confidence: 0.82,
      reason: "当前已有课时计划，且用户表达的是局部修改或补充意图。",
    };
  }

  if (isStandardsConsultQuery(input.query)) {
    return {
      intent: "consult_standards",
      confidence: 0.8,
      reason: "用户主要在咨询课标、安全或合规依据，而非要求生成成品。",
    };
  }

  if ((!normalized || vagueClarifyPattern.test(input.query)) && !explicitLessonTermsPattern.test(input.query)) {
    return {
      intent: "clarify",
      confidence: 0.62,
      reason: "用户请求方向还不够明确，需要先澄清是生成、修改还是咨询。",
    };
  }

  return {
    intent: "generate_lesson",
    confidence: 0.74,
    reason: "默认视为生成新课时计划请求。",
  };
}

async function buildIntentModelMessages(messages: SmartEduUIMessage[]) {
  return (await convertToModelMessages(messages)) as AgentModelMessages;
}

export async function runLessonIntentSkill(input: {
  generateIntent?: LessonIntentGenerateRunner;
  lessonPlan?: string;
  messages: SmartEduUIMessage[];
  mode: GenerationMode;
  query: string;
  requestId: string;
}): Promise<LessonIntent> {
  const deterministicIntent = resolveDeterministicIntent({
    lessonPlan: input.lessonPlan,
    mode: input.mode,
    query: input.query,
  });

  if (deterministicIntent) {
    return deterministicIntent;
  }

  const modelMessages = await buildIntentModelMessages(input.messages);

  try {
    return await runModelOperationWithRetry(
      () =>
        (input.generateIntent ?? generateLessonIntentWithAiSdk)({
          lessonPlan: input.lessonPlan,
          messages: modelMessages,
          mode: input.mode,
          modelId: getLessonIntentModelId(),
        }),
      {
        mode: input.mode,
        requestId: input.requestId,
      },
    );
  } catch (error) {
    const fallback = inferLessonIntentHeuristically({
      lessonPlan: input.lessonPlan,
      mode: input.mode,
      query: input.query,
    });

    console.warn("[lesson-authoring] lesson-intent-fallback", {
      requestId: input.requestId,
      message: error instanceof Error ? error.message : "unknown-error",
      fallbackIntent: fallback.intent,
    });

    return fallback;
  }
}
