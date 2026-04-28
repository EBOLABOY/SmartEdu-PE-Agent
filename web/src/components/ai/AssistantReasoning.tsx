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
      className="mt-2 mb-0 rounded-lg border border-border/40 bg-muted/20 p-2.5 shadow-none"
      isStreaming={isReasoningStreaming(message)}
    >
      <ReasoningTrigger
        className="rounded-lg px-0 py-0 text-xs"
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
      <ReasoningContent className="max-h-32 overflow-y-auto rounded-md border border-border/30 bg-background/50 p-2.5">
        {reasoningText}
      </ReasoningContent>
    </Reasoning>
  );
}
