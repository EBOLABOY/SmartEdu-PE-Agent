"use client";

import { useEffect, useRef, useState } from "react";
import {
  getToolName,
  isToolUIPart,
  type UIDataTypes,
  type UIMessagePart,
  type UITools,
} from "ai";

import {
  Tool,
  ToolContent,
  ToolInput,
  ToolOutput,
  type ToolPart,
} from "@/components/ai-elements/tool";
import { CollapsibleTrigger } from "@/components/ui/collapsible";
import type { SmartEduUIMessage } from "@/lib/lesson-authoring-contract";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
} from "lucide-react";

const TOOL_TITLES: Record<string, string> = {
  searchStandardsTool: "检索课程标准",
  searchStandards: "检索课程标准",
};

function isSmartEduToolPart(part: SmartEduUIMessage["parts"][number]): part is ToolPart {
  return isToolUIPart(part as UIMessagePart<UIDataTypes, UITools>);
}

function humanizeToolName(name: string) {
  return name
    .replace(/Tool$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replaceAll("-", " ");
}

function getToolTitle(part: ToolPart) {
  const name = getToolName(part);
  return part.title ?? TOOL_TITLES[name] ?? humanizeToolName(name);
}

function ToolStatusDot({ state }: { state: ToolPart["state"] | "pending" }) {
  if (state === "output-error" || state === "output-denied") {
    return <XCircle className="size-3.5 shrink-0 text-destructive" />;
  }
  if (state === "output-available" || state === "approval-responded") {
    return <CheckCircle2 className="size-3.5 shrink-0 text-brand" />;
  }
  if (state === "input-streaming" || state === "input-available" || state === "approval-requested") {
    return <Loader2 className="size-3.5 shrink-0 animate-spin text-brand" />;
  }
  if (state === "pending") {
    return <Circle className="size-3.5 shrink-0 text-muted-foreground/30" />;
  }
  return <Circle className="size-3 shrink-0 text-muted-foreground/50" />;
}

function getToolResultSummary(part: ToolPart): string | null {
  if (part.errorText) return part.errorText;
  if (!part.output) return null;
  if (typeof part.output === "string") {
    return part.output.length > 80 ? `${part.output.slice(0, 80)}…` : part.output;
  }
  if (typeof part.output === "object" && part.output !== null) {
    const str = JSON.stringify(part.output);
    return str.length > 80 ? `${str.slice(0, 80)}…` : str;
  }
  return null;
}

/**
 * Timeline-style tool call item — Codex/Claude Code inspired.
 * Reuses <Tool> (Collapsible), <ToolContent>, <ToolInput>, <ToolOutput> from ai-elements.
 */
export function AssistantToolPart({
  className,
  part,
  orchestratedStatus,
}: {
  className?: string;
  part: ToolPart;
  orchestratedStatus?: "pending" | "running" | "completed";
}) {
  const summary = getToolResultSummary(part);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (orchestratedStatus === "running") {
      queueMicrotask(() => setIsOpen(true));
    } else if (orchestratedStatus === "completed") {
      queueMicrotask(() => setIsOpen(false));
    }
  }, [orchestratedStatus]);

  let visualState: ToolPart["state"] | "pending" = part.state;
  if (orchestratedStatus === "running") {
    visualState = "input-streaming";
  } else if (orchestratedStatus === "pending") {
    visualState = "pending";
  } else if (orchestratedStatus === "completed") {
    if (part.state === "output-error" || part.state === "output-denied") {
      visualState = part.state;
    } else {
      visualState = "output-available";
    }
  }

  return (
    <Tool
      className={cn(
        "mb-0 border-0 rounded-none bg-transparent shadow-none",
        className,
      )}
      onOpenChange={setIsOpen}
      open={isOpen}
    >
      {/* Clickable header — single line */}
      <CollapsibleTrigger asChild>
        <button
          className="group/tool-row flex w-full items-center gap-2.5 py-1 text-left"
          type="button"
        >
          <ToolStatusDot state={visualState} />
          <span className="min-w-0 truncate text-[13px] text-muted-foreground transition-colors group-hover/tool-row:text-foreground">
            {getToolTitle(part)}
          </span>
        </button>
      </CollapsibleTrigger>

      {/* Summary line (always visible, under the title) */}
      {summary ? (
        <p className="ml-6 truncate text-[11px] text-muted-foreground/70 leading-relaxed">
          {summary}
        </p>
      ) : null}

      {/* Expandable detail (reuses ai-elements) */}
      <ToolContent className="ml-6 mt-1 space-y-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5 text-xs">
        <ToolInput input={part.input} />
        <ToolOutput errorText={part.errorText} output={part.output} />
      </ToolContent>
    </Tool>
  );
}

