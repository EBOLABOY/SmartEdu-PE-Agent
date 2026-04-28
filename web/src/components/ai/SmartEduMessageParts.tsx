"use client";

import {
  isFileUIPart,
  isTextUIPart,
  isToolUIPart,
  type UIDataTypes,
  type UIMessagePart,
  type UITools,
} from "ai";

import { AssistantInlineCitation, AssistantSources } from "@/components/ai/AssistantReferences";
import { AssistantReasoning } from "@/components/ai/AssistantReasoning";
import { AssistantSourceList } from "@/components/ai/AssistantSourceList";
import {
  AssistantStepBoundary,
  AssistantToolPart,
} from "@/components/ai/AssistantToolCalls";
import type { ToolPart } from "@/components/ai-elements/tool";
import AssistantWorkflowStatus from "@/components/ai/AssistantWorkflowStatus";
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
  type AttachmentData,
} from "@/components/ai-elements/attachments";
import {
  getAssistantCitationLabel,
  getAssistantCitationSources,
  getAssistantSources,
  type AssistantSourceItem,
} from "@/lib/assistant-reference-ui";
import type { SmartEduUIMessage, StructuredArtifactData } from "@/lib/lesson-authoring-contract";

type SmartEduMessagePart = SmartEduUIMessage["parts"][number];

function isSmartEduToolPart(part: SmartEduMessagePart): part is ToolPart {
  return isToolUIPart(part as UIMessagePart<UIDataTypes, UITools>);
}

function isSourceUrlPart(
  part: SmartEduMessagePart,
): part is Extract<SmartEduMessagePart, { type: "source-url" }> {
  return part.type === "source-url";
}

function isSourceDocumentPart(
  part: SmartEduMessagePart,
): part is Extract<SmartEduMessagePart, { type: "source-document" }> {
  return part.type === "source-document";
}

function isArtifactPart(
  part: SmartEduMessagePart,
): part is Extract<SmartEduMessagePart, { type: "data-artifact" }> {
  return part.type === "data-artifact";
}

function isTracePart(
  part: SmartEduMessagePart,
): part is Extract<SmartEduMessagePart, { type: "data-trace" }> {
  return part.type === "data-trace";
}

function getArtifactSummary(artifact: StructuredArtifactData) {
  if (artifact.stage === "lesson") {
    return artifact.status === "ready"
      ? "教案已生成，完整内容已放在右侧教案预览中。你可以继续提出修改意见，或确认后生成互动大屏。"
      : "正在生成教案，完整内容会实时同步到右侧教案预览。";
  }

  return artifact.status === "ready"
    ? "互动大屏已生成，请在右侧工作台查看预览与源码。"
    : "正在生成互动大屏，预览会实时同步到右侧工作台。";
}

function getFallbackText(message: SmartEduUIMessage) {
  return message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("")
    .trim();
}

function getLatestStructuredArtifact(message: SmartEduUIMessage) {
  return message.parts.filter(isArtifactPart).at(-1)?.data;
}

function hasLessonWorkflowTrace(message: SmartEduUIMessage) {
  return message.parts.some((part) => isTracePart(part) && part.data.mode === "lesson");
}

function looksLikeCompetitionLessonPlanJson(text: string) {
  const trimmed = text.trim();

  return (
    trimmed.startsWith("{") &&
    (trimmed.includes("\"title\"") ||
      trimmed.includes("\"learningObjectives\"") ||
      trimmed.includes("\"periodPlan\"") ||
      trimmed.includes("\"loadEstimate\""))
  );
}

function shouldHideAssistantText(message: SmartEduUIMessage, text: string) {
  const latestArtifact = getLatestStructuredArtifact(message);

  if (latestArtifact?.status === "ready") {
    return true;
  }

  const isLessonGeneration =
    latestArtifact?.stage === "lesson" ||
    latestArtifact?.contentType === "lesson-json" ||
    hasLessonWorkflowTrace(message);

  return isLessonGeneration && looksLikeCompetitionLessonPlanJson(text);
}

