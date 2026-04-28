"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Loader2,
} from "lucide-react";

import { AutoScrollArea } from "@/components/ai-elements/auto-scroll";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  buildAssistantWorkflowState,
  type AssistantWorkflowDetail,
  type AssistantWorkflowState,
} from "@/lib/assistant-workflow-status";
import type { SmartEduUIMessage } from "@/lib/lesson-authoring-contract";
import { cn } from "@/lib/utils";

/* ── Status indicator ──────────────────────────────── */

function StatusDot({ status }: { status: AssistantWorkflowState["status"] }) {
  if (status === "failed") {
    return <AlertTriangle className="size-3.5 shrink-0 text-destructive" />;
  }
  if (status === "blocked") {
    return <AlertTriangle className="size-3.5 shrink-0 text-amber-500" />;
  }
  if (status === "active") {
    return <Loader2 className="size-3.5 shrink-0 animate-spin text-brand" />;
  }
  if (status === "complete") {
    return <CheckCircle2 className="size-3.5 shrink-0 text-brand" />;
  }
  return <Loader2 className="size-3.5 shrink-0 text-muted-foreground/50" />;
}

/* ── Detail row inside collapsible ─────────────────── */

function DetailRow({ detail }: { detail: AssistantWorkflowDetail }) {
  return (
    <div className="flex items-start gap-2 py-1">
      <StatusDot status={detail.status} />
      <div className="min-w-0 flex-1">
        <span className="text-[12px] text-muted-foreground">{detail.title}</span>
        <p className="truncate text-[11px] text-muted-foreground/60">{detail.description}</p>
      </div>
    </div>
  );
}

/* ── Badge label ───────────────────────────────────── */

function StatusLabel({ state }: { state: AssistantWorkflowState }) {
  const colorCn =
    state.status === "failed"
      ? "text-destructive"
      : state.status === "blocked"
        ? "text-amber-600 dark:text-amber-400"
        : state.status === "active"
          ? "text-brand"
          : "text-muted-foreground";

  return (
    <span className={cn("shrink-0 text-[11px] font-medium", colorCn)}>
      {state.badge}
    </span>
  );
}

/* ── Main component ────────────────────────────────── */

export default function AssistantWorkflowStatus({ message }: { message: SmartEduUIMessage }) {
  const state = buildAssistantWorkflowState(message);

  if (!state.hasWorkflow) {
    return null;
  }

  const hasDetails = state.details.length > 0 || state.warnings.length > 0;

  return (
    <div className="mt-2 min-w-0">
      <Collapsible defaultOpen={false}>
        {/* Single-line summary: icon + title + badge */}
        <CollapsibleTrigger className="flex w-full items-center gap-2.5 py-1.5 text-left group/wf">
          <StatusDot status={state.status} />
          <span className="min-w-0 flex-1 truncate text-[13px] text-foreground/80 group-hover/wf:text-foreground transition-colors">
            {state.title}
            {state.standardsCount > 0 ? (
              <span className="ml-2 text-[11px] text-muted-foreground">
                · {state.standardsCount} 条课标
              </span>
            ) : null}
          </span>
          <StatusLabel state={state} />
          {hasDetails ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground/50 transition-transform group-data-[state=open]/wf:rotate-180" />
          ) : null}
        </CollapsibleTrigger>

        {/* Expandable details */}
        {hasDetails ? (
          <CollapsibleContent>
            <AutoScrollArea
              className="ml-6 mt-1 max-h-40 min-h-0 rounded-lg border border-border/40 bg-muted/20"
              contentClassName="px-3 py-2 space-y-0.5"
              scrollClassName="overscroll-contain"
            >
              {state.warnings.map((warning) => (
                <div
                  className="flex items-center gap-2 py-1 text-[11px] text-amber-600 dark:text-amber-400"
                  key={warning}
                >
                  <AlertTriangle className="size-3 shrink-0" />
                  {warning}
                </div>
              ))}
              {state.details.map((detail) => (
                <DetailRow detail={detail} key={detail.id} />
              ))}
            </AutoScrollArea>
          </CollapsibleContent>
        ) : null}
      </Collapsible>
    </div>
  );
}
