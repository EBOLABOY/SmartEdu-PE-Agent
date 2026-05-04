"use client";

import { isReasoningUIPart } from "ai";

import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import type { SmartEduUIMessage } from "@/lib/lesson/authoring-contract";
import { cn } from "@/lib/utils";

type ReasoningPart = Extract<SmartEduUIMessage["parts"][number], { type: "reasoning" }>;

function getReasoningText(message: SmartEduUIMessage) {
  return message.parts
    .filter(isReasoningUIPart)
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

function getReasoningPartText(part: ReasoningPart) {
  return part.text.trim();
}

function isReasoningStreaming(message: SmartEduUIMessage) {
  return message.parts
    .filter(isReasoningUIPart)
    .some((part) => part.state === "streaming");
}

function isReasoningPartStreaming(part: ReasoningPart) {
  return part.state === "streaming";
}

function getReasoningLabel(text: string) {
  if (/大屏|HTML|投屏|canvas|页面/.test(text)) {
    return "正在构思大屏布局";
  }

  if (/修改|调整|降低|提高|优化|补充|patch/.test(text)) {
    return "正在核对局部修改影响";
  }

  if (/课标|标准|依据|核心素养/.test(text)) {
    return "正在匹配课标依据";
  }

  return "正在分析教学重难点";
}

function getReasoningSummary(text: string) {
  const firstLine = text
    .split(/\n+/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return "已形成教学处理思路";
  }

  return firstLine.length > 34 ? `${firstLine.slice(0, 34)}...` : firstLine;
}

export function AssistantReasoning({ message }: { message: SmartEduUIMessage }) {
  const reasoningText = getReasoningText(message);

  if (!reasoningText) {
    return null;
  }

  const isStreaming = isReasoningStreaming(message);
  const activeLabel = getReasoningLabel(reasoningText);

  return (
    <Reasoning
      className={cn(
        "mt-2 mb-0 rounded-xl border bg-muted/25 p-3 shadow-none",
        isStreaming ? "border-primary/20" : "border-border/50",
      )}
      isStreaming={isStreaming}
    >
      <ReasoningTrigger
        className="rounded-lg px-0 py-0 text-xs"
        getThinkingMessage={(isStreaming, duration) => {
          if (isStreaming || duration === 0) {
            return (
              <span className="text-muted-foreground">
                {activeLabel}
                <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary/60 align-middle" />
              </span>
            );
          }

          return (
            <span className="text-muted-foreground" title={getReasoningSummary(reasoningText)}>
              专家分析已收起{duration ? `，${duration} 秒` : ""}
            </span>
          );
        }}
      />
      <ReasoningContent className="max-h-56 overflow-y-auto rounded-lg border border-border/30 bg-background/70 p-3 leading-7 text-foreground/80">
        {reasoningText}
      </ReasoningContent>
    </Reasoning>
  );
}

export function AssistantReasoningPart({ part }: { part: ReasoningPart }) {
  const reasoningText = getReasoningPartText(part);

  if (!reasoningText) {
    return null;
  }

  const isStreaming = isReasoningPartStreaming(part);
  const activeLabel = getReasoningLabel(reasoningText);

  return (
    <Reasoning
      className={cn(
        "mt-2 mb-0 rounded-xl border bg-muted/25 p-3 shadow-none",
        isStreaming ? "border-primary/20" : "border-border/50",
      )}
      isStreaming={isStreaming}
    >
      <ReasoningTrigger
        className="rounded-lg px-0 py-0 text-xs"
        getThinkingMessage={(isStreaming, duration) => {
          if (isStreaming || duration === 0) {
            return (
              <span className="text-muted-foreground">
                {activeLabel}
                <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary/60 align-middle" />
              </span>
            );
          }

          return (
            <span className="text-muted-foreground" title={getReasoningSummary(reasoningText)}>
              专家分析已收起{duration ? `，${duration} 秒` : ""}
            </span>
          );
        }}
      />
      <ReasoningContent className="max-h-56 overflow-y-auto rounded-lg border border-border/30 bg-background/70 p-3 leading-7 text-foreground/80">
        {reasoningText}
      </ReasoningContent>
    </Reasoning>
  );
}
