"use client";

import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  History,
  Loader2,
  MonitorPlay,
  Printer,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  Artifact,
  ArtifactAction,
  ArtifactActions,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from "@/components/ai-elements/artifact";
import type { ArtifactLifecycle, ArtifactLifecycleStatus, ArtifactSnapshot } from "@/components/ai/artifact-model";
import HtmlGenerationPanel from "@/components/ai/renderers/HtmlGenerationPanel";
import IframeSandbox from "@/components/ai/renderers/IframeSandbox";
import LessonEditor from "@/components/ai/renderers/LessonEditor";
import MarkdownViewer from "@/components/ai/renderers/MarkdownViewer";
import CompetitionLessonPrintFrame, {
  type CompetitionLessonPrintFrameHandle,
} from "@/components/lesson-print/CompetitionLessonPrintFrame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { exportHtmlResponseSchema } from "@/lib/lesson-authoring-contract";
import { markdownToCompetitionLessonPlan } from "@/lib/competition-lesson-markdown";

type ArtifactView = "lesson" | "canvas" | "versions";
type LessonPresentation = "print" | "draft";

interface SmartEduArtifactProps {
  lifecycle: ArtifactLifecycle;
  canGenerateHtml: boolean;
  isLoading: boolean;
  isRestoringVersion?: boolean;
  projectId?: string | null;
  onGenerateHtml: () => void;
  onLessonMarkdownChange?: (markdown: string) => void;
  onRestoreArtifactVersion?: (snapshot: ArtifactSnapshot) => Promise<void> | void;
}

const STATUS_LABELS: Record<ArtifactLifecycleStatus, string> = {
  idle: "等待输入",
  streaming: "生成中",
  ready: "已就绪",
  editing: "编辑中",
  error: "异常",
};

const STATUS_ICONS = {
  idle: Clock,
  streaming: Loader2,
  ready: Check,
  editing: Clock,
  error: AlertCircle,
} satisfies Record<ArtifactLifecycleStatus, React.ComponentType<{ className?: string }>>;

const VIEW_OPTIONS: Array<{
  value: ArtifactView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: "lesson", label: "教案", icon: FileText },
  { value: "canvas", label: "画布", icon: MonitorPlay },
  { value: "versions", label: "版本", icon: History },
];

function getDefaultView(lifecycle: ArtifactLifecycle): ArtifactView {
  return lifecycle.stage === "html" || lifecycle.html.trim() ? "canvas" : "lesson";
}

