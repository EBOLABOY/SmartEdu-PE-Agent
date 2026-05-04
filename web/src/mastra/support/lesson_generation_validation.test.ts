import { describe, expect, it } from "vitest";

import { DEFAULT_COMPETITION_LESSON_PLAN } from "@/lib/lesson/contract";

import { performLessonBusinessValidation } from "./lesson_generation_validation";

function replacePlaceholders<T>(value: T): T {
  if (typeof value === "string") {
    return (value === "XXX" ? "完整文本" : value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => replacePlaceholders(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => [key, replacePlaceholders(childValue)]),
    ) as T;
  }

  return value;
}

function createCompleteLessonPlan() {
  const plan = structuredClone(DEFAULT_COMPETITION_LESSON_PLAN);
  const completePlan = replacePlaceholders(plan);

  completePlan.periodPlan.rows[0]!.content = ["环节一"];
  completePlan.periodPlan.rows[1]!.content = ["环节二"];
  completePlan.periodPlan.rows[2]!.content = ["环节三"];

  return completePlan;
}

describe("lesson_generation_validation", () => {
  it("accepts a complete lesson without validating specific teaching content keywords", () => {
    const plan = createCompleteLessonPlan();
    const validation = performLessonBusinessValidation(plan);

    expect(validation.isValid).toBe(true);
  });

  it("still rejects lessons with missing required period structures", () => {
    const plan = createCompleteLessonPlan();
    plan.periodPlan.rows = plan.periodPlan.rows.filter((row) => row.structure !== "基本部分");

    const validation = performLessonBusinessValidation(plan);

    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "section-missing",
          message: expect.stringContaining("基本部分"),
        }),
      ]),
    );
  });
});
