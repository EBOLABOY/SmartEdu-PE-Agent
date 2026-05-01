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

    expect(plan.visualSystem).toContain("统一视觉系统");
    expect(plan.sections).toHaveLength(5);
    expect(plan.sections[0]).toMatchObject({
      title: "课堂常规",
      durationSeconds: 60,
      sourceRowIndex: 0,
    });
    expect(plan.sections.find((section) => section.title.includes("传切"))).toMatchObject({
      durationSeconds: 480,
    });
    expect(plan.sections.find((section) => section.title.includes("站点"))).toMatchObject({
      durationSeconds: 420,
    });
    expect(plan.sections.find((section) => section.title.includes("比赛"))).toMatchObject({
      durationSeconds: 360,
    });
    expect(plan.sections.find((section) => section.title.includes("放松"))).toMatchObject({
      durationSeconds: 240,
    });
  });

  it("会为每个 JSON 环节提供可解释的页面草案理由", () => {
    const plan = buildLessonScreenPlanFromLessonPlan(LESSON_PLAN);

    expect(plan.sections.every((section) => section.reason && section.reason.length > 10)).toBe(true);
    expect(plan.sections[0]?.reason).toContain("结构化课时计划");
    expect(plan.sections[0]?.reason).toContain("教学环节参考草案");
    expect(plan.sections[0]?.reason).toContain("时间解析");
  });

  it("会为 Agent HTML 生成补齐页面目标、学生行动和视觉意图", () => {
    const plan = buildLessonScreenPlanFromLessonPlan(LESSON_PLAN);

    expect(plan.sections.every((section) => section.objective?.includes(section.title))).toBe(true);
    expect(plan.sections.every((section) => section.studentActions?.length)).toBe(true);
    expect(plan.sections.every((section) => section.safetyCue?.length)).toBe(true);
    expect(plan.sections.every((section) => section.evaluationCue?.length)).toBe(true);
    expect(plan.sections.every((section) => section.visualIntent?.includes("自由选择"))).toBe(true);
    expect(plan.sections.every((section) => section.visualMode)).toBe(true);
    expect(plan.sections.every((section) => section.pagePrompt?.includes("不要输出完整 HTML"))).toBe(true);
  });

  it("会把动作形态类内容标记为需要生图或混合视觉资产", () => {
    const plan = buildLessonScreenPlanFromLessonPlan({
      ...LESSON_PLAN,
      periodPlan: {
        ...LESSON_PLAN.periodPlan,
        rows: [
          {
            structure: "基本部分" as const,
            content: ["五步拳动作学习"],
            methods: {
              teacher: ["示范弓步冲拳、弹踢冲拳和马步架打动作。"],
              students: ["观察动作分解，跟随口令练习五步拳组合。"],
            },
            organization: ["四列横队散开，前后左右保持一臂距离"],
            time: "10分钟",
            intensity: "中",
          },
        ],
      },
    });

    expect(plan.sections[0]).toMatchObject({
      visualMode: "hybrid",
    });
    expect(plan.sections[0]?.imagePrompt).toContain("16:9 横板体育课堂辅助讲解图");
    expect(plan.sections[0]?.imagePrompt).toContain("五步拳动作学习");
    expect(plan.sections[0]?.pagePrompt).toContain("visualMode=hybrid");
  });

  it("会把跑位路线类内容保留为 HTML/SVG 可视化", () => {
    const plan = buildLessonScreenPlanFromLessonPlan(LESSON_PLAN);
    const tacticalSection = plan.sections.find((section) => section.title.includes("传切"));

    expect(tacticalSection).toMatchObject({
      visualMode: "html",
    });
    expect(tacticalSection?.imagePrompt).toBeUndefined();
    expect(tacticalSection?.pagePrompt).toContain("visualMode=html");
  });
});
