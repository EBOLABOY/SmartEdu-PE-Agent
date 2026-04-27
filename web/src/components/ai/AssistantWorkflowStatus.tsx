"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  ClipboardCheck,
  FileText,
  MonitorPlay,
} from "lucide-react";

import { AutoScrollArea } from "@/components/ai-elements/auto-scroll";
import { Badge } from "@/components/ui/badge";
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

function StatusIcon({ state }: { state: AssistantWorkflowState }) {
  const className = cn("size-4", state.status === "active" ? "animate-pulse" : "");

  if (state.status === "failed") {
    return <AlertTriangle className={className} />;
  }

  if (state.status === "blocked") {
    return <AlertTriangle className={className} />;
  }

  if (state.status === "complete") {
    return <CheckCircle2 className={className} />;
  }

  if (state.status === "active") {
    return <CircleDashed className={className} />;
  }

  return state.mode === "html" ? (
    <MonitorPlay className={className} />
  ) : (
    <FileText className={className} />
  );
}

function getStatusBadgeVariant(status: AssistantWorkflowState["status"]) {
  if (status === "failed") {
    return "destructive";
  }

  if (status === "blocked" || status === "active") {
    return "warning";
  }

  if (status === "complete") {
    return "success";
  }

  return "secondary";
}

function getDetailClassName(status: AssistantWorkflowDetail["status"]) {
  if (status === "failed") {
    return "border-destructive/30 bg-destructive/10 text-destructive";
  }

  if (status === "blocked") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300";
  }

  if (status === "active") {
    return "border-brand/25 bg-brand/10 text-brand";
  }

  return "border-border/60 bg-muted/35 text-muted-foreground";
}

function WorkflowDetailRow({ detail }: { detail: AssistantWorkflowDetail }) {
  return (
    <div className={cn("rounded-xl border px-3 py-2", getDetailClassName(detail.status))}>
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate font-medium text-xs">{detail.title}</span>
        <span className="shrink-0 font-mono text-[10px] opacity-70">{detail.debugStep}</span>
      </div>
      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed opacity-90">
        {detail.description}
      </p>
    </div>
  );
}

function WorkflowSummary({ state }: { state: AssistantWorkflowState }) {
  if (!state.hasWorkflow) {
    return null;
  }

  const hasDetails = state.details.length > 0 || state.warnings.length > 0;
  const defaultOpen =
    state.status === "active" || state.status === "failed" || state.status === "blocked";

  return (
    <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-background via-background to-muted/45 p-3 shadow-sm">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl border",
            state.status === "active"
              ? "border-brand/20 bg-brand/10 text-brand"
              : "border-border/70 bg-muted/50 text-muted-foreground",
          )}
        >
          <StatusIcon state={state} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              工作流
            </span>
            {state.standardsCount ? (
              <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium text-brand">
                {state.standardsCount} 条课标依据
              </span>
            ) : null}
          </div>
          <h3 className="mt-1 truncate font-semibold text-foreground text-sm">{state.title}</h3>
          <p className="mt-1 line-clamp-2 text-muted-foreground text-xs leading-relaxed">
            {state.description}
          </p>
        </div>
        <Badge
          className="h-6 shrink-0 rounded-full px-2 text-[11px]"
          variant={getStatusBadgeVariant(state.status)}
        >
          {state.badge}
        </Badge>
      </div>

      {hasDetails ? (
        <Collapsible className="mt-3" defaultOpen={defaultOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-muted-foreground text-xs transition-colors hover:bg-muted/50 hover:text-foreground">
            <span className="inline-flex items-center gap-2">
              <ClipboardCheck className="size-3.5" />
              执行摘要
            </span>
            <ChevronDown className="size-3.5 transition-transform data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <AutoScrollArea
              className="max-h-44 min-h-0 rounded-2xl border border-border/50 bg-background/70"
              contentClassName="space-y-2 p-2"
              scrollClassName="overscroll-contain"
            >
              {state.warnings.map((warning) => (
                <div
                  className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-800 text-xs dark:text-amber-300"
                  key={warning}
                >
                  {warning}
                </div>
              ))}
              {state.details.map((detail) => (
                <WorkflowDetailRow detail={detail} key={detail.id} />
              ))}
            </AutoScrollArea>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}

export default function AssistantWorkflowStatus({ message }: { message: SmartEduUIMessage }) {
  const state = buildAssistantWorkflowState(message);

  if (!state.hasWorkflow) {
    return null;
  }

  return (
    <div className="mt-3 min-w-0">
      <WorkflowSummary state={state} />
    </div>
  );
}
