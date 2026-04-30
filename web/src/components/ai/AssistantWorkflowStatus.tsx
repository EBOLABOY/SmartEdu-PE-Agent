"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Circle,
  Loader2,
} from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  buildAssistantWorkflowState,
  type AssistantWorkflowDetail,
  type AssistantWorkflowDetailStatus,
  type AssistantWorkflowState,
} from "@/lib/assistant-workflow-status";
import type { SmartEduUIMessage } from "@/lib/lesson-authoring-contract";
import { cn } from "@/lib/utils";

/* ── Status indicator ──────────────────────────────── */

function StatusDot({ status }: { status: AssistantWorkflowState["status"] | "pending" }) {
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
  if (status === "pending") {
    return <Circle className="size-3.5 shrink-0 text-muted-foreground/30" />;
  }
  return <Loader2 className="size-3.5 shrink-0 text-muted-foreground/50" />;
}

/* ── Detail row inside collapsible ─────────────────── */

function DetailRow({
  detail,
  visualStatus,
}: {
  detail: AssistantWorkflowDetail;
  visualStatus?: AssistantWorkflowDetailStatus | "pending";
}) {
  return (
    <div className="relative z-10 flex items-start gap-2.5 py-2">
      <div className="flex h-[20px] items-center justify-center bg-background">
        <StatusDot status={visualStatus ?? detail.status} />
      </div>
      <div className="min-w-0 flex-1">
        <span className="text-[13px] font-medium text-foreground/80">{detail.title}</span>
        {detail.description && (
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground/60">{detail.description}</p>
        )}
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

  const [completedIds, setCompletedIds] = useState<Set<string>>(() => {
    // If not streaming initially, consider it historical and skip animations
    if (!state.isStreaming) {
      return new Set(state.details.map((d) => d.id));
    }
    return new Set();
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (state.details.length === 0) return;

    const nextPending = state.details.find((d) => !completedIds.has(d.id));

    if (!nextPending) {
      if (activeId !== null) {
        queueMicrotask(() => setActiveId(null));
      }
      return;
    }

    if (activeId !== nextPending.id) {
      startTimeRef.current = Date.now();
      queueMicrotask(() => setActiveId(nextPending.id));
      return;
    }

    // Backend trace items are generally immediately complete
    const currentIndex = state.details.findIndex((d) => d.id === activeId);
    const hasNext = currentIndex < state.details.length - 1;
    const isBackendFinished = nextPending.status !== "active" || hasNext;

    if (isBackendFinished) {
      const elapsed = Date.now() - (startTimeRef.current || 0);
      const remaining = 1500 - elapsed;

      if (remaining <= 0) {
        setCompletedIds((prev) => {
          const next = new Set(prev);
          next.add(activeId);
          return next;
        });
      } else {
        const timer = setTimeout(() => {
          setCompletedIds((prev) => {
            const next = new Set(prev);
            next.add(activeId);
            return next;
          });
        }, remaining);
        return () => clearTimeout(timer);
      }
    }
  }, [state.details, activeId, completedIds]);

  const [isOpen, setIsOpen] = useState(false);
  const isAnimating = activeId !== null;

  useEffect(() => {
    if (isAnimating) {
      queueMicrotask(() => setIsOpen(true));
    } else if (state.status === "complete" || state.status === "failed") {
      queueMicrotask(() => setIsOpen(false));
    }
  }, [isAnimating, state.status]);

  if (!state.hasWorkflow) {
    return null;
  }

  const hasDetails = state.details.length > 0 || state.warnings.length > 0;

  let overallVisualStatus: AssistantWorkflowState["status"] = state.status;
  if (!isAnimating && (state.status === "complete" || state.status === "failed")) {
    overallVisualStatus = state.status;
  } else if (isAnimating || state.status === "active") {
    overallVisualStatus = "active";
  }

  return (
    <div className="mt-2 min-w-0">
      <Collapsible onOpenChange={setIsOpen} open={isOpen}>
        {/* Single-line summary: icon + title + badge */}
        <CollapsibleTrigger className="flex w-full items-center gap-2.5 py-1.5 text-left group/wf">
          <StatusDot status={overallVisualStatus} />
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
          <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
            <div className="relative mt-1 pb-1">
              {/* Vertical timeline line */}
              <div className="absolute bottom-6 left-[6px] top-2 w-px bg-border/60" />

              {state.warnings.map((warning) => (
                <div
                  className="relative z-10 flex items-start gap-2.5 py-1.5"
                  key={warning}
                >
                  <div className="flex h-[20px] items-center justify-center bg-background">
                    <AlertTriangle className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="min-w-0 flex-1 text-[12px] text-amber-600 dark:text-amber-400">
                    <span className="leading-relaxed">{warning}</span>
                  </div>
                </div>
              ))}
              {state.details.map((detail) => {
                let visualStatus: AssistantWorkflowDetailStatus | "pending" = "pending";
                if (completedIds.has(detail.id)) {
                  visualStatus = detail.status;
                } else if (activeId === detail.id) {
                  visualStatus = "active";
                }
                return <DetailRow detail={detail} key={detail.id} visualStatus={visualStatus} />;
              })}
            </div>
          </CollapsibleContent>
        ) : null}
      </Collapsible>
    </div>
  );
}
