import type { MastraModelOutput } from "@mastra/core/stream";
import { convertToModelMessages } from "ai";

import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

import { runModelOperationWithRetry, type AgentStreamRunner } from "./lesson_generation_skill";

type AgentModelMessages = Awaited<ReturnType<typeof convertToModelMessages>>;

function buildHtmlModelMessages() {
  return [
    {
      role: "user" as const,
      content:
        "请基于系统消息中的已确认教案和结构化大屏模块计划，生成课堂学习辅助大屏 HTML，并在每个内容页写入 data-support-module。",
    },
  ] as AgentModelMessages;
}

export async function runHtmlScreenGenerationSkill(input: {
  requestId: string;
  workflow: LessonWorkflowOutput;
  lessonPlanLength: number;
  originalMessageCount: number;
  plannedSectionCount?: number;
  planningSource?: string;
  agentStream: AgentStreamRunner;
}): Promise<{ result: MastraModelOutput<unknown>; modelMessageCount: number }> {
  const modelMessages = buildHtmlModelMessages();
  const result = await runModelOperationWithRetry(
    () =>
      input.agentStream(modelMessages, {
        system: input.workflow.system,
        maxSteps: input.workflow.generationPlan.maxSteps,
        providerOptions: {
          openai: {
            store: true,
          },
        },
      }),
    {
      mode: "html",
      requestId: input.requestId,
    },
  );

  console.info("[lesson-authoring] html generation uses slim model messages", {
    requestId: input.requestId,
    originalMessageCount: input.originalMessageCount,
    modelMessageCount: modelMessages.length,
    lessonPlanLength: input.lessonPlanLength,
    plannedSectionCount: input.plannedSectionCount,
    planningSource: input.planningSource,
  });

  return {
    result,
    modelMessageCount: modelMessages.length,
  };
}
