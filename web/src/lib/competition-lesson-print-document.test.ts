import { describe, expect, it } from "vitest";

import { DEFAULT_COMPETITION_LESSON_PLAN } from "@/lib/competition-lesson-contract";
import { buildCompetitionLessonPrintHtml } from "@/lib/competition-lesson-print-document";

describe("competition-lesson-print-document", () => {
  it("会生成独立可打印的 A4 教案 HTML 文档", () => {
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
});
