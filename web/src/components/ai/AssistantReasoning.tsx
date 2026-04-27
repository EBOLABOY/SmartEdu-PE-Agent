"use client";

import { isReasoningUIPart } from "ai";

import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import type { SmartEduUIMessage } from "@/lib/lesson-authoring-contract";

function getReasoningText(message: SmartEduUIMessage) {
  return message.parts
    .filter(isReasoningUIPart)
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

function isReasoningStreaming(message: SmartEduUIMessage) {
  return message.parts
    .filter(isReasoningUIPart)
    .some((part) => part.state === "streaming");
}

export function AssistantReasoning({ message }: { message: SmartEduUIMessage }) {
  const reasoningText = getReasoningText(message);

  if (!reasoningText) {
    return null;
  }

  return (
    <Reasoning
      className="mt-3 mb-0 rounded-2xl border border-border/70 bg-background/70 p-3 shadow-sm"
      isStreaming={isReasoningStreaming(message)}
    >
      <ReasoningTrigger
        className="rounded-xl px-0 py-0 text-xs"
        getThinkingMessage={(isStreaming, duration) => {
          if (isStreaming || duration === 0) {
            return <span className="text-muted-foreground">正在分析课堂需求</span>;
          }

          return (
            <span className="text-muted-foreground">
              分析完成{duration ? ` · ${duration} 秒` : ""}
            </span>
          );
        }}
      />
      <ReasoningContent className="max-h-32 overflow-y-auto rounded-xl border border-border/50 bg-muted/30 p-2.5">
        {reasoningText}
      </ReasoningContent>
    </Reasoning>
  );
}
