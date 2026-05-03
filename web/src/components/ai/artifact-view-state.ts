import type { ArtifactLifecycle } from "@/components/ai/artifact-model";
import type { ArtifactView } from "@/lib/lesson-authoring-contract";

export type LessonArtifactDisplayState = {
  hasLesson: boolean;
  isJsonStream: boolean;
  isPendingStream: boolean;
  isStreamActive: boolean;
  panelDescription: string;
  panelTitle: string;
  shouldShowPrintFrame: boolean;
  shouldShowWorkspace: boolean;
  viewerEmptyDescription?: string;
  viewerEmptyTitle?: string;
};

export type HtmlArtifactDisplayState = {
  hasHtml: boolean;
  isPendingRequest: boolean;
  isStreaming: boolean;
  shouldShowGenerationPanel: boolean;
};

export function getLessonArtifactDisplayState(
  lifecycle: ArtifactLifecycle,
): LessonArtifactDisplayState {
  const hasLesson = Boolean(lifecycle.lessonPlan || lifecycle.lessonContent.trim());
  const isStreamActive = lifecycle.stage === "lesson" && lifecycle.status === "streaming";
  const isPendingStream =
    isStreamActive && !hasLesson;
  const isJsonStream =
    isStreamActive &&
    lifecycle.activeArtifact?.contentType === "lesson-json" &&
    !lifecycle.lessonPlan;
  const shouldShowPrintFrame = Boolean(lifecycle.lessonPlan);

  let panelTitle = "课时计划预览";
  let panelDescription = "固定 A4 模板，修改请在左侧对话提出。";
  let viewerEmptyTitle: string | undefined;
  let viewerEmptyDescription: string | undefined;

  if (shouldShowPrintFrame && isStreamActive) {
    panelDescription = "正在持续补全结构化课时计划，右侧预览会随内容同步刷新。";
  } else if (!shouldShowPrintFrame && isStreamActive) {
    panelTitle = "课时计划生成中";
    panelDescription = isJsonStream
      ? "正在接收结构化课时计划数据，首包通过解析后会进入预览。"
      : "正在等待结构化课时计划首包。";
    viewerEmptyTitle = "等待结构化首包";
    viewerEmptyDescription = "请求已提交，右侧会在收到首段结构化内容后开始展示。";
  }

  return {
    hasLesson,
    isJsonStream,
    isPendingStream,
    isStreamActive,
    panelDescription,
    panelTitle,
    shouldShowPrintFrame,
    shouldShowWorkspace: hasLesson || isPendingStream,
    viewerEmptyDescription,
    viewerEmptyTitle,
  };
}

export function getHtmlArtifactDisplayState(
  lifecycle: ArtifactLifecycle,
  isHtmlGenerationPending = false,
): HtmlArtifactDisplayState {
  const hasHtml = Boolean(lifecycle.html.trim() && lifecycle.htmlPages?.length);
  const isStreaming = lifecycle.stage === "html" && lifecycle.isHtmlStreaming;
  const isPendingRequest = isHtmlGenerationPending && !isStreaming && !hasHtml;

  return {
    hasHtml,
    isPendingRequest,
    isStreaming,
    shouldShowGenerationPanel: isStreaming || isPendingRequest,
  };
}

export function getArtifactDefaultView(
  lifecycle: ArtifactLifecycle,
  isHtmlGenerationPending = false,
): ArtifactView {
  const htmlDisplay = getHtmlArtifactDisplayState(lifecycle, isHtmlGenerationPending);

  return lifecycle.stage === "html" ||
    htmlDisplay.hasHtml ||
    htmlDisplay.shouldShowGenerationPanel
    ? "canvas"
    : "lesson";
}

export function reconcileArtifactViewForLifecycle(
  currentView: ArtifactView | null,
  lifecycle: ArtifactLifecycle,
  isHtmlGenerationPending = false,
): ArtifactView | null {
  if (
    currentView === "lesson" &&
    getArtifactDefaultView(lifecycle, isHtmlGenerationPending) === "canvas"
  ) {
    return "canvas";
  }

  return currentView;
}