function NativeSourceList({ message }: { message: SmartEduUIMessage }) {
  const nativeSources = message.parts
    .filter((part) => isSourceUrlPart(part) || isSourceDocumentPart(part))
    .map((part, index) => {
      if (isSourceUrlPart(part)) {
        return {
          id: part.sourceId || `source-url-${index}`,
          title: part.title || part.url,
          href: part.url,
          description: part.url,
        };
      }

      return {
        id: part.sourceId || `source-document-${index}`,
        title: part.title || part.filename || "来源文档",
        href: undefined,
        description: part.filename || part.mediaType,
      };
    });

  if (!nativeSources.length) {
    return null;
  }

  return <AssistantSourceList label="模型来源" sources={nativeSources} />;
}

function MessageAttachments({ message }: { message: SmartEduUIMessage }) {
  const attachments = message.parts
    .filter(isFileUIPart)
    .map((part, index) => ({
      ...part,
      id: `${part.url}-${part.filename ?? index}`,
    })) satisfies AttachmentData[];

  if (!attachments.length) {
    return null;
  }

  return (
    <Attachments className="mt-2" variant={message.role === "user" ? "inline" : "list"}>
      {attachments.map((attachment) => (
        <Attachment data={attachment} key={attachment.id}>
          <AttachmentPreview />
          <AttachmentInfo showMediaType />
        </Attachment>
      ))}
    </Attachments>
  );
}

function AssistantArtifactPart({ artifact }: { artifact: StructuredArtifactData }) {
  return (
    <p className="text-[13px] text-muted-foreground leading-relaxed">
      {getArtifactSummary(artifact)}
    </p>
  );
}

function AssistantTextParts({
  message,
  sources,
}: {
  message: SmartEduUIMessage;
  sources: AssistantSourceItem[];
}) {
  const rawText = getFallbackText(message);

  if (!rawText || shouldHideAssistantText(message, rawText)) {
    return null;
  }

  const citationSources = getAssistantCitationSources(message);
  const citationLabel = getAssistantCitationLabel(message);

  return (
    <AssistantInlineCitation
      citationLabel={citationLabel}
      citationSources={citationSources}
      sources={sources}
      text={rawText}
    />
  );
}

function UserMessageParts({ message }: { message: SmartEduUIMessage }) {
  const text = getFallbackText(message);

  return (
    <>
      <MessageAttachments message={message} />
      {text ? <div className="whitespace-pre-wrap text-sm leading-relaxed">{text}</div> : null}
    </>
  );
}

function AssistantPartTimeline({ message }: { message: SmartEduUIMessage }) {
  const latestArtifactIndex = message.parts.findLastIndex(isArtifactPart);
  const latestTraceIndex = message.parts.findLastIndex(isTracePart);

  return (
    <div className="min-w-0 space-y-3">
      {message.parts.map((part, index) => {
        if (isTextUIPart(part) || part.type === "reasoning") {
          return null;
        }

        if (isSmartEduToolPart(part)) {
          return <AssistantToolPart key={`${part.toolCallId}-${index}`} part={part} />;
        }

        if (part.type === "step-start") {
          return <AssistantStepBoundary index={index} key={`step-${index}`} />;
        }

        if (isArtifactPart(part)) {
          if (index !== latestArtifactIndex) {
            return null;
          }

          return <AssistantArtifactPart artifact={part.data} key={`${part.id ?? "artifact"}-${index}`} />;
        }

        if (isTracePart(part)) {
          if (index !== latestTraceIndex) {
            return null;
          }

          return <AssistantWorkflowStatus key={`${part.id ?? "trace"}-${index}`} message={message} />;
        }

        return null;
      })}
    </div>
  );
}

export function SmartEduMessageParts({ message }: { message: SmartEduUIMessage }) {
  if (message.role === "user") {
    return <UserMessageParts message={message} />;
  }

  const sources = getAssistantSources(message);

  return (
    <>
      <AssistantTextParts message={message} sources={sources} />
      <AssistantReasoning message={message} />
      <AssistantPartTimeline message={message} />
      <NativeSourceList message={message} />
      <AssistantSources sources={sources} />
    </>
  );
}
