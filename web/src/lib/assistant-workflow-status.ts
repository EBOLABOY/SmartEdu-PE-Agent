import {
  extractArtifactFromMessage,
  getMessageReasoningText,
} from "@/lib/artifact-protocol";
import type {
  GenerationMode,
  SmartEduUIMessage,
  WorkflowTraceData,
  WorkflowTraceEntry,
} from "@/lib/lesson-authoring-contract";

export type AssistantWorkflowDetailStatus = "complete" | "active" | "blocked" | "failed";

export type AssistantWorkflowDetail = {
  id: string;
  status: AssistantWorkflowDetailStatus;
  title: string;
  description: string;
  debugStep: string;
};

export type AssistantWorkflowState = {
  badge: string;
  description: string;
  details: AssistantWorkflowDetail[];
  hasReasoning: boolean;
  hasWorkflow: boolean;
  isStreaming: boolean;
  mode?: GenerationMode;
  reasoningText: string;
  status: AssistantWorkflowDetailStatus | "idle";
  standardsCount: number;
  title: string;
  warnings: string[];
};

const STEP_TITLES: Record<string, string> = {
  "retrieve-standards-context": "查找课程标准",
  "resolve-standards-market": "确认课程标准",
  "collect-lesson-requirements": "收集上课信息",
  "construct-generation-prompt": "整理生成要求",
  "plan-structured-delivery": "准备右侧预览",
  "plan-html-screen-sections": "安排大屏页面",
  "validate-generation-safety": "检查安全要求",
  "authoring-entry": "开始创建体育课",
  "server-deterministic-entry": "准备生成教案",
  "server-standards-retrieval": "查找课程标准",
  "server-standards-retrieval-warning": "课程标准提示",
  "agent-stream-started": "开始生成内容",
  "stream-lesson-draft": "生成教案初稿",
  "validate-lesson-output": "检查教案内容",
  "lesson-repair-started": "完善教案内容",
  "lesson-repair-finished": "完成教案完善",
  "lesson-repair-failed": "教案完善失败",
  "convert-lesson-json-artifact": "整理教案预览",
  "extract-html-document": "整理大屏页面",
  "persist-artifact-version": "保存版本",
  "generation-finished": "生成完成",
  "generation-stream-closed": "结束生成",
  "generation-stream-exception": "生成异常",
  "agent-stream-error": "生成异常",
  "agent-stream-abort": "生成已中断",
};

const TRACE_STEPS_OWNED_BY_AI_SDK_PARTS = new Set([
  "agent-step-start",
  "agent-step-finish",
  "agent-tool-call",
  "agent-tool-result",
  "agent-tool-error",
]);

const PASSIVE_TEXT_ONLY_TRACE_STEPS = new Set([
  "agentic-entry",
  "authoring-entry",
  "agent-stream-started",
  "agent-step-start",
  "agent-step-finish",
  "agent-text-response",
  "generation-finished",
]);

function isStreamingPart(part: SmartEduUIMessage["parts"][number]) {
  return (
    (part.type === "text" || part.type === "reasoning") &&
    "state" in part &&
    part.state === "streaming"
  );
}

function toDetailStatus(status: WorkflowTraceEntry["status"]): AssistantWorkflowDetailStatus {
  if (status === "failed") {
    return "failed";
  }

  if (status === "blocked") {
    return "blocked";
  }

  if (status === "running") {
    return "active";
  }

  return "complete";
}

function toDetailTitle(step: string) {
  return STEP_TITLES[step] ?? step.replaceAll("-", " ");
}

function getCountFromDetail(detail: string) {
  const match = detail.match(/检索\s*(\d+)\s*条课标/);
  if (!match) {
    return undefined;
  }

  return Number.parseInt(match[1] ?? "", 10);
}

