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
import React, { useEffect } from "react";
import ThemeToggle from "@/components/layout/ThemeToggle";

import {
  Artifact,
  ArtifactActions,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from "@/components/ai-elements/artifact";
import type { ArtifactLifecycle, ArtifactLifecycleStatus, ArtifactSnapshot } from "@/components/ai/artifact-model";
import {
  getHtmlArtifactDisplayState,
  getLessonArtifactDisplayState,
} from "@/components/ai/artifact-view-state";
import { useArtifactController } from "@/components/ai/useArtifactController";
import ArtifactTextViewer from "@/components/ai/renderers/ArtifactTextViewer";
import HtmlScreenEditorPreview from "@/components/ai/renderers/HtmlScreenEditorPreview";
import HtmlGenerationPanel from "@/components/ai/renderers/HtmlGenerationPanel";
import IframeSandbox from "@/components/ai/renderers/IframeSandbox";
import CompetitionLessonPrintFrame from "@/components/lesson-print/CompetitionLessonPrintFrame";
import type { ArtifactView } from "@/lib/lesson-authoring-contract";
import type { HtmlScreenPageSelection } from "@/lib/html-screen-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SelectableSurface, StateNotice, StateSurface } from "@/components/ui/state-surface";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface SmartEduArtifactProps {
  lifecycle: ArtifactLifecycle;
  canGenerateHtml: boolean;
  isHtmlGenerationPending?: boolean;
  isLoading: boolean;
  isRestoringVersion?: boolean;
  onActiveViewChange?: (view: ArtifactView) => void;
  projectId?: string | null;
  selectedHtmlPage?: HtmlScreenPageSelection | null;
  showDesktopGenerateAction?: boolean;
  onGenerateHtml: () => void;
  onRestoreArtifactVersion?: (snapshot: ArtifactSnapshot) => Promise<void> | void;
  onSelectHtmlPage?: (page: HtmlScreenPageSelection) => void;
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
  { value: "lesson", label: "课时计划", icon: FileText },
  { value: "canvas", label: "画布", icon: MonitorPlay },
  { value: "versions", label: "版本", icon: History },
];

function LessonStartGuide() {
  return (
    <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_center,rgba(0,217,146,0.10),transparent_62%)] p-6">
      <div className="w-full max-w-2xl rounded-3xl border border-border/80 bg-card/90 p-8 text-center shadow-[0_20px_70px_-58px_rgba(0,217,146,0.55)]">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-brand/25 bg-brand/10 text-brand">
          <Sparkles className="size-6" />
        </div>
        <h2 className="mt-5 text-xl font-semibold text-foreground">开始创建体育课</h2>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
          在左侧输入课程主题，AI 会先生成可审阅课时计划。确认课时计划后，再生成适合课堂投屏的互动大屏。
        </p>
        <StateSurface className="mt-6 text-left" density="compact" tone="brand">
          示例：三年级篮球运球接力，40 人，20 个篮球，半个篮球场，课堂时长 40 分钟。
        </StateSurface>
      </div>
    </div>
  );
}

function CanvasPendingGuide({ hasLesson }: { hasLesson: boolean }) {
  return (
    <div className="flex h-full items-center justify-center bg-background/50 p-6">
      <div className="w-full max-w-xl rounded-3xl border border-border/80 bg-card/90 p-7 text-center shadow-[0_20px_70px_-60px_rgba(0,217,146,0.45)]">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-border/80 bg-background/70 text-muted-foreground">
          <MonitorPlay className="size-5" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-foreground">互动大屏尚未生成</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {hasLesson
            ? "请先确认课时计划，系统会继续生成课堂投屏画面。"
            : "请先在左侧输入课程主题，生成并确认课时计划后，这里会显示课堂投屏画面。"}
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
    <SelectableSurface active={isSelected} onClick={onSelect}>
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-medium text-foreground">{snapshot.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {snapshot.stage === "lesson" ? "课时计划" : "互动大屏"} · v{snapshot.version}
            </p>
          </div>
          <StatusBadge label={STATUS_LABELS[snapshot.status]} status={snapshot.status} />
        </div>
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{formatSnapshotTime(snapshot)}</span>
          {snapshot.isCurrent ? <Badge variant="success">当前版本</Badge> : null}
        </div>
      </div>
    </SelectableSurface>
  );
}

