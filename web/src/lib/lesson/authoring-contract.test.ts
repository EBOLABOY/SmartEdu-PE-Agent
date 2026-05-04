import { describe, expect, it } from "vitest";

import { lessonIntakeResultSchema } from "@/lib/lesson/authoring-contract";

describe("lesson authoring contract", () => {
  it("accepts structured clarifications", () => {
    const result = lessonIntakeResultSchema.safeParse({
      readyToGenerate: false,
      known: {
        grade: "五年级",
      },
      missing: ["topic"],
      clarifications: [
        {
          field: "topic",
          question: "请选择本次课程内容，或直接改写：1. 篮球行进间运球；2. 足球脚内侧传接球。",
        },
      ],
      reason: "缺少具体课程内容。",
    });

    expect(result.success).toBe(true);
  });

  it("rejects clarification entries without field", () => {
    const result = lessonIntakeResultSchema.safeParse({
      readyToGenerate: false,
      known: {},
      missing: ["topic"],
      clarifications: [
        {
          question: "请选择本次课程内容。",
        },
      ],
      reason: "缺少具体课程内容。",
    });

    expect(result.success).toBe(false);
  });

  it("rejects the old questions array shape", () => {
    const result = lessonIntakeResultSchema.safeParse({
      readyToGenerate: false,
      known: {},
      missing: ["grade"],
      questions: ["本次课是几年级？"],
      reason: "缺少年级。",
    });

    expect(result.success).toBe(false);
  });
});
