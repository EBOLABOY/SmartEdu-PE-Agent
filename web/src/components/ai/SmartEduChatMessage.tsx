"use client";

import { SmartEduMessageParts } from "@/components/ai/SmartEduMessageParts";
import { Message, MessageContent } from "@/components/ai-elements/message";
import type { SmartEduUIMessage } from "@/lib/lesson-authoring-contract";
import { cn } from "@/lib/utils";

export function SmartEduChatMessage({ message }: { message: SmartEduUIMessage }) {
  const isUser = message.role === "user";

  return (
    <Message className="min-w-0" from={message.role}>
      <MessageContent
        className={cn(
          "min-w-0 rounded-2xl px-4 py-3 shadow-sm",
          isUser
            ? "rounded-tr-sm bg-primary text-primary-foreground"
            : "w-full rounded-tl-sm border border-border/65 bg-card/90 text-foreground shadow-[0_16px_40px_-32px_rgba(15,23,42,0.35)]",
        )}
      >
        <SmartEduMessageParts message={message} />
      </MessageContent>
    </Message>
  );
}
