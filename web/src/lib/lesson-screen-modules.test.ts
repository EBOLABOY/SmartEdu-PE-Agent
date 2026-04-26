import { describe, expect, it } from "vitest";

import {
  escapeHtml,
  extractLoadCurvePoints,
  renderActivitySupportModule,
  renderFormationModule,
  renderLessonSlideModule,
  renderLoadCurveModule,
  renderRotationModule,
  renderScoreboardModule,
  renderTacticalBoardModule,
  renderTimelineModule,
  resolveLessonSupportModule,
  type RenderableLessonSlide,
} from "./lesson-screen-modules";

const SLIDE: RenderableLessonSlide = {
  title: "战术学习",
  durationSeconds: 480,
  durationLabel: "8 分钟",
  estimated: false,
  content: ["篮球传切配合，跑位接球，防守站位"],
  organization: "半场分组轮换",
  teacherTip: "示范传球路线，巡回纠错",
  studentAction: "观察示范，合作练习",
  safety: "保持移动距离，避免碰撞",
  assessment: "观察跑位时机与传球选择",
  boardRequired: true,
  supportModule: "tacticalBoard",
  actionSteps: ["观察战术板路线", "无球慢速试跑", "带球完成配合"],
  selfHelp: "看右侧自动跑位，按编号和箭头移动。",
};

const COMPETITION_SLIDE: RenderableLessonSlide = {
  ...SLIDE,
  title: "比赛展示",
  content: ["四组运球接力挑战，按完成质量和合作表现计分"],
  organization: "四组分区轮换",
  boardRequired: false,
  supportModule: "scoreboard",
};

const ROTATION_SLIDE: RenderableLessonSlide = {
  ...SLIDE,
  title: "站点轮换练习",
  content: ["四个站点循环练习，听到口令后顺时针轮换"],
  organization: "四组站点轮换",
  boardRequired: false,
  supportModule: "rotation",
};

describe("lesson-screen-modules", () => {
  it("会转义 HTML 文本", () => {
    expect(escapeHtml("<script>alert('x')</script>")).toBe("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
  });

  it("会渲染时间轴模块", () => {
    const html = renderTimelineModule([SLIDE]);

    expect(html).toContain("01");
    expect(html).toContain("战术学习");
    expect(html).toContain("8 分钟");
  });

  it("会渲染自动跑位战术板模块", () => {
    const html = renderTacticalBoardModule(SLIDE);

    expect(html).toContain("战术板自动跑位");
    expect(html).toContain("runner-one");
    expect(html).toContain("学生自助提示");
  });

  it("会渲染组织队形图模块", () => {
    const html = renderFormationModule({ ...SLIDE, boardRequired: false, organization: "四列横队" });

    expect(html).toContain("组织队形图");
    expect(html).toContain("四列横队");
    expect(html).toContain("formation-student");
  });

  it("会渲染分组计分板模块", () => {
    const html = renderScoreboardModule(COMPETITION_SLIDE);

    expect(html).toContain("分组计分板");
    expect(html).toContain("红队");
    expect(html).toContain("完成动作 +1 分");
    expect(html).toContain('data-score-action="plus"');
    expect(html).toContain('data-score-action="minus"');
    expect(html).toContain('data-score-action="reset"');
  });

  it("会解析并渲染运动负荷曲线模块", () => {
    const points = extractLoadCurvePoints("心率曲线节点：0'=90，7'=120，15'=145，25'=155，38'=100");
    const html = renderLoadCurveModule(points);

    expect(points).toHaveLength(5);
    expect(html).toContain("运动负荷曲线");
    expect(html).toContain("load-line");
    expect(html).toContain("155");
  });

  it("会渲染小组轮换路线模块", () => {
    const html = renderRotationModule(ROTATION_SLIDE);

    expect(html).toContain("小组轮换路线");
    expect(html).toContain("rotation-route");
    expect(html).toContain("顺时针轮换");
  });

  it("会按课堂内容选择活动支持模块", () => {
    expect(renderActivitySupportModule(SLIDE)).toContain("战术板自动跑位");
    expect(renderActivitySupportModule(COMPETITION_SLIDE)).toContain("分组计分板");
    expect(renderActivitySupportModule(ROTATION_SLIDE)).toContain("小组轮换路线");
    expect(
      renderActivitySupportModule({
        ...SLIDE,
        boardRequired: false,
        supportModule: "formation",
        title: "课堂常规",
        organization: "四列横队",
      }),
    ).toContain("组织队形图");
  });

  it("会优先使用显式支持模块配置", () => {
    const explicitScoreboard = { ...SLIDE, supportModule: "scoreboard" as const };

    expect(resolveLessonSupportModule(explicitScoreboard)).toBe("scoreboard");
    expect(renderActivitySupportModule(explicitScoreboard)).toContain("分组计分板");
  });

  it("会渲染完整教学环节模块", () => {
    const html = renderLessonSlideModule(SLIDE, 2, 4, "activity");

    expect(html).toContain('data-rhythm="activity"');
    expect(html).toContain('data-support-module="tacticalBoard"');
    expect(html).toContain("学生三步行动");
    expect(html).toContain("安全提醒");
    expect(html).toContain("评价观察");
  });
});
