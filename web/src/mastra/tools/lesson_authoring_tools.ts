import { randomUUID } from "node:crypto";

import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import {
  DEFAULT_STANDARDS_MARKET,
  lessonAuthoringMemorySchema,
  lessonIntakeResultSchema,
  peTeacherContextSchema,
  standardsMarketSchema,
  type SmartEduUIMessage,
} from "@/lib/lesson-authoring-contract";

import { runLessonIntakeSkill } from "../skills/runtime/lesson_intake_skill";

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
