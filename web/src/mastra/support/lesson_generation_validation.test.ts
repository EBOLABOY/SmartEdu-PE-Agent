import { describe, expect, it } from "vitest";

import { DEFAULT_COMPETITION_LESSON_PLAN } from "@/lib/competition-lesson-contract";

import { performLessonBusinessValidation } from "./lesson_generation_validation";

function createValidLessonPlan() {
  const plan = structuredClone(DEFAULT_COMPETITION_LESSON_PLAN);

  plan.title = "篮球行进间运球";
  plan.meta.topic = "篮球行进间运球";
  plan.periodPlan.rows[0]!.content = ["课堂常规、体能唤醒、速度折返"];
  plan.periodPlan.rows[1]!.content = ["观察示范、伙伴练习、闯关挑战"];
  plan.periodPlan.rows[2]!.content = ["放松拉伸"];

  return plan;
}

describe("lesson_generation_validation", () => {
  it("requires learning, practice, competition, and fitness segments across the whole lesson", () => {
    const plan = createValidLessonPlan();
    const incomplete = structuredClone(plan);

    incomplete.periodPlan.rows[0]!.content = ["课堂常规、专项热身"];
    incomplete.periodPlan.rows[1]!.content = ["观察示范、伙伴练习"];

    const validation = performLessonBusinessValidation(incomplete);

    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "lesson-core-segments",
          message: expect.stringContaining("竞赛或展示、体能发展活动"),
        }),
      ]),
    );
  });

  it("accepts a lesson that distributes the four required segments across lesson rows", () => {
    const plan = createValidLessonPlan();
    const validation = performLessonBusinessValidation(plan);

    expect(validation.issues.map((issue) => issue.code)).not.toContain("lesson-core-segments");
  });
});
