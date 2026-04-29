import { describe, expect, it, vi } from "vitest";

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

function createReadyIntake() {
  return {
    intake: {
      readyToGenerate: true,
      known: {
        grade: "五年级",
        topic: "篮球行进间运球",
        studentCount: 40,
      },
      missing: [],
      clarifications: [],
      summary: "五年级篮球行进间运球，学生人数默认 40 人。",
      reason: "年级和课题已明确。",
    },
    modelMessageCount: 1,
    source: "agent" as const,
  };
}

function createClarifyIntake() {
  return {
    intake: {
      readyToGenerate: false,
      known: {
        topic: "篮球课",
      },
      missing: ["grade" as const],
      clarifications: [
        {
          field: "grade" as const,
          question: "本次课是几年级？",
        },
      ],
      reason: "缺少年级。",
    },
    memoryUsed: true,
    modelMessageCount: 1,
    source: "agent" as const,
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
  it("会规划 structured-only 推流链路，并把 ready intake brief 注入系统提示词", async () => {
    const runLessonIntent = vi.fn().mockResolvedValue(createIntentResult("generate_lesson"));
    const runLessonIntake = vi.fn().mockResolvedValue(createReadyIntake());
    const workflow = createLessonAuthoringWorkflow({ runLessonIntent, runLessonIntake });
    const run = await workflow.createRun();
    const result = await run.start({
      inputData: {
        query: "五年级篮球运球课",
        mode: "lesson",
        market: "cn-compulsory-2022",
        messages: [createUserMessage("五年级篮球行进间运球")],
        requestId: "request-workflow-ready",
      },
    });

    expect(result.status).toBe("success");

    if (result.status !== "success") {
      return;
    }

    expect(runLessonIntake).toHaveBeenCalledOnce();
    expect(runLessonIntent).toHaveBeenCalledOnce();
    expect(result.result.decision.type).toBe("generate");
    expect(result.result.decision.intentResult.intent).toBe("generate_lesson");
    if (result.result.decision.type !== "generate") {
      return;
    }
    expect(result.result.decision.intakeResult?.intake.summary).toContain("五年级篮球行进间运球");
    expect(result.result.system).toContain("课时计划生成 Agent 启动前的信息收集结果");
    expect(result.result.system).toContain("searchStandardsTool 已挂载给当前 Agent");
    expect(result.result.generationPlan.responseTransport).toBe("structured-data-part");
    expect(result.result.generationPlan.protocolVersion).toBe("structured-v1");
    expect(result.result.generationPlan.outputProtocol).toBe("lesson-json");
    expect(result.result.generationPlan.assistantTextPolicy).toBe("suppress-json-text");
    expect(result.result.uiHints).toEqual([
      {
        action: "switch_tab",
        params: {
          tab: "lesson",
        },
      },
    ]);
    expect(result.result.trace.map((entry) => entry.step)).toEqual(
      expect.arrayContaining(["delegate-standards-tooling"]),
    );
    expect(result.result.trace.map((entry) => entry.step)).not.toEqual(
      expect.arrayContaining(["retrieve-standards-context"]),
    );
  });

  it("信息不足时返回 clarify decision，并跳过正式生成准备分支", async () => {
    const runLessonIntent = vi.fn().mockResolvedValue(createIntentResult("generate_lesson"));
    const runLessonIntake = vi.fn().mockResolvedValue(createClarifyIntake());
    const workflow = createLessonAuthoringWorkflow({ runLessonIntent, runLessonIntake });
    const run = await workflow.createRun();
    const result = await run.start({
      inputData: {
        query: "帮我写一个篮球课课时计划",
        mode: "lesson",
        market: "cn-compulsory-2022",
        messages: [createUserMessage("帮我写一个篮球课课时计划")],
        memory: {
          defaults: {
            grade: "五年级",
          },
          updatedAt: "2026-04-28T03:00:00.000Z",
        },
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
        intent: "generate_lesson",
      }),
      text: expect.stringContaining("本次课是几年级？"),
    });
    expect(result.result.uiHints).toEqual([]);
    expect(result.result.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          step: "collect-lesson-requirements",
          status: "blocked",
        }),
        expect.objectContaining({
          step: "prepare-clarification-response",
          status: "blocked",
        }),
      ]),
    );
    expect(result.result.trace.map((entry) => entry.step)).not.toEqual(
      expect.arrayContaining(["retrieve-standards-context", "construct-generation-prompt", "validate-generation-safety"]),
    );
  });

  it("会拦截未确认课时计划的 HTML 生成，且不运行 lesson intake", async () => {
    const runLessonIntent = vi.fn().mockResolvedValue(createIntentResult("generate_html"));
    const runLessonIntake = vi.fn();
    const workflow = createLessonAuthoringWorkflow({ runLessonIntent, runLessonIntake });
    const run = await workflow.createRun();
    const result = await run.start({
      inputData: {
        query: "请生成互动大屏",
        mode: "html",
        market: "cn-compulsory-2022",
      },
    });

    expect(runLessonIntake).not.toHaveBeenCalled();
    expect(result.status).toBe("failed");

    if (result.status === "failed" && result.error instanceof Error) {
      expect(result.error.message).toContain("必须提供已确认课时计划");
    }
  });

  it("会把结构化大屏模块计划注入 HTML 阶段系统提示词", async () => {
    const runLessonIntent = vi.fn().mockResolvedValue(createIntentResult("generate_html"));
    const runLessonIntake = vi.fn();
    const workflow = createLessonAuthoringWorkflow({ runLessonIntent, runLessonIntake });
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

    expect(runLessonIntake).not.toHaveBeenCalled();
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
    expect(result.result.system).toContain("data-support-module");
    expect(result.result.system).toContain("比赛展示：supportModule=scoreboard");
    expect(result.result.system).toContain("durationSeconds=360");
  });

  it("咨询课标时会直接返回 respond decision，并跳过 intake", async () => {
    const runLessonIntent = vi.fn().mockResolvedValue(
      createIntentResult("consult_standards", "用户主要在询问课标与安全依据。"),
    );
    const runLessonIntake = vi.fn();
    const workflow = createLessonAuthoringWorkflow({ runLessonIntent, runLessonIntake });
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

    expect(runLessonIntake).not.toHaveBeenCalled();
    expect(result.result.decision).toMatchObject({
      type: "respond",
      intentResult: expect.objectContaining({
        intent: "consult_standards",
      }),
      text: expect.stringContaining("课标"),
    });
    expect(result.result.uiHints).toEqual([]);
    expect(result.result.standards.referenceCount).toBeGreaterThan(0);
  });

  it("入口意图置信度较低时会附带提示性 toast hint", async () => {
    const runLessonIntent = vi.fn().mockResolvedValue(
      createIntentResult("patch_lesson", "用户似乎想修改现有课时计划中的安全要求。", 0.41),
    );
    const runLessonIntake = vi.fn();
    const workflow = createLessonAuthoringWorkflow({ runLessonIntent, runLessonIntake });
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
