"use client";

import { CheckCircle2, Code2, Download, FileText, History, MonitorPlay, RotateCcw, Sparkles } from "lucide-react";
import React, { useMemo, useState } from "react";

import {
  Artifact,
  ArtifactAction,
  ArtifactActions,
  ArtifactBody,
  ArtifactContent,
  ArtifactDescription,
  ArtifactEmpty,
  ArtifactHeader,
  ArtifactStatus,
  ArtifactTitle,
} from "@/components/ai/artifact";
import type { ArtifactLifecycle, ArtifactLifecycleStatus, ArtifactSnapshot } from "@/components/ai/artifact-model";
import CodeEditor from "@/components/ai/renderers/CodeEditor";
import IframeSandbox from "@/components/ai/renderers/IframeSandbox";
import MarkdownViewer from "@/components/ai/renderers/MarkdownViewer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ArtifactView = "lesson" | "preview" | "source" | "versions";

interface SmartEduArtifactProps {
  lifecycle: ArtifactLifecycle;
  canGenerateHtml: boolean;
  isLoading: boolean;
  onGenerateHtml: () => void;
}

const STATUS_LABELS: Record<ArtifactLifecycleStatus, string> = {
  idle: "等待输入",
  streaming: "生成中",
  ready: "已就绪",
  editing: "编辑中",
  error: "异常",
};

const VIEW_OPTIONS: Array<{
  value: ArtifactView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: "lesson", label: "教案", icon: FileText },
  { value: "preview", label: "预览", icon: MonitorPlay },
  { value: "source", label: "源码", icon: Code2 },
  { value: "versions", label: "版本", icon: History },
];

function getDefaultView(lifecycle: ArtifactLifecycle): ArtifactView {
  return lifecycle.html.trim() ? "preview" : "lesson";
}

function VersionItem({ snapshot }: { snapshot: ArtifactSnapshot }) {
  return (
    <article className="flex items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
      <div className="min-w-0">
        <h3 className="truncate text-sm font-medium text-neutral-950">{snapshot.title}</h3>
        <p className="mt-1 text-xs text-neutral-500">
          {snapshot.stage === "lesson" ? "Markdown 教案" : "HTML 互动大屏"} · v{snapshot.version}
        </p>
      </div>
      <ArtifactStatus label={STATUS_LABELS[snapshot.status]} status={snapshot.status} />
    </article>
  );
}

