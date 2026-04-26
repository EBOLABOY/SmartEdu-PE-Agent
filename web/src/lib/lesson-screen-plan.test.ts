import { describe, expect, it } from "vitest";

import { buildLessonScreenPlanFromMarkdown } from "./lesson-screen-plan";

const LESSON_PLAN = `# 篮球传切配合课

| 课的结构 | 具体教学内容 | 教与学的方法 | 组织形式 | 运动时间 |
| --- | --- | --- | --- | --- |
| 课堂常规 | 集合整队，宣布本课目标和安全要求 | 教师讲解，学生回应 | 四列横队 | 1 分钟 |
| 战术学习 | 篮球传切配合，跑位接球，防守站位 | 示范传球路线，分组练习 | 半场分组练习 | 8 分钟 |
| 站点轮换练习 | 四个站点循环练习，听到口令后顺时针轮换 | 教师巡回纠错，学生合作练习 | 四组站点轮换 | 7 分钟 |
| 比赛展示 | 四组运球接力挑战，按完成质量和合作表现计分 | 教师讲解规则，学生分组比赛 | 四组分区轮换 | 6 分钟 |
| 放松总结 | 拉伸放松，回顾传切时机，布置课后练习 | 提问评价，学生自评 | 半圆队形 | 4 分钟 |
`;

describe("lesson-screen-plan", () => {
  it("会从已确认教案构建互动大屏结构化计划", () => {
    const plan = buildLessonScreenPlanFromMarkdown(LESSON_PLAN);

    expect(plan.sections).toHaveLength(5);
    expect(plan.sections[0]).toMatchObject({
      title: "课堂常规",
      durationSeconds: 60,
      supportModule: "formation",
    });
    expect(plan.sections.find((section) => section.title.includes("战术"))).toMatchObject({
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

  it("会为每个环节提供可解释的模块选择理由", () => {
    const plan = buildLessonScreenPlanFromMarkdown(LESSON_PLAN);

    expect(plan.sections.every((section) => section.reason && section.reason.length > 10)).toBe(true);
    expect(plan.sections.find((section) => section.supportModule === "scoreboard")?.reason).toContain("分组计分板");
    expect(plan.sections.find((section) => section.supportModule === "tacticalBoard")?.reason).toContain("战术板");
  });
});
