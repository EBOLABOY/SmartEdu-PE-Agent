import { describe, expect, it, vi } from "vitest";

import {
  applyUiHints,
  createUiHintSignature,
} from "@/components/ai/artifact-ui-hints";

describe("artifact-ui-hints", () => {
  it("会基于 requestId 与 uiHints 生成稳定签名", () => {
    const traceWithoutUiHints: Parameters<typeof createUiHintSignature>[0] = {
      requestId: "request-1",
    };

    expect(createUiHintSignature(undefined)).toBeUndefined();
    expect(
      createUiHintSignature({
        requestId: "request-1",
        uiHints: [],
      }),
    ).toBeUndefined();
    expect(createUiHintSignature(traceWithoutUiHints)).toBeUndefined();
    expect(
      createUiHintSignature({
        requestId: "request-1",
        uiHints: [
          {
            action: "switch_tab",
            params: {
              tab: "canvas",
            },
          },
        ],
      }),
    ).toBe("request-1:[{\"action\":\"switch_tab\",\"params\":{\"tab\":\"canvas\"}}]");
  });

  it("会按顺序执行 switch_tab、show_toast、trigger_print 与 scroll_to", () => {
    const setView = vi.fn();
    const showToast = vi.fn();
    const triggerPrint = vi.fn();
    const scrollToTarget = vi.fn();

    applyUiHints(
      [
        {
          action: "switch_tab",
          params: {
            tab: "lesson",
          },
        },
        {
          action: "show_toast",
          params: {
            level: "success",
            title: "已切换到课时计划",
            description: "当前正在展示结构化课时计划。",
          },
        },
        {
          action: "trigger_print",
          params: {
            target: "lesson",
          },
        },
        {
          action: "scroll_to",
          params: {
            target: "artifact-content",
          },
        },
      ],
      {
        scrollToTarget,
        setView,
        showToast,
        triggerPrint,
      },
    );

    expect(setView).toHaveBeenCalledWith("lesson");
    expect(showToast).toHaveBeenCalledWith({
      level: "success",
      title: "已切换到课时计划",
      description: "当前正在展示结构化课时计划。",
    });
    expect(triggerPrint).toHaveBeenCalledWith("lesson");
    expect(scrollToTarget).toHaveBeenCalledWith("artifact-content");
  });
});
