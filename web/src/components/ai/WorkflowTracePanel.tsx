"use client";

import { Activity, AlertTriangle } from "lucide-react";
import { useMemo } from "react";

import {
  WebPreview,
  WebPreviewConsole,
  WebPreviewNavigation,
} from "@/components/ai-elements/web-preview";
import { Badge } from "@/components/ui/badge";
import type { WorkflowTraceData } from "@/lib/lesson-authoring-contract";
import {
  buildWorkflowTraceConsoleLogs,
  formatWorkflowTraceMarket,
  formatWorkflowTracePhase,
} from "@/lib/workflow-trace-console";
import { cn } from "@/lib/utils";

function WorkflowTraceSummary({
  trace,
  emptyDescription,
}: {
  trace?: WorkflowTraceData;
  emptyDescription: string;
}) {
  if (!trace) {
    return <p className="pb-1 text-xs text-muted-foreground">{emptyDescription}</p>;
  }

  return (
    <div className="mb-3 space-y-1 text-xs text-muted-foreground">
      <p>请求 ID：{trace.requestId}</p>
      <p>
        阶段：{formatWorkflowTracePhase(trace.phase)} · 通道：
        {trace.responseTransport}
      </p>
      <p>市场：{formatWorkflowTraceMarket(trace)}</p>
      <p>更新时间：{new Date(trace.updatedAt).toLocaleString("zh-CN")}</p>
      {trace.warnings.map((warning) => (
        <p key={warning}>告警：{warning}</p>
      ))}
    </div>
  );
}

export function WorkflowTraceConsoleContent({
  trace,
  className,
  emptyDescription = "当前尚无可展示的生成过程。",
}: {
  trace?: WorkflowTraceData;
  className?: string;
  emptyDescription?: string;
}) {
  const logs = useMemo(() => buildWorkflowTraceConsoleLogs(trace), [trace]);

  return (
    <WebPreviewConsole
      className={cn("flex flex-1 flex-col border-t border-border/60 bg-background/95", className)}
      logs={logs}
    >
      <WorkflowTraceSummary emptyDescription={emptyDescription} trace={trace} />
    </WebPreviewConsole>
  );
}

export default function WorkflowTracePanel({
  trace,
  className,
  title = "生成过程",
  emptyDescription = "当前尚无可展示的生成过程。",
}: {
  trace?: WorkflowTraceData;
  className?: string;
  title?: string;
  emptyDescription?: string;
}) {
  return (
    <WebPreview
      className={cn("h-full rounded-2xl border border-border bg-card shadow-xs", className)}
      defaultConsoleOpen
    >
      <WebPreviewNavigation className="border-border/60 bg-background/95 px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Activity className="size-4 text-brand" />
          <span>{title}</span>
        </div>
        {trace ? (
          <Badge className="ml-2" variant={trace.phase === "failed" ? "destructive" : trace.phase === "completed" ? "success" : "secondary"}>
            {formatWorkflowTracePhase(trace.phase)}
          </Badge>
        ) : null}
        {trace?.warnings.length ? (
          <Badge className="ml-2" variant="warning">
            <AlertTriangle className="mr-1 size-3" />
            告警 {trace.warnings.length}
          </Badge>
        ) : null}
        <span className="ml-auto text-xs text-muted-foreground">
          {trace ? `请求 ${trace.requestId.slice(0, 8)}` : "暂无 Trace"}
        </span>
      </WebPreviewNavigation>

      <div className="min-h-0 flex-1 overflow-hidden">
        <WorkflowTraceConsoleContent
          className="h-full border-t-0 bg-card"
          emptyDescription={emptyDescription}
          trace={trace}
        />
      </div>
    </WebPreview>
  );
}
