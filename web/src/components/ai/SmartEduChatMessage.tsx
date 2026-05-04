"use client";

import { SmartEduMessageParts } from "@/components/ai/SmartEduMessageParts";
import { Message, MessageContent } from "@/components/ai-elements/message";
import type { SmartEduUIMessage } from "@/lib/lesson/authoring-contract";
import { cn } from "@/lib/utils";

export function SmartEduChatMessage({ message }: { message: SmartEduUIMessage }) {
  const isUser = message.role === "user";

  return (
    <Message className="min-w-0" from={message.role}>
      <MessageContent
        className={cn(
          "min-w-0",
          isUser
            ? "rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-4 py-3 shadow-sm"
            : "w-full",
        )}
      >
        <SmartEduMessageParts message={message} />
      </MessageContent>
    </Message>
  );
}
