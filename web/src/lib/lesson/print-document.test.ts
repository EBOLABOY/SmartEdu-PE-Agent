import { describe, expect, it } from "vitest";

import { DEFAULT_COMPETITION_LESSON_PLAN } from "@/lib/lesson/contract";
import { buildCompetitionLessonPrintHtml } from "@/lib/lesson/print-document";

describe("competition-lesson-print-document", () => {
  it("会生成独立可打印的 A4 课时计划 HTML 文档", () => {
    const html = buildCompetitionLessonPrintHtml(DEFAULT_COMPETITION_LESSON_PLAN);

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain("XXX｜正式打印版");
    expect(html).toContain("--competition-print-page-width: 210mm");
    expect(html).toContain("@page");
    expect(html).toContain("competition-print-root");
    expect(html).toContain("预计平均心率");
  });

  it("会把叙述性 JSON 数组合并为自然段，避免短语数组造成额外换行", () => {
    const html = buildCompetitionLessonPrintHtml({
      ...DEFAULT_COMPETITION_LESSON_PLAN,
      narrative: {
        ...DEFAULT_COMPETITION_LESSON_PLAN.narrative,
        guidingThought: ["健康第一", "教育理念，落实", "教会、勤练、常赛", "要求。"],
      },
    });

    expect(html).toContain("健康第一教育理念，落实教会、勤练、常赛要求。");
    expect(html).not.toContain("<p class=\"competition-print-paragraph\">健康第一</p>");
  });

  it("会把课时计划具体教学内容中的小标题加粗并单独换行", () => {
    const html = buildCompetitionLessonPrintHtml({
      ...DEFAULT_COMPETITION_LESSON_PLAN,
      periodPlan: {
        ...DEFAULT_COMPETITION_LESSON_PLAN.periodPlan,
        rows: DEFAULT_COMPETITION_LESSON_PLAN.periodPlan.rows.map((row, index) =>
          index === 1
            ? {
                ...row,
                content: [
                  "1. **找准甜点区**：观察示范，明确脚内侧触球部位。2. **两人连线**：两人一组完成定点传接球。3. 小队通关：开展连续传球挑战。",
                ],
              }
            : row,
        ),
      },
    });

    expect(html).toContain("competition-print-teaching-content-heading");
    expect(html).toContain("<strong class=\"competition-print-teaching-content-heading\">1. 找准甜点区</strong>");
    expect(html).toContain("<strong class=\"competition-print-teaching-content-heading\">2. 两人连线</strong>");
    expect(html).toContain("<strong class=\"competition-print-teaching-content-heading\">3. 小队通关</strong>");
    expect(html).not.toContain("**找准甜点区**");
  });

  it("会优先渲染课时计划行内的 AI 教学站位图", () => {
    const html = buildCompetitionLessonPrintHtml({
      ...DEFAULT_COMPETITION_LESSON_PLAN,
      periodPlan: {
        ...DEFAULT_COMPETITION_LESSON_PLAN.periodPlan,
        rows: DEFAULT_COMPETITION_LESSON_PLAN.periodPlan.rows.map((row, index) =>
          index === 0
            ? {
                ...row,
                diagramAssets: [
                  {
                    alt: "准备部分站位图",
                    caption: "准备部分队形",
                    height: 320,
                    imageUrl: "data:image/png;base64,diagram",
                    kind: "formation",
                    source: "ai-generated",
                    width: 320,
                  },
                ],
              }
            : row,
        ),
      },
    });

    expect(html).toContain("competition-print-ai-diagram-image");
    expect(html).toContain("<object");
    expect(html).toContain("data=\"data:image/png;base64,diagram\"");
    expect(html).toContain("准备部分站位图");
    expect(html).toContain("data:image/png;base64,diagram");
  });

  it("会渲染同一课时计划行内的多张 AI 教学站位图", () => {
    const html = buildCompetitionLessonPrintHtml({
      ...DEFAULT_COMPETITION_LESSON_PLAN,
      periodPlan: {
        ...DEFAULT_COMPETITION_LESSON_PLAN.periodPlan,
        rows: DEFAULT_COMPETITION_LESSON_PLAN.periodPlan.rows.map((row, index) =>
          index === 1
            ? {
                ...row,
                diagramAssets: [
                  {
                    alt: "基本部分图一",
                    caption: "找准甜点区",
                    height: 320,
                    imageUrl: "data:image/png;base64,basic-a",
                    kind: "movement",
                    source: "ai-generated",
                    width: 320,
                  },
                  {
                    alt: "基本部分图二",
                    caption: "两人连线",
                    height: 320,
                    imageUrl: "data:image/png;base64,basic-b",
                    kind: "station-rotation",
                    source: "ai-generated",
                    width: 320,
                  },
                ],
              }
            : row,
        ),
      },
    });

    expect(html).toContain("data=\"data:image/png;base64,basic-a\"");
    expect(html).toContain("data=\"data:image/png;base64,basic-b\"");
    expect(html).toContain("找准甜点区");
    expect(html).toContain("两人连线");
  });

  it("会为 AI 教学站位图内置代码示意图兜底，避免外链失效时出现破图", () => {
    const html = buildCompetitionLessonPrintHtml({
      ...DEFAULT_COMPETITION_LESSON_PLAN,
      periodPlan: {
        ...DEFAULT_COMPETITION_LESSON_PLAN.periodPlan,
        rows: DEFAULT_COMPETITION_LESSON_PLAN.periodPlan.rows.map((row, index) =>
          index === 1
            ? {
                ...row,
                diagramAssets: [
                  {
                    alt: "基本部分站位图",
                    caption: "基本部分队形",
                    height: 320,
                    imageUrl: "https://private-storage.example/expired.png",
                    kind: "movement",
                    source: "ai-generated",
                    width: 320,
                  },
                ],
              }
            : row,
        ),
      },
    });

    expect(html).toContain("图片暂不可用，已切换为文本生成示意图");
    expect(html).toContain("competition-print-ai-diagram-fallback");
    expect(html).toContain("competition-print-field-box");
    expect(html).toContain("https://private-storage.example/expired.png");
  });
});
