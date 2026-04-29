import {
  convertToModelMessages,
  extractJsonMiddleware,
  generateText,
  Output,
  stepCountIs,
  wrapLanguageModel,
} from "ai";

import {
  fillLessonIntakeWithMemory,
  formatLessonAuthoringMemoryForPrompt,
} from "@/lib/lesson-authoring-memory";
import {
  type LessonAuthoringMemory,
  lessonIntakeResultSchema,
  type GenerationMode,
  type LessonIntakeResult,
  type PeTeacherContext,
  type SmartEduUIMessage,
} from "@/lib/lesson-authoring-contract";

import { buildLessonIntakeSystemPrompt } from "../agents/lesson_intake";
import { createChatModel } from "../models";
import { runModelOperationWithRetry } from "./lesson_generation_skill";

type AgentModelMessages = Awaited<ReturnType<typeof convertToModelMessages>>;

type LessonIntakeGenerateOptions = {
  messages: AgentModelMessages;
  system: string;
  maxSteps: number;
  modelId: string;
};

export type LessonIntakeGenerateRunner = (options: LessonIntakeGenerateOptions) => Promise<LessonIntakeResult>;

export type LessonIntakeSkillResult = {
  intake: LessonIntakeResult;
  memoryUsed?: boolean;
  modelMessageCount: number;
  source: "agent" | "safe-fallback";
  warning?: string;
};

const DEFAULT_LESSON_INTAKE_MODEL_ID = "gpt-4.1-mini";

function getLessonIntakeModelId() {
  return process.env.AI_LESSON_INTAKE_MODEL ?? process.env.AI_MODEL ?? DEFAULT_LESSON_INTAKE_MODEL_ID;
}

export async function generateLessonIntakeWithAiSdk({
  messages,
  system,
  maxSteps,
  modelId,
}: LessonIntakeGenerateOptions): Promise<LessonIntakeResult> {
  const model = wrapLanguageModel({
    model: createChatModel(modelId),
    middleware: extractJsonMiddleware(),
  });

  const result = await generateText({
    model,
    system,
    messages,
    stopWhen: stepCountIs(maxSteps),
    temperature: 0,
    output: Output.object({
      schema: lessonIntakeResultSchema,
      name: "LessonIntakeResult",
      description: "Structured decision on whether the lesson request has enough information to generate.",
    }),
  });

  return result.output;
}

function contextToPrompt(context?: PeTeacherContext, memory?: LessonAuthoringMemory) {
  if (!context || Object.keys(context).length === 0) {
    return ["用户资料：未提供。", formatLessonAuthoringMemoryForPrompt(memory)].join("\n\n");
  }

  const lines = [
    context.schoolName ? `- 学校：${context.schoolName}` : null,
    context.teacherName ? `- 教师：${context.teacherName}` : null,
    context.teachingGrade ? `- 任教年级：${context.teachingGrade}` : null,
    context.teachingLevel ? `- 任教水平：${context.teachingLevel}` : null,
    context.grade ? `- 本次年级：${context.grade}` : null,
    context.topic ? `- 本次课题：${context.topic}` : null,
    context.duration ? `- 课时：${context.duration} 分钟` : null,
    context.venue ? `- 场地：${context.venue}` : null,
    context.equipment?.length ? `- 器材：${context.equipment.join("、")}` : null,
  ].filter(Boolean);

  return [`用户资料：\n${lines.join("\n")}`, formatLessonAuthoringMemoryForPrompt(memory)].join("\n\n");
}

async function buildIntakeModelMessages(input: {
  context?: PeTeacherContext;
  memory?: LessonAuthoringMemory;
  messages: SmartEduUIMessage[];
}) {
  return [
    ...(await convertToModelMessages(input.messages)),
    {
      role: "user" as const,
      content: [
        "请基于以上完整对话、用户资料和项目教学记忆，判断现在是否可以生成正式体育课时计划。",
        "如果信息不足，只提出必要追问；不要生成课时计划。",
        "项目教学记忆只能补齐默认值，本轮用户明确说明必须优先。",
        "",
        contextToPrompt(input.context, input.memory),
      ].join("\n"),
    },
  ] as AgentModelMessages;
}

function buildSafeFallbackIntake(
  error: unknown,
  memory?: LessonAuthoringMemory,
  context?: PeTeacherContext,
): LessonIntakeSkillResult {
  const message = error instanceof Error ? error.message : "unknown-error";
  const normalized = normalizeIntakeResult(
    {
      readyToGenerate: false,
      known: {},
      missing: ["grade", "topic"],
      clarifications: [
        {
          field: "grade",
          question: "本次课是几年级或哪个水平段？",
        },
        {
          field: "topic",
          question: "请选择本次课程内容，或直接改写：1. 篮球行进间运球；2. 足球脚内侧传接球；3. 立定跳远起跳与落地；4. 接力跑交接棒；5. 跳绳节奏与组合练习。",
        },
      ],
      reason: "信息收集 Agent 不可用时，系统不能猜测年级和课程内容，必须先追问。",
    },
    memory,
    context,
  );

  return {
    intake: normalized.intake,
    memoryUsed: normalized.memoryUsed,
    modelMessageCount: 0,
    source: "safe-fallback",
    warning: `Lesson intake agent failed: ${message}`,
  };
}

function normalizeIntakeResult(
  result: LessonIntakeResult,
  memory?: LessonAuthoringMemory,
  context?: PeTeacherContext,
): { intake: LessonIntakeResult; memoryUsed: boolean } {
  const filled = fillLessonIntakeWithMemory(lessonIntakeResultSchema.parse(result), memory, context);
  const parsed = filled.intake;

  if (!parsed.readyToGenerate) {
    return filled;
  }

  if (parsed.missing.length || !parsed.summary?.trim()) {
    return {
      intake: {
        ...parsed,
        readyToGenerate: false,
        reason: `${parsed.reason} 信息收集结果仍存在缺失字段或缺少教学 brief，已阻止生成。`,
      },
      memoryUsed: filled.memoryUsed,
    };
  }

  return {
    intake: parsed,
    memoryUsed: filled.memoryUsed,
  };
}

export async function runLessonIntakeSkill(input: {
  generateIntake?: LessonIntakeGenerateRunner;
  context?: PeTeacherContext;
  maxSteps: number;
  memory?: LessonAuthoringMemory;
  messages: SmartEduUIMessage[];
  requestId: string;
}): Promise<LessonIntakeSkillResult> {
  const modelMessages = await buildIntakeModelMessages({
    context: input.context,
    memory: input.memory,
    messages: input.messages,
  });

  try {
    const result = await runModelOperationWithRetry(
      () =>
        (input.generateIntake ?? generateLessonIntakeWithAiSdk)({
          messages: modelMessages,
          system: buildLessonIntakeSystemPrompt(),
          maxSteps: input.maxSteps,
          modelId: getLessonIntakeModelId(),
        }),
      {
        mode: "lesson" satisfies GenerationMode,
        requestId: input.requestId,
      },
    );
    const normalized = normalizeIntakeResult(result, input.memory, input.context);

    return {
      intake: normalized.intake,
      memoryUsed: normalized.memoryUsed,
      modelMessageCount: modelMessages.length,
      source: "agent",
    };
  } catch (error) {
    const fallback = buildSafeFallbackIntake(error, input.memory, input.context);

    console.warn("[lesson-authoring] lesson-intake-fallback", {
      requestId: input.requestId,
      message: fallback.warning,
    });

    return {
      ...fallback,
      modelMessageCount: modelMessages.length,
    };
  }
}
