"use client";

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

function ToolStatusDot({ state }: { state: ToolPart["state"] }) {
  if (state === "output-error" || state === "output-denied") {
    return <XCircle className="size-3.5 shrink-0 text-destructive" />;
  }
  if (state === "output-available" || state === "approval-responded") {
    return <CheckCircle2 className="size-3.5 shrink-0 text-brand" />;
  }
  if (state === "input-streaming" || state === "input-available" || state === "approval-requested") {
    return <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />;
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
export function AssistantToolPart({ className, part }: { className?: string; part: ToolPart }) {
  const summary = getToolResultSummary(part);

  return (
    <Tool
      className={cn(
        "mb-0 border-0 rounded-none bg-transparent shadow-none",
        className,
      )}
      defaultOpen={false}
    >
      {/* Clickable header — single line */}
      <button
        type="button"
        className="flex w-full items-center gap-2.5 py-1 text-left group/tool-row"
        data-collapsible-trigger=""
      >
        <ToolStatusDot state={part.state} />
        <span className="min-w-0 truncate text-[13px] text-muted-foreground group-hover/tool-row:text-foreground transition-colors">
          {getToolTitle(part)}
        </span>
      </button>

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
  const hasToolParts = timelineParts.some(isSmartEduToolPart);

  if (!hasToolParts) {
    return null;
  }

  return (
    <div className="mt-3 min-w-0 space-y-2">
      {timelineParts.map((part, index) =>
        part.type === "step-start" ? (
          <AssistantStepBoundary index={index} key={`step-${index}`} />
        ) : (
          <AssistantToolPart key={part.toolCallId} part={part} />
        ),
      )}
    </div>
  );
}
