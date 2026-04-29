import { extractArtifactFromMessage } from "@/lib/artifact-protocol";
import type {
  SmartEduUIMessage,
  WorkflowStandardsReference,
  WorkflowTraceData,
} from "@/lib/lesson-authoring-contract";

export type AssistantSourceItem = {
  id: string;
  title: string;
  href: string;
  description: string;
  citation: string;
};

export type AssistantSuggestionContext = {
  canGenerateHtml: boolean;
  hasHtml: boolean;
  hasLessonPlan: boolean;
  isLoading: boolean;
};

const STARTER_SUGGESTIONS = [
  "六年级 羽毛球 正手发球 40分钟",
  "五年级 篮球 运球与传接球",
  "三年级 跳绳 体能与合作游戏",
];

const LESSON_READY_SUGGESTIONS = [
  "我已确认课时计划无误，请生成互动大屏",
  "强化安全提示和分层评价",
  "把练习密度调整得更高一些",
];

const PATCH_SUGGESTIONS = [
  "补充器材不足时的替代方案",
  "增加学生互评标准",
  "降低练习难度并保留挑战任务",
];

function getTrace(message: SmartEduUIMessage): WorkflowTraceData | undefined {
  return extractArtifactFromMessage(message).trace;
}

function toSourceDescription(reference: WorkflowStandardsReference) {
  const path = reference.sectionPath.length ? `；章节：${reference.sectionPath.join(" / ")}` : "";
  const bands = reference.gradeBands.length ? `；学段：${reference.gradeBands.join("、")}` : "";

  return `${reference.summary}${bands}；模块：${reference.module}${path}`;
}

export function getAssistantSources(message: SmartEduUIMessage): AssistantSourceItem[] {
  const standards = getTrace(message)?.standards;

  if (!standards?.references.length) {
    return [];
  }

  return standards.references.map((reference) => ({
    id: reference.id,
    title: reference.title,
    href: standards.url,
    description: toSourceDescription(reference),
    citation: reference.citation,
  }));
}

export function getAssistantCitationSources(message: SmartEduUIMessage): string[] {
  const trace = getTrace(message);

  return trace?.standards?.references.length && trace.standards.url ? [trace.standards.url] : [];
}

export function getAssistantCitationLabel(message: SmartEduUIMessage) {
  const standards = getTrace(message)?.standards;

  if (!standards?.references.length) {
    return "";
  }

  return `依据 ${standards.references.length} 条课标引用`;
}

export function getAssistantSuggestions(context: AssistantSuggestionContext) {
  if (context.isLoading) {
    return [];
  }

  if (context.hasHtml) {
    return [];
  }

  if (context.canGenerateHtml) {
    return LESSON_READY_SUGGESTIONS;
  }

  if (context.hasLessonPlan) {
    return PATCH_SUGGESTIONS;
  }

  return STARTER_SUGGESTIONS;
}
