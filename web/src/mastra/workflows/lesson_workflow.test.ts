import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resetStandardsRetrievalProvider,
  setStandardsRetrievalProvider,
} from "@/mastra/knowledge/provider-registry";
import { createLessonAuthoringWorkflow } from "@/mastra/workflows/lesson_workflow";

function createIntentResult(
  intent: "clarify" | "generate_lesson" | "patch_lesson" | "generate_html" | "consult_standards",
  reason = "用户意图明确。",
  confidence = 0.92,
) {
  return {
    intent,
    confidence,
    reason,
  };
}

function createUserMessage(text: string) {
  return {
    id: "user-1",
    role: "user" as const,
    parts: [{ type: "text" as const, text }],
  };
}

describe("lesson-workflow", () => {
  afterEach(() => {
    resetStandardsRetrievalProvider();
  });

  it("generate_lesson 进入生成分支并注入服务端生成规则和 memory", async () => {
    const runLessonIntent = vi.fn().mockResolvedValue(createIntentResult("generate_lesson"));
    const workflow = createLessonAuthoringWorkflow({ runLessonIntent });
    const run = await workflow.createRun();
    const result = await run.start({
      inputData: {
        query: "五年级篮球运球课",
        mode: "lesson",
        market: "cn-compulsory-2022",
        memory: {
          defaults: {
            grade: "五年级",
            topic: "篮球行进间运球",
          },
          updatedAt: "2026-04-28T03:00:00.000Z",
        },
        messages: [createUserMessage("五年级篮球行进间运球")],
        requestId: "request-workflow-generate",
      },
    });

    expect(result.status).toBe("success");

    if (result.status !== "success") {
      return;
    }

    expect(runLessonIntent).toHaveBeenCalledOnce();
    expect(result.result.decision.type).toBe("generate");
    expect(result.result.decision.intentResult.intent).toBe("generate_lesson");
    expect(result.result.system).toContain("服务端");
    expect(result.result.system).toContain("不要调用课时计划生成或提交工具");
    expect(result.result.system).not.toContain("submit_lesson_plan");
    expect(result.result.system).not.toContain("submit_html_screen");
    expect(result.result.system).toContain("正式 lesson 生成由服务端在生成前检索并注入课标依据");
    expect(result.result.generationPlan.responseTransport).toBe("structured-data-part");
    expect(result.result.generationPlan.protocolVersion).toBe("structured-v1");
    expect(result.result.generationPlan.outputProtocol).toBe("lesson-json");
    expect(result.result.generationPlan.assistantTextPolicy).toBe("suppress-json-text");
    expect(result.result.generationPlan.maxSteps).toBe(5);
    expect(result.result.uiHints).toEqual([
      {
        action: "switch_tab",
        params: {
          tab: "lesson",
        },
      },
    ]);
    expect(result.result.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          step: "defer-standards-retrieval",
          status: "success",
        }),
      ]),
    );
  });

  it("入口意图不明确时返回 clarify decision，并跳过正式生成分支", async () => {
    const runLessonIntent = vi.fn().mockResolvedValue(
      createIntentResult("clarify", "还无法判断你是要生成、修改还是咨询。", 0.36),
    );
    const workflow = createLessonAuthoringWorkflow({ runLessonIntent });
    const run = await workflow.createRun();
    const result = await run.start({
      inputData: {
        query: "帮我看看这个",
        mode: "lesson",
        market: "cn-compulsory-2022",
        messages: [createUserMessage("帮我看看这个")],
        requestId: "request-workflow-clarify",
      },
    });

    expect(result.status).toBe("success");

    if (result.status !== "success") {
      return;
    }

    expect(result.result.decision).toMatchObject({
      type: "clarify",
      intentResult: expect.objectContaining({
        intent: "clarify",
      }),
      text: expect.stringContaining("请明确你是要"),
    });
    expect(result.result.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          step: "prepare-intent-clarification-response",
          status: "blocked",
        }),
      ]),
    );
  });

  it("未提供已确认课时计划时会拦截 HTML 生成", async () => {
    const runLessonIntent = vi.fn().mockResolvedValue(createIntentResult("generate_html"));
    const workflow = createLessonAuthoringWorkflow({ runLessonIntent });
    const run = await workflow.createRun();
    const result = await run.start({
      inputData: {
        query: "请生成互动大屏",
        mode: "html",
        market: "cn-compulsory-2022",
      },
    });

    expect(result.status).toBe("failed");

    if (result.status === "failed" && result.error instanceof Error) {
      expect(result.error.message).toContain("必须提供已确认课时计划");
    }
  });

  it("会把结构化大屏模块计划注入 HTML 阶段系统提示词", async () => {
    const runLessonIntent = vi.fn().mockResolvedValue(createIntentResult("generate_html"));
    const workflow = createLessonAuthoringWorkflow({ runLessonIntent });
    const run = await workflow.createRun();
    const result = await run.start({
      inputData: {
        query: "请生成课堂学习辅助大屏",
        mode: "html",
        market: "cn-compulsory-2022",
        lessonPlan: "## 十、课时计划\n| 比赛展示 | 6 分钟 |",
        screenPlan: {
          sections: [
            {
              title: "比赛展示",
              durationSeconds: 360,
              supportModule: "scoreboard",
            },
          ],
        },
      },
    });

    expect(result.status).toBe("success");

    if (result.status !== "success") {
      return;
    }

    expect(result.result.decision.type).toBe("generate");
    expect(result.result.decision.intentResult.intent).toBe("generate_html");
    expect(result.result.uiHints).toEqual([
      {
        action: "switch_tab",
        params: {
          tab: "canvas",
        },
      },
    ]);
    expect(result.result.system).toContain("服务端");
    expect(result.result.system).toContain("不要调用提交工具");
    expect(result.result.system).not.toContain("submit_html_screen");
    expect(result.result.system).toContain("data-support-module");
    expect(result.result.system).toContain("比赛展示");
    expect(result.result.system).toContain("durationSeconds=360");
  });

  it("咨询课标时直接返回 respond decision", async () => {
    setStandardsRetrievalProvider({
      id: "workflow-test-provider",
      search: vi.fn().mockResolvedValue({
        requestedMarket: "cn-compulsory-2022",
        resolvedMarket: "cn-compulsory-2022",
        references: [
          {
            id: "std-1",
            title: "课堂安全与风险防控",
            summary: "强调场地器材检查与风险预案。",
            source: "义务教育体育与健康课程标准（2022年版）",
            officialVersion: "2022",
            gradeBands: ["5-6年级"],
            module: "安全管理",
            sectionPath: ["课程实施", "安全教育与风险防控"],
            keywords: ["安全", "风险"],
            requirements: ["课前检查场地器材。"],
            teachingImplications: ["明确安全距离和轮换规则。"],
            citation: "课程标准 第10页",
            score: 88,
          },
        ],
        context: "1. 课堂安全与风险防控\n   课标要求：\n    - 课前检查场地器材。",
        corpus: {
          corpusId: "cn-compulsory-2022",
          displayName: "义务教育体育与健康课程标准（2022年版）结构化知识库",
          issuer: "中华人民共和国教育部",
          version: "2022",
          url: "https://example.com/standards.pdf",
          availability: "ready" as const,
        },
      }),
    });

    const runLessonIntent = vi.fn().mockResolvedValue(
      createIntentResult("consult_standards", "用户主要在询问课标与安全依据。"),
    );
    const workflow = createLessonAuthoringWorkflow({ runLessonIntent });
    const run = await workflow.createRun();
    const result = await run.start({
      inputData: {
        query: "这份五年级篮球课时计划是否符合课标和安全要求？",
        mode: "lesson",
        market: "cn-compulsory-2022",
        messages: [createUserMessage("这份五年级篮球课时计划是否符合课标和安全要求？")],
      },
    });

    expect(result.status).toBe("success");

    if (result.status !== "success") {
      return;
    }

    expect(result.result.decision).toMatchObject({
      type: "respond",
      intentResult: expect.objectContaining({
        intent: "consult_standards",
      }),
      text: expect.stringContaining("课标"),
    });
    expect(result.result.standards.referenceCount).toBe(1);
  });

  it("入口意图置信度较低时会附带 toast hint", async () => {
    const runLessonIntent = vi.fn().mockResolvedValue(
      createIntentResult("patch_lesson", "用户似乎想修改现有课时计划中的安全要求。", 0.41),
    );
    const workflow = createLessonAuthoringWorkflow({ runLessonIntent });
    const run = await workflow.createRun();
    const result = await run.start({
      inputData: {
        query: "把安全部分看看改一下",
        mode: "lesson",
        market: "cn-compulsory-2022",
        lessonPlan: "{\"title\":\"示例课时计划\"}",
        messages: [createUserMessage("把安全部分看看改一下")],
      },
    });

    expect(result.status).toBe("success");

    if (result.status !== "success") {
      return;
    }

    expect(result.result.uiHints).toEqual(
      expect.arrayContaining([
        {
          action: "show_toast",
          params: {
            level: "info",
            title: "我对本轮意图的理解还不够确定",
            description: "当前先按“修改现有课时计划”处理；如果理解有误，请直接纠正我。",
          },
        },
      ]),
    );
  });
});
