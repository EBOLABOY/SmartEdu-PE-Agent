import { describe, expect, it, vi } from "vitest";

import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

import { enrichWorkflowWithServerStandards } from "./server_standards_enrichment";

function createBaseWorkflow(): LessonWorkflowOutput {
  return {
    system: "基础生成提示。",
    standardsContext: "课标检索由服务端生成管线在正式生成前执行。",
    standards: {
      requestedMarket: "cn-compulsory-2022",
      resolvedMarket: "cn-compulsory-2022",
      corpus: null,
      referenceCount: 0,
      references: [],
      warning: "正式生成前将由服务端主动检索课标并注入结构化生成提示。",
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

describe("server standards enrichment", () => {
  it("retrieves standards before generation and injects them into workflow system prompt", async () => {
    const retriever = vi.fn().mockResolvedValue({
      requestedMarket: "cn-compulsory-2022",
      resolvedMarket: "cn-compulsory-2022",
      corpus: {
        availability: "ready",
        corpusId: "cn-compulsory-2022",
        displayName: "义务教育体育与健康课程标准",
        issuer: "教育部",
        url: "https://example.com/standards.pdf",
        version: "2022",
      },
      references: [
        {
          id: "std-wushu-1",
          title: "水平三武术内容要求",
          summary: "学练长拳基本功、基本动作和套路，并描述基本要领。",
          source: "义务教育体育与健康课程标准",
          officialVersion: "2022",
          gradeBands: ["5-6年级"],
          module: "中华传统体育类运动",
          sectionPath: ["运动技能", "武术"],
          keywords: ["长拳", "套路"],
          requirements: ["学练长拳基本功。"],
          teachingImplications: ["采用结构化技能教学。"],
          citation: "课程标准 第99页",
          score: 0.91,
        },
      ],
      context: "水平三武术内容要求：学练长拳基本功、基本动作和套路。",
    });

    const workflow = await enrichWorkflowWithServerStandards({
      market: "cn-compulsory-2022",
      query: "帮我生成一个六年级武术长拳课时计划",
      retriever,
      workflow: createBaseWorkflow(),
    });

    expect(retriever).toHaveBeenCalledWith({
      market: "cn-compulsory-2022",
      query: "帮我生成一个六年级武术长拳课时计划",
    });
    expect(workflow.standardsContext).toContain("水平三武术内容要求");
    expect(workflow.system).toContain("服务端已在正式生成前检索体育课程标准");
    expect(workflow.system).toContain("水平三武术内容要求");
    expect(workflow.standards.referenceCount).toBe(1);
    expect(workflow.standards.references).toEqual([
      expect.objectContaining({
        id: "std-wushu-1",
        title: "水平三武术内容要求",
        citation: "课程标准 第99页",
      }),
    ]);
    expect(workflow.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          step: "server-standards-retrieval",
          status: "success",
        }),
      ]),
    );
  });

  it("keeps generation deterministic when retrieval fails by injecting an honest fallback context", async () => {
    const workflow = await enrichWorkflowWithServerStandards({
      query: "帮我生成一个六年级武术长拳课时计划",
      retriever: vi.fn().mockRejectedValue(new Error("vector store unavailable")),
      workflow: createBaseWorkflow(),
    });

    expect(workflow.standardsContext).toContain("本轮检索失败");
    expect(workflow.standards.referenceCount).toBe(0);
    expect(workflow.standards.references).toEqual([]);
    expect(workflow.standards.warning).toContain("vector store unavailable");
    expect(workflow.system).toContain("检索失败原因：vector store unavailable");
    expect(workflow.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          step: "server-standards-retrieval",
          status: "blocked",
          detail: expect.stringContaining("vector store unavailable"),
        }),
      ]),
    );
  });
});
