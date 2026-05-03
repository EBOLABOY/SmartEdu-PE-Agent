import { describe, expect, it, vi } from "vitest";

import type { TextbookSearchResult } from "@/mastra/knowledge/provider-types";
import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

import {
  createServerTextbookPendingWorkflow,
  resolveWorkflowWithServerTextbook,
} from "./server_textbook_enrichment";

function createBaseWorkflow(): LessonWorkflowOutput {
  return {
    system: "基础生成提示。",
    standardsContext: "课标上下文。",
    standards: {
      requestedMarket: "cn-compulsory-2022",
      resolvedMarket: "cn-compulsory-2022",
      corpus: null,
      referenceCount: 0,
      references: [],
    },
    generationPlan: {
      mode: "lesson",
      confirmedLessonRequired: false,
      outputProtocol: "lesson-json",
      responseTransport: "structured-data-part",
      assistantTextPolicy: "mirror-json-text",
      maxSteps: 7,
      protocolVersion: "structured-v1",
    },
    safety: {
      htmlSandboxRequired: false,
      externalNetworkAllowed: false,
      forbiddenCapabilities: [],
      warnings: [],
    },
    uiHints: [],
    decision: {
      type: "generate",
      intentResult: {
        intent: "generate_lesson",
        confidence: 1,
        reason: "用户要求生成课时计划。",
      },
    },
    trace: [
      {
        detail: "进入服务端生成管线。",
        status: "success",
        step: "server-deterministic-entry",
        timestamp: "2026-04-30T00:00:00.000Z",
      },
    ],
  };
}

describe("server textbook enrichment", () => {
  it("creates a pending workflow state without duplicating retrieval trace entries", () => {
    const pending = createServerTextbookPendingWorkflow({
      ...createBaseWorkflow(),
      trace: [
        ...createBaseWorkflow().trace,
        {
          detail: "旧的教材检索状态。",
          status: "blocked",
          step: "server-textbook-retrieval",
          timestamp: "2026-04-30T00:00:00.000Z",
        },
      ],
    });

    const retrievalTraces = pending.trace.filter((entry) => entry.step === "server-textbook-retrieval");

    expect(retrievalTraces).toHaveLength(1);
    expect(retrievalTraces[0]).toEqual(
      expect.objectContaining({
        status: "running",
        detail: expect.stringContaining("正在服务端检索教材正文"),
      }),
    );
  });

  it("retrieves textbook context before generation and injects it into workflow system prompt", async () => {
    const retriever = vi.fn().mockResolvedValue({
      market: "cn-compulsory-2022",
      stage: "小学",
      publisher: "人教版",
      grade: "三年级",
      references: [
        {
          id: "textbook-basketball-1",
          title: "篮球 - 三年级 - 第 10-12 页",
          summary: "小篮球教材强调熟悉球性、控制运球和在游戏中提升移动能力。",
          bodyExcerpt: "教材正文节选。",
          citation: "人教版体育与健康三年级，第 10-12 页",
          publisher: "人教版",
          textbookName: "义务教育教科书体育与健康三年级",
          edition: "三年级",
          grade: "三年级",
          level: null,
          module: "篮球",
          sectionPath: ["人教版", "篮球"],
          keywords: ["篮球", "运球"],
          sourceKind: "textbook-body",
          sportItem: "篮球",
          teachingAnalysis: ["运球学习应从球性熟悉过渡到行进间控制。"],
          technicalPoints: ["手指自然分开，按拍球的后上方。"],
          teachingSuggestions: ["采用游戏和接力组织练习。"],
          safetyNotes: ["保持前后左右安全距离。"],
          score: 90,
        },
      ],
      context: "教材正文上下文：小篮球教材强调熟悉球性、控制运球和游戏化练习。",
    });

    const result = await resolveWorkflowWithServerTextbook({
      grade: "三年级",
      publisher: "人教版",
      query: "帮我生成一个三年级篮球运球课时计划",
      retriever,
      workflow: createBaseWorkflow(),
    });
    const { workflow } = result;

    expect(retriever).toHaveBeenCalledWith({
      grade: "三年级",
      market: undefined,
      publisher: "人教版",
      query: "帮我生成一个三年级篮球运球课时计划",
      stage: undefined,
    });
    expect(result.outcome).toBe("success");
    expect(workflow.textbook).toMatchObject({
      market: "cn-compulsory-2022",
      stage: "小学",
      publisher: "人教版",
      grade: "三年级",
      referenceCount: 1,
      references: [
        expect.objectContaining({
          citation: "人教版体育与健康三年级，第 10-12 页",
          publisher: "人教版",
          textbookName: "义务教育教科书体育与健康三年级",
        }),
      ],
    });
    expect(workflow.system).toContain("服务端已在正式生成前检索体育与健康教材正文");
    expect(workflow.system).toContain("教材分析必须在末尾单独写出“教材依据");
    expect(workflow.system).toContain("小篮球教材强调熟悉球性");
    expect(workflow.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          step: "server-textbook-retrieval",
          status: "success",
        }),
      ]),
    );
  });

  it("keeps generation deterministic when textbook retrieval fails by injecting an honest fallback context", async () => {
    const result = await resolveWorkflowWithServerTextbook({
      query: "帮我生成一个三年级篮球运球课时计划",
      retriever: vi.fn().mockRejectedValue(new Error("textbook vector store unavailable")),
      workflow: createBaseWorkflow(),
    });
    const { workflow } = result;

    expect(result.outcome).toBe("failure");
    expect(workflow.system).toContain("本轮检索失败");
    expect(workflow.system).toContain("不要虚构教材出处");
    expect(workflow.system).toContain("textbook vector store unavailable");
    expect(workflow.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          step: "server-textbook-retrieval",
          status: "blocked",
          detail: expect.stringContaining("textbook vector store unavailable"),
        }),
      ]),
    );
  });

  it("falls back when textbook retrieval exceeds the configured timeout", async () => {
    const result = await resolveWorkflowWithServerTextbook({
      query: "帮我生成一个三年级篮球运球课时计划",
      retriever: vi.fn(
        () =>
          new Promise<TextbookSearchResult>((resolve) => {
            setTimeout(() => {
              resolve({
                market: "cn-compulsory-2022",
                stage: "小学",
                references: [],
                context: "迟到的教材上下文。",
              });
            }, 50);
          }),
      ),
      timeoutMs: 5,
      workflow: createBaseWorkflow(),
    });
    const { workflow } = result;

    expect(result.outcome).toBe("failure");
    expect(workflow.system).toContain("教材检索超过 5ms");
    expect(workflow.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          step: "server-textbook-retrieval",
          status: "blocked",
          detail: expect.stringContaining("教材检索超过 5ms"),
        }),
      ]),
    );
  });
});
