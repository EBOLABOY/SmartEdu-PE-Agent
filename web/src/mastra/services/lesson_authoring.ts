import { toAISdkStream } from "@mastra/ai-sdk";
import { convertToModelMessages, type UIMessage } from "ai";

import { mastra } from "@/mastra";
import type { GenerationMode, PeTeacherContext } from "@/mastra/agents/pe_teacher";
import type { LessonWorkflowInput, LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

export type LessonAuthoringRequest = {
  messages: UIMessage[];
  context?: PeTeacherContext;
  mode?: GenerationMode;
  lessonPlan?: string;
};

export type LessonAuthoringTrace = {
  workflow: LessonWorkflowOutput;
  mode: GenerationMode;
  query: string;
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
    mode: trace.mode,
    queryLength: trace.query.length,
    outputProtocol: trace.workflow.generationPlan.outputProtocol,
    htmlSandboxRequired: trace.workflow.safety.htmlSandboxRequired,
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
  const workflow = await runLessonAuthoringWorkflow({
    query,
    mode,
    context: request.context,
    lessonPlan: request.lessonPlan,
  });

  logLessonAuthoringTrace({ workflow, mode, query });

  const agent = mastra.getAgent("peTeacherAgent");
  const result = await agent.stream(await convertToModelMessages(request.messages), {
    system: workflow.system,
    maxSteps: workflow.generationPlan.maxSteps,
    providerOptions: {
      openai: {
        store: true,
      },
    },
  });

  return {
    stream: toAISdkStream(result, { from: "agent", version: "v6" }),
    workflow,
  };
}
