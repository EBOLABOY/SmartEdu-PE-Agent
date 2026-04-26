"use client";

import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Search,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { StickToBottom } from "use-stick-to-bottom";

import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Badge } from "@/components/ui/badge";
import {
  buildAssistantProcessState,
  type AssistantProcessEvent,
} from "@/lib/assistant-process-events";
import type { SmartEduUIMessage } from "@/lib/lesson-authoring-contract";
import { cn } from "@/lib/utils";

function getEventIcon(event: AssistantProcessEvent) {
  if (event.kind === "error") {
    return AlertTriangle;
  }

  if (event.status === "active") {
    return CircleDashed;
  }

  if (event.kind === "tool") {
    return Wrench;
  }

  if (event.kind === "validation") {
    return ShieldCheck;
  }

  if (event.kind === "repair") {
    return Sparkles;
  }

  if (event.title.includes("检索")) {
    return Search;
  }

  return CheckCircle2;
}

function getEventClassName(event: AssistantProcessEvent) {
  if (event.kind === "error") {
    return "text-destructive";
  }

  if (event.status === "active") {
    return "text-brand";
  }

  return "text-muted-foreground";
}

function getProcessSummary(events: AssistantProcessEvent[], isStreaming: boolean) {
  const activeEvent = [...events].reverse().find((event) => event.status === "active");

  if (activeEvent) {
    return activeEvent.title;
  }

  if (isStreaming) {
    return "正在生成";
  }

  return events.length ? "已完成" : "暂无过程事件";
}

export default function AssistantProcess({ message }: { message: SmartEduUIMessage }) {
  const process = buildAssistantProcessState(message);
  const hasProcess = process.hasReasoning || process.events.length > 0;

  if (!hasProcess) {
    return null;
  }

  const summary = getProcessSummary(process.events, process.isStreaming);

  return (
    <div className="mt-2 space-y-2 rounded-2xl border border-border/70 bg-background/70 p-2.5 text-xs shadow-xs">
      {process.hasReasoning ? (
        <Reasoning className="mb-0" isStreaming={process.isStreaming}>
          <ReasoningTrigger
            className="rounded-lg px-1 py-1"
            getThinkingMessage={(isStreaming, duration) => {
              if (isStreaming || duration === 0) {
                return <span className="text-muted-foreground">正在分析问题</span>;
              }

              return <span className="text-muted-foreground">分析完成{duration ? ` · ${duration} 秒` : ""}</span>;
            }}
          />
          <ReasoningContent className="max-h-36 overflow-y-auto rounded-lg border border-border/50 bg-muted/40 p-2">
            {process.reasoningText}
          </ReasoningContent>
        </Reasoning>
      ) : null}

      {process.events.length ? (
        <ChainOfThought defaultOpen={process.isStreaming}>
          <ChainOfThoughtHeader className="rounded-lg px-1 py-1">
            <span className="flex items-center gap-2">
              <span>{process.title}</span>
              <Badge className="h-5 rounded-full px-2 text-[11px]" variant={process.isStreaming ? "warning" : "secondary"}>
                {summary}
              </Badge>
            </span>
          </ChainOfThoughtHeader>
          <ChainOfThoughtContent>
            <StickToBottom className="max-h-56 overflow-y-hidden rounded-xl border border-border/50 bg-muted/30">
              <StickToBottom.Content className="space-y-3 p-3">
                {process.events.map((event) => {
                  const Icon = getEventIcon(event);

                  return (
                    <ChainOfThoughtStep
                      className={cn(
                        "last:[&_.absolute]:hidden",
                        event.status === "active" ? "[&_svg]:animate-pulse" : "",
                        getEventClassName(event),
                      )}
                      description={event.description}
                      icon={Icon}
                      key={event.id}
                      label={
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-medium">{event.title}</span>
                          {event.kind === "tool" ? (
                            <Badge className="h-5 rounded-full px-2 text-[11px]" variant="secondary">
                              工具
                            </Badge>
                          ) : null}
                        </span>
                      }
                      status={event.status}
                      title={event.debugStep}
                    />
                  );
                })}
              </StickToBottom.Content>
            </StickToBottom>
          </ChainOfThoughtContent>
        </ChainOfThought>
      ) : null}
    </div>
  );
}
