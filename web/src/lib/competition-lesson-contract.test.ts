import { describe, expect, it } from "vitest";

import {
  DEFAULT_COMPETITION_LESSON_PLAN,
  competitionLessonPlanSchema,
} from "@/lib/competition-lesson-contract";

describe("competition-lesson-contract", () => {
  it("默认课时计划符合统一后的字符串数组正文块契约", () => {
    const parsed = competitionLessonPlanSchema.parse(DEFAULT_COMPETITION_LESSON_PLAN);

    expect(parsed.learningObjectives.sportAbility).toEqual(["XXX"]);
    expect(parsed.keyDifficultPoints.studentLearning).toEqual(["XXX"]);
    expect(parsed.loadEstimate.rationale).toEqual(["XXX"]);
    expect(parsed.periodPlan.mainContent).toEqual(["XXX"]);
    expect(parsed.periodPlan.reflection).toEqual(["XXX"]);
  });

  it("课时计划行仍拒绝未知字段，不能把 strict schema 变成透传", () => {
    const invalidDraft = structuredClone(DEFAULT_COMPETITION_LESSON_PLAN);

    (invalidDraft.periodPlan.rows[0] as Record<string, unknown>).unknownField = "bad";

    const parsed = competitionLessonPlanSchema.safeParse(invalidDraft);

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path.join("."))).toEqual(
      expect.arrayContaining(["periodPlan.rows.0"]),
    );
  });

});