function normalizeTechnicalWords(detail: string) {
  return detail
    .replaceAll("CompetitionLessonPlan JSON", "结构化课时计划 JSON")
    .replaceAll("Artifact", "版本")
    .replaceAll("lesson-json", "课时计划 JSON")
    .replaceAll("html", "HTML");
}

export function formatWorkflowTraceDetailForTeacher(entry: WorkflowTraceEntry) {
  const detail = normalizeTechnicalWords(entry.detail);

  switch (entry.step) {
    case "authoring-entry":
      return "已收到课堂主题，正在准备生成教案。";
    case "server-deterministic-entry":
      return entry.detail.includes("HTML")
        ? "正在根据已确认的教案制作互动大屏。"
        : "正在根据你的要求生成课时计划。";
    case "server-standards-retrieval": {
      const count = getCountFromDetail(entry.detail);

      if (entry.status === "running") {
        return "正在查找可参考的课程标准。";
      }

      if (entry.status === "blocked") {
        return "暂时没有查到课程标准，系统会先按通用体育教学要求继续生成。";
      }

      if (count === 0) {
        return "本次没有匹配到课程标准，系统会先按通用体育教学要求生成。";
      }

      if (typeof count === "number" && Number.isFinite(count)) {
        return `已找到 ${count} 条可参考的课程标准。`;
      }

      return "已查找课程标准。";
    }
    case "server-standards-retrieval-warning":
      return detail.includes("未返回匹配条目") || detail.includes("embedding")
        ? "本次没有匹配到课程标准，可先继续生成；如需严格引用，请先补充课程标准资料。"
        : detail;
    case "agent-stream-started":
      return entry.status === "running" ? "正在生成内容，请稍等。" : "内容生成已完成。";
    case "stream-lesson-draft":
      return entry.status === "running"
        ? "右侧正在同步教案初稿。"
        : "教案初稿已同步完成。";
    case "validate-lesson-output":
      return entry.status === "running"
        ? "正在检查教案是否完整、可用。"
        : "教案内容已检查通过。";
    case "lesson-repair-started":
      return "正在补齐教案里不完整的地方。";
    case "lesson-repair-finished":
      return "教案内容已补齐。";
    case "convert-lesson-json-artifact":
      return "正在整理右侧教案预览。";
    case "extract-html-document":
      return "正在整理互动大屏页面。";
    case "persist-artifact-version":
      return entry.status === "blocked"
        ? "教案已生成，但版本保存需要稍后再试。"
        : "已保存为新版本。";
    case "generation-finished":
      return entry.detail.includes("HTML") ? "互动大屏已生成。" : "课时计划已生成。";
    case "generation-stream-closed":
    case "generation-stream-closed-without-finish":
      return "生成已结束。";
    case "generation-stream-exception":
    case "agent-stream-error":
      return "生成过程中出现问题，请稍后重试。";
    case "agent-stream-abort":
      return "本次生成已中断。";
    default:
      return detail;
  }
}

function buildDetails(trace: WorkflowTraceData | undefined): AssistantWorkflowDetail[] {
  return (
    trace?.trace
      .filter((entry) => !TRACE_STEPS_OWNED_BY_AI_SDK_PARTS.has(entry.step))
      .map((entry, index) => ({
        id: `${entry.step}-${entry.timestamp ?? index}`,
        status: toDetailStatus(entry.status),
        title: toDetailTitle(entry.step),
        description: formatWorkflowTraceDetailForTeacher(entry),
        debugStep: entry.step,
      })) ?? []
  );
}

function isSubmitToolPart(part: SmartEduUIMessage["parts"][number]) {
  return part.type === "tool-submit_lesson_plan";
}

function hasActionableWorkflowTrace(
  message: SmartEduUIMessage,
  trace: WorkflowTraceData | undefined,
  hasArtifact: boolean,
) {
  if (!trace) {
    return false;
  }

  if (hasArtifact || trace.phase === "failed" || message.parts.some(isSubmitToolPart)) {
    return true;
  }

  if (trace.trace.some((entry) => entry.status === "failed" || entry.status === "blocked")) {
    return true;
  }

  return trace.trace.some((entry) => !PASSIVE_TEXT_ONLY_TRACE_STEPS.has(entry.step));
}

