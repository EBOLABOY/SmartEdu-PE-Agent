import { randomUUID } from "node:crypto";

import type { MastraModelOutput } from "@mastra/core/stream";
import { toAISdkStream } from "@mastra/ai-sdk";
import type { UIMessage } from "ai";

import {
  DEFAULT_STANDARDS_MARKET,
  type GenerationMode,
  type LessonScreenPlan,
  type PeTeacherContext,
  type SmartEduUIMessage,
  type StandardsMarket,
} from "@/lib/lesson-authoring-contract";
import type { LessonAuthoringPersistence } from "@/lib/persistence/lesson-authoring-store";
import type { ProjectChatPersistence } from "@/lib/persistence/project-chat-store";
import { mastra } from "@/mastra";
import {
  createStructuredAuthoringStreamAdapter,
  runHtmlScreenGenerationSkill,
  runLessonGenerationSkill,
  runLessonJsonRepairSkill,
  type AgentStreamRunner,
} from "@/mastra/skills";
import type { LessonWorkflowInput, LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

export type LessonAuthoringRequest = {
  messages: SmartEduUIMessage[];
  persistence?: LessonAuthoringPersistence | null;
  chatPersistence?: ProjectChatPersistence | null;
  projectId?: string;
  context?: PeTeacherContext;
  mode?: GenerationMode;
  lessonPlan?: string;
  screenPlan?: LessonScreenPlan;
  market?: StandardsMarket;
};

export type LessonAuthoringTrace = {
  workflow: LessonWorkflowOutput;
  mode: GenerationMode;
  query: string;
  requestId: string;
};

export class LessonAuthoringError extends Error {
  constructor(
    message: string,
    public readonly status = 422,
  ) {
    super(message);
    this.name = "LessonAuthoringError";
  }
}

function getLatestUserText(messages: UIMessage[]) {
  const latestUserMessage = messages.findLast((message) => message.role === "user");

  if (!latestUserMessage) {
    return "";
  }

  return latestUserMessage.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

function getWorkflowFailureMessage(result: { status: string; error?: unknown }) {
  if (result.error instanceof Error) {
    return result.error.message;
  }

  return `体育教案工作流执行失败，状态：${result.status}。`;
}

function logLessonAuthoringTrace(trace: LessonAuthoringTrace) {
  console.info("[lesson-authoring]", {
    requestId: trace.requestId,
    mode: trace.mode,
    queryLength: trace.query.length,
    outputProtocol: trace.workflow.generationPlan.outputProtocol,
    responseTransport: trace.workflow.generationPlan.responseTransport,
    htmlSandboxRequired: trace.workflow.safety.htmlSandboxRequired,
    requestedMarket: trace.workflow.standards.requestedMarket,
    resolvedMarket: trace.workflow.standards.resolvedMarket,
    trace: trace.workflow.trace,
    warnings: trace.workflow.safety.warnings,
  });
}

export async function runLessonAuthoringWorkflow(input: LessonWorkflowInput) {
  const workflow = mastra.getWorkflow("lessonAuthoringWorkflow");
  const run = await workflow.createRun();
  const result = await run.start({ inputData: input });

  if (result.status !== "success") {
    throw new LessonAuthoringError(getWorkflowFailureMessage(result));
  }

  return result.result;
}

export async function streamLessonAuthoring(request: LessonAuthoringRequest) {
  const mode = request.mode === "html" ? "html" : "lesson";
  const query = getLatestUserText(request.messages);
  const requestId = randomUUID();
  const workflow = await runLessonAuthoringWorkflow({
    query,
    mode,
    context: request.context,
    lessonPlan: request.lessonPlan,
    screenPlan: request.screenPlan,
    market: request.market ?? DEFAULT_STANDARDS_MARKET,
  });

  logLessonAuthoringTrace({ workflow, mode, query, requestId });

  const agent = mastra.getAgent("peTeacherAgent");
  const agentStream: AgentStreamRunner = async (messages, options) =>
    (await agent.stream(messages, options)) as MastraModelOutput<unknown>;
  const generationResult =
    mode === "html"
      ? await runHtmlScreenGenerationSkill({
          requestId,
          workflow,
          lessonPlanLength: request.lessonPlan?.length ?? 0,
          originalMessageCount: request.messages.length,
          agentStream,
        })
      : await runLessonGenerationSkill({
          messages: request.messages,
          requestId,
          workflow,
          agentStream,
        });

  return {
    stream: createStructuredAuthoringStreamAdapter({
      originalMessages: request.messages,
      chatPersistence: request.chatPersistence,
      lessonPlan: request.lessonPlan,
      mode,
      persistence: request.persistence,
      projectId: request.projectId,
      repairLessonJson: (input) =>
        runLessonJsonRepairSkill(input, {
          modelId: process.env.AI_REPAIR_MODEL ?? process.env.AI_MODEL ?? "gpt-4.1-mini",
        }),
      requestId,
      workflow,
      stream: toAISdkStream(generationResult.result, {
        from: "agent",
        version: "v6",
        sendStart: false,
        sendFinish: true,
      }),
    }),
    workflow,
    requestId,
  };
}
