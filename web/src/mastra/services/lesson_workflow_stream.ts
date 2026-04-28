import type { WorkflowStreamEvent } from "@mastra/core/workflows";

import {
  DEFAULT_STANDARDS_MARKET,
  STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
  standardsMarketSchema,
  workflowStandardsSnapshotSchema,
  workflowTraceEntrySchema,
  type StandardsMarket,
  type WorkflowTraceData,
  type WorkflowTraceEntry,
} from "@/lib/lesson-authoring-contract";
import type { LessonWorkflowInput, LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

type WorkflowRunResult = {
  error?: unknown;
  result?: LessonWorkflowOutput;
  status: string;
};

type WorkflowEventReader = {
  read(): Promise<ReadableStreamReadResult<WorkflowStreamEvent>>;
  releaseLock?(): void;
};

type WorkflowEventStream = {
  getReader(): WorkflowEventReader;
};

type WorkflowRunStreamOutput = {
  fullStream: WorkflowEventStream;
  result: Promise<WorkflowRunResult>;
};

type WorkflowRun = {
  start(args: { inputData: LessonWorkflowInput }): Promise<WorkflowRunResult>;
  stream?: (args: { inputData: LessonWorkflowInput }) => WorkflowRunStreamOutput;
};

export type LessonWorkflowRunner = {
  createRun(): Promise<WorkflowRun>;
};

export type LessonWorkflowTraceState = {
  mode: LessonWorkflowInput["mode"];
  requestedMarket: StandardsMarket;
  resolvedMarket: StandardsMarket;
  standards?: WorkflowTraceData["standards"];
  trace: WorkflowTraceEntry[];
  warnings: string[];
};

const WORKFLOW_RESPONSE_TRANSPORT = "structured-data-part" as const;

const STEP_RUNNING_DETAILS: Record<string, string> = {
  "collect-lesson-requirements": "正在核对课题、年级、场地和器材等上课信息。",
  "prepare-clarification-response": "正在准备必要追问。",
  "prepare-generation-response": "正在准备正式生成上下文。",
  "retrieve-standards-context": "正在检索课程标准并解析目标市场。",
  "construct-generation-prompt": "正在构造生成提示词。",
  "plan-structured-delivery": "正在规划结构化输出协议。",
  "validate-generation-safety": "正在校验生成安全边界。",
  "merge-workflow-branch-output": "正在归一化工作流分支输出。",
};

const STEP_SUCCESS_DETAILS: Record<string, string> = {
  "collect-lesson-requirements": "信息收集已完成。",
  "prepare-clarification-response": "必要追问已准备。",
  "prepare-generation-response": "正式生成上下文已准备。",
  "retrieve-standards-context": "课程标准检索已完成。",
  "construct-generation-prompt": "生成提示词已构造。",
  "plan-structured-delivery": "结构化输出协议已就绪。",
  "validate-generation-safety": "生成安全校验已通过。",
  "merge-workflow-branch-output": "工作流分支输出已归一化。",
};

function nowIsoString() {
  return new Date().toISOString();
}

export function createWorkflowTraceEntry(
  step: string,
  status: WorkflowTraceEntry["status"],
  detail: string,
): WorkflowTraceEntry {
  return {
    detail,
    status,
    step,
    timestamp: nowIsoString(),
  };
}

export function createLessonWorkflowTraceState(input: LessonWorkflowInput): LessonWorkflowTraceState {
  const requestedMarket = input.market ?? DEFAULT_STANDARDS_MARKET;

  return {
    mode: input.mode,
    requestedMarket,
    resolvedMarket: requestedMarket,
    trace: [],
    warnings: [],
  };
}

export function buildWorkflowTraceData(
  state: LessonWorkflowTraceState,
  requestId: string,
  phase: WorkflowTraceData["phase"],
): WorkflowTraceData {
  return {
    protocolVersion: STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
    requestId,
    mode: state.mode,
    phase,
    responseTransport: WORKFLOW_RESPONSE_TRANSPORT,
    requestedMarket: state.requestedMarket,
    resolvedMarket: state.resolvedMarket,
    warnings: state.warnings,
    ...(state.standards ? { standards: state.standards } : {}),
    trace: state.trace,
    updatedAt: nowIsoString(),
  };
}

export function buildWorkflowTraceDataFromWorkflow(
  workflow: LessonWorkflowOutput,
  requestId: string,
  phase: WorkflowTraceData["phase"],
  trace: WorkflowTraceEntry[] = workflow.trace,
): WorkflowTraceData {
  return buildWorkflowTraceData(
    {
      mode: workflow.generationPlan.mode,
      requestedMarket: workflow.standards.requestedMarket,
      resolvedMarket: workflow.standards.resolvedMarket,
      standards: workflow.standards.references
        ? {
            corpusId: workflow.standards.corpusId,
            displayName: workflow.standards.displayName,
            issuer: workflow.standards.issuer,
            references: workflow.standards.references,
            sourceName: workflow.standards.sourceName,
            url: workflow.standards.url,
            version: workflow.standards.version,
          }
        : undefined,
      trace,
      warnings: workflow.safety.warnings,
    },
    requestId,
    phase,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: Record<string, unknown>, key: string) {
  const found = value[key];

  return typeof found === "string" ? found : undefined;
}

function parseMarket(value: unknown) {
  const parsed = standardsMarketSchema.safeParse(value);

  return parsed.success ? parsed.data : undefined;
}

function getWorkflowTraceEntries(output: unknown) {
  if (!isRecord(output)) {
    return undefined;
  }

  const parsed = workflowTraceEntrySchema.array().safeParse(output.trace);

  return parsed.success ? parsed.data : undefined;
}

function getEventPayload(event: WorkflowStreamEvent): Record<string, unknown> {
  const payload: unknown = event.payload;

  return isRecord(payload) ? payload : {};
}

function getEventStepId(event: WorkflowStreamEvent) {
  const payload = getEventPayload(event);

  return getString(payload, "id") ?? getString(payload, "stepName") ?? ("id" in event ? String(event.id) : undefined);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (isRecord(error) && typeof error.message === "string") {
    return error.message;
  }

  return typeof error === "string" ? error : "unknown-error";
}

function getStepStatus(status: unknown): WorkflowTraceEntry["status"] {
  switch (status) {
    case "success":
      return "success";
    case "failed":
      return "failed";
    case "suspended":
    case "waiting":
    case "paused":
      return "blocked";
    case "running":
    default:
      return "running";
  }
}

function getStepDetail(step: string, status: WorkflowTraceEntry["status"], error?: unknown) {
  if (status === "failed") {
    return `${step} 执行失败：${getErrorMessage(error)}`;
  }

  if (status === "blocked") {
    return `${step} 已暂停或等待外部条件。`;
  }

  if (status === "success") {
    return STEP_SUCCESS_DETAILS[step] ?? `${step} 已完成。`;
  }

  return STEP_RUNNING_DETAILS[step] ?? `${step} 正在执行。`;
}

function replaceTraceEntry(state: LessonWorkflowTraceState, nextEntry: WorkflowTraceEntry) {
  const existingIndex = state.trace.findIndex((entry) => entry.step === nextEntry.step);

  if (existingIndex >= 0) {
    state.trace = [
      ...state.trace.slice(0, existingIndex),
      nextEntry,
      ...state.trace.slice(existingIndex + 1),
    ];
    return;
  }

  state.trace = [...state.trace, nextEntry];
}

function updateStandardsSnapshot(state: LessonWorkflowTraceState, output: Record<string, unknown>) {
  const standards = isRecord(output.standards) ? output.standards : undefined;

  if (!standards) {
    return;
  }

  state.requestedMarket = parseMarket(standards.requestedMarket) ?? state.requestedMarket;
  state.resolvedMarket = parseMarket(standards.resolvedMarket) ?? state.resolvedMarket;

  const warning = getString(standards, "warning");

  if (warning && !state.warnings.includes(warning)) {
    state.warnings = [...state.warnings, warning];
  }

  const snapshot = workflowStandardsSnapshotSchema.safeParse({
    corpusId: standards.corpusId,
    displayName: standards.displayName,
    issuer: standards.issuer,
    references: Array.isArray(standards.references) ? standards.references : [],
    sourceName: standards.sourceName,
    url: standards.url,
    version: standards.version,
  });

  if (snapshot.success) {
    state.standards = snapshot.data;
  }
}

function updateSafetySnapshot(state: LessonWorkflowTraceState, output: Record<string, unknown>) {
  const safety = isRecord(output.safety) ? output.safety : undefined;

  if (!safety || !Array.isArray(safety.warnings)) {
    return;
  }

  state.warnings = safety.warnings.filter((warning): warning is string => typeof warning === "string");
}

function updateStateFromStepOutput(state: LessonWorkflowTraceState, output: unknown) {
  if (!isRecord(output)) {
    return;
  }

  updateStandardsSnapshot(state, output);
  updateSafetySnapshot(state, output);

  const trace = getWorkflowTraceEntries(output);

  if (trace) {
    state.trace = trace;
  }
}

export function applyWorkflowStreamEvent(
  state: LessonWorkflowTraceState,
  event: WorkflowStreamEvent,
) {
  if (event.type !== "workflow-step-start" && event.type !== "workflow-step-result") {
    return false;
  }

  const step = getEventStepId(event);

  if (!step) {
    return false;
  }

  const payload = getEventPayload(event);

  if (event.type === "workflow-step-start") {
    replaceTraceEntry(
      state,
      createWorkflowTraceEntry(step, "running", getStepDetail(step, "running")),
    );
    return true;
  }

  const status = getStepStatus(payload.status);

  updateStateFromStepOutput(state, payload.output);

  if (!getWorkflowTraceEntries(payload.output)) {
    replaceTraceEntry(
      state,
      createWorkflowTraceEntry(step, status, getStepDetail(step, status, payload.error)),
    );
  }

  return true;
}

function assertSuccessfulWorkflowResult(result: WorkflowRunResult): LessonWorkflowOutput {
  if (result.status !== "success" || !result.result) {
    throw new Error(
      result.error instanceof Error
        ? result.error.message
        : `Lesson authoring workflow failed with status: ${result.status}`,
    );
  }

  return result.result;
}

export async function runLessonAuthoringWorkflowWithTrace(
  workflow: LessonWorkflowRunner,
  input: LessonWorkflowInput,
  options: {
    onTrace: (traceData: WorkflowTraceData) => void;
    requestId: string;
  },
) {
  const run = await workflow.createRun();
  const state = createLessonWorkflowTraceState(input);
  const publishTrace = () => options.onTrace(buildWorkflowTraceData(state, options.requestId, "workflow"));

  replaceTraceEntry(
    state,
    createWorkflowTraceEntry(
      "collect-lesson-requirements",
      "running",
      STEP_RUNNING_DETAILS["collect-lesson-requirements"],
    ),
  );
  publishTrace();

  if (!run.stream) {
    const result = await run.start({ inputData: input });
    const output = assertSuccessfulWorkflowResult(result);

    options.onTrace(buildWorkflowTraceDataFromWorkflow(output, options.requestId, "workflow"));
    return output;
  }

  const workflowStream = run.stream({ inputData: input });

  const reader = workflowStream.fullStream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (applyWorkflowStreamEvent(state, value)) {
        publishTrace();
      }
    }
  } finally {
    reader.releaseLock?.();
  }

  const output = assertSuccessfulWorkflowResult(await workflowStream.result);

  options.onTrace(buildWorkflowTraceDataFromWorkflow(output, options.requestId, "workflow"));
  return output;
}
