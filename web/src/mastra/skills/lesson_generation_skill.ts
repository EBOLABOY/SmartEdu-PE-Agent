import type { MastraModelOutput } from "@mastra/core/stream";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type DeepPartial,
  type UIMessageChunk,
} from "ai";
import { z } from "zod";

import {
  agentLessonGenerationSchema,
  type AgentLessonGenerationResult,
  competitionLessonPlanSchema,
  type CompetitionLessonPlan,
  unwrapAgentLessonGenerationResult,
} from "@/lib/competition-lesson-contract";
import {
  formatLessonPlanProtocolDiagnostics,
  parseLessonPlanProtocolToCompetitionLessonPlan,
} from "@/lib/competition-lesson-protocol";
import type { GenerationMode, SmartEduUIMessage } from "@/lib/lesson-authoring-contract";
import { createMastraAgentUiMessageStream } from "@/mastra/ai_sdk_stream";
import { createChatModel } from "@/mastra/models";
import {
  SUBMIT_LESSON_PLAN_TOOL_NAME,
  parseSubmitLessonPlanToolInput,
} from "@/mastra/tools/output_tools";
import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

type AgentModelMessages = Awaited<ReturnType<typeof convertToModelMessages>>;

type AgentStreamOptions = {
  system: string;
  maxSteps: number;
  modelSettings?: {
    maxRetries?: number;
  };
  providerOptions: {
    openai: {
      store: true;
    };
  };
  structuredOutput?: {
    schema: typeof agentLessonGenerationSchema;
    instructions: string;
    jsonPromptInjection: boolean;
  };
};

type ReadableObjectStream<T> = {
  getReader: () => {
    read: () => Promise<{ done: true; value?: undefined } | { done: false; value: T }>;
    releaseLock: () => void;
  };
};

export type AgentStreamRunner<OUTPUT = unknown> = (
  messages: AgentModelMessages,
  options: AgentStreamOptions,
) => Promise<MastraModelOutput<OUTPUT>>;

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
const STRUCTURED_OUTPUT_MAX_RETRIES = 3;

export const lessonGenerationEnvelopeSchema = z
  .object({
    _thinking_process: z
      .string()
      .trim()
      .min(1)
      .describe("面向 trace 的课时计划设计草稿。业务层必须丢弃该字段，只保存 lessonPlan。"),
    lessonPlan: competitionLessonPlanSchema.describe("最终可渲染和持久化的纯净课时计划。"),
  })
  .strict();

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
    "所有字段必须使用 UTF-8 中文内容，普通字段使用 key=value；允许正文行直接写在 @section、@safety、@load 等块下。",
    "必须包含：@lesson、三个 narrative @section、三个 objectives @section、三个 @flow、三个 @evaluation、@equipment、@safety、@load。",
    "三个 @flow 必须分别覆盖 part=准备部分、part=基本部分、part=结束部分。",
    "三个 @evaluation 必须分别覆盖 level=三颗星、level=二颗星、level=一颗星。",
    "协议模板如下，实际内容必须替换为完整、具体、无占位符的教学内容：",
    "@lesson",
    "title=篮球行进间运球",
    "subtitle=小学体育课时计划",
    "topic=篮球行进间运球",
    "grade=三年级",
    "student_count=40人",
    "lesson_no=第1课时",
    "level=水平二",
    "teacher_school=未填写学校",
    "teacher_name=未填写教师",
    "",
    "@section narrative.guiding_thought",
    "写 1-2 条指导思想。",
    "",
    "@section narrative.textbook_analysis",
    "写 1-2 条教材分析。",
    "",
    "@section narrative.student_analysis",
    "写 1-2 条学情分析。",
    "",
    "@section objectives.sport_ability",
    "写运动能力目标。",
    "",
    "@section objectives.health_behavior",
    "写健康行为目标。",
    "",
    "@section objectives.sport_morality",
    "写体育品德目标。",
    "",
    "@flow",
    "part=准备部分",
    "time=8分钟",
    "intensity=中",
    "content=课堂常规、热身活动和专项准备",
    "teacher=讲解安全要求并组织热身",
    "students=按队形完成热身并保持安全距离",
    "organization=四列横队或散点队形",
    "",
    "@flow",
    "part=基本部分",
    "time=27分钟",
    "intensity=中高",
    "content=主要技能学练、分组练习和课堂挑战",
    "teacher=示范动作、分层指导并巡回纠错",
    "students=分组练习、互评改进并完成挑战",
    "organization=分组轮换队形",
    "",
    "@flow",
    "part=结束部分",
    "time=5分钟",
    "intensity=低",
    "content=放松拉伸、课堂评价和课后练习布置",
    "teacher=组织放松并总结课堂表现",
    "students=完成放松、自评互评并整理器材",
    "organization=集合队形",
    "",
    "@evaluation",
    "level=三颗星",
    "description=写高水平达成标准。",
    "",
    "@evaluation",
    "level=二颗星",
    "description=写基本达成标准。",
    "",
    "@evaluation",
    "level=一颗星",
    "description=写继续努力标准。",
    "",
    "@equipment",
    "venue=学校运动场",
    "equipment=标志桶",
    "equipment=秒表",
    "",
    "@safety",
    "写至少 2 条安全提示。",
    "",
    "@load",
    "load_level=中等偏上",
    "target_heart_rate_range=140-155次/分钟",
    "average_heart_rate=145次/分钟",
    "group_density=约75%",
    "individual_density=约45%",
    "rationale=说明课堂负荷安排依据。",
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

