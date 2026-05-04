import { describe, expect, it } from "vitest";

import { getAssistantChronologicalRenderItems } from "@/components/ai/SmartEduMessageParts";
import type { SmartEduUIMessage } from "@/lib/lesson/authoring-contract";

function createMessage(parts: SmartEduUIMessage["parts"]): SmartEduUIMessage {
  return {
    id: "assistant-message",
    role: "assistant",
    parts,
  };
}

describe("SmartEduMessageParts", () => {
  it("按模型返回的原始顺序渲染文本、reasoning、工具、Artifact 和 Trace", () => {
    const message = createMessage([
      { type: "reasoning", text: "先判断任务。", state: "done" },
      {
        type: "tool-analyze_requirements",
        toolCallId: "call-1",
        state: "input-available",
        input: { request: "你好" },
      } as SmartEduUIMessage["parts"][number],
      { type: "text", text: "老师您好。" },
      {
        type: "data-artifact",
        id: "artifact-old",
        data: {
          protocolVersion: "structured-v1",
          stage: "lesson",
          contentType: "lesson-json",
          content: "{}",
          isComplete: false,
          status: "streaming",
          source: "data-part",
          updatedAt: "2026-04-29T00:00:00.000Z",
        },
      },
      {
        type: "data-trace",
        id: "trace-old",
        data: {
          protocolVersion: "structured-v1",
          requestId: "request-1",
          mode: "lesson",
          phase: "generation",
          responseTransport: "structured-data-part",
          requestedMarket: "cn-compulsory-2022",
          resolvedMarket: "cn-compulsory-2022",
          warnings: [],
          uiHints: [],
          trace: [],
          updatedAt: "2026-04-29T00:00:00.000Z",
        },
      },
      { type: "text", text: "请告诉我您要生成还是修改。" },
      {
        type: "data-artifact",
        id: "artifact-new",
        data: {
          protocolVersion: "structured-v1",
          stage: "lesson",
          contentType: "lesson-json",
          content: "{}",
          isComplete: true,
          status: "ready",
          source: "data-part",
          updatedAt: "2026-04-29T00:00:01.000Z",
        },
      },
      {
        type: "data-trace",
        id: "trace-new",
        data: {
          protocolVersion: "structured-v1",
          requestId: "request-1",
          mode: "lesson",
          phase: "completed",
          responseTransport: "structured-data-part",
          requestedMarket: "cn-compulsory-2022",
          resolvedMarket: "cn-compulsory-2022",
          warnings: [],
          uiHints: [],
          trace: [],
          updatedAt: "2026-04-29T00:00:01.000Z",
        },
      },
    ]);

    expect(getAssistantChronologicalRenderItems(message)).toEqual([
      { index: 0, kind: "reasoning" },
      { index: 1, kind: "tool" },
      { index: 6, kind: "artifact" },
      { index: 7, kind: "trace" },
    ]);
  });

  it("没有 ready Artifact 时，工具后的自然语言仍保留在工具后面", () => {
    const message = createMessage([
      {
        type: "tool-searchStandards",
        toolCallId: "call-1",
        state: "output-available",
        input: { query: "篮球" },
        output: { references: [] },
      } as SmartEduUIMessage["parts"][number],
      { type: "text", text: "我已查到相关依据，接下来可以生成教案。" },
    ]);

    expect(getAssistantChronologicalRenderItems(message)).toEqual([
      { index: 0, kind: "tool" },
      { index: 1, kind: "text" },
    ]);
  });
});