export default function SmartEduArtifact({ lifecycle, canGenerateHtml, isLoading, onGenerateHtml }: SmartEduArtifactProps) {
  const [view, setView] = useState<ArtifactView | null>(null);
  const [htmlDraft, setHtmlDraft] = useState({ source: lifecycle.html, value: lifecycle.html });
  const activeView = view ?? getDefaultView(lifecycle);
  const draftMatchesSource = htmlDraft.source === lifecycle.html;
  const html = draftMatchesSource ? htmlDraft.value : lifecycle.html;
  const hasHtml = Boolean(html.trim());
  const effectiveStatus: ArtifactLifecycleStatus =
    draftMatchesSource && htmlDraft.value !== lifecycle.html ? "editing" : lifecycle.status;
  const activeTitle = lifecycle.activeArtifact?.title ?? "体育课 Artifact";
  const downloadBlob = useMemo(() => {
    if (!hasHtml) {
      return null;
    }

    return new Blob([html], { type: "text/html;charset=utf-8" });
  }, [hasHtml, html]);

  const resetSource = () => setHtmlDraft({ source: lifecycle.html, value: lifecycle.html });

  const downloadHtml = () => {
    if (!downloadBlob) {
      return;
    }

    const url = URL.createObjectURL(downloadBlob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "smartedu-pe-artifact.html";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Artifact className="bg-[radial-gradient(circle_at_top_left,#eef6ff,transparent_34%),linear-gradient(180deg,#fafafa,#f3f4f6)]">
      <ArtifactHeader className="min-h-[76px] border-neutral-200/80 bg-white/85">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-blue-600" />
            <ArtifactTitle>{activeTitle}</ArtifactTitle>
            <ArtifactStatus label={STATUS_LABELS[effectiveStatus]} status={effectiveStatus} />
          </div>
          <ArtifactDescription>
            Shadcn AI Artifacts 工作台：教案流式生成、确认转 HTML、源码编辑与沙箱预览统一在 Artifact 内完成。
          </ArtifactDescription>
        </div>

        <ArtifactActions className="hidden lg:flex">
          {canGenerateHtml ? (
            <ArtifactAction className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={onGenerateHtml} type="button">
              <CheckCircle2 className="size-4" />
              确认并生成大屏
            </ArtifactAction>
          ) : null}
          <ArtifactAction disabled={!hasHtml || html === lifecycle.html} onClick={resetSource} type="button">
            <RotateCcw className="size-4" />
            恢复源码
          </ArtifactAction>
          <ArtifactAction disabled={!hasHtml} onClick={downloadHtml} type="button" variant="outline">
            <Download className="size-4" />
            导出 HTML
          </ArtifactAction>
        </ArtifactActions>
      </ArtifactHeader>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-neutral-200/80 bg-white/70 px-4 py-3 backdrop-blur">
        <div className="flex rounded-2xl border border-neutral-200 bg-neutral-100 p-1">
          {VIEW_OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = activeView === option.value;

            return (
              <button
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-950",
                  selected && "bg-white text-neutral-950 shadow-sm",
                )}
                key={option.value}
                onClick={() => setView(option.value)}
                type="button"
              >
                <Icon className="size-4" />
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          {canGenerateHtml ? (
            <Button className="h-9 rounded-xl bg-emerald-600 px-3 text-xs text-white hover:bg-emerald-700" onClick={onGenerateHtml} type="button">
              确认生成
            </Button>
          ) : null}
          <Button disabled={!hasHtml} onClick={downloadHtml} size="sm" type="button" variant="outline">
            导出
          </Button>
        </div>

        {isLoading ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700">
            <span className="size-2 animate-pulse rounded-full bg-blue-600" />
            {lifecycle.stage === "html" ? "正在生成互动大屏" : "正在生成教案"}
          </div>
        ) : null}
      </div>

      <ArtifactBody>
        <div className="h-full overflow-y-auto p-4 lg:p-6">
          <ArtifactContent className="mx-auto h-full max-w-7xl">
            {activeView === "lesson" ? (
              <div className="h-full overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm">
                {lifecycle.markdown.trim() ? (
                  <MarkdownViewer content={lifecycle.markdown} />
                ) : (
                  <ArtifactEmpty>输入课程主题后，AI 会在 Artifact 中直接生成可审阅教案。</ArtifactEmpty>
                )}
              </div>
            ) : null}

            {activeView === "preview" ? (
              <div className="aspect-video w-full overflow-hidden rounded-3xl border border-neutral-900 bg-black shadow-2xl">
                {hasHtml ? (
                  <IframeSandbox htmlContent={html} />
                ) : (
                  <ArtifactEmpty className="rounded-none border-0 bg-neutral-950 text-neutral-400">
                    确认教案后，互动大屏会作为 HTML Artifact 在这里实时预览。
                  </ArtifactEmpty>
                )}
              </div>
            ) : null}

            {activeView === "source" ? (
              <div className="h-full min-h-[560px] overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-950 shadow-2xl">
                {hasHtml ? (
                  <CodeEditor code={html} onChange={(value) => setHtmlDraft({ source: lifecycle.html, value: value ?? "" })} />
                ) : (
                  <ArtifactEmpty className="rounded-none border-0 bg-neutral-950 text-neutral-400">
                    HTML Artifact 生成后可在这里直接编辑源码，预览会随源码草稿更新。
                  </ArtifactEmpty>
                )}
              </div>
            ) : null}

            {activeView === "versions" ? (
              <div className="min-h-full rounded-3xl border border-neutral-200 bg-neutral-50 p-4 shadow-sm">
                <div className="space-y-3">
                  {lifecycle.versions.length ? (
                    lifecycle.versions.map((snapshot) => <VersionItem key={snapshot.id} snapshot={snapshot} />)
                  ) : (
                    <ArtifactEmpty>暂无版本。每次教案或大屏 Artifact 生成都会在这里形成快照。</ArtifactEmpty>
                  )}
                </div>
              </div>
            ) : null}
          </ArtifactContent>
        </div>
      </ArtifactBody>
    </Artifact>
  );
}