async function streamCompetitionLessonPlanServerSide({
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

function readToolInputPart(part: UIMessageChunk) {
  const candidate = part as {
    input?: unknown;
    toolCallId?: string;
    toolName?: string;
    type?: string;
  };

  if (candidate.type !== "tool-input-available" || typeof candidate.toolName !== "string") {
    return undefined;
  }

  return {
    input: candidate.input,
    toolCallId: typeof candidate.toolCallId === "string" ? candidate.toolCallId : undefined,
    toolName: candidate.toolName,
  };
}

async function readSubmittedLessonPlanFromToolStream(stream: ReadableStream<UIMessageChunk>) {
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        return undefined;
      }

      const toolInput = readToolInputPart(value);

      if (!toolInput || toolInput.toolName !== SUBMIT_LESSON_PLAN_TOOL_NAME) {
        continue;
      }

      return parseSubmitLessonPlanToolInput(toolInput.input).lessonPlan;
    }
  } finally {
    reader.releaseLock();
  }
}

function createToolFirstLessonPlanPromise(input: {
  legacyFinalLessonPlanPromise?: Promise<CompetitionLessonPlan>;
  toolStream: ReadableStream<UIMessageChunk>;
}) {
  const promise = (async () => {
    const submittedLessonPlan = await readSubmittedLessonPlanFromToolStream(input.toolStream);

    if (submittedLessonPlan) {
      return submittedLessonPlan;
    }

    if (input.legacyFinalLessonPlanPromise) {
      return input.legacyFinalLessonPlanPromise;
    }

    throw new Error("模型未通过 submit_lesson_plan 提交课时计划，且未返回兼容结构化输出。");
  })();

  void promise.catch(() => undefined);

  return promise;
}

async function streamCompetitionLessonPlanWithMastraAgent({
  agentStream,
  maxSteps,
  messages,
  system,
  toUIMessageStream,
}: {
  agentStream: AgentStreamRunner<AgentLessonGenerationResult>;
  maxSteps: number;
  messages: AgentModelMessages;
  system: string;
  toUIMessageStream?: (result: MastraModelOutput<AgentLessonGenerationResult>) => ReadableStream<UIMessageChunk>;
}): Promise<LessonGenerationStreams> {
  const result = await agentStream(messages, {
    system,
    maxSteps,
    modelSettings: {
      maxRetries: STRUCTURED_OUTPUT_MAX_RETRIES,
    },
    providerOptions: {
      openai: {
        store: true,
      },
    },
    structuredOutput: {
      schema: agentLessonGenerationSchema,
      instructions:
        "请先填写 _thinking_process 作为课时计划设计草稿，再把最终可渲染课时计划写入 lessonPlan。除 schema 字段外不要输出 Markdown、HTML、XML、代码围栏或解释文字。",
      jsonPromptInjection: true,
    },
  });

  const uiMessageStream =
    toUIMessageStream?.(result) ??
    createMastraAgentUiMessageStream(result, {
      sendStart: false,
      sendFinish: true,
    });
  const [toolInspectionStream, passthroughStream] = uiMessageStream.tee();
  const legacyFinalLessonPlanPromise = createFinalLessonPlanPromise(result);

  return {
    finalLessonPlanPromise: createToolFirstLessonPlanPromise({
      legacyFinalLessonPlanPromise,
      toolStream: toolInspectionStream,
    }),
    partialOutputStream: createLessonPartialOutputStream(result),
    stream: passthroughStream,
  };
}

function createFinalLessonPlanPromise(result: MastraModelOutput<AgentLessonGenerationResult>) {
  const objectPromise = result.object;

  if (!objectPromise || typeof objectPromise.then !== "function") {
    return undefined;
  }

  return objectPromise.then((value) => unwrapAgentLessonGenerationResult(value));
}

function createLessonPartialOutputStream(result: MastraModelOutput<AgentLessonGenerationResult>) {
  const objectStream = result.objectStream;

  if (!objectStream || typeof objectStream.getReader !== "function") {
    return undefined;
  }

  return mapAgentLessonPartialOutputStream(
    objectStream as ReadableObjectStream<Partial<AgentLessonGenerationResult>>,
  );
}

async function* mapAgentLessonPartialOutputStream(
  objectStream: ReadableObjectStream<Partial<AgentLessonGenerationResult>>,
): AsyncIterable<DeepPartial<CompetitionLessonPlan>> {
  const reader = objectStream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        return;
      }

      if (value.lessonPlan) {
        yield value.lessonPlan as DeepPartial<CompetitionLessonPlan>;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function runLessonGenerationSkill(input: {
  agentStream?: AgentStreamRunner<AgentLessonGenerationResult>;
  messages: SmartEduUIMessage[];
  modelId?: string;
  requestId: string;
  serverSide?: boolean;
  structuredStream?: LessonStructuredStreamer;
  structuredGenerate?: LessonStructuredGenerator;
  toUIMessageStream?: (result: MastraModelOutput<AgentLessonGenerationResult>) => ReadableStream<UIMessageChunk>;
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
      : input.serverSide === true || !input.agentStream
        ? (options: Parameters<LessonStructuredStreamer>[0]) =>
            streamCompetitionLessonPlanServerSide({
              maxSteps: options.maxSteps,
              messages: options.messages,
              modelId: options.modelId,
              system: options.system,
            })
        : input.agentStream
        ? (options: Parameters<LessonStructuredStreamer>[0]) =>
            streamCompetitionLessonPlanWithMastraAgent({
              agentStream: input.agentStream!,
              maxSteps: options.maxSteps,
              messages: options.messages,
              system: options.system,
              toUIMessageStream: input.toUIMessageStream,
            })
        : undefined);

  if (!streamer) {
    throw new Error("Lesson generation requires a server-side structured streamer or legacy Mastra Agent stream runner.");
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
