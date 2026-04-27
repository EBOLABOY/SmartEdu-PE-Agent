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
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolPart,
} from "@/components/ai-elements/tool";
import type { SmartEduUIMessage } from "@/lib/lesson-authoring-contract";
import { cn } from "@/lib/utils";

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

function shouldOpenToolByDefault(part: ToolPart) {
  return (
    part.state === "input-streaming" ||
    part.state === "input-available" ||
    part.state === "approval-requested" ||
    part.state === "output-error"
  );
}

export function AssistantToolPart({ className, part }: { className?: string; part: ToolPart }) {
  const defaultOpen = shouldOpenToolByDefault(part);
  const headerProps =
    part.type === "dynamic-tool"
      ? { toolName: part.toolName, type: part.type }
      : { type: part.type };

  return (
    <Tool
      className={cn(
        "mb-0 rounded-2xl border-border/70 bg-gradient-to-br from-background to-muted/35 shadow-sm",
        className,
      )}
      defaultOpen={defaultOpen}
    >
      <ToolHeader
        className="px-3 py-2.5"
        state={part.state}
        title={getToolTitle(part)}
        {...headerProps}
      />
      <ToolContent className="space-y-3 border-t border-border/60 bg-background/80 px-3 py-3">
        <ToolInput input={part.input} />
        <ToolOutput errorText={part.errorText} output={part.output} />
      </ToolContent>
    </Tool>
  );
}

export function AssistantStepBoundary({ index }: { index: number }) {
  if (index === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
      <span className="h-px flex-1 bg-border/70" />
      <span className="shrink-0 rounded-full border border-border/70 bg-background/80 px-2 py-0.5">
        新一轮工具步骤
      </span>
      <span className="h-px flex-1 bg-border/70" />
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
