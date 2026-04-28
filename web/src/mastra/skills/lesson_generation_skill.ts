import type { MastraModelOutput } from "@mastra/core/stream";
import { toAISdkStream } from "@mastra/ai-sdk";
import {
  convertToModelMessages,
  type DeepPartial,
  type UIMessageChunk,
} from "ai";

import {
  competitionLessonPlanSchema,
  type CompetitionLessonPlan,
} from "@/lib/competition-lesson-contract";
import type { GenerationMode, SmartEduUIMessage } from "@/lib/lesson-authoring-contract";
import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

type AgentModelMessages = Awaited<ReturnType<typeof convertToModelMessages>>;

type AgentStreamOptions = {
  system: string;
  maxSteps: number;
  providerOptions: {
    openai: {
      store: true;
    };
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
  partialOutputStream?: AsyncIterable<DeepPartial<CompetitionLessonPlan>>;
  stream: ReadableStream<UIMessageChunk>;
};

const DEFAULT_LESSON_MODEL_ID = "gpt-4.1-mini";
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

async function streamCompetitionLessonPlanWithMastraAgent({
  agentStream,
  maxSteps,
  messages,
  system,
  toUIMessageStream,
}: {
  agentStream: AgentStreamRunner<CompetitionLessonPlan>;
  maxSteps: number;
  messages: AgentModelMessages;
  system: string;
  toUIMessageStream?: (result: MastraModelOutput<CompetitionLessonPlan>) => ReadableStream<UIMessageChunk>;
}): Promise<LessonGenerationStreams> {
  const result = await agentStream(messages, {
    system,
    maxSteps,
    providerOptions: {
      openai: {
        store: true,
      },
    },
  });

  return {
    stream:
      toUIMessageStream?.(result) ??
      (toAISdkStream(result, {
        from: "agent",
        version: "v6",
        sendStart: false,
        sendFinish: true,
      }) as ReadableStream<UIMessageChunk>),
  };
}

export async function runLessonGenerationSkill(input: {
  agentStream?: AgentStreamRunner<CompetitionLessonPlan>;
  messages: SmartEduUIMessage[];
  modelId?: string;
  requestId: string;
  structuredStream?: LessonStructuredStreamer;
  structuredGenerate?: LessonStructuredGenerator;
  toUIMessageStream?: (result: MastraModelOutput<CompetitionLessonPlan>) => ReadableStream<UIMessageChunk>;
  workflow: LessonWorkflowOutput;
}) {
  const modelMessages = await convertToModelMessages(input.messages);
  const streamer =
    input.structuredStream ??
    (input.structuredGenerate
      ? async (options: Parameters<LessonStructuredStreamer>[0]) => {
          const lessonPlan = await input.structuredGenerate!(options);
          const content = JSON.stringify(competitionLessonPlanSchema.parse(lessonPlan));

          return new ReadableStream<UIMessageChunk>({
            start(controller) {
              const id = "lesson-json";

              controller.enqueue({ type: "text-start", id });
              controller.enqueue({ type: "text-delta", id, delta: content });
              controller.enqueue({ type: "text-end", id });
              controller.enqueue({ type: "finish", finishReason: "stop" });
              controller.close();
            },
          });
        }
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
    throw new Error("Lesson generation requires a Mastra Agent stream runner.");
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
    modelMessageCount: modelMessages.length,
    partialOutputStream: generationStreams.partialOutputStream,
    stream: generationStreams.stream,
  };
}
