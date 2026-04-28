import {
  getHtmlAttribute,
  getHtmlElement,
  getHtmlElements,
  getVisibleText,
  hasDoctype,
  hasHtmlClass,
  hasSourcedHtmlElement,
  isExternalHttpUrl,
  parseHtmlDocument,
} from "@/lib/html-inspection";

export type LessonScreenQualityReport = {
  errors: string[];
  warnings: string[];
};

export function analyzeLessonScreenHtml(html: string): LessonScreenQualityReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const document = parseHtmlDocument(html);
  const htmlElement = getHtmlElement(document, "html");
  const visibleText = getVisibleText(document);
  const slideCount = getHtmlElements(document, "section").filter((element) =>
    hasHtmlClass(element, "slide"),
  ).length;
  const timedSlideCount = getHtmlElements(document).filter((element) =>
    /^\d+$/.test(getHtmlAttribute(element, "data-duration") ?? ""),
  ).length;
  const hasExternalScript = getHtmlElements(document, "script").some((element) =>
    isExternalHttpUrl(getHtmlAttribute(element, "src")),
  );
  const hasExternalStylesheet = getHtmlElements(document, "link").some((element) =>
    isExternalHttpUrl(getHtmlAttribute(element, "href")),
  );

  if (!hasDoctype(document) && !hasSourcedHtmlElement(document, "html")) {
    errors.push("缺少完整 HTML 文档结构。");
  }

  if (getHtmlAttribute(htmlElement, "lang") !== "zh-CN") {
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

  if (!/开始上课/.test(visibleText)) {
    errors.push("缺少“开始上课”入口。");
  }

  if (!/上一页/.test(visibleText) || !/下一页/.test(visibleText) || !/暂停/.test(visibleText) || !/重新计时/.test(visibleText)) {
    errors.push("缺少基础课堂控制按钮。");
  }

  if (!/倒计时|timer|remaining|本环节剩余/i.test(visibleText)) {
    errors.push("缺少倒计时显示。");
  }

  if (!/学生三步行动/.test(visibleText)) {
    errors.push("缺少“学生三步行动”提示。");
  }

  if (!/本环节怎么做/.test(visibleText)) {
    errors.push("缺少“本环节怎么做”的学生任务聚焦区。");
  }

  if (!/学生自助提示/.test(visibleText)) {
    errors.push("缺少学生看屏自助理解提示。");
  }

  if (!/安全提醒/.test(visibleText)) {
    errors.push("缺少安全提醒模块。");
  }

  if (!/评价观察/.test(visibleText)) {
    warnings.push("缺少评价观察模块。");
  }

  if (!getHtmlElements(document).some((element) => getHtmlAttribute(element, "data-rhythm") !== null)) {
    warnings.push("未检测到页面 rhythm 标记，后续难以控制页面节奏。");
  }

  if (!getHtmlElements(document).some((element) => getHtmlAttribute(element, "data-support-module") !== null)) {
    warnings.push("未检测到支持模块结构化标记，后续难以稳定控制战术板、计分板、轮换路线和队形图。");
  }

  if (!/战术板|组织队形图|小组轮换路线|分组计分板/.test(visibleText)) {
    warnings.push("未检测到动作、队形、轮换或计分可视化模块，学生理解支撑不足。");
  }

  if (/\b(Unified|Playback|Console|Showcase|Open Class|Phase|AI)\b/i.test(visibleText)) {
    errors.push("课堂大屏可见界面不应出现英文控制台、展示页或 AI 包装文案。");
  }

  if (hasExternalScript || hasExternalStylesheet) {
    errors.push("课堂大屏不应依赖外部脚本或样式。");
  }

  return {
    errors: Array.from(new Set(errors)),
    warnings: Array.from(new Set(warnings)),
  };
}
