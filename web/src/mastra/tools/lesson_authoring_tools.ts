import { randomUUID } from "node:crypto";

import type { FullOutput } from "@mastra/core/stream";
import { createTool } from "@mastra/core/tools";
import { withMastra } from "@mastra/ai-sdk";
import {
  extractJsonMiddleware,
  generateText,
  Output,
  stepCountIs,
  wrapLanguageModel,
} from "ai";
import { z } from "zod";

import { competitionLessonPlanSchema } from "@/lib/competition-lesson-contract";
import {
  DEFAULT_STANDARDS_MARKET,
  lessonAuthoringMemorySchema,
  lessonIntakeResultSchema,
  peTeacherContextSchema,
  standardsMarketSchema,
  type SmartEduUIMessage,
} from "@/lib/lesson-authoring-contract";

import { createLessonPatchAgent } from "../agents/lesson_patch";
import { buildPeTeacherSystemPrompt } from "../skills/pe_teacher_prompt";
import { runCompetitionLessonPatchSkill } from "../skills/competition_lesson_patch_skill";
import { runLessonIntakeSkill } from "../skills/lesson_intake_skill";
import { runModelOperationWithRetry } from "../skills/lesson_generation_skill";
import { createChatModel } from "../models";

const DEFAULT_MODEL_ID = process.env.AI_MODEL ?? "gpt-4.1-mini";
const LESSON_PATCH_MODEL_ID = process.env.AI_LESSON_PATCH_MODEL ?? process.env.AI_PATCH_MODEL ?? DEFAULT_MODEL_ID;
const TOOL_MAX_STEPS = 5;

function nowRequestId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

function createUserMessage(text: string): SmartEduUIMessage {
  return {
    id: nowRequestId("tool-message"),
    role: "user",
    parts: [{ type: "text", text }],
  };
}

function createStructuredModel(modelId = DEFAULT_MODEL_ID) {
  return wrapLanguageModel({
    model: createChatModel(modelId),
    middleware: extractJsonMiddleware(),
  });
}

function compactJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function parsePositiveIntegerFromText(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value !== "string") {
    return value;
  }

  const match = /\d+/.exec(value.replace(/，/g, ","));

  return match ? Number.parseInt(match[0], 10) : undefined;
}

