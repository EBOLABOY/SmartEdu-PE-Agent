import {
  extractArtifactFromMessage,
  getMessageReasoningText,
} from "@/lib/artifact-protocol";
import type {
  SmartEduUIMessage,
  WorkflowTraceEntry,
} from "@/lib/lesson-authoring-contract";

export type AssistantProcessEventStatus = "complete" | "active" | "pending";
export type AssistantProcessEventKind = "workflow" | "tool" | "repair" | "validation" | "error";

export type AssistantProcessEvent = {
  id: string;
  kind: AssistantProcessEventKind;
  status: AssistantProcessEventStatus;
  title: string;
  description?: string;
  debugStep: string;
};

export type AssistantProcessState = {
  events: AssistantProcessEvent[];
  hasReasoning: boolean;
  isStreaming: boolean;
  reasoningText: string;
  title: string;
};

const STEP_TITLES: Record<string, string> = {
  "retrieve-standards-context": "检索课程标准",
  "resolve-standards-market": "解析课程标准市场",
  "construct-generation-prompt": "构造生成提示",
  "plan-structured-delivery": "规划结构化输出",
  "validate-generation-safety": "校验生成安全",
  "agent-stream-started": "启动模型生成",
  "agent-step-start": "模型开始执行",
  "agent-step-finish": "模型完成一步",
  "agent-tool-call": "调用工具",
  "agent-tool-result": "工具返回结果",
  "agent-tool-error": "工具执行异常",
  "validate-lesson-output": "校验教案输出",
  "repair-lesson-json-artifact": "自动修复结构化教案",
  "convert-lesson-json-artifact": "转换结构化教案",
  "extract-html-document": "提取 HTML 文档",
  "html-slideshow-fallback": "生成大屏兜底版本",
  "persist-artifact-version": "保存 Artifact 版本",
  "generation-finished": "生成完成",
  "generation-stream-closed": "关闭生成流",
  "generation-stream-exception": "生成流异常",
  "agent-stream-error": "模型生成异常",
  "agent-stream-abort": "生成已中断",
};

function toEventStatus(status: WorkflowTraceEntry["status"]): AssistantProcessEventStatus {
  if (status === "running") {
    return "active";
  }

  if (status === "failed" || status === "blocked") {
    return "active";
  }

  return "complete";
}

function toEventKind(entry: WorkflowTraceEntry): AssistantProcessEventKind {
  if (entry.status === "failed" || entry.step.includes("error") || entry.step.includes("exception")) {
    return "error";
  }

  if (entry.step.includes("tool")) {
    return "tool";
  }

  if (entry.step.includes("repair")) {
    return "repair";
  }

  if (entry.step.includes("validate") || entry.step.includes("convert") || entry.step.includes("extract")) {
    return "validation";
  }

  return "workflow";
}

function toEventTitle(step: string) {
  return STEP_TITLES[step] ?? step.replaceAll("-", " ");
}

function normalizeDetail(detail: string) {
  return detail
    .replaceAll("CompetitionLessonPlan JSON", "结构化教案 JSON")
    .replaceAll("Artifact", "版本")
    .replaceAll("lesson", "教案")
    .replaceAll("html", "HTML");
}

export function buildAssistantProcessState(message: SmartEduUIMessage): AssistantProcessState {
  const extracted = extractArtifactFromMessage(message);
  const reasoningText = getMessageReasoningText(message);
  const trace = extracted.trace;
  const isStreaming = extracted.status === "streaming" || trace?.phase === "workflow" || trace?.phase === "generation";
  const events =
    trace?.trace.map((entry, index) => ({
      id: `${entry.step}-${entry.timestamp ?? index}`,
      kind: toEventKind(entry),
      status: toEventStatus(entry.status),
      title: toEventTitle(entry.step),
      description: normalizeDetail(entry.detail),
      debugStep: entry.step,
    })) ?? [];

  return {
    events,
    hasReasoning: Boolean(reasoningText.trim()),
    isStreaming,
    reasoningText,
    title: isStreaming ? "正在执行" : "执行过程",
  };
}