function getWorkflowStatus(
  trace: WorkflowTraceData | undefined,
  details: AssistantWorkflowDetail[],
  isStreaming: boolean,
): AssistantWorkflowState["status"] {
  if (trace?.phase === "failed" || details.some((detail) => detail.status === "failed")) {
    return "failed";
  }

  if (details.some((detail) => detail.status === "blocked")) {
    return "blocked";
  }

  if (isStreaming) {
    return "active";
  }

  if (trace?.phase === "completed" || details.some((detail) => detail.status === "complete")) {
    return "complete";
  }

  return "idle";
}

function getTitle(input: {
  mode?: GenerationMode;
  phase?: WorkflowTraceData["phase"];
  status: AssistantWorkflowState["status"];
}) {
  if (input.status === "failed") {
    return "生成失败";
  }

  if (input.status === "blocked") {
    return "生成完成但有阻塞项";
  }

  if (input.phase === "workflow") {
    return "准备课程上下文";
  }

  if (input.phase === "generation") {
    return input.mode === "html" ? "生成互动大屏" : "生成课时计划";
  }

  if (input.phase === "completed" || input.status === "complete") {
    return input.mode === "html" ? "互动大屏已完成" : "课时计划已完成";
  }

  return input.mode === "html" ? "互动大屏工作流" : "课时计划工作流";
}

function getBadge(status: AssistantWorkflowState["status"]) {
  switch (status) {
    case "active":
      return "进行中";
    case "blocked":
      return "需注意";
    case "complete":
      return "已完成";
    case "failed":
      return "失败";
    default:
      return "待开始";
  }
}

function getDescription(input: {
  mode?: GenerationMode;
  resolvedMarket?: string;
  standardsCount: number;
  status: AssistantWorkflowState["status"];
}) {
  if (input.status === "failed") {
    return "生成时遇到问题，请稍后重试或调整要求。";
  }

  if (input.status === "blocked") {
    return "主要内容可继续查看，但有一项辅助步骤需要注意。";
  }

  const standardsText = input.standardsCount
    ? `已找到 ${input.standardsCount} 条课程标准`
    : "未找到匹配课程标准";

  if (input.mode === "html") {
    return `正在把已确认的课时计划做成课堂互动大屏。${standardsText}。`;
  }

  return `正在根据课堂需求生成课时计划。${standardsText}。`;
}

export function buildAssistantWorkflowState(message: SmartEduUIMessage): AssistantWorkflowState {
  const extracted = extractArtifactFromMessage(message);
  const reasoningText = getMessageReasoningText(message);
  const trace = extracted.trace;
  const hasWorkflow = hasActionableWorkflowTrace(message, trace, Boolean(extracted.artifact));
  const details = hasWorkflow ? buildDetails(trace) : [];
  const isStreaming =
    extracted.status === "streaming" ||
    (hasWorkflow && (trace?.phase === "workflow" || trace?.phase === "generation")) ||
    message.parts.some(isStreamingPart);
  const status = getWorkflowStatus(trace, details, isStreaming);
  const standardsCount = trace?.standards?.references.length ?? 0;
  const mode = trace?.mode ?? extracted.stage;

  return {
    badge: getBadge(status),
    description: getDescription({
      mode,
      resolvedMarket: trace?.resolvedMarket,
      standardsCount,
      status,
    }),
    details,
    hasReasoning: Boolean(reasoningText.trim()),
    hasWorkflow,
    isStreaming,
    mode,
    reasoningText,
    status,
    standardsCount,
    title: getTitle({
      mode,
      phase: trace?.phase,
      status,
    }),
    warnings: trace?.warnings ?? [],
  };
}
