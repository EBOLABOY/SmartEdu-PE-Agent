import { describe, expect, it } from "vitest";

import { DEFAULT_COMPETITION_LESSON_PLAN } from "@/lib/competition-lesson-contract";
import {
  CompetitionLessonPatchError,
  applyCompetitionLessonPatch,
} from "@/lib/competition-lesson-patch";

describe("competition-lesson-patch", () => {
  it("按 JSON Pointer 替换单个教案字段且不修改原对象", () => {
    const original = DEFAULT_COMPETITION_LESSON_PLAN;
    const next = applyCompetitionLessonPatch(original, {
      operations: [
        {
          op: "replace",
          path: "/learningObjectives/sportAbility",
          value: "能在游戏中稳定控制足球方向，并根据同伴位置调整运球速度。",
          reason: "强化运动能力目标的可观察性。",
        },
      ],
    });

    expect(next.learningObjectives.sportAbility).toContain("稳定控制足球方向");
    expect(original.learningObjectives.sportAbility).not.toContain("稳定控制足球方向");
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
});
