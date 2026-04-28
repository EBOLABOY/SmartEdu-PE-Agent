import { describe, expect, it } from "vitest";

import { buildCompetitionLessonDraft } from "@/lib/competition-lesson-draft";

describe("competition-lesson-draft", () => {
  it("builds a schema-valid default draft before the model emits partial output", () => {
    const draft = buildCompetitionLessonDraft();

    expect(draft.title).toBe("教案生成中");
    expect(draft.periodPlan.rows).toHaveLength(3);
    expect(draft.evaluation.map((item) => item.level)).toEqual(["三颗星", "二颗星", "一颗星"]);
  });

  it("merges AI SDK partial object output into the stable lesson draft shape", () => {
    const draft = buildCompetitionLessonDraft({
      learningObjectives: {
        sportAbility: ["能完成正手发高远球动作"],
      },
      periodPlan: {
        rows: [
          {
            content: ["课堂常规与专项热身"],
            time: "6分钟",
          },
          {
            content: ["正手发高远球分层练习"],
            methods: {
              teacher: ["示范侧身引拍与击球后送"],
            },
          },
        ],
      },
      title: "羽毛球：正手发高远球",
    });

    expect(draft.title).toBe("羽毛球：正手发高远球");
    expect(draft.learningObjectives.sportAbility).toEqual(["能完成正手发高远球动作"]);
    expect(draft.periodPlan.rows[0]).toMatchObject({
      content: ["课堂常规与专项热身"],
      structure: "准备部分",
      time: "6分钟",
    });
    expect(draft.periodPlan.rows[1]?.methods.teacher).toEqual(["示范侧身引拍与击球后送"]);
    expect(draft.periodPlan.rows[2]?.structure).toBe("结束部分");
  });

  it("keeps the last schema-valid draft when a partial update is temporarily invalid", () => {
    const validDraft = buildCompetitionLessonDraft({
      title: "羽毛球草稿",
    });
    const invalidDraft = buildCompetitionLessonDraft(
      {
        periodPlan: {
          rows: [
            {
              structure: "热身环节",
            },
          ],
        },
      } as unknown as Parameters<typeof buildCompetitionLessonDraft>[0],
      validDraft,
    );

    expect(invalidDraft).toBe(validDraft);
  });

  it("ignores empty draft leaves instead of overwriting usable content", () => {
    const draft = buildCompetitionLessonDraft({
      learningObjectives: {
        sportAbility: ["能稳定完成正手发高远球"],
      },
      teacher: {
        name: "",
        school: null,
      },
      title: "",
    } as unknown as Parameters<typeof buildCompetitionLessonDraft>[0]);

    expect(draft.title).toBe("教案生成中");
    expect(draft.teacher.name).toBe("正在生成");
    expect(draft.teacher.school).toBe("正在生成");
    expect(draft.learningObjectives.sportAbility).toEqual(["能稳定完成正手发高远球"]);
  });
});
