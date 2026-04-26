import { describe, expect, it } from "vitest";

import type { SmartEduUIMessage } from "@/lib/lesson-authoring-contract";

import { buildAssistantProcessState } from "./assistant-process-events";

describe("assistant-process-events", () => {
  it("会把 workflow trace 转换为人类可读的过程事件", () => {
    const message = {
      id: "assistant-1",
      role: "assistant",
      parts: [
        {
          type: "data-trace",
          id: "trace-1",
          data: {
            protocolVersion: "structured-v1",
            requestId: "request-1",
            mode: "lesson",
            phase: "generation",
            responseTransport: "structured-data-part",
            requestedMarket: "cn-compulsory-2022",
            resolvedMarket: "cn-compulsory-2022",
            warnings: [],
            updatedAt: "2026-04-26T00:00:00.000Z",
            trace: [
              {
                step: "retrieve-standards-context",
                status: "success",
                detail: "目标市场 cn-compulsory-2022 已解析，命中 1 条课标条目。",
              },
              {
                step: "agent-tool-call",
                status: "running",
                detail: "触发工具 searchStandardsTool。",
              },
            ],
          },
        },
      ],
    } as SmartEduUIMessage;

    const state = buildAssistantProcessState(message);

    expect(state.isStreaming).toBe(true);
    expect(state.events).toEqual([
      expect.objectContaining({
        kind: "workflow",
        status: "complete",
        title: "检索课程标准",
      }),
      expect.objectContaining({
        kind: "tool",
        status: "active",
        title: "调用工具",
      }),
    ]);
  });

  it("会识别 reasoning 文本", () => {
    const message = {
      id: "assistant-2",
      role: "assistant",
      parts: [
        {
          type: "reasoning",
          text: "先分析年级与教材。",
        },
      ],
    } as SmartEduUIMessage;

    const state = buildAssistantProcessState(message);

    expect(state.hasReasoning).toBe(true);
    expect(state.reasoningText).toContain("先分析年级");
  });
});
