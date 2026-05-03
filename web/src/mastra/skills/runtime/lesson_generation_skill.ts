import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type DeepPartial,
  type UIMessageChunk,
} from "ai";

import {
  competitionLessonPlanSchema,
  type CompetitionLessonPlan,
} from "@/lib/competition-lesson-contract";
import {
  formatLessonPlanProtocolDiagnostics,
  parseLessonPlanProtocolToCompetitionLessonPlan,
} from "@/lib/competition-lesson-protocol";
import type { GenerationMode, SmartEduUIMessage } from "@/lib/lesson-authoring-contract";
import { createChatModel } from "@/mastra/models";
import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

type AgentModelMessages = Awaited<ReturnType<typeof convertToModelMessages>>;

export type LessonStructuredGenerator = (options: {
  maxSteps: number;
  messages: AgentModelMessages;
  modelId: string;
  system: string;
}) => Promise<CompetitionLessonPlan>;

export type LessonStructuredStreamer = (options: {
  maxSteps: number;
  messages: AgentModelMessages;
  modelId: string;
  system: string;
}) => Promise<LessonGenerationStreams | ReadableStream<UIMessageChunk>>;

export type LessonGenerationStreams = {
  finalLessonPlanPromise?: Promise<CompetitionLessonPlan>;
  partialOutputStream?: AsyncIterable<DeepPartial<CompetitionLessonPlan>>;
  stream: ReadableStream<UIMessageChunk>;
};

const DEFAULT_LESSON_MODEL_ID = process.env.AI_LESSON_MODEL ?? process.env.AI_MODEL ?? "gpt-4.1-mini";
const MAX_MODEL_OPERATION_ATTEMPTS = 5;

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

function normalizeLessonGenerationStreams(
  output: LessonGenerationStreams | ReadableStream<UIMessageChunk>,
): LessonGenerationStreams {
  return output instanceof ReadableStream ? { stream: output } : output;
}

function createServerLessonProtocolSystemPrompt(system: string) {
  return [
    system,
    "你正在执行服务端确定性课时计划生成任务，不是工具调用或聊天回复。",
    "你必须只输出“自定义教案行协议”文本。不要输出 JSON、Markdown 标题、HTML、XML、代码围栏或解释文字。",
    "所有字段必须使用 UTF-8 中文内容。普通字段用 key=value；@section、@safety、@load 块内可以直接写正文行。",
    "必须包含：@lesson、三个 narrative @section、三个 objectives @section、三个 @flow、三个 @evaluation、@equipment、@safety、@load。",
    "三个 @flow 必须分别覆盖 part=准备部分、part=基本部分、part=结束部分。",
    "三个 @evaluation 必须分别覆盖 level=三颗星、level=二颗星、level=一颗星。",
    "@flow 的 content 只写本段课堂环节短语，不写时间和步骤细节；教师行为、学生行为、组织形式和安全要求分别写入对应字段。",
    "基本部分必须体现“学、练、赛、体能练习”四个环节；具体内容、项目任务和组织方式由你自主设计。",
    "下面只是协议骨架，不是内容模板；具体教学内容由你根据用户需求、课标依据和教材上下文自主生成，不要照抄骨架说明：",
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

function createEmptyUiStream(): ReadableStream<UIMessageChunk> {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      controller.enqueue({ type: "finish", finishReason: "stop" });
      controller.close();
    },
  });
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
    stream: createEmptyUiStream(),
  };
}

export async function runLessonGenerationSkill(input: {
  messages: SmartEduUIMessage[];
  modelId?: string;
  requestId: string;
  serverSide?: boolean;
  structuredStream?: LessonStructuredStreamer;
  structuredGenerate?: LessonStructuredGenerator;
  workflow: LessonWorkflowOutput;
}) {
  const modelMessages = await convertToModelMessages(input.messages);
  const streamer =
    input.structuredStream ??
    (input.structuredGenerate
      ? async (options: Parameters<LessonStructuredStreamer>[0]) => {
          const lessonPlan = await input.structuredGenerate!(options);
          const content = JSON.stringify(competitionLessonPlanSchema.parse(lessonPlan));

          return {
            finalLessonPlanPromise: Promise.resolve(competitionLessonPlanSchema.parse(lessonPlan)),
            stream: new ReadableStream<UIMessageChunk>({
              start(controller) {
                const id = "lesson-json";

                controller.enqueue({ type: "text-start", id });
                controller.enqueue({ type: "text-delta", id, delta: content });
                controller.enqueue({ type: "text-end", id });
                controller.enqueue({ type: "finish", finishReason: "stop" });
                controller.close();
              },
            }),
          };
        }
      : input.serverSide === false
        ? undefined
        : (options: Parameters<LessonStructuredStreamer>[0]) =>
            streamCompetitionLessonPlanServerSideWithProtocol({
              maxSteps: options.maxSteps,
              messages: options.messages,
              modelId: options.modelId,
              system: options.system,
            }));

  if (!streamer) {
    throw new Error("Lesson generation requires a server-side lesson protocol streamer.");
  }

  const generationStreams = normalizeLessonGenerationStreams(
    await runModelOperationWithRetry(
      () =>
        streamer({
          maxSteps: input.workflow.generationPlan.maxSteps,
          messages: modelMessages,
          modelId: input.modelId ?? DEFAULT_LESSON_MODEL_ID,
          system: input.workflow.system,
        }),
      { mode: "lesson", requestId: input.requestId },
    ),
  );

  return {
    finalLessonPlanPromise: generationStreams.finalLessonPlanPromise,
    modelMessageCount: modelMessages.length,
    partialOutputStream: generationStreams.partialOutputStream,
    stream: generationStreams.stream,
  };
}
