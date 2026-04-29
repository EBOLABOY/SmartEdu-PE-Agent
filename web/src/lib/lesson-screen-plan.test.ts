import { describe, expect, it } from "vitest";

import { DEFAULT_COMPETITION_LESSON_PLAN } from "@/lib/competition-lesson-contract";

import { buildLessonScreenPlanFromLessonPlan } from "./lesson-screen-plan";

const LESSON_PLAN = {
  ...DEFAULT_COMPETITION_LESSON_PLAN,
  periodPlan: {
    ...DEFAULT_COMPETITION_LESSON_PLAN.periodPlan,
    rows: [
      {
        structure: "准备部分" as const,
        content: ["课堂常规"],
        methods: {
          teacher: ["宣布本课目标和安全要求。"],
          students: ["集合整队，回应教师要求。"],
        },
        organization: ["四列横队"],
        time: "1分钟",
        intensity: "低",
      },
      {
        structure: "基本部分" as const,
        content: ["篮球传切配合"],
        methods: {
          teacher: ["示范传球路线。"],
          students: ["跑位接球，理解防守站位。"],
        },
        organization: ["半场分组练习"],
        time: "8分钟",
        intensity: "中",
      },
      {
        structure: "基本部分" as const,
        content: ["站点轮换练习"],
        methods: {
          teacher: ["巡回纠错。"],
          students: ["四个站点循环练习，听到口令后顺时针轮换。"],
        },
        organization: ["四组站点轮换"],
        time: "7分钟",
        intensity: "中",
      },
      {
        structure: "基本部分" as const,
        content: ["比赛展示"],
        methods: {
          teacher: ["讲解规则。"],
          students: ["分组比赛，按完成质量和合作表现计分。"],
        },
        organization: ["四组分区轮换"],
        time: "6分钟",
        intensity: "中高",
      },
      {
        structure: "结束部分" as const,
        content: ["放松总结"],
        methods: {
          teacher: ["提问评价。"],
          students: ["拉伸放松，回顾传切时机。"],
        },
        organization: ["半圆队形"],
        time: "4分钟",
        intensity: "低",
      },
    ],
  },
};

describe("lesson-screen-plan", () => {
  it("会从结构化课时计划 JSON 构建互动大屏结构化计划", () => {
    const plan = buildLessonScreenPlanFromLessonPlan(LESSON_PLAN);

    expect(plan.sections).toHaveLength(5);
    expect(plan.sections[0]).toMatchObject({
      title: "课堂常规",
      durationSeconds: 60,
      supportModule: "formation",
      sourceRowIndex: 0,
    });
    expect(plan.sections.find((section) => section.title.includes("传切"))).toMatchObject({
      durationSeconds: 480,
      supportModule: "tacticalBoard",
    });
    expect(plan.sections.find((section) => section.title.includes("站点"))).toMatchObject({
      durationSeconds: 420,
      supportModule: "rotation",
    });
    expect(plan.sections.find((section) => section.title.includes("比赛"))).toMatchObject({
      durationSeconds: 360,
      supportModule: "scoreboard",
    });
    expect(plan.sections.find((section) => section.title.includes("放松"))).toMatchObject({
      durationSeconds: 240,
      supportModule: "formation",
    });
  });

  it("会为每个 JSON 环节提供可解释的模块选择理由", () => {
    const plan = buildLessonScreenPlanFromLessonPlan(LESSON_PLAN);

    expect(plan.sections.every((section) => section.reason && section.reason.length > 10)).toBe(true);
    expect(plan.sections.find((section) => section.supportModule === "scoreboard")?.reason).toContain("分组计分板");
    expect(plan.sections.find((section) => section.supportModule === "tacticalBoard")?.reason).toContain("战术板");
  });

  it("会为 Agent HTML 生成补齐页面目标、学生行动和视觉意图", () => {
    const plan = buildLessonScreenPlanFromLessonPlan(LESSON_PLAN);
    const tacticalSection = plan.sections.find((section) => section.supportModule === "tacticalBoard");

    expect(plan.sections.every((section) => section.objective?.includes(section.title))).toBe(true);
    expect(plan.sections.every((section) => section.studentActions?.length)).toBe(true);
    expect(plan.sections.every((section) => section.safetyCue?.length)).toBe(true);
    expect(plan.sections.every((section) => section.evaluationCue?.length)).toBe(true);
    expect(tacticalSection?.visualIntent).toContain("战术板");
  });
});
