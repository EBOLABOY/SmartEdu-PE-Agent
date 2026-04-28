import { randomUUID } from "node:crypto";

import type { FullOutput, MastraModelOutput } from "@mastra/core/stream";
import { toAISdkStream } from "@mastra/ai-sdk";
import {
  createUIMessageStream,
  type UIMessage,
  type UIMessageStreamWriter,
} from "ai";

import type { CompetitionLessonPlan } from "@/lib/competition-lesson-contract";
import {
  DEFAULT_STANDARDS_MARKET,
  type GenerationMode,
  type LessonAuthoringMemory,
  type LessonScreenPlan,
  type PeTeacherContext,
  type SmartEduUIMessage,
  type StandardsMarket,
} from "@/lib/lesson-authoring-contract";
import type { LessonAuthoringPersistence } from "@/lib/persistence/lesson-authoring-store";
import type { LessonMemoryPersistence } from "@/lib/persistence/lesson-memory-store";
import type { ProjectChatPersistence } from "@/lib/persistence/project-chat-store";
import { mastra } from "@/mastra";
import { formatLessonScreenPlanForPrompt } from "@/mastra/agents/html_screen_planner";
import {
  formatLessonIntakeQuestions,
  formatLessonIntakeResultForPrompt,
} from "@/mastra/agents/lesson_intake";
import {
  createLessonClarificationStreamAdapter,
  createStructuredAuthoringStreamAdapter,
  runHtmlScreenGenerationSkill,
  runHtmlScreenPlanningSkill,
  runLessonGenerationSkill,
  runLessonIntakeSkill,
  type AgentStreamRunner,
  type HtmlScreenPlanAgentRunner,
  type HtmlScreenPlanningResult,
  type LessonIntakeSkillResult,
} from "@/mastra/skills";
import type { LessonWorkflowInput, LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";
import {
  buildWorkflowTraceData,
  buildWorkflowTraceDataFromWorkflow,
  createLessonWorkflowTraceState,
  createWorkflowTraceEntry,
  runLessonAuthoringWorkflowWithTrace,
} from "./lesson_workflow_stream";

export type LessonAuthoringRequest = {
  messages: SmartEduUIMessage[];
  persistence?: LessonAuthoringPersistence | null;
  chatPersistence?: ProjectChatPersistence | null;
  memory?: LessonAuthoringMemory;
  memoryPersistence?: LessonMemoryPersistence | null;
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

function applyLessonIntake(
  workflow: LessonWorkflowOutput,
  intakeResult: LessonIntakeSkillResult,
): LessonWorkflowOutput {
  const intake = intakeResult.intake;
  const memoryDetail = intakeResult.memoryUsed ? " 已使用项目教学记忆减少追问。" : "";
  const traceEntry = {
    step: "collect-lesson-requirements",
    status: intake.readyToGenerate ? ("success" as const) : ("blocked" as const),
    detail: intake.readyToGenerate
      ? `信息收集 Agent 已确认可以生成教案：${intake.reason}${memoryDetail}`
      : `信息收集 Agent 已阻止随机生成：${intake.reason}${memoryDetail}`,
    timestamp: new Date().toISOString(),
  };

  if (!intake.readyToGenerate) {
    return {
      ...workflow,
      safety: {
        ...workflow.safety,
        warnings: intakeResult.warning ? [...workflow.safety.warnings, intakeResult.warning] : workflow.safety.warnings,
      },
      trace: [...workflow.trace, traceEntry],
    };
  }

  return {
    ...workflow,
    system: [
      workflow.system,
      "教案生成 Agent 启动前的信息收集结果：",
      "你必须严格基于下列已确认信息生成教案；不得补写与其冲突的年级、课题、人数、课时、场地或器材。未确认学生人数时按 40 人生成；未确认课时、场地和器材时，根据课程内容、教学环节和安全要求自动匹配。",
      formatLessonIntakeResultForPrompt(intake),
    ].join("\n\n"),
    safety: {
      ...workflow.safety,
      warnings: intakeResult.warning ? [...workflow.safety.warnings, intakeResult.warning] : workflow.safety.warnings,
    },
    trace: [...workflow.trace, traceEntry],
  };
}

function applyHtmlScreenPlanning(
  workflow: LessonWorkflowOutput,
  planning: HtmlScreenPlanningResult,
): LessonWorkflowOutput {
  const sectionCount = planning.plan.sections.length;
  const sourceText =
    planning.source === "agent"
      ? "HTML 分镜规划 Agent"
      : planning.source === "deterministic-fallback"
        ? "结构化教案确定性解析"
        : planning.source === "seed-fallback"
          ? "前端初始大屏计划"
          : "最小安全兜底计划";
  const planText = formatLessonScreenPlanForPrompt(planning.plan);
  const traceEntry = {
    step: "plan-html-screen-sections",
    status: planning.source === "agent" ? ("success" as const) : ("blocked" as const),
    detail:
      planning.source === "agent"
        ? `${sourceText}已规划 ${sectionCount} 个课堂内容页，并将结果交给 HTML 生成 Agent 执行。`
        : `${sourceText}已提供 ${sectionCount} 个课堂内容页，${planning.warning ?? "Agent 规划不可用。"}`,
    timestamp: new Date().toISOString(),
  };

  return {
    ...workflow,
    system: [
      workflow.system,
      "HTML Agent 分镜规划最终执行版：",
      "你必须逐条实现下列内容页；封面页仍由你生成，但不得计入下列内容页数量。",
      planText,
    ].join("\n\n"),
    safety: {
      ...workflow.safety,
      warnings: planning.warning ? [...workflow.safety.warnings, planning.warning] : workflow.safety.warnings,
    },
    trace: [...workflow.trace, traceEntry],
  };
}

async function rememberLessonIntake(input: {
  context?: PeTeacherContext;
  intakeResult: LessonIntakeSkillResult;
  memoryPersistence?: LessonMemoryPersistence | null;
  projectId?: string;
  requestId: string;
}) {
  if (!input.memoryPersistence || !input.projectId) {
    return;
  }

  await input.memoryPersistence.rememberFromIntake({
    context: input.context,
    intake: input.intakeResult.intake,
    projectId: input.projectId,
    requestId: input.requestId,
  });
}

function writeTracePart(
  writer: UIMessageStreamWriter<SmartEduUIMessage>,
  data: ReturnType<typeof buildWorkflowTraceData>,
) {
  writer.write({
    type: "data-trace",
    id: "lesson-authoring-trace",
    data,
  });
}

function writeWorkflowTracePart(
  writer: UIMessageStreamWriter<SmartEduUIMessage>,
  workflow: LessonWorkflowOutput,
  requestId: string,
  phase: Parameters<typeof buildWorkflowTraceDataFromWorkflow>[2],
  trace = workflow.trace,
) {
  writeTracePart(writer, buildWorkflowTraceDataFromWorkflow(workflow, requestId, phase, trace));
}

function appendWorkflowTrace(
  workflow: LessonWorkflowOutput,
  entry: LessonWorkflowOutput["trace"][number],
): LessonWorkflowOutput {
  return {
    ...workflow,
    trace: [...workflow.trace, entry],
  };
}

function writeAuthoringFailure(input: {
  error: unknown;
  mode: GenerationMode;
  query: string;
  requestId: string;
  requestedMarket: StandardsMarket;
  writer: UIMessageStreamWriter<SmartEduUIMessage>;
}) {
  const errorText = input.error instanceof Error ? input.error.message : "体育教案生成服务异常。";
  const state = createLessonWorkflowTraceState({
    query: input.query || "lesson authoring",
    mode: input.mode,
    market: input.requestedMarket,
  });

  state.trace = [
    createWorkflowTraceEntry("lesson-authoring-failed", "failed", errorText),
  ];

  writeTracePart(input.writer, buildWorkflowTraceData(state, input.requestId, "failed"));
  input.writer.write({ type: "start" });
  input.writer.write({ type: "error", errorText });
  input.writer.write({ type: "finish", finishReason: "error" });
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

async function executeLessonAuthoringStream(input: {
  mode: GenerationMode;
  query: string;
  request: LessonAuthoringRequest;
  requestId: string;
  writer: UIMessageStreamWriter<SmartEduUIMessage>;
}) {
  const { mode, query, request, requestId, writer } = input;
  const requestedMarket = request.market ?? DEFAULT_STANDARDS_MARKET;
  const workflowRunner = mastra.getWorkflow("lessonAuthoringWorkflow");
  let workflow = await runLessonAuthoringWorkflowWithTrace(
    workflowRunner,
    {
      query,
      mode,
      context: request.context,
      lessonPlan: request.lessonPlan,
      screenPlan: request.screenPlan,
      market: requestedMarket,
    },
    {
      requestId,
      onTrace: (traceData) => writeTracePart(writer, traceData),
    },
  );

  logLessonAuthoringTrace({ workflow, mode, query, requestId });

  const agent = mastra.getAgent("peTeacherAgent");
  const agentStream: AgentStreamRunner = async (messages, options) =>
    (await agent.stream(messages, options as never)) as MastraModelOutput<unknown>;

  if (mode === "html") {
    const plannerAgent = mastra.getAgent("htmlScreenPlannerAgent");
    const agentGenerate: HtmlScreenPlanAgentRunner = async (messages, options) =>
      (await plannerAgent.generate(messages, options)) as FullOutput<LessonScreenPlan>;

    writeWorkflowTracePart(writer, workflow, requestId, "workflow", [
      ...workflow.trace,
      createWorkflowTraceEntry(
        "plan-html-screen-sections",
        "running",
        "正在规划互动大屏内容页。",
      ),
    ]);

    const screenPlanning = await runHtmlScreenPlanningSkill({
      agentGenerate,
      lessonPlan: request.lessonPlan,
      maxSteps: workflow.generationPlan.maxSteps,
      requestId,
      seedPlan: request.screenPlan,
    });

    workflow = applyHtmlScreenPlanning(workflow, screenPlanning);
    writeWorkflowTracePart(writer, workflow, requestId, "workflow");
    workflow = appendWorkflowTrace(
      workflow,
      createWorkflowTraceEntry("agent-stream-started", "running", "正在连接互动大屏生成模型流。"),
    );
    writeWorkflowTracePart(writer, workflow, requestId, "generation");

    const htmlGeneration = await runHtmlScreenGenerationSkill({
      requestId,
      workflow,
      lessonPlanLength: request.lessonPlan?.length ?? 0,
      originalMessageCount: request.messages.length,
      plannedSectionCount: screenPlanning.plan.sections.length,
      planningSource: screenPlanning.source,
      agentStream,
    });

    const generationStream = toAISdkStream(htmlGeneration.result, {
      from: "agent",
      version: "v6",
      sendStart: false,
      sendFinish: true,
    });

    writer.merge(
      createStructuredAuthoringStreamAdapter({
        originalMessages: request.messages,
        chatPersistence: request.chatPersistence,
        lessonPlan: request.lessonPlan,
        mode,
        persistence: request.persistence,
        projectId: request.projectId,
        requestId,
        workflow,
        stream: generationStream,
      }),
    );
    return;
  } else {
    writeWorkflowTracePart(writer, workflow, requestId, "workflow", [
      ...workflow.trace,
      createWorkflowTraceEntry(
        "collect-lesson-requirements",
        "running",
        "正在核对课题、年级、场地和器材等上课信息。",
      ),
    ]);

    const lessonIntake = await runLessonIntakeSkill({
      context: request.context,
      maxSteps: workflow.generationPlan.maxSteps,
      memory: request.memory,
      messages: request.messages,
      requestId,
    });

    workflow = applyLessonIntake(workflow, lessonIntake);
    writeWorkflowTracePart(writer, workflow, requestId, "workflow");

    await rememberLessonIntake({
      context: request.context,
      intakeResult: lessonIntake,
      memoryPersistence: request.memoryPersistence,
      projectId: request.projectId,
      requestId,
    });

    if (!lessonIntake.intake.readyToGenerate) {
      writer.merge(
        createLessonClarificationStreamAdapter({
          originalMessages: request.messages,
          chatPersistence: request.chatPersistence,
          projectId: request.projectId,
          requestId,
          text: formatLessonIntakeQuestions(lessonIntake.intake),
          workflow,
        }),
      );
      return;
    }

    const lessonAgentStream: AgentStreamRunner<CompetitionLessonPlan> = async (messages, options) =>
      (await agent.stream(messages, options as never)) as MastraModelOutput<CompetitionLessonPlan>;

    workflow = appendWorkflowTrace(
      workflow,
      createWorkflowTraceEntry("agent-stream-started", "running", "正在连接结构化教案生成模型流。"),
    );
    writeWorkflowTracePart(writer, workflow, requestId, "generation");

    const lessonGeneration = await runLessonGenerationSkill({
      agentStream: lessonAgentStream,
      messages: request.messages,
      requestId,
      workflow,
    });

    writer.merge(
      createStructuredAuthoringStreamAdapter({
        originalMessages: request.messages,
        chatPersistence: request.chatPersistence,
        lessonDraftStream: lessonGeneration.partialOutputStream,
        lessonPlan: request.lessonPlan,
        mode,
        persistence: request.persistence,
        projectId: request.projectId,
        requestId,
        workflow,
        stream: lessonGeneration.stream,
      }),
    );
  }
}

export function streamLessonAuthoring(request: LessonAuthoringRequest) {
  const mode = request.mode === "html" ? "html" : "lesson";
  const query = getLatestUserText(request.messages);
  const requestId = randomUUID();

  return {
    stream: createUIMessageStream<SmartEduUIMessage>({
      execute: async ({ writer }) => {
        try {
          await executeLessonAuthoringStream({
            mode,
            query,
            request,
            requestId,
            writer,
          });
        } catch (error) {
          writeAuthoringFailure({
            error,
            mode,
            query,
            requestId,
            requestedMarket: request.market ?? DEFAULT_STANDARDS_MARKET,
            writer,
          });
        }
      },
    }),
    requestId,
  };
}
