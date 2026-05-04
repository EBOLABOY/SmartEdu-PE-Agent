import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type DeepPartial,
} from "ai";

import {
  type CompetitionLessonPlan,
} from "@/lib/lesson/contract";
import {
  formatLessonPlanProtocolDiagnostics,
  parseLessonPlanProtocolToCompetitionLessonPlan,
  parseLessonPlanProtocolText,
} from "@/lib/lesson/protocol";
import type { GenerationMode, SmartEduUIMessage } from "@/lib/lesson/authoring-contract";
import { createChatModel } from "@/mastra/models";
import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

type AgentModelMessages = Awaited<ReturnType<typeof convertToModelMessages>>;
type CompetitionLessonEvaluationLevel = CompetitionLessonPlan["evaluation"][number]["level"];

export type LessonGenerationStreams = {
  finalLessonPlanPromise: Promise<CompetitionLessonPlan>;
  lessonDraftStream: AsyncIterable<DeepPartial<CompetitionLessonPlan>>;
};

const DEFAULT_LESSON_MODEL_ID = process.env.AI_LESSON_MODEL ?? process.env.AI_MODEL ?? "gpt-4.1-mini";
const MAX_MODEL_OPERATION_ATTEMPTS = 5;
const COMPETITION_LESSON_EVALUATION_LEVELS = ["三颗星", "二颗星", "一颗星"] as const satisfies readonly CompetitionLessonEvaluationLevel[];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorStatusCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) {
    return undefined;
  }

  const statusCode = (error as { statusCode?: unknown }).statusCode;

  return typeof statusCode === "number" ? statusCode : undefined;
}

function getRetryDelayMs(attempt: number) {
  const baseDelayMs = 500 * 2 ** (attempt - 1);
  const jitterMs = Math.floor(Math.random() * 250);

  return Math.min(baseDelayMs + jitterMs, 8_000);
}

function isRetryableModelOperationError(error: unknown) {
  const statusCode = getErrorStatusCode(error);
  const message = error instanceof Error ? error.message : String(error);

  if (statusCode && [408, 409, 425, 429, 500, 502, 503, 504].includes(statusCode)) {
    return true;
  }

  return /No available channels|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|network|timeout/i.test(message);
}

/**
 * 重试创建模型调用的瞬时失败（429 / 5xx / 连接错误 / "No available channels" 等）。
 *
 * ⚠️ 重要限制：对**流式生成**调用，仅捕获 stream **创建期**抛错（鉴权失败、
 * 立即返回的 4xx 等）。**stream 消费过程中的中断**（例如 30k token 处的
 * ECONNRESET）会直接传播到调用方，不会触发重试，因为 `streamText()` 是
 * 同步返回 `{ textStream, text Promise }`，retry block 在 textStream
 * 还没开始消费前就已经退出了。
 *
 * 中段流重试需要在 stream 消费层实现，已规划在 P2 workflow 迁移中通过
 * Mastra workflow step 的 retry 配置统一处理（见架构清理 plan）。
 *
 * 当前 5 个调用点：
 * - `lesson_intent_skill` / `lesson_intake_skill` / `competition_lesson_patch_skill`
 *   是非流式（`generateText` / `agent.generate`），retry 完整生效。
 * - `lesson_generation_skill`（自身）/ `server_html_generation_skill`
 *   是流式（`streamText`），retry 仅覆盖创建期失败。
 */
export async function runModelOperationWithRetry<T>(
  operation: () => Promise<T>,
  context: {
    mode: GenerationMode;
    requestId: string;
  },
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_MODEL_OPERATION_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt >= MAX_MODEL_OPERATION_ATTEMPTS || !isRetryableModelOperationError(error)) {
        throw error;
      }

      const delayMs = getRetryDelayMs(attempt);
      console.warn("[lesson-authoring] retrying model operation", {
        requestId: context.requestId,
        mode: context.mode,
        attempt,
        nextAttempt: attempt + 1,
        maxAttempts: MAX_MODEL_OPERATION_ATTEMPTS,
        delayMs,
        statusCode: getErrorStatusCode(error),
        error: error instanceof Error ? error.message : String(error),
      });
      await sleep(delayMs);
    }
  }

  throw lastError;
}

