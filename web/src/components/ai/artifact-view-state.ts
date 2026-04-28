import type { ArtifactLifecycle } from "@/components/ai/artifact-model";

export type ArtifactView = "lesson" | "canvas" | "versions";

export type LessonArtifactDisplayState = {
  hasLesson: boolean;
  isJsonStream: boolean;
  isPendingStream: boolean;
  isStreamActive: boolean;
  shouldShowPrintFrame: boolean;
  shouldShowWorkspace: boolean;
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

  return {
    hasLesson,
    isJsonStream,
    isPendingStream,
    isStreamActive,
    shouldShowPrintFrame,
    shouldShowWorkspace: hasLesson || isPendingStream,
  };
}

export function getHtmlArtifactDisplayState(
  lifecycle: ArtifactLifecycle,
  isHtmlGenerationPending = false,
): HtmlArtifactDisplayState {
  const hasHtml = Boolean(lifecycle.html.trim());
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
