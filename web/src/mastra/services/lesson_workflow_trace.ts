import {
  DEFAULT_STANDARDS_MARKET,
  STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
  type StandardsMarket,
  type UiHint,
  type WorkflowTraceData,
  type WorkflowTraceEntry,
} from "@/lib/lesson/authoring-contract";
import type { LessonWorkflowInput, LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

/**
 * 课时计划工作流的 trace 状态机：
 * 用于在 service 层（lesson_authoring.ts）边推进流程边累积 trace 步骤、
 * 课标快照、UI hints 与警告，最终交给 buildWorkflowTraceData 序列化成
 * 前端 data-trace part 的 payload。
 *
 * 注：本文件不再消费 Mastra workflow 的 fullStream 事件（旧的
 * runLessonAuthoringWorkflowWithTrace / applyWorkflowStreamEvent 已删除，
 * 因为 prod 路径直接调 skills 而不跑 workflow）。当未来按 P2 计划迁移到
 * Mastra workflow + @mastra/ai-sdk 的 handleWorkflowStream 时，那条路径
 * 自带 step 事件转 UI parts，本文件只需保留 trace 数据构造能力。
 */

export type LessonWorkflowTraceState = {
  mode: LessonWorkflowInput["mode"];
  requestedMarket: StandardsMarket;
  resolvedMarket: StandardsMarket;
  standards?: WorkflowTraceData["standards"];
  trace: WorkflowTraceEntry[];
  uiHints: UiHint[];
  warnings: string[];
};

const WORKFLOW_RESPONSE_TRANSPORT = "structured-data-part" as const;

function nowIsoString() {
  return new Date().toISOString();
}

function collectWorkflowWarnings(workflow: LessonWorkflowOutput) {
  const standardsWarning = workflow.standards.warning?.startsWith("正式生成前将由服务端主动检索")
    ? undefined
    : workflow.standards.warning;

  return [
    ...workflow.safety.warnings,
    ...(standardsWarning ? [standardsWarning] : []),
  ];
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
    uiHints: [],
    warnings: [],
  };
}

export function buildWorkflowTraceData(
  state: LessonWorkflowTraceState,
  requestId: string,
  phase: WorkflowTraceData["phase"],
  uiHints: UiHint[] = state.uiHints,
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
    uiHints,
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
  uiHints: UiHint[] = workflow.uiHints,
): WorkflowTraceData {
  return buildWorkflowTraceData(
    {
      mode: workflow.generationPlan.mode,
      requestedMarket: workflow.standards.requestedMarket,
      resolvedMarket: workflow.standards.resolvedMarket,
      standards: workflow.standards.corpus && workflow.standards.references
        ? {
            corpusId: workflow.standards.corpus.corpusId,
            displayName: workflow.standards.corpus.displayName,
            issuer: workflow.standards.corpus.issuer,
            references: workflow.standards.references,
            url: workflow.standards.corpus.url,
            version: workflow.standards.corpus.version,
          }
        : undefined,
      trace,
      uiHints,
      warnings: collectWorkflowWarnings(workflow),
    },
    requestId,
    phase,
    uiHints,
  );
}
