export type LessonScreenQualityReport = {
  errors: string[];
  warnings: string[];
};

function countMatches(html: string, pattern: RegExp) {
  return (html.match(pattern) ?? []).length;
}

export function analyzeLessonScreenHtml(html: string): LessonScreenQualityReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const slideCount = countMatches(html, /<section\b[^>]*class=["'][^"']*\bslide\b/gi);
  const timedSlideCount = countMatches(html, /data-duration=["']\d+["']/gi);

  if (!/<!doctype\s+html/i.test(html) && !/<html[\s>]/i.test(html)) {
    errors.push("缺少完整 HTML 文档结构。");
  }

  if (!/<html[^>]+lang=["']zh-CN["']/i.test(html)) {
    errors.push("HTML 必须声明 lang=\"zh-CN\"。");
  }

  if (!/overflow:\s*hidden/i.test(html) || !/(100vw|100%)/i.test(html) || !/(100vh|100%)/i.test(html)) {
    warnings.push("未明确检测到全屏投屏布局约束。");
  }

  if (slideCount < 3) {
    errors.push("课堂大屏至少需要封面和两个以上内容页。");
  }

  if (timedSlideCount < 2) {
    errors.push("至少两个内容页需要 data-duration 倒计时。");
  }

  if (!/开始上课/.test(html)) {
    errors.push("缺少“开始上课”入口。");
  }

  if (!/上一页/.test(html) || !/下一页/.test(html) || !/暂停/.test(html) || !/重新计时/.test(html)) {
    errors.push("缺少基础课堂控制按钮。");
  }

  if (!/倒计时|timer|remaining|本环节剩余/i.test(html)) {
    errors.push("缺少倒计时显示。");
  }

  if (!/学生三步行动/.test(html)) {
    errors.push("缺少面向学生的三步行动提示。");
  }

  if (!/安全提醒/.test(html)) {
    errors.push("缺少安全提醒模块。");
  }

  if (!/评价观察/.test(html)) {
    warnings.push("缺少评价观察模块。");
  }

  if (!/data-rhythm=["']/.test(html)) {
    warnings.push("未检测到页面 rhythm 标记，后续难以控制页面节奏。");
  }

  if (!/data-support-module=["']/.test(html)) {
    warnings.push("未检测到支持模块结构化标记，后续难以稳定控制战术板、计分板、轮换路线和队形图。");
  }

  if (/<script[^>]+src\s*=\s*["']https?:\/\//i.test(html) || /<link[^>]+href\s*=\s*["']https?:\/\//i.test(html)) {
    errors.push("课堂大屏不应依赖外部脚本或样式。");
  }

  return {
    errors: Array.from(new Set(errors)),
    warnings: Array.from(new Set(warnings)),
  };
}
