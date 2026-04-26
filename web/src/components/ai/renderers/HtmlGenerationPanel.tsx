"use client";

import { Code2, Loader2 } from "lucide-react";
import React, { useEffect, useMemo, useRef } from "react";

import type { WorkflowTraceData } from "@/lib/lesson-authoring-contract";

interface HtmlGenerationPanelProps {
  code: string;
  trace?: WorkflowTraceData;
  hasPreviousPreview?: boolean;
}

function getCurrentStep(trace?: WorkflowTraceData) {
  const latestRunningStep = trace?.trace.findLast((entry) => entry.status === "running");
  const latestStep = trace?.trace.at(-1);

  return latestRunningStep?.detail ?? latestStep?.detail ?? "正在接收互动大屏源码流。";
}

export default function HtmlGenerationPanel({
  code,
  trace,
  hasPreviousPreview = false,
}: HtmlGenerationPanelProps) {
  const codeRef = useRef<HTMLPreElement>(null);
  const lineCount = useMemo(() => (code ? code.split(/\r?\n/).length : 0), [code]);
  const currentStep = getCurrentStep(trace);

  useEffect(() => {
    const element = codeRef.current;

    if (!element) {
      return;
    }

    element.scrollTop = element.scrollHeight;
  }, [code]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950 text-slate-100">
      <div className="shrink-0 border-b border-white/10 bg-slate-900/95 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300">
                <Code2 className="size-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-white">AI 正在生成互动大屏源码</h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  完成结构校验和安全检查后，系统会一次性切换到课堂投屏预览。
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-medium text-emerald-200">
            <Loader2 className="size-3.5 animate-spin" />
            生成中
          </div>
        </div>

        <div className="mt-3 grid gap-2 text-xs text-slate-300 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <span className="block text-slate-500">当前阶段</span>
            <strong className="mt-1 block truncate font-medium text-slate-100">{currentStep}</strong>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <span className="block text-slate-500">已生成行数</span>
            <strong className="mt-1 block font-medium text-slate-100">{lineCount || "准备中"}</strong>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <span className="block text-slate-500">预览策略</span>
            <strong className="mt-1 block font-medium text-slate-100">
              {hasPreviousPreview ? "保留旧版，完成后替换" : "完成后首次展示"}
            </strong>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-4">
        <pre
          ref={codeRef}
          className="h-full overflow-auto rounded-2xl border border-white/10 bg-black/55 p-4 text-[12px] leading-5 text-emerald-100 shadow-inner"
        >
          <code>
            {code ||
              "<!-- 正在建立生成通道，HTML 源码会在这里流式出现。 -->"}
          </code>
        </pre>
      </div>
    </div>
  );
}
