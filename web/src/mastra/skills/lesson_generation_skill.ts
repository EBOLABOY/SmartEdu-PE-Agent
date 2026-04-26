import type { MastraModelOutput } from "@mastra/core/stream";
import { convertToModelMessages } from "ai";

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

export type AgentStreamRunner = (
  messages: AgentModelMessages,
  options: AgentStreamOptions,
) => Promise<MastraModelOutput<unknown>>;

const MAX_AGENT_STREAM_ATTEMPTS = 5;

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

function isRetryableAgentStreamError(error: unknown) {
  const statusCode = getErrorStatusCode(error);
  const message = error instanceof Error ? error.message : String(error);

  if (statusCode && [408, 409, 425, 429, 500, 502, 503, 504].includes(statusCode)) {
    return true;
  }

  return /No available channels|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|network|timeout/i.test(message);
}

export async function runAgentStreamWithRetry<T>(
  operation: () => Promise<T>,
  context: {
    mode: GenerationMode;
    requestId: string;
  },
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_AGENT_STREAM_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt >= MAX_AGENT_STREAM_ATTEMPTS || !isRetryableAgentStreamError(error)) {
        throw error;
      }

      const delayMs = getRetryDelayMs(attempt);
      console.warn("[lesson-authoring] retrying agent stream", {
        requestId: context.requestId,
        mode: context.mode,
        attempt,
        nextAttempt: attempt + 1,
        maxAttempts: MAX_AGENT_STREAM_ATTEMPTS,
        delayMs,
        statusCode: getErrorStatusCode(error),
        error: error instanceof Error ? error.message : String(error),
      });
      await sleep(delayMs);
    }
  }

  throw lastError;
}

function buildAgentStreamOptions(workflow: LessonWorkflowOutput): AgentStreamOptions {
  return {
    system: workflow.system,
    maxSteps: workflow.generationPlan.maxSteps,
    providerOptions: {
      openai: {
        store: true,
      },
    },
  };
}

export async function runLessonGenerationSkill(input: {
  messages: SmartEduUIMessage[];
  requestId: string;
  workflow: LessonWorkflowOutput;
  agentStream: AgentStreamRunner;
}) {
  const modelMessages = await convertToModelMessages(input.messages);
  const result = await runAgentStreamWithRetry(
    () => input.agentStream(modelMessages, buildAgentStreamOptions(input.workflow)),
    { mode: "lesson", requestId: input.requestId },
  );

  return {
    result,
    modelMessageCount: modelMessages.length,
  };
}
