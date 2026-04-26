import { describe, expect, it } from "vitest";

import { DEFAULT_COMPETITION_LESSON_PLAN } from "@/lib/competition-lesson-contract";
import { buildCompetitionLessonPrintHtml } from "@/lib/competition-lesson-print-document";

describe("competition-lesson-print-document", () => {
  it("会生成独立可打印的 A4 教案 HTML 文档", () => {
    const html = buildCompetitionLessonPrintHtml(DEFAULT_COMPETITION_LESSON_PLAN);

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain("操控性技能－足球游戏｜正式打印版");
    expect(html).toContain("--competition-print-page-width: 210mm");
    expect(html).toContain("@page");
    expect(html).toContain("competition-print-root");
    expect(html).toContain("预计平均心率");
  });
});
