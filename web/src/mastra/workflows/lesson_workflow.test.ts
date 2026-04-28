import { describe, expect, it, vi } from "vitest";

import { createLessonAuthoringWorkflow } from "@/mastra/workflows/lesson_workflow";

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
      questions: [],
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
      questions: ["本次课是几年级？"],
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
    const runLessonIntake = vi.fn().mockResolvedValue(createReadyIntake());
    const workflow = createLessonAuthoringWorkflow({ runLessonIntake });
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
    expect(result.result.decision.type).toBe("generate");
    expect(result.result.decision.intakeResult?.intake.summary).toContain("五年级篮球行进间运球");
    expect(result.result.system).toContain("教案生成 Agent 启动前的信息收集结果");
    expect(result.result.system).toContain("searchStandardsTool 已挂载给当前 Agent");
    expect(result.result.generationPlan.responseTransport).toBe("structured-data-part");
    expect(result.result.generationPlan.protocolVersion).toBe("structured-v1");
    expect(result.result.generationPlan.outputProtocol).toBe("lesson-json");
    expect(result.result.generationPlan.assistantTextPolicy).toBe("suppress-json-text");
    expect(result.result.trace.map((entry) => entry.step)).toEqual(
      expect.arrayContaining(["delegate-standards-tooling"]),
    );
    expect(result.result.trace.map((entry) => entry.step)).not.toEqual(
      expect.arrayContaining(["retrieve-standards-context"]),
    );
  });

  it("信息不足时返回 clarify decision，并跳过正式生成准备分支", async () => {
    const runLessonIntake = vi.fn().mockResolvedValue(createClarifyIntake());
    const workflow = createLessonAuthoringWorkflow({ runLessonIntake });
    const run = await workflow.createRun();
    const result = await run.start({
      inputData: {
        query: "帮我写一个篮球课教案",
        mode: "lesson",
        market: "cn-compulsory-2022",
        messages: [createUserMessage("帮我写一个篮球课教案")],
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
      text: expect.stringContaining("本次课是几年级？"),
    });
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

  it("会拦截未确认教案的 HTML 生成，且不运行 lesson intake", async () => {
    const runLessonIntake = vi.fn();
    const workflow = createLessonAuthoringWorkflow({ runLessonIntake });
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
      expect(result.error.message).toContain("必须提供已确认教案");
    }
  });

  it("会把结构化大屏模块计划注入 HTML 阶段系统提示词", async () => {
    const runLessonIntake = vi.fn();
    const workflow = createLessonAuthoringWorkflow({ runLessonIntake });
    const run = await workflow.createRun();
    const result = await run.start({
      inputData: {
        query: "请生成课堂学习辅助大屏",
        mode: "html",
        market: "cn-compulsory-2022",
        lessonPlan: "## 十、课时计划（教案）\n| 比赛展示 | 6 分钟 |",
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
    expect(result.result.system).toContain("data-support-module");
    expect(result.result.system).toContain("比赛展示：supportModule=scoreboard");
    expect(result.result.system).toContain("durationSeconds=360");
  });
});
