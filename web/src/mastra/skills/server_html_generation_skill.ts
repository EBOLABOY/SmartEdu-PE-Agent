import { convertToModelMessages, generateText, type UIMessageChunk } from "ai";

import {
  competitionLessonPlanSchema,
  type CompetitionLessonPlan,
} from "@/lib/competition-lesson-contract";
import type {
  HtmlScreenPlan,
  HtmlScreenSectionPlan,
} from "@/lib/html-screen-plan-contract";
import type {
  SmartEduUIMessage,
} from "@/lib/lesson-authoring-contract";
import { createChatModel } from "@/mastra/models";
import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

import { enrichHtmlScreenPlanWithVisualAssets } from "./html_screen_visual_asset_skill";
import { runModelOperationWithRetry } from "./lesson_generation_skill";

const DEFAULT_HTML_MODEL_ID = process.env.AI_HTML_MODEL ?? process.env.AI_MODEL ?? "gpt-4.1-mini";
const DEFAULT_SECTION_CONCURRENCY = 4;

function resolveSectionConcurrency() {
  const parsed = Number.parseInt(process.env.AI_HTML_SECTION_CONCURRENCY ?? "", 10);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_SECTION_CONCURRENCY;
  }

  return Math.min(8, Math.max(1, parsed));
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(values[currentIndex]!, currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );

  return results;
}

function buildHtmlServerSystemPrompt(system: string) {
  return [
    system,
    "你正在执行服务端 HTML 大屏逐页片段生成任务，不是工具调用或聊天回复。",
    "你每次只生成一个课堂分镜页的 HTML 片段，不生成完整 HTML 文档。",
    "禁止输出 <!DOCTYPE>、<html>、<head>、<body>、<script>、<style>、外链资源、Markdown 代码围栏、解释文字或 JSON。",
    "允许使用语义化 div、ul、li、strong、span、svg、path、circle、line、text 等内联片段；所有可见文本必须是简体中文。",
    "页面整体追求 Apple Inc. 顶级 UI 设计师视角的 iOS 18 横板课堂大屏质感：毛玻璃效果、Gaussian blur/高斯模糊、动态渐变、细腻阴影、柔和高光和圆角层级，但不要牺牲远距离可读性。",
    "最终完整 CSS 和 JavaScript 由服务端 HTML 外壳统一提供；片段只输出结构与内容，使用 section-brief、brief-block、cue-grid、module-visual、scoreboard-grid、glass-panel、hero-stack、center-module 等语义类名即可。",
  ].join("\n\n");
}

