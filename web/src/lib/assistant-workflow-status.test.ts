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
    expect(state.title).toBe("生成结构化课时计划");
    expect(state.status).toBe("active");
    expect(state.details).toEqual([
      expect.objectContaining({
        status: "complete",
        title: "检索课程标准",
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

  it("纯聊天兼容 trace 不显示为课时计划工作流", () => {
    const message = {
      id: "assistant-text-only",
      role: "assistant",
      parts: [
        {
          type: "text",
          text: "老师您好，我可以帮您生成课时计划、修改教案或设计互动大屏。",
        },
        {
          type: "data-trace",
          id: "trace-text-only",
          data: {
            protocolVersion: "structured-v1",
            requestId: "request-text-only",
            mode: "lesson",
            phase: "completed",
            responseTransport: "structured-data-part",
            requestedMarket: "cn-compulsory-2022",
            resolvedMarket: "cn-compulsory-2022",
            warnings: [],
            uiHints: [],
            updatedAt: "2026-04-26T00:00:00.000Z",
            trace: [
              {
                step: "agentic-entry",
                status: "success",
                detail: "已进入旧版 Agentic 自主工具编排模式。",
              },
              {
                step: "agent-text-response",
                status: "success",
                detail: "Agent 已返回自然语言答复，本轮未提交结构化课时计划。",
              },
            ],
          },
        },
      ],
    } as SmartEduUIMessage;

    const state = buildAssistantWorkflowState(message);

    expect(state.hasWorkflow).toBe(false);
    expect(state.details).toEqual([]);
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

  it("会把 Repair Pass 的步骤映射为可读中文标题", () => {
    const message = {
      id: "assistant-4",
      role: "assistant",
      parts: [
        {
          type: "data-trace",
          id: "trace-2",
          data: {
            protocolVersion: "structured-v1",
            requestId: "request-2",
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
                step: "lesson-repair-started",
                status: "running",
                detail: "正在自动完善结构化课时计划。",
              },
            ],
          },
        },
      ],
    } as SmartEduUIMessage;

    const state = buildAssistantWorkflowState(message);

    expect(state.details).toEqual([
      expect.objectContaining({
        status: "active",
        title: "自动修复课时计划",
      }),
    ]);
  });

  it("会把服务端确定性管线 trace 显示为左侧工作流步骤", () => {
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
        title: "进入服务端管线",
        status: "complete",
      }),
      expect.objectContaining({
        title: "服务端检索课标",
        status: "complete",
      }),
      expect.objectContaining({
        title: "流式生成草稿",
        status: "active",
      }),
    ]);
  });
});
