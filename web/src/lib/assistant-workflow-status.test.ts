import { describe, expect, it } from "vitest";

import type { SmartEduUIMessage } from "@/lib/lesson-authoring-contract";

import { buildAssistantWorkflowState } from "./assistant-workflow-status";

describe("assistant-workflow-status", () => {
  it("会把 workflow trace 转换为轻量业务状态，并忽略 AI SDK 已接管的工具轨迹", () => {
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
            uiHints: [],
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
                detail: "触发工具 searchStandards。",
              },
            ],
          },
        },
      ],
    } as SmartEduUIMessage;

    const state = buildAssistantWorkflowState(message);

    expect(state.isStreaming).toBe(true);
    expect(state.title).toBe("生成课时计划");
    expect(state.status).toBe("active");
    expect(state.details).toEqual([
      expect.objectContaining({
        status: "complete",
        title: "查找课程标准",
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

    const state = buildAssistantWorkflowState(message);

    expect(state.hasReasoning).toBe(true);
    expect(state.reasoningText).toContain("先分析年级");
  });

  it("会把 blocked 作为需要注意的业务状态，而不是失败", () => {
    const message = {
      id: "assistant-3",
      role: "assistant",
      parts: [
        {
          type: "data-trace",
          id: "trace-1",
          data: {
            protocolVersion: "structured-v1",
            requestId: "request-1",
            mode: "html",
            phase: "completed",
            responseTransport: "structured-data-part",
            requestedMarket: "cn-compulsory-2022",
            resolvedMarket: "cn-compulsory-2022",
            warnings: ["持久化失败"],
            uiHints: [],
            updatedAt: "2026-04-26T00:00:00.000Z",
            trace: [
              {
                step: "persist-artifact-version",
                status: "blocked",
                detail: "Artifact 持久化失败，但主生成结果已保留。",
              },
            ],
          },
        },
      ],
    } as SmartEduUIMessage;

    const state = buildAssistantWorkflowState(message);

    expect(state.status).toBe("blocked");
    expect(state.badge).toBe("需注意");
    expect(state.warnings).toEqual(["持久化失败"]);
  });

  it("会把服务端确定性管线 trace 显示为老师能理解的左侧步骤", () => {
    const message = {
      id: "assistant-server-pipeline",
      role: "assistant",
      parts: [
        {
          type: "data-trace",
          id: "trace-server-pipeline",
          data: {
            protocolVersion: "structured-v1",
            requestId: "request-server-pipeline",
            mode: "lesson",
            phase: "generation",
            responseTransport: "structured-data-part",
            requestedMarket: "cn-compulsory-2022",
            resolvedMarket: "cn-compulsory-2022",
            warnings: [],
            uiHints: [],
            updatedAt: "2026-04-30T00:00:00.000Z",
            trace: [
              {
                step: "server-deterministic-entry",
                status: "success",
                detail: "已进入服务端课时计划结构化生成管线。",
              },
              {
                step: "server-standards-retrieval",
                status: "success",
                detail: "服务端已检索 2 条课标条目并注入结构化生成提示。",
              },
              {
                step: "stream-lesson-draft",
                status: "running",
                detail: "正在流式生成课时计划草稿。",
              },
            ],
          },
        },
      ],
    } as SmartEduUIMessage;

    const state = buildAssistantWorkflowState(message);

    expect(state.hasWorkflow).toBe(true);
    expect(state.status).toBe("active");
    expect(state.details).toEqual([
      expect.objectContaining({
        title: "准备生成教案",
        description: "正在根据你的要求生成课时计划。",
        status: "complete",
        debugStep: "server-deterministic-entry",
      }),
      expect.objectContaining({
        title: "查找课程标准",
        description: "已找到 2 条可参考的课程标准。",
        status: "complete",
        debugStep: "server-standards-retrieval",
      }),
      expect.objectContaining({
        title: "生成教案初稿",
        description: "右侧正在同步教案初稿。",
        status: "active",
        debugStep: "stream-lesson-draft",
      }),
    ]);
  });

  it("生成互动大屏时不会把服务端生成入口误显示为准备生成教案", () => {
    const message = {
      id: "assistant-server-html-pipeline",
      role: "assistant",
      parts: [
        {
          type: "data-trace",
          id: "trace-server-html-pipeline",
          data: {
            protocolVersion: "structured-v1",
            requestId: "request-server-html-pipeline",
            mode: "html",
            phase: "generation",
            responseTransport: "structured-data-part",
            requestedMarket: "cn-compulsory-2022",
            resolvedMarket: "cn-compulsory-2022",
            warnings: [],
            uiHints: [],
            updatedAt: "2026-04-30T00:00:00.000Z",
            trace: [
              {
                step: "server-deterministic-entry",
                status: "success",
                detail: "已进入服务端 HTML 流式生成管线，不再通过 Agent 工具提交 HTML。",
              },
            ],
          },
        },
      ],
    } as SmartEduUIMessage;

    const state = buildAssistantWorkflowState(message);

    expect(state.details).toEqual([
      expect.objectContaining({
        title: "准备生成互动大屏",
        description: "正在根据已确认的教案制作互动大屏。",
        status: "complete",
        debugStep: "server-deterministic-entry",
      }),
    ]);
  });

  it("课标检索为空时不向老师展示 embedding 等技术词", () => {
    const message = {
      id: "assistant-empty-standards",
      role: "assistant",
      parts: [
        {
          type: "data-trace",
          id: "trace-empty-standards",
          data: {
            protocolVersion: "structured-v1",
            requestId: "request-empty-standards",
            mode: "lesson",
            phase: "generation",
            responseTransport: "structured-data-part",
            requestedMarket: "cn-compulsory-2022",
            resolvedMarket: "cn-compulsory-2022",
            warnings: [],
            uiHints: [],
            updatedAt: "2026-04-30T00:00:00.000Z",
            trace: [
              {
                step: "server-standards-retrieval",
                status: "success",
                detail: "服务端已检索 0 条课标条目并注入结构化生成提示。",
              },
              {
                step: "server-standards-retrieval-warning",
                status: "blocked",
                detail: "课程标准语义检索当前未返回匹配条目；请先灌入带 embedding 的课标数据后再检索。",
              },
              {
                step: "validate-lesson-output",
                status: "success",
                detail: "结构化课时计划已通过最终 schema 检查。",
              },
              {
                step: "generation-finished",
                status: "success",
                detail: "课时计划 Artifact 已完成结构化封装。",
              },
            ],
          },
        },
      ],
    } as SmartEduUIMessage;

    const state = buildAssistantWorkflowState(message);
    const copy = state.details.map((detail) => `${detail.title} ${detail.description}`).join("\n");

    expect(copy).toContain("本次没有匹配到课程标准");
    expect(copy).toContain("教案内容已检查通过");
    expect(copy).toContain("课时计划已生成");
    expect(copy).not.toContain("embedding");
    expect(copy).not.toContain("schema");
    expect(copy).not.toContain("Artifact");
    expect(copy).not.toContain("服务端");
    expect(copy).not.toContain("结构化封装");
  });
});
