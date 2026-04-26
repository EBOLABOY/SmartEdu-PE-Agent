import { describe, expect, it } from "vitest";

import { analyzeLessonScreenHtml } from "@/lib/lesson-screen-quality";
import { analyzeSandboxHtml } from "@/lib/sandbox-html";

import { renderLessonScreenScript } from "./lesson-screen-script";
import { buildLessonScreenProjectState } from "./lesson-screen-state";
import { buildLessonSlideshowHtml, extractLessonSlides, isPptStyleLessonHtml } from "./lesson-slideshow-html";

const LESSON_PLAN = `# 篮球传切配合课

## 十、课时计划（教案）
| 课的结构 | 具体教学内容 | 教与学的方法 | 组织形式 | 运动时间 |
| --- | --- | --- | --- | --- |
| 课堂常规 | 集合整队，宣布本课目标和安全要求 | 教师讲解，学生回应 | 四列横队 | 1 分钟 |
| 热身活动 | 慢跑、动态拉伸、专项脚步 | 教师领做，学生模仿 | 绕场与散点 | 5 分钟 |
| 战术学习 | 篮球传切配合，跑位接球，防守站位 | 示范传球路线，分组练习 | 半场分组轮换 | 8 分钟 |
| 比赛展示 | 四组运球接力挑战，按完成质量和合作表现计分 | 教师讲解规则，学生分组比赛 | 四组分区轮换 | 6 分钟 |
| 放松总结 | 拉伸放松，回顾传切时机，布置课后练习 | 提问评价，学生自评 | 半圆队形 | 4 分钟 |

## 八、运动负荷预计

心率曲线节点：0'=90，5'=120，10'=145，15'=155，18'=100
`;

describe("lesson-slideshow-html", () => {
  it("会从教案表格中提取分环节幻灯片和时间", () => {
    const slides = extractLessonSlides(LESSON_PLAN);

    expect(slides).toHaveLength(5);
    expect(slides[0]?.title).toContain("课堂常规");
    expect(slides[0]?.durationSeconds).toBe(60);
    expect(slides.some((slide) => slide.title.includes("战术") && slide.boardRequired)).toBe(true);
    expect(slides.find((slide) => slide.title.includes("比赛"))?.supportModule).toBe("scoreboard");
    expect(slides.find((slide) => slide.title.includes("战术"))?.supportModule).toBe("tacticalBoard");
    expect(slides.some((slide) => slide.title === "热身")).toBe(false);
    expect(slides.some((slide) => slide.title === "比赛")).toBe(false);
  });

  it("会生成可在沙箱中运行的 PPT 式多页 HTML", () => {
    const html = buildLessonSlideshowHtml(LESSON_PLAN);
    const report = analyzeSandboxHtml(html);

    expect(html).toContain("<title>篮球传切配合课｜课堂学习辅助大屏</title>");
    expect(html).toContain("<style>");
    expect(html).toContain("--screen-bg:");
    expect(html).toContain("开始上课");
    expect(html).toContain("倒计时");
    expect(html).toContain("课堂运行总览");
    expect(html).toContain("学生三步行动");
    expect(html).toContain("学生自助提示");
    expect(html).toContain("战术板自动跑位");
    expect(html).toContain("运动负荷曲线");
    expect(html).toContain("load-line");
    expect(html).toContain("分组计分板");
    expect(html).toContain("setupScoreboards");
    expect(html).toContain('data-score-action="plus"');
    expect(html).toContain('data-theme="basketball-energy"');
    expect(html).toContain('data-rhythm="activity"');
    expect(html).toContain('data-support-module="scoreboard"');
    expect(html).toContain('data-support-module="tacticalBoard"');
    expect(html).toContain("上一页");
    expect(html).toContain("下一页");
    expect(html).toContain("重新计时");
    expect(html).toContain("战术板");
    expect(html).toContain('data-duration="60"');
    expect(isPptStyleLessonHtml(html)).toBe(true);
    expect(report.blockedReasons).toEqual([]);
    expect(analyzeLessonScreenHtml(html).errors).toEqual([]);
  });

  it("会构建课堂大屏中间态供生成器复用", () => {
    const slides = extractLessonSlides(LESSON_PLAN);
    const state = buildLessonScreenProjectState({
      title: "篮球传切配合课",
      lessonText: LESSON_PLAN,
      slides,
    });

    expect(state.totalMinutes).toBe(24);
    expect(state.slideData).toHaveLength(5);
    expect(state.loadCurvePoints).toHaveLength(5);
    expect(state.designSpec.theme.name).toBe("basketball-energy");
    expect(state.boardCount).toBeGreaterThanOrEqual(1);
    expect(state.supportModuleCounts.scoreboard).toBe(1);
    expect(state.supportModuleCounts.tacticalBoard).toBeGreaterThanOrEqual(1);
  });

  it("会独立渲染课堂大屏运行脚本", () => {
    const script = renderLessonScreenScript([{ title: "课堂常规", durationSeconds: 60 }]);

    expect(script).toContain("<script>");
    expect(script).toContain("const slideData");
    expect(script).toContain("setupScoreboards");
    expect(script).toContain("课堂常规");
  });

  it("会识别不合格的单页 HTML", () => {
    expect(
      isPptStyleLessonHtml("<!DOCTYPE html><html lang=\"zh-CN\"><body><h1>单页教案</h1></body></html>"),
    ).toBe(false);
  });

  it("会报告不合格的课堂大屏 HTML", () => {
    const report = analyzeLessonScreenHtml("<!DOCTYPE html><html><body><h1>单页教案</h1></body></html>");

    expect(report.errors.join(" ")).toContain("lang=\"zh-CN\"");
    expect(report.errors.join(" ")).toContain("课堂大屏至少需要");
    expect(report.errors.join(" ")).toContain("开始上课");
    expect(report.warnings.join(" ")).toContain("支持模块结构化标记");
  });
});