function createServerLessonProtocolSystemPrompt(system: string) {
  return [
    system,
    "你正在执行服务端确定性课时计划生成任务，输出内容会直接进入自定义教案行协议解析器。",
    "你必须只输出“自定义教案行协议”文本。",
    "所有字段必须使用 UTF-8 中文内容。普通字段用 key=value；@section、@safety、@load 块内可以直接写正文行。",
    "【排版与加粗要求】：为了让教案更具可读性，若要在 teacher、students、content、organization 等字段中分条列出，请多次使用同一个键名（例如多次写 teacher=），内容必须极度精简干练，切忌使用长篇大论、超长单行和分号堆砌！",
    "【加粗使用范围】：加粗语法（**）用于核心的大环节名称，例如 content=**课堂礼仪**；teacher、students、organization 等教与学的方法字段使用普通文本短句。",
    "必须包含：@lesson、三个 narrative @section、三个 objectives @section、多个 @flow、三个 @evaluation、@equipment、@safety、@load。",
    "准备部分和结束部分各需一个 @flow。基本部分必须被拆分为 3-4 个具体的环节（如：技能复习、新授内容、分层挑战、课课练等），每个环节使用独立的 @flow 描述并单独分配时间和强度；对于这些基本部分的环节，part=基本部分 即可，系统会按顺序将其渲染为多行。",
    "三个 @evaluation 必须分别覆盖 level=三颗星、level=二颗星、level=一颗星。",
    "@flow 的 content 只写本段课堂环节短语，不写时间和步骤细节；教师行为、学生行为、组织形式和安全要求分别写入对应字段。",
    "整节课应自然体现“学、练、赛、体能训练”的完整课堂逻辑，活动标签跟随真实课堂任务自然分布。",
    "【高水平质量要求】：",
    "1. 贯彻“学、练、赛、评”一体化：必须创设真实、复杂的运动情境与对抗比赛，坚决避免全程枯燥的队列或孤立动作练习。",
    "2. 紧扣核心素养：大单元教学指导思想明确，三维目标描述必须具体、可观测、可评价。",
    "3. 保证大密度、高强度：群体练习密度应在 75% 以上；必须包含有针对性的“体能补偿”练习（课课练）。",
    "4. 关注个体差异：在教学组织形式和评价中体现分层教学，提供不同难度梯度的任务选项。",
    "下面是协议骨架；具体教学内容由你根据用户需求、课标依据和教材上下文自主生成：",
    "@lesson",
    "title=",
    "subtitle=",
    "topic=",
    "grade=",
    "student_count=",
    "lesson_no=",
    "level=",
    "teacher_school=",
    "teacher_name=",
    "",
    "@section narrative.guiding_thought",
    "",
    "@section narrative.textbook_analysis",
    "",
    "@section narrative.student_analysis",
    "",
    "@section objectives.sport_ability",
    "",
    "@section objectives.health_behavior",
    "",
    "@section objectives.sport_morality",
    "",
    "@flow",
    "part=准备部分",
    "time=",
    "intensity=",
    "content=",
    "teacher=",
    "students=",
    "organization=",
    "",
    "@flow",
    "part=基本部分",
    "time=",
    "intensity=",
    "content=",
    "teacher=",
    "students=",
    "organization=",
    "",
    "@flow",
    "part=结束部分",
    "time=",
    "intensity=",
    "content=",
    "teacher=",
    "students=",
    "organization=",
    "",
    "@evaluation",
    "level=三颗星",
    "description=",
    "",
    "@evaluation",
    "level=二颗星",
    "description=",
    "",
    "@evaluation",
    "level=一颗星",
    "description=",
    "",
    "@equipment",
    "venue=",
    "equipment=",
    "",
    "@safety",
    "",
    "@load",
    "load_level=",
    "target_heart_rate_range=",
    "average_heart_rate=",
    "group_density=",
    "individual_density=",
    "rationale=",
  ].join("\n");
}

function toCompetitionLessonEvaluationLevel(level?: string): CompetitionLessonEvaluationLevel | undefined {
  return COMPETITION_LESSON_EVALUATION_LEVELS.find((allowedLevel) => allowedLevel === level);
}

