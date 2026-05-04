import type {
  ArtifactView,
  UiHint,
  UiHintToastLevel,
  WorkflowTraceData,
} from "@/lib/lesson/authoring-contract";

export type ArtifactUiHintHandlers = {
  scrollToTarget?: (target: "artifact-top" | "artifact-content" | "versions-panel") => void;
  setView: (view: ArtifactView) => void;
  showToast?: (input: {
    description?: string;
    level: UiHintToastLevel;
    title: string;
  }) => void;
  triggerPrint?: (target: "lesson") => void;
};

type UiHintSignatureTrace =
  Pick<WorkflowTraceData, "requestId"> &
  Partial<Pick<WorkflowTraceData, "uiHints">>;

export function createUiHintSignature(
  trace: UiHintSignatureTrace | undefined,
) {
  if (!trace || !trace.uiHints || trace.uiHints.length === 0) {
    return undefined;
  }

  return `${trace.requestId}:${JSON.stringify(trace.uiHints)}`;
}

export function applyUiHint(
  hint: UiHint,
  handlers: ArtifactUiHintHandlers,
) {
  switch (hint.action) {
    case "switch_tab":
      handlers.setView(hint.params.tab);
      return;

    case "show_toast":
      handlers.showToast?.({
        level: hint.params.level,
        title: hint.params.title,
        ...(hint.params.description ? { description: hint.params.description } : {}),
      });
      return;

    case "trigger_print":
      handlers.triggerPrint?.(hint.params.target);
      return;

    case "scroll_to":
      handlers.scrollToTarget?.(hint.params.target);
      return;

    default: {
      const exhaustiveCheck: never = hint;
      return exhaustiveCheck;
    }
  }
}

export function applyUiHints(
  hints: UiHint[],
  handlers: ArtifactUiHintHandlers,
) {
  hints.forEach((hint) => applyUiHint(hint, handlers));
}