function ArtifactEmptyState({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex h-full items-center justify-center rounded-2xl border border-dashed border-border bg-muted/50 p-8 text-center text-sm text-muted-foreground ${className}`}
    >
      {children}
    </div>
  );
}

function LessonStartGuide() {
  return (
    <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_center,#f8fafc,transparent_62%)] p-6">
      <div className="w-full max-w-2xl rounded-3xl border border-border bg-background p-8 text-center shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
          <Sparkles className="size-6" />
        </div>
        <h2 className="mt-5 text-xl font-semibold text-foreground">开始创建体育课</h2>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
          在左侧输入课程主题，AI 会先生成可审阅教案。确认教案后，再生成适合课堂投屏的互动大屏。
        </p>
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-muted/50 px-4 py-3 text-left text-sm text-muted-foreground">
          示例：三年级篮球运球接力，40 人，20 个篮球，半个篮球场，课堂时长 40 分钟。
        </div>
      </div>
    </div>
  );
}

function CanvasPendingGuide({ hasLesson }: { hasLesson: boolean }) {
  return (
    <div className="flex h-full items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-xl rounded-3xl border border-border bg-background p-7 text-center shadow-sm">
        <MonitorPlay className="mx-auto size-10 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-semibold text-foreground">互动大屏尚未生成</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {hasLesson
            ? "请先确认教案，系统会继续生成课堂投屏画面。"
            : "请先在左侧输入课程主题，生成并确认教案后，这里会显示课堂投屏画面。"}
        </p>
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  label,
}: {
  status: ArtifactLifecycleStatus;
  label: string;
}) {
  const Icon = STATUS_ICONS[status];

  return (
    <Badge
      variant={
        status === "ready"
          ? "success"
          : status === "streaming" || status === "editing"
            ? "warning"
            : status === "error"
              ? "destructive"
              : "secondary"
      }
    >
      <Icon className={`mr-1 size-3.5 ${status === "streaming" ? "animate-spin" : ""}`} />
      {label}
    </Badge>
  );
}

function formatSnapshotTime(snapshot: ArtifactSnapshot) {
  if (!snapshot.createdAt) {
    return "刚刚更新";
  }

  return new Date(snapshot.createdAt).toLocaleString("zh-CN");
}

function VersionItem({
  snapshot,
  isSelected,
  onSelect,
}: {
  snapshot: ArtifactSnapshot;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button className="block w-full text-left" onClick={onSelect} type="button">
      <Card
        className={`gap-0 py-0 shadow-xs transition-colors ${
          isSelected ? "border-brand bg-brand/5" : "hover:border-brand/25"
        }`}
      >
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-medium text-foreground">{snapshot.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {snapshot.stage === "lesson" ? "教案" : "互动大屏"} · v{snapshot.version}
              </p>
            </div>
            <StatusBadge label={STATUS_LABELS[snapshot.status]} status={snapshot.status} />
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>{formatSnapshotTime(snapshot)}</span>
            {snapshot.isCurrent ? <Badge variant="success">当前版本</Badge> : null}
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

export default function SmartEduArtifact({
  lifecycle,
  canGenerateHtml,
  isLoading,
  isRestoringVersion = false,
  projectId,
  onGenerateHtml,
  onLessonMarkdownChange,
  onRestoreArtifactVersion,
}: SmartEduArtifactProps) {
  const [view, setView] = useState<ArtifactView | null>(null);
  const [lessonPresentation, setLessonPresentation] = useState<LessonPresentation>("print");
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const printFrameRef = useRef<CompetitionLessonPrintFrameHandle>(null);
  const pendingHtmlToastRef = useRef(false);
  const activeView = view ?? getDefaultView(lifecycle);
  const html = lifecycle.html;
  const streamingHtml = lifecycle.streamingHtml;
  const hasHtml = Boolean(html.trim());
  const isGeneratingHtml = lifecycle.stage === "html" && lifecycle.isHtmlStreaming;
  const hasLesson = Boolean(lifecycle.markdown.trim());
  const isStreamingLessonDraft =
    lifecycle.stage === "lesson" &&
    lifecycle.status === "streaming" &&
    lifecycle.activeArtifact?.contentType === "markdown";
  const competitionLessonPlan = useMemo(
    () => lifecycle.lessonPlan ?? markdownToCompetitionLessonPlan(lifecycle.markdown),
    [lifecycle.lessonPlan, lifecycle.markdown],
  );
  const effectiveSelectedVersionId =
    selectedVersionId && lifecycle.versions.some((snapshot) => snapshot.id === selectedVersionId)
      ? selectedVersionId
      : lifecycle.activeArtifact?.id ?? lifecycle.versions.at(-1)?.id ?? null;
  const selectedVersion =
    lifecycle.versions.find((snapshot) => snapshot.id === effectiveSelectedVersionId) ??
    lifecycle.activeArtifact ??
    lifecycle.versions.at(-1);
  const canRestoreSelectedVersion = Boolean(
    selectedVersion?.persistedVersionId &&
      !selectedVersion.isCurrent &&
      onRestoreArtifactVersion,
  );

  useEffect(() => {
    if (isLoading && lifecycle.stage === "html") {
      pendingHtmlToastRef.current = true;
      return;
    }

    if (!isLoading && pendingHtmlToastRef.current && lifecycle.html.trim()) {
      toast.success("互动大屏已生成", { description: "可在画布中预览或导出大屏文件。", id: "generate-html" });
      pendingHtmlToastRef.current = false;
      return;
    }

    if (!isLoading && !lifecycle.html.trim()) {
      pendingHtmlToastRef.current = false;
    }
  }, [isLoading, lifecycle.html, lifecycle.stage]);

  const downloadBlob = useMemo(() => {
    if (!hasHtml) {
      return null;
    }

    return new Blob([html], { type: "text/html;charset=utf-8" });
  }, [hasHtml, html]);

  const downloadHtmlLocally = () => {
    if (!downloadBlob) {
      toast.warning("暂无可导出的大屏文件", { description: "请先确认教案并生成互动大屏。" });
      return;
    }

    const url = URL.createObjectURL(downloadBlob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "smartedu-pe-screen.html";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadHtml = () => {
    void (async () => {
      if (!downloadBlob) {
        toast.warning("暂无可导出的大屏文件", { description: "请先确认教案并生成互动大屏。" });
        return;
      }

      if (!projectId) {
        downloadHtmlLocally();
        toast.success("大屏文件已导出", { description: "当前为临时会话，已保存为本地 HTML 文件。" });
        return;
      }

      setIsExporting(true);

      try {
        const response = await fetch(`/api/projects/${projectId}/exports/html`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            artifactVersionId: lifecycle.activeArtifact?.persistedVersionId,
            filename: "smartedu-pe-screen.html",
            html,
          }),
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
              ? payload.error
              : "云端导出失败。",
          );
        }

        const parsedPayload = exportHtmlResponseSchema.safeParse(payload);

        if (!parsedPayload.success) {
          throw new Error("云端导出响应结构不合法。");
        }

        downloadHtmlLocally();
        toast.success("大屏文件已导出", {
          description: `已写入 R2：${parsedPayload.data.exportFile.objectKey}`,
        });
      } catch (exportError) {
        downloadHtmlLocally();
        toast.warning("云端导出未完成，已改为本地导出", {
          description: exportError instanceof Error ? exportError.message : "请检查 R2 环境配置后重试。",
        });
      } finally {
        setIsExporting(false);
      }
    })();
  };

  const generateHtml = () => {
    toast.loading("正在生成互动大屏", { description: "AI 将基于已确认教案生成可预览的大屏。", id: "generate-html" });
    onGenerateHtml();
  };

  const printLesson = () => {
    printFrameRef.current?.print();
  };

  const restoreSelectedVersion = () => {
    if (!selectedVersion || !onRestoreArtifactVersion) {
      return;
    }

    void onRestoreArtifactVersion(selectedVersion);
  };

  return (
    <Artifact className="h-full min-w-0 flex-1 rounded-none border-0 shadow-none">
      <Tabs className="flex min-h-0 flex-1 flex-col" onValueChange={(value) => setView(value as ArtifactView)} value={activeView}>
        <ArtifactHeader className="min-h-11 shrink-0 flex-wrap gap-2 bg-card/95 px-4 py-1.5 backdrop-blur">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Sparkles className="size-4 shrink-0 text-brand" />
            <ArtifactTitle className="shrink-0">体育课创作工作台</ArtifactTitle>
            <StatusBadge label={STATUS_LABELS[lifecycle.status]} status={lifecycle.status} />
            <ArtifactDescription className="hidden truncate text-xs 2xl:block">
              先生成教案，确认后自动生成课堂互动大屏。
            </ArtifactDescription>
          </div>

          <TabsList className="order-3 w-full justify-start sm:order-none sm:w-auto">
            {VIEW_OPTIONS.map((option) => {
              const Icon = option.icon;

              return (
                <TabsTrigger key={option.value} value={option.value}>
                  <Icon className="mr-1.5 size-4" />
                  {option.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <div className="flex items-center gap-2 lg:hidden">
            {canGenerateHtml ? (
              <Button onClick={generateHtml} size="sm" type="button" variant="brand">
                确认生成
              </Button>
            ) : null}
            {hasHtml ? (
              <Button disabled={isExporting} onClick={downloadHtml} size="sm" type="button" variant="outline">
                {isExporting ? "导出中" : "导出"}
              </Button>
            ) : null}
          </div>

          {isLoading ? (
            <div className="hidden items-center gap-2 rounded-full border border-brand/20 bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand xl:inline-flex">
              <span className="size-2 animate-pulse rounded-full bg-brand" />
              {lifecycle.stage === "html" ? "正在生成互动大屏" : "正在生成教案"}
            </div>
          ) : null}

          <ArtifactActions className="hidden lg:flex">
            {canGenerateHtml ? (
              <Button className="h-9" onClick={generateHtml} size="sm" type="button" variant="brand">
                <CheckCircle2 className="size-4" />
                确认并生成大屏
              </Button>
            ) : null}
            {hasHtml ? (
              <ArtifactAction
                disabled={isExporting}
                icon={Download}
                label={isExporting ? "导出中" : "导出大屏"}
                onClick={downloadHtml}
                tooltip={projectId ? "导出到云端并下载本地副本" : "导出本地大屏文件"}
                type="button"
                variant="outline"
              />
            ) : null}
          </ArtifactActions>
        </ArtifactHeader>

        <ArtifactContent className="flex min-h-0 flex-1 flex-col p-0">
          <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col">
            <TabsContent className="m-0 h-full p-3 lg:p-4" value="lesson">
              <div className="h-full overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
                {hasLesson ? (
                  <div className="flex h-full flex-col">
                    <div className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-1.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <h2 className="shrink-0 text-sm font-semibold text-foreground">
                          {isStreamingLessonDraft ? "教案草稿生成中" : "教案预览"}
                        </h2>
                        <span className="hidden truncate text-xs text-muted-foreground lg:inline">
                          {isStreamingLessonDraft
                            ? "正在流式生成 Markdown 草稿，完成后自动切换正式打印版。"
                            : "固定 A4 模板，修改请在左侧对话提出。"}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5">
                          <Button
                            className="h-7 rounded-sm px-2.5 text-xs"
                            onClick={() => setLessonPresentation("print")}
                            type="button"
                            variant={lessonPresentation === "print" ? "brand" : "ghost"}
                          >
                            正式打印版
                          </Button>
                          <Button
                            className="h-7 rounded-sm px-2.5 text-xs"
                            onClick={() => setLessonPresentation("draft")}
                            type="button"
                            variant={lessonPresentation === "draft" ? "brand" : "ghost"}
                          >
                            草稿编辑
                          </Button>
                        </div>
                        {lessonPresentation === "print" && !isStreamingLessonDraft ? (
                          <Button className="h-8 px-2.5 text-xs" onClick={printLesson} type="button" variant="outline">
                            <Printer className="size-3.5" />
                            打印/另存 PDF
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="min-h-0 flex-1">
                      {isStreamingLessonDraft ? (
                        <MarkdownViewer content={lifecycle.markdown} />
                      ) : lessonPresentation === "print" ? (
                        <div className="h-full min-h-0 overflow-hidden bg-slate-100">
                          <CompetitionLessonPrintFrame ref={printFrameRef} lesson={competitionLessonPlan} />
                        </div>
                      ) : (
                        <LessonEditor
                          content={lifecycle.markdown}
                          disabled={isLoading}
                          onMarkdownChange={onLessonMarkdownChange}
                        />
                      )}
                    </div>
                  </div>
                ) : (
                  <LessonStartGuide />
                )}
              </div>
            </TabsContent>

            <TabsContent className="m-0 h-full p-3 lg:p-4" value="canvas">
              <div className={`h-full overflow-hidden rounded-2xl border border-border shadow-lg ${hasHtml || isGeneratingHtml ? "min-h-[560px] bg-primary" : "bg-card"}`}>
                {isGeneratingHtml ? (
                  <HtmlGenerationPanel
                    code={streamingHtml}
                    hasPreviousPreview={hasHtml}
                    trace={lifecycle.activeTrace}
                  />
                ) : hasHtml ? (
                  <div className="flex h-full flex-col">
                    <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-primary px-4 py-2 text-primary-foreground">
                      <div>
                        <h2 className="text-sm font-semibold">互动大屏预览</h2>
                        <p className="mt-0.5 text-xs text-primary-foreground/70">这里展示课堂投屏效果。</p>
                      </div>
                    </div>
                    <div className="min-h-0 flex-1">
                      <IframeSandbox key={lifecycle.htmlPreviewVersionId ?? html.length} htmlContent={html} />
                    </div>
                  </div>
                ) : (
                  <CanvasPendingGuide hasLesson={hasLesson} />
                )}
              </div>
            </TabsContent>

            <TabsContent className="m-0 h-full p-3 lg:p-4" value="versions">
              <div className="grid h-full gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                <ScrollArea className="rounded-2xl border border-border bg-muted/50 p-4 shadow-xs">
                  <div className="mb-4">
                    <h2 className="text-sm font-semibold text-foreground">版本记录</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      每次生成教案或互动大屏后，都会在这里留下记录，并可恢复为当前版本。
                    </p>
                  </div>
                  <div className="space-y-3">
                    {lifecycle.versions.length ? (
                      lifecycle.versions.map((snapshot) => (
                        <VersionItem
                          isSelected={snapshot.id === selectedVersion?.id}
                          key={snapshot.id}
                          onSelect={() => setSelectedVersionId(snapshot.id)}
                          snapshot={snapshot}
                        />
                      ))
                    ) : (
                      <ArtifactEmptyState>
                        暂无版本。每次教案或互动大屏生成都会在这里形成快照。
                      </ArtifactEmptyState>
                    )}
                  </div>
                </ScrollArea>

                <div className="min-h-0 overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
                  {selectedVersion ? (
                    <div className="flex h-full flex-col">
                      <div className="flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="truncate text-sm font-semibold text-foreground">
                              {selectedVersion.title}
                            </h2>
                            <Badge variant="secondary">
                              {selectedVersion.stage === "lesson" ? "教案" : "互动大屏"}
                            </Badge>
                            {selectedVersion.isCurrent ? (
                              <Badge variant="success">当前版本</Badge>
                            ) : null}
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            版本 v{selectedVersion.version} · {formatSnapshotTime(selectedVersion)}
                          </p>
                        </div>

                        {canRestoreSelectedVersion ? (
                          <Button
                            disabled={isLoading || isRestoringVersion}
                            onClick={restoreSelectedVersion}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            {isRestoringVersion ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <RotateCcw className="size-4" />
                            )}
                            恢复为当前版本
                          </Button>
                        ) : null}
                      </div>

                      <div className="min-h-0 flex-1">
                        {selectedVersion.stage === "lesson" ? (
                          <MarkdownViewer content={selectedVersion.content} />
                        ) : selectedVersion.status === "streaming" ? (
                          <HtmlGenerationPanel
                            code={selectedVersion.content}
                            hasPreviousPreview={hasHtml}
                            trace={selectedVersion.trace}
                          />
                        ) : (
                          <IframeSandbox htmlContent={selectedVersion.content} />
                        )}
                      </div>
                    </div>
                  ) : (
                    <ArtifactEmptyState className="m-4">
                      选择一个版本以查看详细内容。
                    </ArtifactEmptyState>
                  )}
                </div>
              </div>
            </TabsContent>
          </div>
        </ArtifactContent>
      </Tabs>
    </Artifact>
  );
}
