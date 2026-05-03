import { describe, expect, it, vi } from "vitest";

import type { SmartEduUIMessage } from "@/lib/lesson-authoring-contract";

import { runLessonIntakeSkill } from "./lesson_intake_skill";

const completeMessages = [
  {
    id: "user-1",
    role: "user",
    parts: [{ type: "text", text: "五年级篮球行进间运球，篮球场" }],
  },
] as SmartEduUIMessage[];

describe("lesson intake skill", () => {
  it("returns an agent-approved lesson brief when minimum information is complete", async () => {
    const generateIntake = vi.fn().mockResolvedValue({
        readyToGenerate: true,
        known: {
          grade: "五年级",
          topic: "篮球行进间运球",
          studentCount: 40,
          venue: "篮球场",
        },
        missing: [],
        clarifications: [],
        summary: "五年级篮球行进间运球，学生人数默认40人，篮球场，课时和器材由服务端课时计划生成管线自动匹配。",
        reason: "年级、课程内容和场地已明确。",
    });

    const result = await runLessonIntakeSkill({
      generateIntake,
      maxSteps: 3,
      messages: completeMessages,
      requestId: "request-intake-ready",
    });

    expect(result.source).toBe("agent");
    expect(result.intake.readyToGenerate).toBe(true);
    expect(result.intake.summary).toContain("默认40人");
    expect(generateIntake).toHaveBeenCalledWith(
      expect.objectContaining({
        maxSteps: 3,
        messages: expect.arrayContaining([expect.objectContaining({ role: "user" })]),
        modelId: expect.any(String),
        system: expect.any(String),
      }),
    );
  });

  it("blocks generation only when grade or topic is still missing", async () => {
    const generateIntake = vi.fn().mockResolvedValue({
        readyToGenerate: true,
        known: {
          topic: "篮球课",
        },
        missing: ["grade", "duration", "venue", "equipment"],
        clarifications: [
          {
            field: "grade",
            question: "本次课是几年级？",
          },
          {
            field: "duration",
            question: "课时多长？",
          },
          {
            field: "venue",
            question: "使用什么场地？",
          },
          {
            field: "equipment",
            question: "需要哪些器材？",
          },
        ],
        summary: "篮球课。",
        reason: "Agent 误判为可以生成。",
    });

    const result = await runLessonIntakeSkill({
      generateIntake,
      maxSteps: 3,
      messages: completeMessages,
      requestId: "request-intake-blocked",
    });

    expect(result.intake.readyToGenerate).toBe(false);
    expect(result.intake.missing).toEqual(["grade"]);
    expect(result.intake.clarifications).toEqual([
      {
        field: "grade",
        question: "本次课是几年级？",
      },
    ]);
  });

  it("passes through the model-generated topic clarification when lesson content is missing", async () => {
    const generateIntake = vi.fn().mockResolvedValue({
        readyToGenerate: false,
        known: {
          grade: "五年级",
          venue: "篮球场",
        },
        missing: ["topic"],
        clarifications: [
          {
            field: "topic",
            question: "请选择本次课程内容，或直接改写：1. 篮球行进间运球；2. 篮球原地双手胸前传接球；3. 篮球传切配合；4. 篮球运球急停急起。",
          },
        ],
        reason: "缺少具体课程内容。",
    });

    const result = await runLessonIntakeSkill({
      generateIntake,
      maxSteps: 3,
      messages: [
        {
          id: "user-topic-options",
          role: "user",
          parts: [{ type: "text", text: "五年级，篮球场，帮我写一节体育课" }],
        },
      ] as SmartEduUIMessage[],
      requestId: "request-topic-options",
    });

    expect(result.intake.readyToGenerate).toBe(false);
    expect(result.intake.missing).toEqual(["topic"]);
    expect(result.intake.clarifications).toEqual([
      {
        field: "topic",
        question: "请选择本次课程内容，或直接改写：1. 篮球行进间运球；2. 篮球原地双手胸前传接球；3. 篮球传切配合；4. 篮球运球急停急起。",
      },
    ]);
  });

  it("does not block generation when only venue is missing", async () => {
    const generateIntake = vi.fn().mockResolvedValue({
        readyToGenerate: false,
        known: {
          grade: "五年级",
          topic: "篮球行进间运球",
        },
        missing: ["venue"],
        clarifications: [
          {
            field: "venue",
            question: "本次课使用什么场地？",
          },
        ],
        reason: "Agent 错误地把场地当成必填字段。",
    });

    const result = await runLessonIntakeSkill({
      generateIntake,
      maxSteps: 3,
      messages: [
        {
          id: "user-venue-auto",
          role: "user",
          parts: [{ type: "text", text: "五年级篮球行进间运球" }],
        },
      ] as SmartEduUIMessage[],
      requestId: "request-venue-auto",
    });

    expect(result.intake.readyToGenerate).toBe(true);
    expect(result.intake.missing).toEqual([]);
    expect(result.intake.clarifications).toEqual([]);
    expect(result.intake.summary).toContain("场地由服务端课时计划生成管线根据课程内容自动匹配");
    expect(result.intake.known?.venue).toBeUndefined();
  });

  it("only asks for fields still missing after teacher context is merged", async () => {
    const generateIntake = vi.fn().mockResolvedValue({
        readyToGenerate: false,
        known: {},
        missing: ["grade", "topic", "venue"],
        clarifications: [
          {
            field: "grade",
            question: "本次课是几年级？",
          },
          {
            field: "topic",
            question: "请选择本次课程内容，或直接改写：1. 篮球行进间运球；2. 足球脚内侧传接球；3. 立定跳远起跳与落地；4. 接力跑交接棒。",
          },
          {
            field: "venue",
            question: "使用什么场地？",
          },
        ],
        reason: "Agent 没有正确利用用户资料。",
    });

    const result = await runLessonIntakeSkill({
      generateIntake,
      context: {
        grade: "五年级",
      },
      maxSteps: 3,
      messages: [
        {
          id: "user-context-only-missing-topic",
          role: "user",
          parts: [{ type: "text", text: "帮我写一节体育课" }],
        },
      ] as SmartEduUIMessage[],
      requestId: "request-context-only-missing-topic",
    });

    expect(result.memoryUsed).toBe(false);
    expect(result.intake.readyToGenerate).toBe(false);
    expect(result.intake.missing).toEqual(["topic"]);
    expect(result.intake.clarifications).toEqual([
      {
        field: "topic",
        question: "请选择本次课程内容，或直接改写：1. 篮球行进间运球；2. 足球脚内侧传接球；3. 立定跳远起跳与落地；4. 接力跑交接棒。",
      },
    ]);
    expect(result.intake.known).toMatchObject({
      grade: "五年级",
      studentCount: 40,
    });
    expect(result.intake.known?.venue).toBeUndefined();
  });

  it("falls back to clarification instead of guessing when the intake agent fails", async () => {
    const generateIntake = vi.fn().mockRejectedValue(new Error("model unavailable"));

    const result = await runLessonIntakeSkill({
      generateIntake,
      maxSteps: 3,
      messages: completeMessages,
      requestId: "request-intake-fallback",
    });

    expect(result.source).toBe("safe-fallback");
    expect(result.intake.readyToGenerate).toBe(false);
    expect(result.intake.clarifications.map((item) => item.question).join("\n")).toContain("几年级");
    expect(result.intake.clarifications.map((item) => item.question).join("\n")).toContain("课程内容");
    expect(result.intake.clarifications.map((item) => item.question).join("\n")).not.toContain("场地");
    expect(result.warning).toContain("model unavailable");
  });

  it("filters safe-fallback clarification with known teacher context", async () => {
    const generateIntake = vi.fn().mockRejectedValue(new Error("model unavailable"));

    const result = await runLessonIntakeSkill({
      generateIntake,
      context: {
        grade: "五年级",
      },
      maxSteps: 3,
      messages: completeMessages,
      requestId: "request-intake-fallback-context",
    });

    expect(result.source).toBe("safe-fallback");
    expect(result.intake.readyToGenerate).toBe(false);
    expect(result.intake.missing).toEqual(["topic"]);
    expect(result.intake.clarifications).toHaveLength(1);
    expect(result.intake.clarifications.map((item) => item.question).join("\n")).toContain("请选择本次课程内容");
    expect(result.intake.clarifications.map((item) => item.question).join("\n")).not.toContain("几年级");
    expect(result.intake.clarifications.map((item) => item.question).join("\n")).not.toContain("场地");
  });

  it("uses project memory and default 40 students to reduce repeated clarification questions", async () => {
    const generateIntake = vi.fn().mockResolvedValue({
        readyToGenerate: false,
        known: {
          topic: "篮球行进间运球",
        },
        missing: ["grade", "duration", "studentCount", "venue", "equipment"],
        clarifications: [
          {
            field: "grade",
            question: "请补充年级、课时、人数、场地和器材。",
          },
        ],
        reason: "当前消息只提供了课程内容。",
    });

    const result = await runLessonIntakeSkill({
      generateIntake,
      maxSteps: 3,
      memory: {
        defaults: {
          grade: "五年级",
          venue: "篮球场",
        },
        updatedAt: "2026-04-28T03:00:00.000Z",
      },
      messages: [
        {
          id: "user-memory",
          role: "user",
          parts: [{ type: "text", text: "继续帮我写篮球行进间运球课" }],
        },
      ] as SmartEduUIMessage[],
      requestId: "request-intake-memory",
    });

    expect(result.memoryUsed).toBe(true);
    expect(result.intake.readyToGenerate).toBe(true);
    expect(result.intake.clarifications).toEqual([]);
    expect(result.intake.known).toMatchObject({
      grade: "五年级",
      topic: "篮球行进间运球",
      studentCount: 40,
      venue: "篮球场",
    });
    expect(generateIntake).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining("项目教学记忆"),
            role: "user",
          }),
        ]),
      }),
    );
  });
});
