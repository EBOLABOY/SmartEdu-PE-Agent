import { describe, expect, it } from "vitest";

import { DEFAULT_COMPETITION_LESSON_PLAN } from "@/lib/competition-lesson-contract";
import {
  CompetitionLessonPatchError,
  applyCompetitionLessonPatch,
  applySemanticLessonUpdates,
  applySemanticLessonUpdatesWithTrace,
} from "@/lib/competition-lesson-patch";

describe("competition-lesson-patch", () => {
  it("按 JSON Pointer 替换单个教案字段且不修改原对象", () => {
    const original = DEFAULT_COMPETITION_LESSON_PLAN;
    const next = applyCompetitionLessonPatch(original, {
      operations: [
        {
          op: "replace",
          path: "/learningObjectives/sportAbility/0",
          value: "能在游戏中稳定控制足球方向，并根据同伴位置调整运球速度。",
          reason: "强化运动能力目标的可观察性。",
        },
      ],
    });

    expect(next.learningObjectives.sportAbility[0]).toContain("稳定控制足球方向");
    expect(original.learningObjectives.sportAbility[0]).not.toContain("稳定控制足球方向");
  });

  it("支持向数组字段追加内容", () => {
    const next = applyCompetitionLessonPatch(DEFAULT_COMPETITION_LESSON_PLAN, {
      operations: [
        {
          op: "append",
          path: "/periodPlan/homework",
          value: "课后与家长复述本节课三条安全规则。",
          reason: "补充安全复盘作业。",
        },
      ],
    });

    expect(next.periodPlan.homework.at(-1)).toBe("课后与家长复述本节课三条安全规则。");
  });

  it("支持删除数组元素并保持 schema 合法", () => {
    const next = applyCompetitionLessonPatch(DEFAULT_COMPETITION_LESSON_PLAN, {
      operations: [
        {
          op: "remove",
          path: "/periodPlan/homework/0",
          reason: "删除与本节课目标关联较弱的作业。",
        },
      ],
    });

    expect(next.periodPlan.homework).not.toContain("模仿三种动物爬行");
    expect(next.periodPlan.homework.length).toBe(DEFAULT_COMPETITION_LESSON_PLAN.periodPlan.homework.length - 1);
  });

  it("拒绝污染原型链的 path", () => {
    expect(() =>
      applyCompetitionLessonPatch(DEFAULT_COMPETITION_LESSON_PLAN, {
        operations: [
          {
            op: "replace",
            path: "/__proto__/polluted",
            value: true,
            reason: "恶意路径。",
          },
        ],
      }),
    ).toThrow(CompetitionLessonPatchError);
  });

  it("拒绝应用后不符合教案 schema 的 patch", () => {
    expect(() =>
      applyCompetitionLessonPatch(DEFAULT_COMPETITION_LESSON_PLAN, {
        operations: [
          {
            op: "replace",
            path: "/evaluation/1/description",
            value: "",
            reason: "空评价不合法。",
          },
        ],
      }),
    ).toThrow(CompetitionLessonPatchError);
  });

  it("按语义环节名称修改课时行并生成兼容 patch trace", () => {
    const result = applySemanticLessonUpdatesWithTrace(DEFAULT_COMPETITION_LESSON_PLAN, [
      {
        action: "update_stage",
        payload: {
          targetStageName: "准备部分",
          newTime: "8分钟",
          reason: "按用户要求延长热身时间。",
        },
      },
    ]);

    expect(result.lessonPlan.periodPlan.rows[0]?.time).toBe("8分钟");
    expect(result.patch.operations).toEqual([
      {
        op: "replace",
        path: "/periodPlan/rows/0/time",
        value: "8分钟",
        reason: "按用户要求延长热身时间。",
      },
    ]);
    expect(DEFAULT_COMPETITION_LESSON_PLAN.periodPlan.rows[0]?.time).toBe("XXX");
  });

  it("按语义工具修改学习目标且不暴露数组索引给模型", () => {
    const next = applySemanticLessonUpdates(DEFAULT_COMPETITION_LESSON_PLAN, [
      {
        action: "update_objectives",
        payload: {
          sportMorality: ["能在接力比赛中遵守规则，主动鼓励同伴。"],
          reason: "补充体育品德目标。",
        },
      },
    ]);

    expect(next.learningObjectives.sportMorality).toEqual([
      "能在接力比赛中遵守规则，主动鼓励同伴。",
    ]);
    expect(DEFAULT_COMPETITION_LESSON_PLAN.learningObjectives.sportMorality).toEqual(["XXX"]);
  });

  it("拒绝没有关键词的多行同环节语义修改", () => {
    const plan = structuredClone(DEFAULT_COMPETITION_LESSON_PLAN);
    const basicRow = structuredClone(plan.periodPlan.rows[1]!);
    basicRow.content = ["第二个基本部分练习"];
    plan.periodPlan.rows.splice(2, 0, basicRow);

    expect(() =>
      applySemanticLessonUpdates(plan, [
        {
          action: "update_stage",
          payload: {
            targetStageName: "基本部分",
            newTime: "12分钟",
            reason: "用户要求调整基本部分时间。",
          },
        },
      ]),
    ).toThrow(CompetitionLessonPatchError);
  });
});