export default function SmartEduArtifact({
  lifecycle,
  canGenerateHtml,
  isHtmlGenerationPending = false,
  isLoading,
  isRestoringVersion = false,
  onActiveViewChange,
  projectId,
  selectedHtmlPage,
  showDesktopGenerateAction = true,
  onGenerateHtml,
  onRestoreArtifactVersion,
  onSelectHtmlPage,
}: SmartEduArtifactProps) {
  const {
    activeView,
    canRestoreSelectedVersion,
    downloadHtml,
    generateHtml,
    isExporting,
    printFrameRef,
    printLesson,
    restoreSelectedVersion,
    selectedVersion,
    setSelectedVersionId,
    setView,
  } = useArtifactController({
    isHtmlGenerationPending,
    lifecycle,
    onGenerateHtml,
    onRestoreArtifactVersion,
    projectId,
  });
  const html = lifecycle.html;
  const streamingHtml = lifecycle.streamingHtml;
  const htmlDisplay = getHtmlArtifactDisplayState(lifecycle, isHtmlGenerationPending);
  const hasHtml = htmlDisplay.hasHtml;
  const lessonDisplay = getLessonArtifactDisplayState(lifecycle);
  const competitionLessonPlan = lifecycle.lessonPlan;

  useEffect(() => {
    onActiveViewChange?.(activeView);
  }, [activeView, onActiveViewChange]);

  return (
    <Artifact className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent shadow-none">
      <Tabs className="flex min-h-0 flex-1 flex-col" onValueChange={(value) => setView(value as ArtifactView)} value={activeView}>
        <ArtifactHeader className="min-h-14 shrink-0 flex-wrap gap-2 border-b border-border/70 bg-card/90 px-4 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Sparkles className="size-4 shrink-0 text-brand drop-shadow-[0_0_8px_rgba(0,217,146,0.75)]" />
            <ArtifactTitle className="shrink-0">体育课创作工作台</ArtifactTitle>
            <StatusBadge label={STATUS_LABELS[lifecycle.status]} status={lifecycle.status} />
            <ArtifactDescription className="hidden truncate text-xs 2xl:block">
              先生成课时计划，确认后自动生成课堂互动大屏。
            </ArtifactDescription>
          </div>

          <TabsList className="order-3 w-full justify-start border border-border/70 bg-background/70 sm:order-none sm:w-auto">
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
            <div className="hidden items-center gap-2 rounded-full border border-brand/25 bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand xl:inline-flex">
              <span className="size-2 animate-pulse rounded-full bg-brand" />
              {lifecycle.stage === "html" ? "正在生成互动大屏" : "正在生成课时计划"}
            </div>
          ) : null}

          <ArtifactActions className="hidden lg:flex">
            {showDesktopGenerateAction && canGenerateHtml ? (
              <Button className="h-9" onClick={generateHtml} size="sm" type="button" variant="brand">
                <CheckCircle2 className="size-4" />
                确认并生成大屏
              </Button>
            ) : null}
            <ThemeToggle compact />
          </ArtifactActions>
        </ArtifactHeader>

        <ArtifactContent className="flex min-h-0 flex-1 flex-col bg-transparent p-0">
          <div className="mx-auto flex min-h-0 w-full flex-1 flex-col">
            <TabsContent className="m-0 h-full p-3 lg:p-4" value="lesson">
              <div className="h-full overflow-hidden rounded-2xl border border-border/80 bg-card/90 shadow-[0_18px_70px_-62px_rgba(0,217,146,0.45)]">
                {lessonDisplay.shouldShowWorkspace ? (
                  <div className="flex h-full flex-col">
                    <div className="flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/75 bg-background/35 px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <h2 className="shrink-0 text-sm font-semibold text-foreground">
                          {lessonDisplay.panelTitle}
                        </h2>
                        <span className="hidden truncate text-xs text-muted-foreground lg:inline">
                          {lessonDisplay.panelDescription}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {lessonDisplay.shouldShowPrintFrame ? (
                          <Button className="h-8 px-2.5 text-xs" onClick={printLesson} type="button" variant="outline">
                            <Printer className="size-3.5" />
                            打印/另存 PDF
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="min-h-0 flex-1">
                      {!competitionLessonPlan || !lessonDisplay.shouldShowPrintFrame ? (
                        <ArtifactTextViewer
                          content={lifecycle.lessonContent}
                          emptyDescription={lessonDisplay.viewerEmptyDescription}
                          emptyTitle={lessonDisplay.viewerEmptyTitle}
                          isStreaming={lessonDisplay.isStreamActive}
                        />
                      ) : (
                        <div className="h-full min-h-0 overflow-hidden bg-muted">
                          <CompetitionLessonPrintFrame ref={printFrameRef} lesson={competitionLessonPlan} />
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <LessonStartGuide />
                )}
              </div>
            </TabsContent>

            <TabsContent className="m-0 h-full p-3 lg:p-4" value="canvas">
              <div className={`h-full overflow-hidden rounded-2xl border border-border/80 shadow-[0_18px_70px_-62px_rgba(0,217,146,0.45)] ${hasHtml || htmlDisplay.shouldShowGenerationPanel ? "min-h-[560px] bg-background" : "bg-card/90"}`}>
                {htmlDisplay.shouldShowGenerationPanel ? (
                  <HtmlGenerationPanel
                    code={streamingHtml}
                    hasPreviousPreview={hasHtml}
                    trace={lifecycle.activeTrace}
                  />
                ) : hasHtml ? (
                  <div className="flex h-full flex-col">
                    <div className="flex shrink-0 items-center justify-between border-b border-border/70 bg-card px-4 py-2 text-foreground">
                      <div>
                        <h2 className="text-sm font-semibold">{"AI \u751f\u6210\u7684\u4e92\u52a8\u5927\u5c4f"}</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">{"\u7531\u6a21\u578b\u751f\u6210\u7684 HTML \u5b9e\u65f6\u6e32\u67d3\u3002"}</p>
                      </div>
                      <Button disabled={isExporting} onClick={downloadHtml} size="sm" type="button" variant="outline" className="h-8 gap-1.5">
                        <Download className="size-3.5" />
                        {isExporting ? "导出中" : "导出大屏"}
                      </Button>
                    </div>
                    <div className="min-h-0 flex-1">
                      <HtmlScreenEditorPreview
                        htmlContent={html}
                        htmlPages={lifecycle.htmlPages}
                        onSelectPage={onSelectHtmlPage}
                        selectedPageIndex={selectedHtmlPage?.pageIndex}
                      />
                    </div>
                  </div>
                ) : (
                  <CanvasPendingGuide hasLesson={lessonDisplay.hasLesson} />
                )}
              </div>
            </TabsContent>

            <TabsContent className="m-0 h-full p-3 lg:p-4" value="versions">
              <div className="grid h-full gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                <ScrollArea className="rounded-2xl border border-border/80 bg-card/75 p-4 shadow-xs">
                  <div className="mb-4">
                    <h2 className="text-sm font-semibold text-foreground">版本记录</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      每次生成课时计划或互动大屏后，都会在这里留下记录，并可恢复为当前版本。
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
                      <StateNotice
                        description="每次课时计划或互动大屏生成都会在这里形成快照。"
                        layout="center"
                        title="暂无版本"
                      />
                    )}
                  </div>
                </ScrollArea>

                <div className="min-h-0 overflow-hidden rounded-2xl border border-border/80 bg-card/90 shadow-xs">
                  {selectedVersion ? (
                    <div className="flex h-full flex-col">
                      <div className="flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-border/75 bg-background/35 px-5 py-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="truncate text-sm font-semibold text-foreground">
                              {selectedVersion.title}
                            </h2>
                            <Badge variant="secondary">
                              {selectedVersion.stage === "lesson" ? "课时计划" : "互动大屏"}
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
                          <ArtifactTextViewer content={selectedVersion.content} />
                        ) : selectedVersion.status === "streaming" ? (
                          <HtmlGenerationPanel
                            code={selectedVersion.content}
                            hasPreviousPreview={hasHtml}
                            trace={selectedVersion.trace}
                          />
                        ) : selectedVersion.stage === "html" && !selectedVersion.htmlPages?.length ? (
                          <StateNotice
                            className="m-4 flex h-[calc(100%-2rem)] items-center justify-center"
                            description="该版本缺少页级数据，已不再支持按新编辑链路预览。请重新生成互动大屏。"
                            layout="center"
                            title="版本不可预览"
                          />
                        ) : selectedVersion.content.trim() ? (
                          <IframeSandbox htmlContent={selectedVersion.content} />
                        ) : (
                          <StateNotice
                            className="m-4 flex h-[calc(100%-2rem)] items-center justify-center"
                            description={"\u5927\u5c4f\u5185\u5bb9\u4e3a\u7a7a\u3002"}
                            layout="center"
                            title={"\u6682\u65e0\u9884\u89c8"}
                          />
                        )}
                      </div>
                    </div>
                  ) : (
                    <StateNotice
                      className="m-4 flex h-[calc(100%-2rem)] items-center justify-center"
                      description="选择一个版本以查看详细内容。"
                      layout="center"
                      title="等待选择版本"
                    />
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