function getLatestUserText(messages: SmartEduUIMessage[]) {
  const userMessages = messages.filter((message) => message.role === "user");

  return userMessages
    .at(-1)
    ?.parts.filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

async function buildSectionModelMessages(input: {
  lessonPlan: string;
  originalMessages: SmartEduUIMessage[];
  section: HtmlScreenSectionPlan;
  sectionIndex: number;
  totalSections: number;
  visualSystem: string;
}) {
  const latestUserText = getLatestUserText(input.originalMessages);

  return convertToModelMessages([
    {
      role: "user",
      parts: [
        {
          type: "text",
          text: [
            input.section.pagePrompt
              ? "请严格依据“页面生成提示词”生成这个课堂大屏分镜的 HTML 内容片段。"
              : "请只为下面这个课堂大屏分镜生成 HTML 内容片段。",
            "片段会被服务端放入固定的 <section class=\"slide lesson-slide\"> 模板中，所以不要输出完整文档、section 标签、script、style 或 Markdown。",
            "必须严格继承统一视觉系统，不要为本页另起一套配色、按钮、卡片、倒计时或图形语言。",
            "请把视觉结构设计成横板课堂大屏片段，优先使用毛玻璃信息层、动态渐变背景承载区、细腻阴影层级和大字号中文，而不是普通网页卡片堆叠。",
            "必须包含：核心任务、学生行动、安全提醒、评价观察。允许用少量文字，禁止做成密集文字板。",
            input.section.pageRole === "cover"
              ? "本页是首页。必须生成简洁封面内容：大标题居中，学校和教师姓名在标题下方，预留或呈现“开始上课”按钮视觉；不要生成倒计时和课堂任务卡。"
              : "",
            "请根据 pagePrompt 和 visualIntent 自由选择最有教学帮助的视觉表达；不得受固定组件枚举限制。",
            input.section.visualMode === "hybrid" && input.section.visualAsset
              ? "本页已有服务端生成的 16:9 教学辅助图，图片面板会由服务端插入；你只生成图片旁边或下方的任务、提示、观察与安全信息，不要再输出 img 标签或外链资源。"
              : "如果本页是学习或练习内容，优先用 HTML/CSS/SVG 手搓动作结构、战术跑位、路线、器材路径、对抗关系或动作关键点，帮助学生形成认知。",
            "如果本页是比赛、体能训练、放松拉伸、课堂总结或其他非学练页，优先生成一个居中的任务模块，倒计时视觉要突出，规则和安全提示只保留关键短句。",
            latestUserText ? `教师本轮要求：${latestUserText}` : "",
            "",
            `分镜序号：${input.sectionIndex + 1}/${input.totalSections}`,
            "统一视觉系统：",
            input.visualSystem,
            "",
            input.section.pagePrompt ? ["页面生成提示词：", input.section.pagePrompt, ""].join("\n") : "",
            "当前分镜 JSON：",
            JSON.stringify(input.section),
            "",
            "已确认课时计划 JSON：",
            input.lessonPlan,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    },
  ]);
}

function parseLessonPlan(lessonPlan: string): CompetitionLessonPlan | undefined {
  try {
    return competitionLessonPlanSchema.parse(JSON.parse(lessonPlan));
  } catch {
    return undefined;
  }
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resolveSafeImageUrl(value: string) {
  if (!/^https?:\/\//i.test(value)) {
    return "";
  }

  return escapeHtml(value);
}

function stripCodeFence(value: string) {
  return value.trim().replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function sanitizeSectionFragment(value: string) {
  return stripCodeFence(value)
    .replace(/<!doctype[\s\S]*?>/gi, "")
    .replace(/<\/?(?:html|head|body|section)[^>]*>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<link[\s\S]*?>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:src|href)\s*=\s*(?:"https?:\/\/[^"]*"|'https?:\/\/[^']*')/gi, "");
}

function durationLabel(seconds?: number) {
  if (!seconds) {
    return "估算时间";
  }

  const minutes = Math.max(1, Math.round(seconds / 60));

  return `${minutes}分钟`;
}

function renderVisualAssetPanel(section: HtmlScreenSectionPlan) {
  const asset = section.visualAsset;
  const imageUrl = asset?.imageUrl ? resolveSafeImageUrl(asset.imageUrl) : "";

  if (!asset || !imageUrl) {
    return "";
  }

  return `
    <figure class="teaching-image-panel">
      <div class="teaching-image-frame">
        <img src="${imageUrl}" alt="${escapeHtml(asset.alt)}" loading="eager" decoding="async">
      </div>
      <figcaption>${escapeHtml(asset.caption ?? section.title)}</figcaption>
    </figure>
  `;
}

function renderImageSectionFragment(section: HtmlScreenSectionPlan) {
  const actions = (section.studentActions?.length ? section.studentActions : ["看图理解动作结构", "按教师口令分组练习", "同伴观察并及时反馈"])
    .slice(0, 3);
  const visualPanel = renderVisualAssetPanel(section);

  if (!visualPanel) {
    return "";
  }

  return `
    <div class="teaching-image-layout">
      ${visualPanel}
      <aside class="teaching-image-cues">
        <div>
          <span>本页任务</span>
          <p>${escapeHtml(section.objective ?? `学习并练习${section.title}`)}</p>
        </div>
        <div>
          <span>学生行动</span>
          <ol>
            ${actions.map((action) => `<li>${escapeHtml(action)}</li>`).join("")}
          </ol>
        </div>
        <div class="safety">
          <span>安全边界</span>
          <p>${escapeHtml(section.safetyCue ?? "保持安全距离，按教师口令开始与停止。")}</p>
        </div>
        <div>
          <span>观察评价</span>
          <p>${escapeHtml(section.evaluationCue ?? "观察动作是否清晰、稳定、符合本页要求。")}</p>
        </div>
      </aside>
    </div>
  `;
}

function getLessonMeta(lessonPlan?: CompetitionLessonPlan) {
  return {
    title: lessonPlan?.title ?? lessonPlan?.meta.topic ?? "课堂学习辅助大屏",
    school: lessonPlan?.teacher.school ?? "学校",
    teacher: lessonPlan?.teacher.name ?? "教师",
    topic: lessonPlan?.meta.topic ?? "体育课堂",
    grade: lessonPlan?.meta.grade ?? lessonPlan?.meta.level ?? "未标注年级",
    studentCount: lessonPlan?.meta.studentCount ?? "40人",
    venue: lessonPlan?.venueEquipment.venue ?? "教学场地",
    equipment: lessonPlan?.venueEquipment.equipment?.join("、") ?? "常规器材",
    safety: lessonPlan?.periodPlan.safety?.slice(0, 3) ?? ["保持安全距离", "按教师口令开始与停止"],
  };
}

function renderSlide(input: {
  fragment: string;
  index: number;
  section: HtmlScreenSectionPlan;
}) {
  const isCover = input.section.pageRole === "cover";
  const active = input.index === 0 ? " active" : "";
  const kindClass = isCover ? " cover-slide" : " lesson-slide";
  const duration = isCover ? 0 : input.section.durationSeconds ?? 300;
  const startButton = isCover && !/\bdata-start\b/.test(input.fragment)
    ? '<button class="start-button" type="button" data-start>开始上课</button>'
    : "";

  if (isCover) {
    return `
    <section class="slide${kindClass}${active}" data-slide-kind="cover" data-duration="${duration}">
      <main class="cover-content">
        ${input.fragment}
        ${startButton}
      </main>
    </section>
  `;
  }

  return `
    <section class="slide${kindClass}${active}" data-slide-kind="${escapeHtml(input.section.pageRole ?? "lesson")}" data-duration="${duration}">
      <header class="slide-header">
        <div>
          <span class="eyebrow">第 ${input.index + 1} 页</span>
          <h2>${escapeHtml(input.section.title)}</h2>
        </div>
        <div class="timer-face" aria-label="本页倒计时">
          <span data-timer>${durationLabel(input.section.durationSeconds)}</span>
          <small>本环节倒计时</small>
        </div>
      </header>
      <main class="slide-content">
        ${input.fragment}
      </main>
    </section>
  `;
}

function renderDocument(input: {
  lessonPlan?: CompetitionLessonPlan;
  screenPlan: HtmlScreenPlan;
  sectionFragments: string[];
}) {
  const slides = input.screenPlan.sections
    .map((section, index) =>
      renderSlide({
        fragment: input.sectionFragments[index] ?? "",
        index,
        section,
      }),
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(getLessonMeta(input.lessonPlan).title)}</title>
  <style>
    :root {
      color-scheme: light;
      --ink: oklch(0.18 0.016 165);
      --muted: oklch(0.47 0.028 165);
      --paper: oklch(0.985 0.012 112);
      --surface: oklch(0.97 0.018 118);
      --court: oklch(0.54 0.13 154);
      --court-deep: oklch(0.28 0.07 158);
      --accent: oklch(0.61 0.15 157);
      --warm: oklch(0.72 0.13 64);
      --orange: oklch(0.68 0.17 52);
      --danger: oklch(0.56 0.19 30);
      --line: oklch(0.84 0.032 118);
      --glass: oklch(0.99 0.012 118 / 0.58);
      --glass-strong: oklch(0.99 0.018 118 / 0.76);
      --shadow-soft: 0 26px 80px oklch(0.24 0.05 160 / 0.18);
      --shadow-lift: 0 18px 48px oklch(0.22 0.05 160 / 0.22);
    }
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: var(--paper); color: var(--ink); font-family: "Microsoft YaHei", "PingFang SC", system-ui, sans-serif; }
    body { min-height: 100dvh; }
    .screen { position: relative; width: 100vw; height: 100dvh; background:
      radial-gradient(circle at 16% 18%, oklch(0.92 0.09 154 / 0.74), transparent 29%),
      radial-gradient(circle at 74% 16%, oklch(0.93 0.075 210 / 0.58), transparent 25%),
      radial-gradient(circle at 82% 78%, oklch(0.91 0.105 72 / 0.56), transparent 32%),
      linear-gradient(135deg, oklch(0.985 0.014 106), oklch(0.91 0.045 156)); overflow: hidden; }
    .screen::before { content: ""; position: absolute; inset: -18%; background:
      conic-gradient(from 120deg at 50% 50%, oklch(0.72 0.12 160 / 0.18), transparent 22%, oklch(0.82 0.1 78 / 0.16), transparent 58%, oklch(0.72 0.08 210 / 0.16), transparent);
      filter: blur(58px); animation: ambientShift 16s ease-in-out infinite alternate; pointer-events: none; }
    .screen::after { content: ""; position: absolute; inset: 18px; border: 1px solid oklch(0.56 0.06 154 / 0.22); border-radius: clamp(26px, 4vw, 58px); pointer-events: none; box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.52); }
    .slide { position: absolute; inset: 0; display: none; padding: clamp(24px, 4.5vw, 72px); }
    .slide.active { display: grid; grid-template-rows: auto 1fr; gap: clamp(16px, 3vh, 34px); }
    .cover-slide.active { display: grid; place-items: center; text-align: center; }
    .eyebrow { display: inline-flex; width: fit-content; border: 1px solid oklch(0.28 0.04 154 / 0.2); border-radius: 999px; padding: 0.42rem 0.72rem; color: var(--court-deep); background: oklch(0.98 0.02 118 / 0.84); font-size: clamp(16px, 1.25vw, 22px); font-weight: 900; letter-spacing: 0.08em; }
    h1, h2, p { margin: 0; }
    h1 { max-width: min(13ch, 92vw); font-size: clamp(54px, 9vw, 138px); line-height: 0.98; letter-spacing: -0.055em; text-wrap: balance; }
    h2 { font-size: clamp(42px, 6.5vw, 96px); line-height: 1; letter-spacing: -0.045em; text-wrap: balance; }
    .cover-content { width: min(1180px, 92vw); display: grid; justify-items: center; gap: clamp(18px, 3.4vh, 38px); }
    .cover-content > div, .cover-content .cover-hero { display: grid; justify-items: center; gap: clamp(18px, 3.4vh, 38px); }
    .cover-content h1, .cover-content [data-cover-title] { max-width: min(13ch, 92vw); font-size: clamp(54px, 9vw, 138px); line-height: 0.98; letter-spacing: -0.055em; text-wrap: balance; }
    .cover-content p, .cover-content [data-cover-meta] { font-size: clamp(22px, 2.1vw, 38px); color: var(--muted); font-weight: 800; }
    .cover-hero { display: grid; justify-items: center; gap: clamp(18px, 3.4vh, 38px); align-self: end; }
    .cover-hero p { font-size: clamp(22px, 2.1vw, 38px); color: var(--muted); font-weight: 800; }
    .start-button, .control-btn { border: 0; border-radius: 999px; background: var(--ink); color: oklch(0.97 0.012 118); font: inherit; font-weight: 900; cursor: pointer; }
    .start-button { padding: clamp(18px, 2vh, 26px) clamp(30px, 3.8vw, 52px); font-size: clamp(26px, 2.5vw, 44px); box-shadow: var(--shadow-lift); transition: transform 220ms ease, box-shadow 220ms ease; }
    .start-button:hover, .control-btn:hover { transform: translateY(-2px); }
    .cover-meta { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
    .cover-meta span { border: 1px solid var(--line); border-radius: 999px; padding: 10px 16px; background: oklch(0.99 0.008 118 / 0.72); color: var(--muted); font-size: clamp(16px, 1.25vw, 22px); font-weight: 900; }
    .cover-timeline { width: min(1120px, 92vw); display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; padding: 0; margin: 0; list-style: none; align-self: start; }
    .cover-timeline li { border: 1px solid var(--line); border-radius: 20px; padding: 14px 16px; background: oklch(0.99 0.006 118 / 0.68); text-align: left; }
    .cover-timeline span { color: var(--accent); font-weight: 1000; font-size: 22px; }
    .cover-timeline strong { display: block; margin: 6px 0; font-size: clamp(18px, 1.55vw, 28px); }
    .cover-timeline em { color: var(--muted); font-style: normal; font-weight: 900; }
    .safety-strip { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
    .safety-strip span { border-radius: 999px; padding: 10px 16px; background: oklch(0.95 0.05 48); color: oklch(0.36 0.1 35); font-size: clamp(16px, 1.3vw, 24px); font-weight: 900; }
    .slide-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 32px; }
    .timer-face { min-width: 188px; border: 1px solid oklch(1 0 0 / 0.42); border-radius: 28px; padding: 14px 18px; text-align: center; background: linear-gradient(145deg, oklch(0.92 0.13 126 / 0.82), oklch(0.82 0.12 155 / 0.66)); backdrop-filter: blur(24px) saturate(1.35); box-shadow: var(--shadow-lift), inset 0 1px 0 oklch(1 0 0 / 0.48); }
    .timer-face span { display: block; font-size: clamp(34px, 4.4vw, 72px); line-height: 1; font-weight: 1000; font-variant-numeric: tabular-nums; }
    .timer-face small { color: oklch(0.22 0.045 145); }
    .slide-content { display: grid; min-height: 0; }
    .section-brief, .cue-grid { display: grid; gap: 16px; }
    .brief-block, .cue-grid > div, .module-visual, .glass-panel, .center-module, .hero-stack { border: 1px solid oklch(1 0 0 / 0.5); border-radius: clamp(26px, 3vw, 44px); background: linear-gradient(145deg, var(--glass-strong), oklch(0.93 0.024 150 / 0.46)); padding: clamp(18px, 2vw, 30px); backdrop-filter: blur(26px) saturate(1.28); box-shadow: var(--shadow-soft), inset 0 1px 0 oklch(1 0 0 / 0.58); }
    .brief-block p, .brief-block li, .cue-grid span, .module-visual p { font-size: clamp(26px, 2.15vw, 40px); line-height: 1.22; font-weight: 800; }
    .brief-block ol { margin: 16px 0 0; padding-left: 1.25em; }
    .module-visual, .center-module { display: grid; place-items: center; min-height: 420px; background: linear-gradient(145deg, oklch(0.99 0.02 96 / 0.74), oklch(0.89 0.06 151 / 0.62)); }
    .module-visual svg { width: 100%; max-height: 460px; }
    .module-visual rect, .module-visual circle { fill: oklch(0.96 0.03 96); stroke: var(--court-deep); stroke-width: 5; }
    .module-visual line, .module-visual path { fill: none; stroke: var(--orange); stroke-width: 8; stroke-linecap: round; stroke-linejoin: round; }
    .module-visual text { fill: var(--ink); font-size: 32px; font-weight: 1000; text-anchor: middle; dominant-baseline: middle; }
    .teaching-image-layout { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.55fr); gap: clamp(18px, 2.4vw, 36px); min-height: 0; align-items: stretch; }
    .teaching-image-panel { display: grid; grid-template-rows: 1fr auto; gap: 12px; margin: 0; min-width: 0; border: 1px solid oklch(1 0 0 / 0.58); border-radius: clamp(26px, 3vw, 44px); padding: clamp(14px, 1.45vw, 24px); background: linear-gradient(145deg, var(--glass-strong), oklch(0.92 0.035 150 / 0.5)); backdrop-filter: blur(26px) saturate(1.22); box-shadow: var(--shadow-soft), inset 0 1px 0 oklch(1 0 0 / 0.62); }
    .teaching-image-frame { position: relative; overflow: hidden; border-radius: clamp(20px, 2vw, 34px); background: oklch(0.96 0.018 112); aspect-ratio: 16 / 9; box-shadow: inset 0 0 0 1px oklch(0.22 0.04 154 / 0.12); }
    .teaching-image-frame img { display: block; width: 100%; height: 100%; object-fit: cover; }
    .teaching-image-panel figcaption { color: var(--court-deep); font-size: clamp(18px, 1.45vw, 26px); font-weight: 1000; text-align: center; }
    .teaching-image-cues { display: grid; gap: 14px; align-content: stretch; }
    .teaching-image-cues > div { border: 1px solid oklch(1 0 0 / 0.52); border-radius: clamp(22px, 2vw, 34px); padding: clamp(16px, 1.65vw, 26px); background: linear-gradient(145deg, oklch(0.99 0.012 118 / 0.8), oklch(0.9 0.04 148 / 0.5)); backdrop-filter: blur(22px) saturate(1.2); box-shadow: var(--shadow-soft), inset 0 1px 0 oklch(1 0 0 / 0.55); }
    .teaching-image-cues span { display: inline-flex; margin-bottom: 8px; border-radius: 999px; padding: 6px 10px; background: oklch(0.91 0.08 154 / 0.82); color: var(--court-deep); font-size: clamp(16px, 1.15vw, 20px); font-weight: 1000; }
    .teaching-image-cues p, .teaching-image-cues li { font-size: clamp(21px, 1.8vw, 34px); line-height: 1.22; font-weight: 900; }
    .teaching-image-cues ol { margin: 0; padding-left: 1.2em; }
    .teaching-image-cues .safety span { background: oklch(0.93 0.07 48 / 0.9); color: oklch(0.36 0.1 35); }
    .scoreboard-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; width: 100%; }
    .scoreboard-grid div { border-radius: 24px; padding: 18px; background: var(--ink); color: oklch(0.97 0.01 96); text-align: center; }
    .scoreboard-grid span { display: block; font-size: 28px; font-weight: 900; }
    .scoreboard-grid strong { display: block; font-size: 72px; line-height: 1; }
    .cue-grid { grid-column: 1 / -1; grid-template-columns: repeat(3, 1fr); }
    .cue-grid strong { display: block; margin-bottom: 8px; font-size: clamp(22px, 1.8vw, 30px); color: var(--danger); }
    .hero-stack { display: grid; justify-items: center; gap: clamp(18px, 3vh, 34px); text-align: center; }
    .center-module { width: min(980px, 90vw); justify-self: center; align-self: center; text-align: center; }
    .controls { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); display: flex; gap: 12px; padding: 10px; border-radius: 999px; background: var(--glass-strong); border: 1px solid oklch(1 0 0 / 0.48); backdrop-filter: blur(28px) saturate(1.35); box-shadow: var(--shadow-soft), inset 0 1px 0 oklch(1 0 0 / 0.52); }
    .control-btn { padding: 14px 22px; font-size: 20px; transition: transform 200ms ease; }
    @keyframes ambientShift {
      from { transform: translate3d(-2%, -1%, 0) rotate(0deg) scale(1); }
      to { transform: translate3d(2%, 1%, 0) rotate(8deg) scale(1.06); }
    }
    @media (max-width: 900px) {
      .slide-header, .cue-grid { grid-template-columns: 1fr; }
      .slide-header { flex-direction: column; }
      .teaching-image-layout { grid-template-columns: 1fr; }
      .slide { padding: 24px; overflow-y: auto; }
      html, body, .screen { overflow: auto; height: auto; min-height: 100vh; }
      .slide { position: relative; min-height: 100vh; }
      .slide:not(.active) { display: none; }
    }
  </style>
</head>
<body>
  <div class="screen" data-screen>
    ${slides}
    <nav class="controls" aria-label="课堂大屏控制">
      <button class="control-btn" type="button" data-prev>上一页</button>
      <button class="control-btn" type="button" data-toggle>暂停</button>
      <button class="control-btn" type="button" data-reset>重新计时</button>
      <button class="control-btn" type="button" data-next>下一页</button>
    </nav>
  </div>
  <script>
    (() => {
      const slides = Array.from(document.querySelectorAll(".slide"));
      const timerButtons = {
        next: document.querySelector("[data-next]"),
        prev: document.querySelector("[data-prev]"),
        reset: document.querySelector("[data-reset]"),
        toggle: document.querySelector("[data-toggle]"),
      };
      let index = 0;
      let seconds = Number(slides[0]?.dataset.duration || 0);
      let running = false;
      let tickId = undefined;
      const format = (value) => {
        if (!value) return "总览";
        const minutes = Math.floor(value / 60);
        const remain = value % 60;
        return String(minutes).padStart(2, "0") + ":" + String(remain).padStart(2, "0");
      };
      const paint = () => {
        slides.forEach((slide, slideIndex) => slide.classList.toggle("active", slideIndex === index));
        seconds = Number(slides[index]?.dataset.duration || 0);
        const timer = slides[index]?.querySelector("[data-timer]");
        if (timer) timer.textContent = format(seconds);
      };
      const updateTimer = () => {
        const timer = slides[index]?.querySelector("[data-timer]");
        if (timer) timer.textContent = format(seconds);
      };
      const go = (nextIndex) => {
        index = Math.max(0, Math.min(slides.length - 1, nextIndex));
        paint();
      };
      const startTick = () => {
        running = true;
        timerButtons.toggle.textContent = "暂停";
        clearInterval(tickId);
        tickId = setInterval(() => {
          if (!running || index === 0) return;
          seconds = Math.max(0, seconds - 1);
          updateTimer();
          if (seconds === 0 && index < slides.length - 1) go(index + 1);
        }, 1000);
      };
      document.addEventListener("click", (event) => {
        if (event.target instanceof Element && event.target.closest("[data-start]")) {
          go(1);
          startTick();
        }
      });
      timerButtons.next?.addEventListener("click", () => go(index + 1));
      timerButtons.prev?.addEventListener("click", () => go(index - 1));
      timerButtons.reset?.addEventListener("click", () => { seconds = Number(slides[index]?.dataset.duration || 0); updateTimer(); });
      timerButtons.toggle?.addEventListener("click", () => {
        running = !running;
        timerButtons.toggle.textContent = running ? "暂停" : "继续";
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "ArrowRight") go(index + 1);
        if (event.key === "ArrowLeft") go(index - 1);
        if (event.key === " ") {
          event.preventDefault();
          running = !running;
          timerButtons.toggle.textContent = running ? "暂停" : "继续";
        }
      });
      paint();
    })();
  </script>
</body>
</html>`;
}

function createHtmlChunkStream(html: string): ReadableStream<UIMessageChunk> {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      const id = "server-html-document";

      controller.enqueue({ type: "text-start", id });
      controller.enqueue({ type: "text-delta", id, delta: html });
      controller.enqueue({ type: "text-end", id });
      controller.enqueue({ type: "finish", finishReason: "stop" });
      controller.close();
    },
  });
}

async function generateSectionFragment(input: {
  lessonPlan: string;
  messages: SmartEduUIMessage[];
  modelId: string;
  requestId: string;
  section: HtmlScreenSectionPlan;
  sectionIndex: number;
  system: string;
  totalSections: number;
  visualSystem: string;
}) {
  if (input.section.visualMode === "image" && input.section.visualAsset) {
    return renderImageSectionFragment(input.section);
  }

  const messages = await buildSectionModelMessages({
    lessonPlan: input.lessonPlan,
    originalMessages: input.messages,
    section: input.section,
    sectionIndex: input.sectionIndex,
    totalSections: input.totalSections,
    visualSystem: input.visualSystem,
  });

  try {
    const result = await runModelOperationWithRetry(
      () =>
        generateText({
          model: createChatModel(input.modelId),
          system: input.system,
          messages,
          temperature: 0.25,
        }),
      {
        mode: "html",
        requestId: `${input.requestId}-section-${input.sectionIndex + 1}`,
      },
    );

    const fragment = sanitizeSectionFragment(result.text).trim();
    const assetPanel =
      input.section.visualMode === "hybrid" && input.section.visualAsset
        ? renderVisualAssetPanel(input.section)
        : "";
    const mergedFragment = [assetPanel, fragment].filter(Boolean).join("\n").trim();

    if (!mergedFragment) {
      throw new Error("模型返回空 HTML 片段。");
    }

    return mergedFragment;
  } catch (error) {
    console.warn("[lesson-authoring] html-section-generation-failed", {
      requestId: input.requestId,
      sectionIndex: input.sectionIndex,
      title: input.section.title,
      message: error instanceof Error ? error.message : "unknown-error",
    });

    throw error;
  }
}

async function buildHtmlDocument(input: {
  lessonPlan: string;
  messages: SmartEduUIMessage[];
  modelId: string;
  projectId?: string;
  requestId: string;
  screenPlan: HtmlScreenPlan;
  workflow: LessonWorkflowOutput;
}) {
  const system = buildHtmlServerSystemPrompt(input.workflow.system);
  const visualAssetResult = await enrichHtmlScreenPlanWithVisualAssets({
    projectId: input.projectId,
    requestId: input.requestId,
    screenPlan: input.screenPlan,
  });

  if (visualAssetResult.skippedReason || visualAssetResult.warnings.length) {
    console.warn("[lesson-authoring] html-screen-visual-assets-summary", {
      generatedCount: visualAssetResult.generatedCount,
      requestId: input.requestId,
      skippedReason: visualAssetResult.skippedReason,
      warnings: visualAssetResult.warnings,
    });
  }

  const screenPlan = visualAssetResult.screenPlan;
  const sectionFragments = await mapWithConcurrency(
    screenPlan.sections,
    resolveSectionConcurrency(),
    (section, sectionIndex) =>
      generateSectionFragment({
        lessonPlan: input.lessonPlan,
        messages: input.messages,
        modelId: input.modelId,
        requestId: input.requestId,
        section,
        sectionIndex,
        system,
        totalSections: screenPlan.sections.length,
        visualSystem: screenPlan.visualSystem,
      }),
  );

  return renderDocument({
    lessonPlan: parseLessonPlan(input.lessonPlan),
    screenPlan,
    sectionFragments,
  });
}

export async function runServerHtmlGenerationSkill(input: {
  lessonPlan: string;
  messages: SmartEduUIMessage[];
  modelId?: string;
  projectId?: string;
  requestId: string;
  screenPlan?: HtmlScreenPlan;
  workflow: LessonWorkflowOutput;
}): Promise<ReadableStream<UIMessageChunk>> {
  const modelId = input.modelId ?? DEFAULT_HTML_MODEL_ID;

  if (!input.screenPlan?.sections.length) {
    throw new Error("HTML 大屏生成缺少 AI 分镜规划结果，无法生成页面。");
  }

  const html = await buildHtmlDocument({
    lessonPlan: input.lessonPlan,
    messages: input.messages,
    modelId,
    projectId: input.projectId,
    requestId: input.requestId,
    screenPlan: input.screenPlan,
    workflow: input.workflow,
  });

  return createHtmlChunkStream(html);
}
