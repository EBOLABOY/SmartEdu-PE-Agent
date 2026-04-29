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
  "retrieve-standards-context": "检索课程标准",
  "resolve-standards-market": "解析课程标准市场",
  "collect-lesson-requirements": "收集上课信息",
  "construct-generation-prompt": "构建生成提示",
  "plan-structured-delivery": "规划结构化输出",
  "plan-html-screen-sections": "规划大屏分镜",
  "validate-generation-safety": "校验生成安全",
  "agent-stream-started": "启动模型生成",
  "validate-lesson-output": "校验课时计划输出",
  "lesson-repair-started": "自动修复课时计划",
  "lesson-repair-finished": "完成自动修复",
  "lesson-repair-failed": "课时计划修复失败",
  "convert-lesson-json-artifact": "转换结构化课时计划",
  "extract-html-document": "提取 HTML 文档",
  "html-slideshow-fallback": "生成大屏兜底版本",
  "persist-artifact-version": "保存 Artifact 版本",
  "generation-finished": "生成完成",
  "generation-stream-closed": "关闭生成流",
  "generation-stream-exception": "生成流异常",
  "agent-stream-error": "模型生成异常",
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

function normalizeDetail(detail: string) {
  return detail
    .replaceAll("CompetitionLessonPlan JSON", "结构化课时计划 JSON")
    .replaceAll("Artifact", "版本")
    .replaceAll("lesson-json", "课时计划 JSON")
    .replaceAll("html", "HTML");
}

function buildDetails(trace: WorkflowTraceData | undefined): AssistantWorkflowDetail[] {
  return (
    trace?.trace
      .filter((entry) => !TRACE_STEPS_OWNED_BY_AI_SDK_PARTS.has(entry.step))
      .map((entry, index) => ({
        id: `${entry.step}-${entry.timestamp ?? index}`,
        status: toDetailStatus(entry.status),
        title: toDetailTitle(entry.step),
        description: normalizeDetail(entry.detail),
        debugStep: entry.step,
      })) ?? []
  );
}

function isSubmitToolPart(part: SmartEduUIMessage["parts"][number]) {
  return part.type === "tool-submit_lesson_plan" || part.type === "tool-submit_html_screen";
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
    return input.mode === "html" ? "生成互动大屏" : "生成结构化课时计划";
  }

  if (input.phase === "completed" || input.status === "complete") {
    return input.mode === "html" ? "互动大屏已完成" : "结构化课时计划已完成";
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
    return "模型或结构化封装失败，保留原始错误信息用于定位。";
  }

  if (input.status === "blocked") {
    return "主结果仍可用，但持久化或辅助步骤需要关注。";
  }

  const marketText = input.resolvedMarket ? `课标市场：${input.resolvedMarket}` : "课标市场待解析";
  const standardsText = input.standardsCount
    ? `已引用 ${input.standardsCount} 条课标依据`
    : "尚无课标引用";

  if (input.mode === "html") {
    return `正在把已确认课时计划转换为可预览互动大屏。${marketText}，${standardsText}。`;
  }

  return `正在把课堂需求转换为结构化课时计划。${marketText}，${standardsText}。`;
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