function mapDraftToPartialLessonPlan(draft: ReturnType<typeof parseLessonPlanProtocolText>): DeepPartial<CompetitionLessonPlan> {
  return {
    evaluation: draft.evaluations.map((e) => ({
      description: e.description,
      level: toCompetitionLessonEvaluationLevel(e.level),
    })),
    flowSummary: [],
    keyDifficultPoints: {
      studentLearning: [],
      teachingContent: [],
      teachingMethod: [],
      teachingOrganization: [],
    },
    learningObjectives: {
      healthBehavior: draft.objectives.healthBehavior,
      sportAbility: draft.objectives.sportAbility,
      sportMorality: draft.objectives.sportMorality,
    },
    meta: {
      grade: draft.lesson.grade,
      lessonNo: draft.lesson.lessonNo,
      level: draft.lesson.level,
      studentCount: draft.lesson.studentCount,
      topic: draft.lesson.topic,
    },
    loadEstimate: {
      averageHeartRate: draft.load.averageHeartRate,
      chartPoints: [],
      groupDensity: draft.load.groupDensity,
      individualDensity: draft.load.individualDensity,
      loadLevel: draft.load.loadLevel,
      rationale: draft.load.rationale,
      targetHeartRateRange: draft.load.targetHeartRateRange,
    },
    narrative: {
      guidingThought: draft.narrative.guidingThought,
      studentAnalysis: draft.narrative.studentAnalysis,
      textbookAnalysis: draft.narrative.textbookAnalysis,
    },
    periodPlan: {
      homework: [],
      mainContent: [],
      reflection: [],
      safety: draft.safety,
      rows: draft.flows.map((flow) => ({
        content: flow.content,
        intensity: flow.intensity,
        organization: flow.organization,
        structure: flow.part as any,
        time: flow.time,
        methods: {
          students: flow.students,
          teacher: flow.teacher,
        },
      })),
    },
    subtitle: draft.lesson.subtitle,
    teacher: {
      name: draft.lesson.teacherName,
      school: draft.lesson.teacherSchool,
    },
    title: draft.lesson.title || draft.lesson.topic,
    venueEquipment: {
      equipment: draft.equipment.equipment,
      venue: draft.equipment.venue,
    },
  };
}

async function* createLessonDraftStream(
  textStream: AsyncIterable<string>,
): AsyncGenerator<DeepPartial<CompetitionLessonPlan>> {
  let rawText = "";
  let lastLength = 0;
  for await (const chunk of textStream) {
    rawText += chunk;
    if (rawText.length - lastLength > 60) {
      lastLength = rawText.length;
      try {
        const draft = parseLessonPlanProtocolText(rawText);
        yield mapDraftToPartialLessonPlan(draft);
      } catch {
        // ignore partial parse errors
      }
    }
  }

  if (rawText.length > 0) {
    try {
      const draft = parseLessonPlanProtocolText(rawText);
      yield mapDraftToPartialLessonPlan(draft);
    } catch {
      // ignore partial parse errors
    }
  }
}

async function streamCompetitionLessonPlanServerSideWithProtocol({
  maxSteps,
  messages,
  modelId,
  system,
}: {
  maxSteps: number;
  messages: AgentModelMessages;
  modelId: string;
  system: string;
}): Promise<LessonGenerationStreams> {
  const result = streamText({
    model: createChatModel(modelId),
    system: createServerLessonProtocolSystemPrompt(system),
    messages,
    stopWhen: stepCountIs(Math.max(1, maxSteps)),
    temperature: 0,
  });

  const finalLessonPlanPromise = Promise.resolve(result.text)
    .then((protocolText) => parseLessonPlanProtocolToCompetitionLessonPlan(protocolText))
    .catch((error) => {
      throw new Error(
        error && typeof error === "object" && "diagnostics" in error
          ? `教案行协议生成失败：\n${formatLessonPlanProtocolDiagnostics(
              error as Parameters<typeof formatLessonPlanProtocolDiagnostics>[0],
            )}`
          : `教案行协议生成失败：${error instanceof Error ? error.message : "unknown-error"}`,
      );
    });

  void finalLessonPlanPromise.catch(() => undefined);

  return {
    finalLessonPlanPromise,
    lessonDraftStream: createLessonDraftStream(result.textStream),
  };
}

export async function runLessonGenerationSkill(input: {
  messages: SmartEduUIMessage[];
  modelId?: string;
  requestId: string;
  workflow: LessonWorkflowOutput;
}) {
  const modelMessages = await convertToModelMessages(input.messages);
  const generationStreams = await runModelOperationWithRetry(
    () =>
      streamCompetitionLessonPlanServerSideWithProtocol({
        maxSteps: input.workflow.generationPlan.maxSteps,
        messages: modelMessages,
        modelId: input.modelId ?? DEFAULT_LESSON_MODEL_ID,
        system: input.workflow.system,
      }),
    { mode: "lesson", requestId: input.requestId },
  );

  return {
    finalLessonPlanPromise: generationStreams.finalLessonPlanPromise,
    lessonDraftStream: generationStreams.lessonDraftStream,
    modelMessageCount: modelMessages.length,
  };
}