function normalizeTextArrayInput(value: unknown) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim();

  if (!normalized) {
    return undefined;
  }

  return normalized
    .split(/[、,，;；\n\r]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeConstraintsInput(value: unknown) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim();

  if (!normalized) {
    return undefined;
  }

  const parts = normalized
    .split(/[;；\n\r]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  return parts.length > 1 ? parts : [normalized];
}

const flexiblePositiveIntegerSchema = (max: number) =>
  z.preprocess(parsePositiveIntegerFromText, z.number().int().positive().max(max).optional());

const flexibleTextArraySchema = (maxItems: number, maxLength: number) =>
  z.preprocess(
    normalizeTextArrayInput,
    z.array(z.string().trim().min(1).max(maxLength)).max(maxItems).optional(),
  );

const flexibleConstraintsSchema = z.preprocess(
  normalizeConstraintsInput,
  z.array(z.string().trim().min(1).max(200)).max(12).optional(),
);

const flexiblePeTeacherContextSchema = z.preprocess((value) => {
  if (typeof value === "string") {
    return undefined;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const candidate = value as Record<string, unknown>;

  return {
    ...candidate,
    duration: parsePositiveIntegerFromText(candidate.duration),
    equipment: normalizeTextArrayInput(candidate.equipment),
  };
}, peTeacherContextSchema.optional());

export const lessonGenerationToolInputSchema = z
  .object({
    request: z.string().trim().min(1).max(4000).describe("教师的自然语言课时计划需求。"),
    topic: z.string().trim().min(1).max(160).optional(),
    grade: z.string().trim().min(1).max(80).optional(),
    teachingLevel: z.string().trim().min(1).max(80).optional(),
    durationMinutes: flexiblePositiveIntegerSchema(240).describe(
      "课时时长，支持数字或“40分钟”等中文字符串；工具会规范化为分钟数。",
    ),
    studentCount: flexiblePositiveIntegerSchema(300).describe(
      "学生人数，支持数字或“40人”等中文字符串；工具会规范化为人数。",
    ),
    venue: z.string().trim().min(1).max(160).optional(),
    equipment: flexibleTextArraySchema(32, 120).describe(
      "器材清单，优先传字符串数组；若传“篮球20个、标志桶8个”等字符串，工具会自动拆分。",
    ),
    constraints: flexibleConstraintsSchema.describe(
      "教学、安全或场地约束，优先传字符串数组；若传单条字符串，工具会自动包装为数组。",
    ),
    standardsContext: z.string().trim().max(12000).optional(),
    context: flexiblePeTeacherContextSchema.describe(
      "用户资料上下文对象。不要传自然语言字符串；若误传字符串，工具会忽略该字段。",
    ),
    market: standardsMarketSchema.default(DEFAULT_STANDARDS_MARKET),
  })
  .strict();

export type LessonGenerationToolInput = z.input<typeof lessonGenerationToolInputSchema>;

const lessonGenerationToolOutputSchema = z
  .object({
    lessonPlan: competitionLessonPlanSchema,
    repairApplied: z.boolean(),
    source: z.literal("structured-generation-tool"),
    summary: z.string().trim().min(1).max(500),
  })
  .strict();

async function generateCompetitionLessonPlan(input: LessonGenerationToolInput) {
  const normalizedInput = lessonGenerationToolInputSchema.parse(input);
  const system = [
    buildPeTeacherSystemPrompt(normalizedInput.context, { mode: "lesson" }),
    "你正在作为 deprecated legacy generate_structured_lesson / write_lesson_plan 工具执行结构化生成。",
    "只输出 CompetitionLessonPlan 对象本身，不要输出提交工具参数、Markdown、解释文字或代码围栏。",
    "如果 standardsContext 已提供，必须把课标依据落实到目标、重难点、评价和安全设计中。",
  ].join("\n\n");
  const userPrompt = [
    "教师课时计划需求：",
    normalizedInput.request,
    "",
    "已标准化参数：",
    compactJson({
      topic: normalizedInput.topic,
      grade: normalizedInput.grade,
      teachingLevel: normalizedInput.teachingLevel,
      durationMinutes: normalizedInput.durationMinutes,
      studentCount: normalizedInput.studentCount,
      venue: normalizedInput.venue,
      equipment: normalizedInput.equipment,
      constraints: normalizedInput.constraints,
      market: normalizedInput.market,
    }),
    "",
    "课标检索上下文：",
    normalizedInput.standardsContext ?? "未提供。若缺少课标依据，仍需按现行义务教育体育与健康课程标准的通用原则谨慎生成。",
  ].join("\n");

  const result = await runModelOperationWithRetry(
    () =>
      generateText({
        model: createStructuredModel(),
        system,
        messages: [{ role: "user", content: userPrompt }],
        stopWhen: stepCountIs(TOOL_MAX_STEPS),
        temperature: 0,
        output: Output.object({
          schema: competitionLessonPlanSchema,
          name: "CompetitionLessonPlan",
          description: "广东省比赛体育课时计划结构化对象。",
        }),
      }),
    { mode: "lesson", requestId: nowRequestId("generate-lesson-tool") },
  );

  const lessonPlan = competitionLessonPlanSchema.parse(result.output);

  return lessonGenerationToolOutputSchema.parse({
    lessonPlan,
    repairApplied: false,
    source: "structured-generation-tool",
    summary: `${lessonPlan.meta.grade ?? normalizedInput.grade ?? "目标年级"}《${lessonPlan.meta.topic}》课时计划已生成。`,
  });
}

export const analyzeRequirementsTool = createTool({
  id: "analyze_requirements",
  description:
    "当教师需求不够清楚，或你需要判断是否能直接生成课时计划时调用。返回已知信息、缺失项和建议追问。",
  inputSchema: z
    .object({
      request: z.string().trim().min(1).max(4000),
      context: peTeacherContextSchema.optional(),
      memory: lessonAuthoringMemorySchema.optional(),
    })
    .strict(),
  outputSchema: lessonIntakeResultSchema,
  execute: async ({ request, context, memory }) => {
    const normalizedMemory = lessonAuthoringMemorySchema.parse(memory ?? {});
    const result = await runLessonIntakeSkill({
      context,
      maxSteps: TOOL_MAX_STEPS,
      memory: normalizedMemory,
      messages: [createUserMessage(request)],
      requestId: nowRequestId("analyze-requirements-tool"),
    });

    return result.intake;
  },
});

export const generateStructuredLessonTool = createTool({
  id: "generate_structured_lesson",
  description:
    "[Deprecated legacy compatibility only] 旧版 Agent 工具链使用的课时计划生成工具。正式新链路由服务端确定性生成管线直接生成、校验和持久化，不应让 Agent 调用本工具搬运 CompetitionLessonPlan。",
  inputSchema: lessonGenerationToolInputSchema,
  outputSchema: lessonGenerationToolOutputSchema,
  execute: generateCompetitionLessonPlan,
});

export const writeLessonPlanTool = createTool({
  id: "write_lesson_plan",
  description:
    "[Deprecated legacy compatibility only] 旧版 Agent 工具链使用的自然语言课时计划生成工具。正式新链路由服务端确定性生成管线直接生成、校验和持久化，不应让 Agent 调用本工具搬运 CompetitionLessonPlan。",
  inputSchema: lessonGenerationToolInputSchema,
  outputSchema: lessonGenerationToolOutputSchema,
  execute: generateCompetitionLessonPlan,
});

export const applyLessonPatchTool = createTool({
  id: "apply_lesson_patch",
  description:
    "[Legacy compatibility] 当教师要求修改现有课时计划时调用。只做局部语义修改，返回修改后的 CompetitionLessonPlan；新链路应由服务端接收返回值并完成校验、封装和持久化。",
  inputSchema: z
    .object({
      lessonPlan: competitionLessonPlanSchema,
      instruction: z.string().trim().min(1).max(4000),
      targetPaths: z.array(z.string().trim().min(1).max(240)).max(20).optional(),
      additionalInstructions: z.string().trim().max(2000).optional(),
    })
    .strict(),
  execute: async ({ lessonPlan, instruction, targetPaths, additionalInstructions }) => {
    const parsedLessonPlan = competitionLessonPlanSchema.parse(lessonPlan);
    const patchAgent = createLessonPatchAgent(withMastra(createChatModel(LESSON_PATCH_MODEL_ID)));
    const agentGenerate: Parameters<typeof runCompetitionLessonPatchSkill>[1]["agentGenerate"] = async (messages, options) =>
      (await patchAgent.generate(messages, options)) as FullOutput<unknown>;

    return runCompetitionLessonPatchSkill(
      {
        instruction,
        lessonPlan: parsedLessonPlan,
        targetPaths,
      },
      {
        additionalInstructions,
        agentGenerate,
        maxSteps: TOOL_MAX_STEPS,
        requestId: nowRequestId("apply-lesson-patch-tool"),
      },
    );
  },
});

export const lessonAuthoringTools = {
  analyze_requirements: analyzeRequirementsTool,
  generate_structured_lesson: generateStructuredLessonTool,
  write_lesson_plan: writeLessonPlanTool,
  apply_lesson_patch: applyLessonPatchTool,
};
