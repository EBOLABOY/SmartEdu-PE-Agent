import { describe, expect, it } from "vitest";

import {
  DEFAULT_COMPETITION_LESSON_PLAN,
  competitionLessonPlanSchema,
} from "@/lib/competition-lesson-contract";

describe("competition-lesson-contract", () => {
  it("默认教案符合统一后的字符串数组正文块契约", () => {
    const parsed = competitionLessonPlanSchema.parse(DEFAULT_COMPETITION_LESSON_PLAN);

    expect(parsed.learningObjectives.sportAbility).toEqual(["XXX"]);
    expect(parsed.keyDifficultPoints.studentLearning).toEqual(["XXX"]);
    expect(parsed.loadEstimate.rationale).toEqual(["XXX"]);
    expect(parsed.periodPlan.mainContent).toEqual(["XXX"]);
    expect(parsed.periodPlan.reflection).toEqual(["XXX"]);
  });

  it("拒绝旧的 scalar 正文块结构", () => {
    const legacyDraft = {
      ...DEFAULT_COMPETITION_LESSON_PLAN,
      learningObjectives: {
        ...DEFAULT_COMPETITION_LESSON_PLAN.learningObjectives,
        sportAbility: "能完成主要动作。",
      },
      periodPlan: {
        ...DEFAULT_COMPETITION_LESSON_PLAN.periodPlan,
        mainContent: "主教材练习。",
      },
    };

    const parsed = competitionLessonPlanSchema.safeParse(legacyDraft);

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path.join("."))).toEqual(
      expect.arrayContaining(["learningObjectives.sportAbility", "periodPlan.mainContent"]),
    );
  });
});
