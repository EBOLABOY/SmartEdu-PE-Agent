import { randomUUID } from "node:crypto";

import type { FullOutput, MastraModelOutput } from "@mastra/core/stream";
import { toAISdkStream } from "@mastra/ai-sdk";
import {
  createUIMessageStream,
  type UIMessage,
  type UIMessageChunk,
  type UIMessageStreamWriter,
} from "ai";

import {
  competitionLessonPlanSchema,
  type AgentLessonGenerationResult,
  type CompetitionLessonPlan,
} from "@/lib/competition-lesson-contract";
import {
  DEFAULT_STANDARDS_MARKET,
  type GenerationMode,
  type LessonAuthoringMemory,
  type LessonScreenPlan,
  type PeTeacherContext,
  type SmartEduUIMessage,
  type StandardsMarket,
  type UiHint,
} from "@/lib/lesson-authoring-contract";
import type { LessonAuthoringPersistence } from "@/lib/persistence/lesson-authoring-store";
import type { LessonMemoryPersistence } from "@/lib/persistence/lesson-memory-store";
import type { ProjectChatPersistence } from "@/lib/persistence/project-chat-store";
import { mastra } from "@/mastra";
import { formatLessonScreenPlanForPrompt } from "@/mastra/agents/html_screen_planner";
import {
  createLessonClarificationStreamAdapter,
  createStructuredAuthoringStreamAdapter,
  runCompetitionLessonPatchSkill,
  runHtmlScreenGenerationSkill,
  runHtmlScreenPlanningSkill,
  runLessonGenerationWithRepair,
  type AgentStreamRunner,
  type HtmlScreenPlanAgentRunner,
  type HtmlScreenPlanningResult,
  type LessonRepairGenerateRunner,
  type LessonPatchAgentRunner,
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
  mastraStorageAdapter?: import("@/mastra/storage/mastra-storage-adapter").SupabaseMastraStorageAdapter | null;
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

function parseConfirmedLessonPlan(lessonPlan?: string): CompetitionLessonPlan | undefined {
  if (!lessonPlan?.trim()) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(lessonPlan);
    const result = competitionLessonPlanSchema.safeParse(parsed);

    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

function createPatchedLessonStream(lessonPlan: CompetitionLessonPlan) {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      controller.enqueue({
        type: "data-structured-output",
        data: {
          object: {
            lessonPlan,
          },
        },
      } as UIMessageChunk);
      controller.enqueue({ type: "finish", finishReason: "stop" });
      controller.close();
    },
  });
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
    decisionType: trace.workflow.decision.type,
    intent: trace.workflow.decision.intentResult.intent,
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
  workflow: LessonWorkflowOutput;
  memoryPersistence?: LessonMemoryPersistence | null;
  projectId?: string;
  requestId: string;
}) {
  if (!input.memoryPersistence || !input.projectId) {
    return;
  }

  const intakeResult =
    "intakeResult" in input.workflow.decision
      ? input.workflow.decision.intakeResult
      : undefined;

  if (!intakeResult) {
    return;
  }

  await input.memoryPersistence.rememberFromIntake({
    context: input.context,
    intake: intakeResult.intake,
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
  uiHints: UiHint[] = workflow.uiHints,
) {
  writeTracePart(writer, buildWorkflowTraceDataFromWorkflow(workflow, requestId, phase, trace, uiHints));
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

function mergeUiHints(...collections: UiHint[][]) {
  const seen = new Set<string>();
  const merged: UiHint[] = [];

  collections.flat().forEach((hint) => {
    const signature = JSON.stringify(hint);

    if (seen.has(signature)) {
      return;
    }

    seen.add(signature);
    merged.push(hint);
  });

  return merged;
}

function buildIntentExecutionHandover(workflow: LessonWorkflowOutput) {
  const { confidence, intent, reason } = workflow.decision.intentResult;

  return [
    "入口意图接力说明（隐藏执行指令，不要向教师复述）：",
    `- 当前入口判定：${intent}（置信度 ${confidence.toFixed(2)}）。`,
    `- 判定依据：${reason}`,
    "- 执行原则：优先围绕上述判定依据理解教师真正想解决的问题；若与教师最新明确指令冲突，以教师最新明确指令为准。",
  ].join("\n");
}

function appendHiddenInstructions(baseSystem: string, hiddenInstructions?: string) {
  if (!hiddenInstructions?.trim()) {
    return baseSystem;
  }

  return [baseSystem, hiddenInstructions].join("\n\n");
}

function applyIntentExecutionHandover(workflow: LessonWorkflowOutput) {
  if (workflow.decision.type !== "generate") {
    return workflow;
  }

  return {
    ...workflow,
    system: appendHiddenInstructions(workflow.system, buildIntentExecutionHandover(workflow)),
  };
}

function createRepairSuccessUiHint(): UiHint {
  return {
    action: "show_toast",
    params: {
      level: "success",
      title: "教案已自动修复",
      description: "检测到教案中存在未完成字段，系统已自动完善并替换占位符。",
    },
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

async function buildExecutionMessages(request: LessonAuthoringRequest): Promise<SmartEduUIMessage[]> {
  const incrementalMessages = request.messages;

  if (!request.projectId || !request.mastraStorageAdapter) {
    return incrementalMessages;
  }

  try {
    const history = await request.mastraStorageAdapter.listMessages({
      threadId: request.projectId,
      limit: 15,
    });

    if (history.length === 0) {
      return incrementalMessages;
    }

    // Sanitize: 剥离占用大量 Token 的 Data Part 等结构化载荷，仅提取纯文本意图
    const sanitizedHistory: SmartEduUIMessage[] = history.map((msg) => ({
      id: msg.id,
      role: msg.role === "system" ? "system" : msg.role === "user" ? "user" : "assistant",
      content: msg.content,
      parts: [{ type: "text", text: msg.content }],
    }));

    // 去重合并：因为前端最后一条消息在 route.ts 中已被 upsert，可能包含在 history 里
    const historyIds = new Set(sanitizedHistory.map((m) => m.id));
    const newMessages = incrementalMessages.filter((m) => !historyIds.has(m.id));

    return [...sanitizedHistory, ...newMessages];
  } catch (error) {
    console.warn("[lesson-authoring] build-execution-messages-failed", {
      projectId: request.projectId,
      message: error instanceof Error ? error.message : "unknown-error",
    });
    return incrementalMessages;
  }
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
  const executionMessages = await buildExecutionMessages(request);
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
      memory: request.memory,
      messages: executionMessages,
      requestId,
    },
    {
      requestId,
      onTrace: (traceData) => writeTracePart(writer, traceData),
    },
  );
  workflow = applyIntentExecutionHandover(workflow);

  logLessonAuthoringTrace({ workflow, mode: workflow.generationPlan.mode, query, requestId });

  await rememberLessonIntake({
    context: request.context,
    workflow,
    memoryPersistence: request.memoryPersistence,
    projectId: request.projectId,
    requestId,
  });

  if (workflow.decision.type === "clarify" || workflow.decision.type === "respond") {
    writer.merge(
      createLessonClarificationStreamAdapter({
        originalMessages: executionMessages,
        chatPersistence: request.chatPersistence,
        projectId: request.projectId,
        requestId,
        text: workflow.decision.text,
        workflow,
      }),
    );
    return;
  }

  if (workflow.decision.type === "patch") {
    const confirmedLessonPlan = parseConfirmedLessonPlan(request.lessonPlan);
    const additionalInstructions = buildIntentExecutionHandover(workflow);

    if (!confirmedLessonPlan) {
      throw new LessonAuthoringError("当前修改请求缺少已确认的结构化教案，无法执行局部补丁。");
    }

    const patchAgent = mastra.getAgent("lessonPatchAgent");
    const agentGenerate: LessonPatchAgentRunner = async (messages, options) =>
      (await patchAgent.generate(messages, options)) as FullOutput<unknown>;

    workflow = appendWorkflowTrace(
      workflow,
      createWorkflowTraceEntry("lesson-patch-started", "running", "正在执行结构化教案补丁。"),
    );
    writeWorkflowTracePart(writer, workflow, requestId, "generation");

    const patchResponse = await runCompetitionLessonPatchSkill(
      {
        instruction: query,
        lessonPlan: confirmedLessonPlan,
      },
      {
        additionalInstructions,
        agentGenerate,
        maxSteps: workflow.generationPlan.maxSteps,
        requestId,
      },
    );

    workflow = appendWorkflowTrace(
      workflow,
      createWorkflowTraceEntry(
        "lesson-patch-finished",
        "success",
        patchResponse.patchSummary ??
          `已完成 ${patchResponse.patch.operations.length} 处结构化教案修改。`,
      ),
    );
    writeWorkflowTracePart(writer, workflow, requestId, "generation");

    writer.merge(
      createStructuredAuthoringStreamAdapter({
        originalMessages: executionMessages,
        chatPersistence: request.chatPersistence,
        mode: "lesson",
        persistence: request.persistence,
        projectId: request.projectId,
        requestId,
        workflow,
        stream: createPatchedLessonStream(patchResponse.lessonPlan),
      }),
    );
    return;
  }

  const agent = mastra.getAgent("peTeacherAgent");
  const agentStream: AgentStreamRunner = async (messages, options) =>
    (await agent.stream(messages, options as never)) as MastraModelOutput<unknown>;

  if (workflow.generationPlan.mode === "html") {
    const plannerAgent = mastra.getAgent("htmlScreenPlannerAgent");
    const agentGenerate: HtmlScreenPlanAgentRunner = async (messages, options) =>
      (await plannerAgent.generate(messages, options)) as FullOutput<LessonScreenPlan>;
    const additionalInstructions = buildIntentExecutionHandover(workflow);

    writeWorkflowTracePart(writer, workflow, requestId, "workflow", [
      ...workflow.trace,
      createWorkflowTraceEntry(
        "plan-html-screen-sections",
        "running",
        "正在规划互动大屏内容页。",
      ),
    ]);

    const screenPlanning = await runHtmlScreenPlanningSkill({
      additionalInstructions,
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
        mode: workflow.generationPlan.mode,
        persistence: request.persistence,
        projectId: request.projectId,
        requestId,
        workflow,
        stream: generationStream,
      }),
    );
    return;
  }

  const lessonAgentStream: AgentStreamRunner<AgentLessonGenerationResult> = async (messages, options) =>
    (await agent.stream(messages, options as never)) as MastraModelOutput<AgentLessonGenerationResult>;
  const lessonAgentGenerate: LessonRepairGenerateRunner = async (messages, options) =>
    (await agent.generate(messages, options as never)) as FullOutput<CompetitionLessonPlan>;
  const lessonRuntimeTrace = [...workflow.trace];
  const lessonRuntimeUiHints = [...workflow.uiHints];
  const recordLessonTrace = (
    entry: LessonWorkflowOutput["trace"][number],
    phase: Parameters<typeof buildWorkflowTraceDataFromWorkflow>[2] = "generation",
  ) => {
    if (entry.step === "lesson-repair-finished" && entry.status === "success") {
      const nextUiHints = mergeUiHints(lessonRuntimeUiHints, [createRepairSuccessUiHint()]);
      lessonRuntimeUiHints.splice(0, lessonRuntimeUiHints.length, ...nextUiHints);
    }

    lessonRuntimeTrace.push(entry);
    writeWorkflowTracePart(writer, workflow, requestId, phase, lessonRuntimeTrace, lessonRuntimeUiHints);
  };

  recordLessonTrace(
    createWorkflowTraceEntry("agent-stream-started", "running", "正在连接结构化教案生成模型流。"),
  );

  const lessonGeneration = await runLessonGenerationWithRepair({
    agentStream: lessonAgentStream,
    messages: executionMessages,
    onTrace: (entry) => recordLessonTrace(entry, "generation"),
    repairGenerate: lessonAgentGenerate,
    requestId,
    workflow,
  });

  writer.merge(
    createStructuredAuthoringStreamAdapter({
      finalLessonPlanPromise: lessonGeneration.finalLessonPlanPromise,
      originalMessages: executionMessages,
      chatPersistence: request.chatPersistence,
      lessonDraftStream: lessonGeneration.partialOutputStream,
      lessonPlan: request.lessonPlan,
      mode: workflow.generationPlan.mode,
      persistence: request.persistence,
      projectId: request.projectId,
      requestId,
      runtimeTrace: lessonRuntimeTrace,
      runtimeUiHints: lessonRuntimeUiHints,
      workflow,
      stream: lessonGeneration.stream,
    }),
  );
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
