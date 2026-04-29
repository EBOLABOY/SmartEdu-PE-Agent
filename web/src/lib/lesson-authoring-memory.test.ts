import { describe, expect, it } from "vitest";

import {
  buildLessonAuthoringMemoryPatch,
  fillLessonIntakeWithMemory,
  mergeLessonAuthoringMemory,
} from "@/lib/lesson-authoring-memory";
import type { LessonAuthoringMemory, LessonIntakeResult } from "@/lib/lesson-authoring-contract";

const memory: LessonAuthoringMemory = {
  defaults: {
    grade: "五年级",
    venue: "篮球场",
  },
  updatedAt: "2026-04-28T03:00:00.000Z",
};

describe("lesson authoring memory", () => {
  it("does not require duration student count venue or equipment before generation", () => {
    const intake: LessonIntakeResult = {
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
      reason: "当前消息缺少常规授课条件。",
    };

    const result = fillLessonIntakeWithMemory(intake, memory);

    expect(result.memoryUsed).toBe(true);
    expect(result.intake.readyToGenerate).toBe(true);
    expect(result.intake.missing).toEqual([]);
    expect(result.intake.clarifications).toEqual([]);
    expect(result.intake.known).toMatchObject({
      grade: "五年级",
      topic: "篮球行进间运球",
      studentCount: 40,
      venue: "篮球场",
    });
    expect(result.intake.known?.durationMinutes).toBeUndefined();
    expect(result.intake.known?.equipment).toBeUndefined();
  });

  it("keeps explicit current-turn facts over older memory", () => {
    const intake: LessonIntakeResult = {
      readyToGenerate: false,
      known: {
        grade: "六年级",
        topic: "足球脚内侧传球",
        venue: "足球场",
      },
      missing: ["duration", "studentCount", "equipment"],
      clarifications: [
        {
          field: "duration",
          question: "请补充课时、人数和器材。",
        },
      ],
      reason: "缺少自动生成字段。",
    };

    const result = fillLessonIntakeWithMemory(intake, memory);

    expect(result.intake.known?.grade).toBe("六年级");
    expect(result.intake.known?.topic).toBe("足球脚内侧传球");
    expect(result.intake.known?.venue).toBe("足球场");
    expect(result.intake.known?.studentCount).toBe(40);
    expect(result.intake.readyToGenerate).toBe(true);
  });

  it("does not persist duration student count or generated equipment as stable memory", () => {
    const patch = buildLessonAuthoringMemoryPatch({
      context: {
        teachingLevel: "水平三",
        venue: "室内体育馆",
      },
      intake: {
        readyToGenerate: true,
        known: {
          grade: "五年级",
          topic: "篮球行进间运球",
          durationMinutes: 40,
          studentCount: 36,
          equipment: ["篮球36个", "标志桶12个"],
        },
        missing: [],
        clarifications: [],
        summary: "五年级篮球行进间运球。",
        reason: "信息完整。",
      },
      updatedAt: "2026-04-28T04:00:00.000Z",
    });
    const merged = mergeLessonAuthoringMemory(memory, patch);

    expect(merged?.defaults).toMatchObject({
      grade: "五年级",
      teachingLevel: "水平三",
      topic: "篮球行进间运球",
      venue: "室内体育馆",
    });
    expect(merged?.defaults.durationMinutes).toBeUndefined();
    expect(merged?.defaults.studentCount).toBeUndefined();
    expect(merged?.defaults.equipment).toBeUndefined();
    expect(merged?.updatedAt).toBe("2026-04-28T04:00:00.000Z");
  });

  it("keeps the model-generated topic clarification intact", () => {
    const intake: LessonIntakeResult = {
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
      reason: "缺少课程内容。",
    };

    const result = fillLessonIntakeWithMemory(intake);

    expect(result.intake.readyToGenerate).toBe(false);
    expect(result.intake.clarifications).toEqual(intake.clarifications);
  });

  it("does not ask again for facts already provided by current teacher context", () => {
    const intake: LessonIntakeResult = {
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
      reason: "Agent 未正确使用上下文。",
    };

    const result = fillLessonIntakeWithMemory(intake, undefined, {
      grade: "五年级",
    });

    expect(result.memoryUsed).toBe(false);
    expect(result.intake.readyToGenerate).toBe(false);
    expect(result.intake.missing).toEqual(["topic"]);
    expect(result.intake.clarifications).toEqual([intake.clarifications[1]]);
    expect(result.intake.known).toMatchObject({
      grade: "五年级",
      studentCount: 40,
    });
    expect(result.intake.known?.venue).toBeUndefined();
  });

  it("lets the lesson generation agent choose a venue when only venue is missing", () => {
    const intake: LessonIntakeResult = {
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
    };

    const result = fillLessonIntakeWithMemory(intake);

    expect(result.intake.readyToGenerate).toBe(true);
    expect(result.intake.missing).toEqual([]);
    expect(result.intake.clarifications).toEqual([]);
    expect(result.intake.summary).toContain("场地由课时计划生成 Agent 根据课程内容自动匹配");
    expect(result.intake.known?.venue).toBeUndefined();
  });
});
