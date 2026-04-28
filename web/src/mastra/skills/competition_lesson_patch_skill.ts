import type { FullOutput } from "@mastra/core/stream";
import { convertToModelMessages } from "ai";

import {
  applyCompetitionLessonPatch,
  competitionLessonPatchResponseSchema,
  competitionLessonPatchSchema,
  type CompetitionLessonPatch,
  type CompetitionLessonPatchRequestBody,
  type CompetitionLessonPatchResponse,
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
  structuredOutput: {
    schema: typeof competitionLessonPatchSchema;
    instructions: string;
    jsonPromptInjection: boolean;
  };
};

export type LessonPatchAgentRunner = (
  messages: AgentModelMessages,
  options: LessonPatchGenerateOptions,
) => Promise<FullOutput<CompetitionLessonPatch>>;

function buildPatchModelMessages(input: CompetitionLessonPatchRequestBody) {
  return [
    {
      role: "user" as const,
      content: buildLessonPatchUserPrompt(input),
    },
  ] as AgentModelMessages;
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
        structuredOutput: {
          schema: competitionLessonPatchSchema,
          instructions:
            "只输出符合 CompetitionLessonPatch schema 的字段级 patch operations，不要输出整份教案、Markdown、HTML 或解释文字。",
          jsonPromptInjection: true,
        },
      }),
    {
      mode: "lesson",
      requestId: options.requestId,
    },
  );

  const patch = competitionLessonPatchSchema.parse(result.object);
  const nextLessonPlan = applyCompetitionLessonPatch(input.lessonPlan, patch);

  return competitionLessonPatchResponseSchema.parse({
    patch,
    lessonPlan: nextLessonPlan,
  });
}
