import { describe, expect, it } from "vitest";

import { buildArtifactLifecycle } from "@/components/ai/artifact-model";
import {
  getArtifactDefaultView,
  getHtmlArtifactDisplayState,
  getLessonArtifactDisplayState,
  reconcileArtifactViewForLifecycle,
} from "@/components/ai/artifact-view-state";
import { DEFAULT_COMPETITION_LESSON_PLAN } from "@/lib/competition-lesson-contract";
import type { SmartEduUIMessage } from "@/lib/lesson-authoring-contract";

describe("artifact-view-state", () => {
  function createReadyLessonMessage() {
    return {
      id: "assistant-lesson-ready",
      role: "assistant",
      parts: [
        {
          type: "data-artifact",
          id: "artifact",
          data: {
            protocolVersion: "structured-v1",
            stage: "lesson",
            contentType: "lesson-json",
            content: JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN),
            isComplete: true,
            status: "ready",
            source: "data-part",
            updatedAt: "2026-04-25T12:10:00.000Z",
          },
        },
      ],
    } as SmartEduUIMessage;
  }

  function createHtmlMessage(status: "streaming" | "ready") {
    return {
      id: `assistant-html-${status}`,
      role: "assistant",
      parts: [
        {
          type: "data-artifact",
          id: "artifact",
          data: {
            protocolVersion: "structured-v1",
            stage: "html",
            contentType: "html",
            content: "<!DOCTYPE html><html lang=\"zh-CN\"><body><h1>Screen</h1></body></html>",
            isComplete: status === "ready",
            status,
            source: "data-part",
            updatedAt: "2026-04-25T12:15:00.000Z",
          },
        },
      ],
    } as SmartEduUIMessage;
  }

  it("routes submitted lesson requests into the streaming workspace before first chunk", () => {
    const userMessage = {
      id: "user-lesson",
      role: "user",
      parts: [{ type: "text", text: "Generate a PE lesson." }],
    } as SmartEduUIMessage;

    const lifecycle = buildArtifactLifecycle([userMessage], "submitted", false, []);
    const displayState = getLessonArtifactDisplayState(lifecycle);

    expect(displayState).toMatchObject({
      hasLesson: false,
      isJsonStream: false,
      isPendingStream: true,
      isStreamActive: true,
      panelDescription: "正在等待结构化课时计划首包。",
      panelTitle: "课时计划生成中",
      shouldShowPrintFrame: false,
      shouldShowWorkspace: true,
      viewerEmptyDescription: "请求已提交，右侧会在收到首段结构化内容后开始展示。",
      viewerEmptyTitle: "等待结构化首包",
    });
  });

  it("没有 data-artifact 时会保持等待结构化首包的流式工作区", () => {
    const assistantMessage = {
      id: "assistant-lesson-text-stream",
      role: "assistant",
      parts: [
        {
          type: "text",
          text: "{\"title\":\"Wushu lesson\",\"meta\":",
          state: "streaming",
        },
      ],
    } as SmartEduUIMessage;

    const lifecycle = buildArtifactLifecycle([assistantMessage], "streaming", false, []);
    const displayState = getLessonArtifactDisplayState(lifecycle);

    expect(displayState).toMatchObject({
      hasLesson: false,
      isJsonStream: false,
      isPendingStream: true,
      isStreamActive: true,
      panelDescription: "正在等待结构化课时计划首包。",
      panelTitle: "课时计划生成中",
      shouldShowPrintFrame: false,
      shouldShowWorkspace: true,
      viewerEmptyDescription: "请求已提交，右侧会在收到首段结构化内容后开始展示。",
      viewerEmptyTitle: "等待结构化首包",
    });
  });

  it("uses the print frame only after a ready lesson plan is parsed", () => {
    const lifecycle = buildArtifactLifecycle([createReadyLessonMessage()], "ready", false, []);
    const displayState = getLessonArtifactDisplayState(lifecycle);

    expect(displayState).toMatchObject({
      hasLesson: true,
      isStreamActive: false,
      panelDescription: "固定 A4 模板，修改请在左侧对话提出。",
      panelTitle: "课时计划预览",
      shouldShowPrintFrame: true,
      shouldShowWorkspace: true,
    });
  });

  it("uses the print frame for schema-valid streaming lesson drafts", () => {
    const streamingDraftMessage = {
      ...createReadyLessonMessage(),
      id: "assistant-lesson-streaming-draft",
      parts: [
        {
          type: "data-artifact",
          id: "artifact",
          data: {
            protocolVersion: "structured-v1",
            stage: "lesson",
            contentType: "lesson-json",
            content: JSON.stringify({
              ...DEFAULT_COMPETITION_LESSON_PLAN,
              title: "课时计划生成中",
            }),
            isComplete: false,
            status: "streaming",
            source: "data-part",
            updatedAt: "2026-04-25T12:10:00.000Z",
          },
        },
      ],
    } as SmartEduUIMessage;

    const lifecycle = buildArtifactLifecycle([streamingDraftMessage], "streaming", false, []);
    const displayState = getLessonArtifactDisplayState(lifecycle);

    expect(displayState).toMatchObject({
      hasLesson: true,
      isStreamActive: true,
      panelDescription: "正在持续补全结构化课时计划，右侧预览会随内容同步刷新。",
      panelTitle: "课时计划预览",
      shouldShowPrintFrame: true,
      shouldShowWorkspace: true,
    });
  });

  it("keeps the start guide before any lesson request exists", () => {
    const lifecycle = buildArtifactLifecycle([], "ready", false, []);
    const displayState = getLessonArtifactDisplayState(lifecycle);

    expect(displayState).toMatchObject({
      hasLesson: false,
      isStreamActive: false,
      panelDescription: "固定 A4 模板，修改请在左侧对话提出。",
      panelTitle: "课时计划预览",
      shouldShowPrintFrame: false,
      shouldShowWorkspace: false,
    });
  });

  it("routes a confirmed HTML request to the canvas before the first source chunk", () => {
    const lifecycle = buildArtifactLifecycle([createReadyLessonMessage()], "submitted", true, []);
    const htmlDisplay = getHtmlArtifactDisplayState(lifecycle, true);

    expect(htmlDisplay).toMatchObject({
      hasHtml: false,
      isPendingRequest: true,
      isStreaming: false,
      shouldShowGenerationPanel: true,
    });
    expect(getArtifactDefaultView(lifecycle, true)).toBe("canvas");
    expect(reconcileArtifactViewForLifecycle("lesson", lifecycle, true)).toBe("canvas");
  });

  it("keeps the canvas selected while HTML is streaming", () => {
    const lifecycle = buildArtifactLifecycle(
      [createReadyLessonMessage(), createHtmlMessage("streaming")],
      "streaming",
      true,
      [],
    );
    const htmlDisplay = getHtmlArtifactDisplayState(lifecycle, true);

    expect(htmlDisplay).toMatchObject({
      hasHtml: false,
      isPendingRequest: false,
      isStreaming: true,
      shouldShowGenerationPanel: true,
    });
    expect(getArtifactDefaultView(lifecycle, true)).toBe("canvas");
    expect(reconcileArtifactViewForLifecycle("lesson", lifecycle, true)).toBe("canvas");
  });

  it("moves a stale lesson tab to canvas after ready HTML exists without stealing versions", () => {
    const lifecycle = buildArtifactLifecycle(
      [createReadyLessonMessage(), createHtmlMessage("ready")],
      "ready",
      true,
      [],
    );

    expect(getArtifactDefaultView(lifecycle)).toBe("canvas");
    expect(reconcileArtifactViewForLifecycle("lesson", lifecycle)).toBe("canvas");
    expect(reconcileArtifactViewForLifecycle("versions", lifecycle)).toBe("versions");
  });
});
