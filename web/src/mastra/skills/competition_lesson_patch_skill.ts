import type { FullOutput } from "@mastra/core/stream";
import { convertToModelMessages } from "ai";

import {
  CompetitionLessonPatchError,
  applySemanticLessonUpdatesWithTrace,
  competitionLessonPatchResponseSchema,
  competitionLessonSemanticUpdateActionSchema,
  summarizeSemanticLessonUpdates,
  type CompetitionLessonPatchRequestBody,
  type CompetitionLessonPatchResponse,
  type CompetitionLessonSemanticUpdate,
} from "@/lib/competition-lesson-patch";

import {
  buildLessonPatchSystemPrompt,
  buildLessonPatchUserPrompt,
} from "../agents/lesson_patch";
import { runModelOperationWithRetry } from "./lesson_generation_skill";

type AgentModelMessages = Awaited<ReturnType<typeof convertToModelMessages>>;

type LessonPatchGenerateOptions = {
  system: string;
  maxSteps: number;
  providerOptions: {
    openai: {
      store: true;
    };
  };
};

export type LessonPatchAgentRunner = (
  messages: AgentModelMessages,
  options: LessonPatchGenerateOptions,
) => Promise<FullOutput<unknown>>;

function buildPatchModelMessages(input: CompetitionLessonPatchRequestBody) {
  return [
    {
      role: "user" as const,
      content: buildLessonPatchUserPrompt(input),
    },
  ] as AgentModelMessages;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractToolResultCandidate(toolResult: unknown) {
  if (!isRecord(toolResult)) {
    return toolResult;
  }

  const payload = toolResult.payload;

  if (isRecord(payload)) {
    if (payload.isError) {
      throw new CompetitionLessonPatchError("教案修改工具执行失败。");
    }

    if ("result" in payload) {
      return payload.result;
    }
  }

  if ("result" in toolResult) {
    return toolResult.result;
  }

  if ("output" in toolResult) {
    return toolResult.output;
  }

  return toolResult;
}

function extractToolResultCandidates(result: FullOutput<unknown>) {
  const topLevelResults = Array.isArray(result.toolResults) ? result.toolResults : [];

  if (topLevelResults.length > 0) {
    return topLevelResults.map(extractToolResultCandidate);
  }

  const steps = Array.isArray(result.steps) ? result.steps : [];

  return steps.flatMap((step) => {
    if (!isRecord(step) || !Array.isArray(step.toolResults)) {
      return [];
    }

    return step.toolResults.map(extractToolResultCandidate);
  });
}

export function extractSemanticLessonUpdates(result: FullOutput<unknown>): CompetitionLessonSemanticUpdate[] {
  const candidates = extractToolResultCandidates(result);

  if (candidates.length === 0) {
    throw new CompetitionLessonPatchError("模型没有调用任何教案修改工具。");
  }

  return candidates.map((candidate) => {
    const parsed = competitionLessonSemanticUpdateActionSchema.safeParse(candidate);

    if (!parsed.success) {
      throw new CompetitionLessonPatchError("教案修改工具返回结构不合法。");
    }

    return parsed.data;
  });
}

export async function runCompetitionLessonPatchSkill(
  input: CompetitionLessonPatchRequestBody,
  options: {
    agentGenerate: LessonPatchAgentRunner;
    maxSteps: number;
    requestId: string;
  },
): Promise<CompetitionLessonPatchResponse> {
  const modelMessages = buildPatchModelMessages(input);
  const result = await runModelOperationWithRetry(
    () =>
      options.agentGenerate(modelMessages, {
        system: buildLessonPatchSystemPrompt(),
        maxSteps: options.maxSteps,
        providerOptions: {
          openai: {
            store: true,
          },
        },
      }),
    {
      mode: "lesson",
      requestId: options.requestId,
    },
  );

  const semanticUpdates = extractSemanticLessonUpdates(result);
  const applied = applySemanticLessonUpdatesWithTrace(input.lessonPlan, semanticUpdates);

  return competitionLessonPatchResponseSchema.parse({
    patch: applied.patch,
    patchSummary: summarizeSemanticLessonUpdates(applied.semanticUpdates),
    semanticUpdates: applied.semanticUpdates,
    lessonPlan: applied.lessonPlan,
  });
}
