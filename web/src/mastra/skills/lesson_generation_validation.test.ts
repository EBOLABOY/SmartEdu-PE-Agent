import { describe, expect, it } from "vitest";

import { parseLessonPlanProtocolToCompetitionLessonPlan } from "@/lib/competition-lesson-protocol";

import { performLessonBusinessValidation } from "./lesson_generation_validation";

const protocol = `
@lesson
title=篮球行进间运球
topic=篮球行进间运球
@section narrative.guiding_thought
坚持健康第一。
@section narrative.textbook_analysis
篮球运球是基础技能。
@section narrative.student_analysis
学生已有初步控球经验。
@section objectives.sport_ability
能完成运球练习。
@section objectives.health_behavior
能保持安全距离。
@section objectives.sport_morality
能遵守规则。
@flow
part=准备部分
content=课堂常规、体能唤醒、速度折返
@flow
part=基本部分
content=观察示范、伙伴练习、闯关挑战
@flow
part=结束部分
content=放松拉伸
@evaluation
level=三颗星
description=能高质量完成任务。
@evaluation
level=二颗星
description=能基本完成任务。
@evaluation
level=一颗星
description=能参与练习。
@equipment
venue=篮球场
equipment=篮球
@safety
保持安全距离。
@load
rationale=基本部分保持适宜强度。
`;

describe("lesson_generation_validation", () => {
  it("requires learning, practice, competition, and fitness segments across the whole lesson", () => {
    const plan = parseLessonPlanProtocolToCompetitionLessonPlan(protocol);
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
    const plan = parseLessonPlanProtocolToCompetitionLessonPlan(protocol);
    const validation = performLessonBusinessValidation(plan);

    expect(validation.issues.map((issue) => issue.code)).not.toContain("lesson-core-segments");
  });
});
