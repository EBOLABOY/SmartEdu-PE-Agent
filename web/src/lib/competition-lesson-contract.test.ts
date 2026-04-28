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

  it("normalizes scalar text blocks from model output", () => {
    const legacyDraft = {
      ...DEFAULT_COMPETITION_LESSON_PLAN,
      learningObjectives: {
        ...DEFAULT_COMPETITION_LESSON_PLAN.learningObjectives,
        sportAbility: "能完成主要动作。",
      },
      flowSummary: "warmup -> practice -> cooldown",
      periodPlan: {
        ...DEFAULT_COMPETITION_LESSON_PLAN.periodPlan,
        mainContent: "主教材练习。",
      },
    };

    const parsed = competitionLessonPlanSchema.parse(legacyDraft);

    expect(parsed.learningObjectives.sportAbility).toEqual(["能完成主要动作。"]);
    expect(parsed.flowSummary).toEqual(["warmup -> practice -> cooldown"]);
    expect(parsed.periodPlan.mainContent).toEqual(["主教材练习。"]);
  });

  it("课时计划行会把受控中文字段别名归一化为 schema 字段", () => {
    const aliasedDraft = structuredClone(DEFAULT_COMPETITION_LESSON_PLAN);
    const firstRow = aliasedDraft.periodPlan.rows[0] as Record<string, unknown>;

    firstRow["强度"] = firstRow.intensity;
    delete firstRow.intensity;

    const parsed = competitionLessonPlanSchema.parse(aliasedDraft);

    expect(parsed.periodPlan.rows[0]?.intensity).toBe("XXX");
    expect(parsed.periodPlan.rows[0]).not.toHaveProperty("强度");
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
