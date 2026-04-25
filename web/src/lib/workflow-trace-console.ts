import type {
  WorkflowTraceData,
  WorkflowTraceEntry,
} from "@/lib/lesson-authoring-contract";

export type WorkflowConsoleLog = {
  level: "log" | "warn" | "error";
  message: string;
  timestamp: Date;
};

const TRACE_PHASE_LABELS: Record<WorkflowTraceData["phase"], string> = {
  workflow: "工作流编排",
  generation: "模型生成",
  completed: "生成完成",
  failed: "生成失败",
};

const TRACE_STATUS_LABELS: Record<WorkflowTraceEntry["status"], string> = {
  success: "完成",
  blocked: "阻断",
  running: "进行中",
  failed: "失败",
};

const MARKET_LABELS: Record<WorkflowTraceData["requestedMarket"], string> = {
  "cn-compulsory-2022": "中国义务教育课标（2022）",
  "us-shape-k12": "美国 SHAPE K-12",
};

function parseTimestamp(value: string | undefined, fallback: string) {
  const candidate = value ?? fallback;
  const parsed = new Date(candidate);

  if (Number.isNaN(parsed.getTime())) {
    return new Date(fallback);
  }

  return parsed;
}

function toConsoleLevel(
  status: WorkflowTraceEntry["status"],
): WorkflowConsoleLog["level"] {
  if (status === "failed") {
    return "error";
  }

  if (status === "blocked") {
    return "warn";
  }

  return "log";
}

export function formatWorkflowTracePhase(
  phase: WorkflowTraceData["phase"] | undefined,
) {
  if (!phase) {
    return "暂无阶段";
  }

  return TRACE_PHASE_LABELS[phase];
}

export function formatWorkflowTraceMarket(trace: WorkflowTraceData | undefined) {
  if (!trace) {
    return "暂无市场信息";
  }

  const requested = MARKET_LABELS[trace.requestedMarket];
  const resolved = MARKET_LABELS[trace.resolvedMarket];

  if (trace.requestedMarket === trace.resolvedMarket) {
    return resolved;
  }

  return `${requested} -> ${resolved}`;
}

export function buildWorkflowTraceConsoleLogs(
  trace: WorkflowTraceData | undefined,
): WorkflowConsoleLog[] {
  if (!trace) {
    return [];
  }

  const stepLogs = trace.trace.map((entry) => ({
    level: toConsoleLevel(entry.status),
    message: `[${TRACE_STATUS_LABELS[entry.status]}] ${entry.step}：${entry.detail}`,
    timestamp: parseTimestamp(entry.timestamp, trace.updatedAt),
  }));

  const warningLogs = trace.warnings.map((warning) => ({
    level: "warn" as const,
    message: `[流程告警] ${warning}`,
    timestamp: parseTimestamp(undefined, trace.updatedAt),
  }));

  return [...stepLogs, ...warningLogs];
}