export function AssistantStepBoundary({ index }: { index: number }) {
  if (index === 0) return null;

  return (
    <div className="flex items-center gap-2 py-1 text-[11px] text-muted-foreground/50">
      <span className="h-px flex-1 bg-border/40" />
    </div>
  );
}

export function AssistantToolCalls({ message }: { message: SmartEduUIMessage }) {
  const timelineParts = message.parts.filter(
    (part) => part.type === "step-start" || isSmartEduToolPart(part),
  );
  const toolParts = timelineParts.filter(isSmartEduToolPart) as ToolPart[];
  const hasToolParts = toolParts.length > 0;

  const [completedToolIds, setCompletedToolIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    toolParts.forEach((t) => {
      if (
        t.state === "output-available" ||
        t.state === "output-error" ||
        t.state === "output-denied" ||
        t.output !== undefined
      ) {
        initial.add(t.toolCallId);
      }
    });
    return initial;
  });

  const [activeToolId, setActiveToolId] = useState<string | null>(null);
  const activeToolStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (toolParts.length === 0) return;

    const nextPendingTool = toolParts.find((t) => !completedToolIds.has(t.toolCallId));

    if (!nextPendingTool) {
      if (activeToolId !== null) {
        queueMicrotask(() => setActiveToolId(null));
      }
      return;
    }

    if (activeToolId !== nextPendingTool.toolCallId) {
      activeToolStartTimeRef.current = Date.now();
      queueMicrotask(() => setActiveToolId(nextPendingTool.toolCallId));
      return;
    }

    const currentTool = nextPendingTool;
    const currentToolPartIndex = message.parts.findIndex(
      (p) => isSmartEduToolPart(p) && p.toolCallId === currentTool.toolCallId,
    );
    const lastPartIndex = message.parts.length - 1;
    const hasSubsequentParts = currentToolPartIndex > -1 && currentToolPartIndex < lastPartIndex;

    const isBackendFinished =
      currentTool.state === "output-available" ||
      currentTool.state === "output-error" ||
      currentTool.state === "output-denied" ||
      currentTool.output !== undefined ||
      hasSubsequentParts;

    if (isBackendFinished) {
      const timeElapsed = Date.now() - (activeToolStartTimeRef.current || 0);
      const remainingTime = 1500 - timeElapsed;

      if (remainingTime <= 0) {
        setCompletedToolIds((prev) => {
          const next = new Set(prev);
          next.add(currentTool.toolCallId);
          return next;
        });
      } else {
        const timer = setTimeout(() => {
          setCompletedToolIds((prev) => {
            const next = new Set(prev);
            next.add(currentTool.toolCallId);
            return next;
          });
        }, remainingTime);
        return () => clearTimeout(timer);
      }
    }
  }, [toolParts, activeToolId, completedToolIds, message.parts]);

  if (!hasToolParts) {
    return null;
  }

  return (
    <div className="mt-3 min-w-0 space-y-2">
      {timelineParts.map((part, index) => {
        if (part.type === "step-start") {
          return <AssistantStepBoundary index={index} key={`step-${index}`} />;
        }

        if (isSmartEduToolPart(part)) {
          let orchestratedStatus: "pending" | "running" | "completed" = "pending";
          if (completedToolIds.has(part.toolCallId)) {
            orchestratedStatus = "completed";
          } else if (activeToolId === part.toolCallId) {
            orchestratedStatus = "running";
          }

          return (
            <AssistantToolPart
              key={part.toolCallId}
              orchestratedStatus={orchestratedStatus}
              part={part}
            />
          );
        }

        return null;
      })}
    </div>
  );
}
