import { convertToModelMessages, generateText, type UIMessageChunk } from "ai";

import {
  competitionLessonPlanSchema,
  type CompetitionLessonPlan,
} from "@/lib/competition-lesson-contract";
import {
  HTML_SCREEN_DESIGN_DIRECTION,
  HTML_SCREEN_SUPPORTED_FRAGMENT_CLASS_GUIDE,
} from "@/lib/html-screen-visual-language";
import type {
  HtmlScreenPlan,
  HtmlScreenSectionPlan,
} from "@/lib/html-screen-plan-contract";
import type {
  StructuredArtifactData,
  SmartEduUIMessage,
  WorkflowTraceEntry,
} from "@/lib/lesson-authoring-contract";
import { isArtifactImageProxyUrl } from "@/lib/s3/artifact-image-url";
import { createChatModel } from "@/mastra/models";
import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

import { enrichHtmlScreenPlanWithVisualAssets } from "./html_screen_visual_asset_skill";
import { runModelOperationWithRetry } from "./lesson_generation_skill";
import {
  createStructuredArtifactData,
  createWorkflowTraceData,
  createWorkflowTraceStep,
} from "./structured_authoring_stream_adapter";

const DEFAULT_HTML_MODEL_ID = process.env.AI_HTML_MODEL ?? process.env.AI_MODEL ?? "gpt-4.1-mini";
const DEFAULT_SECTION_CONCURRENCY = 4;
const DEFAULT_STANDARDS_MARKET = "cn-compulsory-2022" as const;

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
  onResult?: (result: R, index: number) => void,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(values[currentIndex]!, currentIndex);
      onResult?.(results[currentIndex]!, currentIndex);
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
    HTML_SCREEN_DESIGN_DIRECTION,
    "最终完整 CSS 和 JavaScript 由服务端 HTML 外壳统一提供；片段只输出结构与内容，不负责写全局样式。",
    HTML_SCREEN_SUPPORTED_FRAGMENT_CLASS_GUIDE,
  ].join("\n\n");
}

function normalizeHtmlWorkflow(workflow: LessonWorkflowOutput): LessonWorkflowOutput {
  const candidate = workflow as Partial<LessonWorkflowOutput>;

  return {
    system: candidate.system ?? "",
    standardsContext: candidate.standardsContext ?? "",
    standards: candidate.standards ?? {
      requestedMarket: DEFAULT_STANDARDS_MARKET,
      resolvedMarket: DEFAULT_STANDARDS_MARKET,
      corpus: null,
      referenceCount: 0,
      references: [],
    },
    textbook: candidate.textbook,
    generationPlan: {
      mode: "html",
      confirmedLessonRequired: true,
      outputProtocol: "html-document",
      responseTransport: "structured-data-part",
      assistantTextPolicy: "suppress-html-text",
      maxSteps: candidate.generationPlan?.maxSteps ?? 7,
      protocolVersion: candidate.generationPlan?.protocolVersion ?? "structured-v1",
      ...candidate.generationPlan,
    },
    safety: candidate.safety ?? {
      htmlSandboxRequired: true,
      externalNetworkAllowed: false,
      forbiddenCapabilities: [],
      warnings: [],
    },
    uiHints: candidate.uiHints ?? [],
    decision: candidate.decision ?? {
      type: "generate",
      intentResult: {
        intent: "generate_html",
        confidence: 1,
        reason: "服务端 HTML 生成 skill 自动补齐 workflow 默认值。",
      },
    },
    trace: candidate.trace ?? [],
  };
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
            "请把视觉结构设计成横板课堂大屏片段，像体育馆里的教师课堂控制台：深色球场基底、实体高对比任务面板、清晰图形路线和醒目倒计时，而不是普通网页卡片堆叠或空洞海报。",
            "必须包含：核心任务、学生行动、安全提醒、评价观察。允许用少量文字，禁止做成密集文字板。",
            input.section.pageRole === "cover"
              ? "本页是首页。必须生成课堂启动封面：使用 <div class=\"cover-stage\"> 建立左右网格，一侧放置 <div class=\"module-visual\"> 等图形视觉块，另一侧必须使用 <div class=\"cover-content\"> 统一包裹所有文本信息（大标题、学校、教师和核心任务）；切忌把文本元素直接散落在 cover-stage 下，不要做成只有大标题的空洞海报，也不要生成倒计时。"
              : "",
            "请根据 pagePrompt 和 visualIntent 自由选择最有教学帮助的视觉表达；不得受固定组件枚举限制。",
            input.section.visualMode === "hybrid" && input.section.visualAsset
              ? "本页已有服务端生成的 16:9 教学辅助图，图片面板会由服务端插入；你只生成图片旁边或下方的任务、提示、观察与安全信息，不要再输出 img 标签或外链资源。"
              : "如果本页是学习或练习内容，优先用 HTML/CSS/SVG 手搓动作结构、战术跑位、路线、器材路径、对抗关系或动作关键点，帮助学生形成认知。",
            "如果本页是比赛、体能训练、放松拉伸、课堂总结或其他非学练页，优先生成一个居中的任务模块，倒计时视觉要突出，规则和安全提示只保留关键短句。",
            HTML_SCREEN_SUPPORTED_FRAGMENT_CLASS_GUIDE,
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
  if (!isArtifactImageProxyUrl(value) && !/^(?:data|blob):/i.test(value)) {
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
      <main class="cover-shell">
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
      color-scheme: dark;
      --ink: oklch(0.95 0.012 145);
      --muted: oklch(0.78 0.03 160);
      --paper: oklch(0.17 0.028 165);
      --surface: oklch(0.22 0.03 165);
      --surface-strong: oklch(0.27 0.036 165);
      --court: oklch(0.34 0.078 160);
      --court-deep: oklch(0.11 0.02 165);
      --accent: oklch(0.8 0.17 86);
      --brand: oklch(0.62 0.12 157);
      --orange: oklch(0.72 0.18 52);
      --danger: oklch(0.72 0.16 34);
      --line: oklch(0.55 0.045 160 / 0.34);
      --line-strong: oklch(0.76 0.08 92 / 0.34);
      --panel: color-mix(in oklab, var(--surface) 94%, black 6%);
      --panel-strong: color-mix(in oklab, var(--surface-strong) 92%, black 8%);
      --shadow-soft: 0 24px 72px oklch(0.04 0.01 165 / 0.34);
      --shadow-lift: 0 18px 52px oklch(0.04 0.01 165 / 0.44);
      --radius-lg: clamp(22px, 2vw, 32px);
      --radius-xl: clamp(28px, 2.6vw, 42px);
      --stage-pad-x: clamp(20px, 3vw, 56px);
      --stage-pad-top: clamp(18px, 2.6vh, 44px);
      --control-shell-gap: clamp(12px, 1.8vh, 24px);
      --control-shell-height: clamp(72px, 9vh, 108px);
      --control-reserve: calc(var(--control-shell-height) + var(--control-shell-gap) * 2);
    }
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: var(--paper); color: var(--ink); font-family: "Microsoft YaHei", "PingFang SC", system-ui, sans-serif; }
    body { min-height: 100dvh; }
    .screen { position: relative; width: 100vw; min-height: 100dvh; height: 100dvh; background:
      radial-gradient(circle at 18% 14%, oklch(0.36 0.1 160 / 0.18), transparent 30%),
      radial-gradient(circle at 84% 20%, oklch(0.68 0.17 52 / 0.16), transparent 26%),
      linear-gradient(160deg, oklch(0.2 0.03 165), oklch(0.13 0.024 165)); overflow: hidden; }
    .screen::before { content: ""; position: absolute; inset: 0; background:
      linear-gradient(90deg, transparent 0 11.5%, oklch(0.8 0.03 145 / 0.06) 11.5% 12%, transparent 12% 88%, oklch(0.8 0.03 145 / 0.06) 88% 88.5%, transparent 88.5%),
      radial-gradient(circle at center, transparent 0 17%, oklch(0.8 0.03 145 / 0.07) 17% 17.4%, transparent 17.4%),
      linear-gradient(0deg, transparent 0 49.7%, oklch(0.8 0.03 145 / 0.06) 49.7% 50.3%, transparent 50.3%);
      opacity: 0.48; pointer-events: none; }
    .screen::after { content: ""; position: absolute; inset: 18px; border: 1px solid oklch(0.7 0.04 145 / 0.12); border-radius: clamp(24px, 3vw, 44px); pointer-events: none; }
    .slide { position: absolute; inset: 0; display: none; padding: var(--stage-pad-top) var(--stage-pad-x) calc(var(--control-reserve) + clamp(16px, 2.2vh, 34px)); }
    .slide.active { display: grid; min-height: 100%; grid-template-rows: auto 1fr; gap: clamp(12px, 2.4vh, 28px); }
    .cover-slide.active { display: block; }
    .eyebrow, .cover-kicker, .pill, .time-pill, .cue-label { display: inline-flex; align-items: center; width: fit-content; border: 1px solid var(--line-strong); border-radius: 999px; padding: 0.5rem 0.88rem; color: var(--accent); background: color-mix(in oklab, var(--surface) 76%, black 24%); font-size: clamp(12px, 1.3vmin, 20px); font-weight: 900; letter-spacing: 0.06em; }
    h1, h2, p { margin: 0; }
    h1 { max-width: min(12ch, 92vw); font-size: clamp(46px, 7.6vmin, 126px); line-height: 0.96; letter-spacing: -0.06em; text-wrap: balance; }
    h2 { font-size: clamp(32px, 4.8vmin, 80px); line-height: 1.02; letter-spacing: -0.045em; text-wrap: balance; }
    .cover-shell { height: 100%; display: grid; align-items: center; }
    .cover-stage { width: min(1520px, 100%); min-height: 100%; display: grid; grid-template-columns: minmax(0, 1.06fr) minmax(360px, 0.94fr); gap: clamp(18px, 2.6vw, 40px); align-items: stretch; }
    .cover-stage > .cover-content, .cover-stage > .glass-panel, .cover-stage > .hero-stack { align-content: start; }
    .cover-stage > .cover-court-visual, .cover-stage > .module-visual, .cover-stage > .center-module { min-height: clamp(260px, 52vh, 620px); }
    .cover-content, .glass-panel, .brief-block, .cue-grid > div, .module-visual, .center-module, .hero-stack, .mini-cue, .teaching-image-panel, .teaching-image-cues > div, .timer-face, .scoreboard-grid div { border: 1px solid var(--line); border-radius: var(--radius-lg); background: linear-gradient(180deg, color-mix(in oklab, var(--panel-strong) 84%, transparent), color-mix(in oklab, var(--panel) 96%, black 4%)); box-shadow: var(--shadow-soft); }
    .cover-content, .glass-panel, .brief-block, .cue-grid > div, .center-module, .hero-stack, .mini-cue, .teaching-image-panel, .teaching-image-cues > div { padding: clamp(18px, 1.8vw, 28px); }
    .cover-content { display: grid; gap: clamp(12px, 1.8vh, 22px); text-align: left; }
    .cover-content h1, .cover-content .cover-title, .cover-content [data-cover-title] { max-width: 10ch; }
    .cover-content p, .cover-content [data-cover-meta], .cover-subtitle { font-size: clamp(18px, 2.25vmin, 34px); color: var(--muted); font-weight: 800; }
    .cover-kicker { color: var(--brand); }
    .cover-meta { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
    .cover-meta span { border: 1px solid var(--line); border-radius: 999px; padding: 10px 16px; background: color-mix(in oklab, var(--surface) 76%, black 24%); color: var(--ink); font-size: clamp(14px, 1.35vmin, 20px); font-weight: 800; }
    .cover-meta .meta-dot { width: 8px; height: 8px; padding: 0; border: 0; border-radius: 999px; background: var(--orange); }
    .cover-footer-cues { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .mini-cue { display: grid; gap: 8px; align-content: start; min-height: 112px; }
    .mini-cue strong { font-size: clamp(20px, 2vmin, 34px); line-height: 1.16; }
    .cue-label { color: var(--muted); }
    .cover-timeline { width: min(1120px, 100%); display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; padding: 0; margin: 0; list-style: none; }
    .cover-timeline li { border: 1px solid var(--line); border-radius: 20px; padding: 14px 16px; background: color-mix(in oklab, var(--surface) 74%, black 26%); text-align: left; }
    .cover-timeline span { color: var(--accent); font-weight: 1000; font-size: 20px; }
    .cover-timeline strong { display: block; margin: 6px 0; font-size: clamp(16px, 1.6vmin, 26px); }
    .cover-timeline em { color: var(--muted); font-style: normal; font-weight: 800; }
    .safety-strip { display: flex; flex-wrap: wrap; gap: 10px; }
    .safety-strip span, .safety-pill { display: inline-flex; align-items: center; border: 1px solid color-mix(in oklab, var(--danger) 36%, var(--line)); border-radius: 999px; padding: 10px 16px; background: color-mix(in oklab, var(--danger) 18%, var(--surface)); color: oklch(0.95 0.03 45); font-size: clamp(14px, 1.4vmin, 22px); font-weight: 900; }
    .start-button, .control-btn, .start-button-visual { border: 0; border-radius: 999px; font: inherit; font-weight: 900; cursor: pointer; }
    .start-button, .start-button-visual { justify-self: center; margin-top: 24px; display: inline-flex; align-items: center; justify-content: center; gap: 10px; padding: clamp(14px, 1.8vh, 22px) clamp(24px, 3vw, 44px); background: linear-gradient(135deg, var(--accent), var(--orange)); color: var(--court-deep); font-size: clamp(20px, 2.2vmin, 38px); box-shadow: 0 18px 48px color-mix(in oklab, var(--orange) 42%, transparent); }
    .start-button:hover, .control-btn:hover { transform: translateY(-1px); }
    .button-glow, .ambient-orb { display: none !important; }
    .slide-header { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 24px; }
    .timer-face { min-width: clamp(180px, 18vw, 240px); padding: clamp(14px, 1.6vw, 22px); text-align: right; background: linear-gradient(180deg, color-mix(in oklab, var(--brand) 32%, var(--panel)), color-mix(in oklab, var(--surface) 92%, black 8%)); box-shadow: var(--shadow-lift); }
    .timer-face span { display: block; font-size: clamp(30px, 4.2vmin, 72px); line-height: 1; font-weight: 1000; font-variant-numeric: tabular-nums; color: var(--accent); }
    .timer-face small { color: var(--muted); font-size: clamp(12px, 1.2vmin, 18px); font-weight: 800; }
    .slide-content { display: grid; min-height: 0; gap: 16px; align-content: start; }
    .section-brief, .cue-grid { display: grid; gap: 16px; }
    .brief-block p, .brief-block li, .cue-grid p, .cue-grid li, .module-visual p, .center-module p, .teaching-image-cues p, .teaching-image-cues li { font-size: clamp(18px, 2.1vmin, 34px); line-height: 1.28; font-weight: 800; color: var(--ink); }
    .brief-block strong, .cue-grid strong { display: block; margin-bottom: 10px; font-size: clamp(14px, 1.25vmin, 22px); color: var(--accent); }
    .brief-block ol { margin: 16px 0 0; padding-left: 1.25em; }
    .module-visual, .center-module { display: grid; place-items: center; min-height: clamp(260px, 38vh, 420px); padding: clamp(18px, 1.8vw, 28px); background: linear-gradient(180deg, color-mix(in oklab, var(--court) 34%, var(--panel-strong)), color-mix(in oklab, var(--panel) 92%, black 8%)); }
    .module-visual svg { width: 100%; max-height: min(44vh, 460px); }
    .module-visual rect, .module-visual circle { fill: color-mix(in oklab, var(--surface-strong) 82%, white 18%); stroke: color-mix(in oklab, var(--ink) 32%, var(--court)); stroke-width: 5; }
    .module-visual line, .module-visual path { fill: none; stroke: var(--orange); stroke-width: 8; stroke-linecap: round; stroke-linejoin: round; }
    .module-visual text { fill: var(--ink); font-size: 32px; font-weight: 1000; text-anchor: middle; dominant-baseline: middle; }
    .teaching-image-layout, .warmup-layout { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr); gap: clamp(18px, 2.2vw, 32px); min-height: 0; align-items: stretch; }
    .teaching-image-panel { display: grid; grid-template-rows: 1fr auto; gap: 12px; margin: 0; min-width: 0; }
    .teaching-image-frame { position: relative; overflow: hidden; border-radius: clamp(20px, 2vw, 34px); background: color-mix(in oklab, var(--surface) 82%, black 18%); aspect-ratio: 16 / 9; box-shadow: inset 0 0 0 1px oklch(0.8 0.03 145 / 0.08); }
    .teaching-image-frame img { display: block; width: 100%; height: 100%; object-fit: cover; }
    .teaching-image-panel figcaption { color: var(--muted); font-size: clamp(14px, 1.4vmin, 24px); font-weight: 1000; text-align: center; }
    .teaching-image-cues { display: grid; gap: 14px; align-content: stretch; }
    .teaching-image-cues span { display: inline-flex; margin-bottom: 8px; border-radius: 999px; padding: 6px 10px; background: color-mix(in oklab, var(--surface) 72%, black 28%); color: var(--accent); font-size: clamp(13px, 1.15vmin, 20px); font-weight: 1000; }
    .teaching-image-cues ol { margin: 0; padding-left: 1.2em; }
    .teaching-image-cues .safety span { background: color-mix(in oklab, var(--danger) 24%, var(--surface)); color: oklch(0.95 0.03 45); }
    .scoreboard-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; width: 100%; }
    .scoreboard-grid div { border-radius: 24px; padding: 18px; text-align: center; }
    .scoreboard-grid span { display: block; font-size: clamp(16px, 1.6vmin, 24px); font-weight: 900; color: var(--muted); }
    .scoreboard-grid strong { display: block; font-size: clamp(42px, 5vmin, 72px); line-height: 1; color: var(--ink); }
    .cue-grid { grid-column: 1 / -1; grid-template-columns: repeat(3, 1fr); }
    .cue-grid strong { color: var(--accent); }
    .hero-stack { display: grid; gap: clamp(14px, 2.2vh, 24px); text-align: left; justify-items: start; align-content: start; }
    .center-module { width: min(980px, 90vw); justify-self: center; align-self: center; text-align: left; }
    .slide-kicker { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .pill { color: var(--brand); }
    .time-pill { color: var(--accent); }
    .controls { position: fixed; left: 50%; bottom: var(--control-shell-gap); transform: translateX(-50%); display: flex; gap: 12px; align-items: center; min-height: var(--control-shell-height); max-width: calc(100vw - 32px); padding: 12px; border-radius: 999px; background: color-mix(in oklab, var(--panel-strong) 92%, black 8%); border: 1px solid var(--line); box-shadow: var(--shadow-lift); flex-wrap: wrap; justify-content: center; }
    .control-btn { padding: clamp(10px, 1.2vh, 14px) clamp(18px, 1.8vw, 22px); font-size: clamp(16px, 1.45vmin, 20px); transition: transform 200ms ease, background-color 200ms ease; background: color-mix(in oklab, var(--surface) 70%, black 30%); color: var(--ink); }
    .control-btn:hover { background: color-mix(in oklab, var(--surface-strong) 82%, black 18%); }
    @media (max-height: 920px) {
      :root {
        --stage-pad-x: 18px;
        --stage-pad-top: 16px;
        --control-shell-gap: 10px;
        --control-shell-height: 68px;
      }
      .cover-stage { gap: 18px; }
      .cover-footer-cues, .cue-grid, .scoreboard-grid { gap: 10px; }
      .mini-cue { min-height: 88px; }
      .cover-timeline { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
    }
    @media (max-height: 820px) and (min-width: 901px) {
      .cover-stage { width: 100%; grid-template-columns: minmax(0, 1fr) minmax(300px, 0.88fr); }
      .slide-header { gap: 16px; }
      .cue-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .teaching-image-layout, .warmup-layout { grid-template-columns: minmax(0, 1.08fr) minmax(280px, 0.92fr); }
    }
    @media (max-width: 900px) {
      .slide-header, .cue-grid, .cover-stage, .teaching-image-layout, .warmup-layout { grid-template-columns: 1fr; }
      .slide { padding: 24px; overflow-y: auto; }
      html, body, .screen { overflow: auto; height: auto; min-height: 100vh; }
      .slide { position: relative; min-height: 100vh; }
      .slide:not(.active) { display: none; }
      .controls { position: sticky; left: 0; bottom: 20px; transform: none; width: fit-content; margin: 0 auto 20px; flex-wrap: wrap; justify-content: center; }
      .cover-footer-cues, .scoreboard-grid { grid-template-columns: 1fr; }
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
      const controls = document.querySelector(".controls");
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
        if (controls instanceof HTMLElement) {
          controls.style.display = index === 0 ? "none" : "flex";
        }
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

function renderPendingSectionFragment(section: HtmlScreenSectionPlan, index: number) {
  const actions = (section.studentActions?.length ? section.studentActions : ["等待页面内容生成", "保持课堂组织准备"])
    .slice(0, 3);

  return `
    <div class="center-module">
      <div class="hero-stack">
        <span class="eyebrow">第 ${index + 1} 页生成中</span>
        <h2>${escapeHtml(section.title)}</h2>
        <p>${escapeHtml(section.objective ?? "正在生成本页课堂任务、可视化结构与安全提示。")}</p>
        <div class="cue-grid">
          ${actions.map((action) => `<div><strong>学生行动</strong><p>${escapeHtml(action)}</p></div>`).join("")}
        </div>
      </div>
    </div>
  `;
}

function createInitialSectionFragments(screenPlan: HtmlScreenPlan) {
  return screenPlan.sections.map((section, index) => renderPendingSectionFragment(section, index));
}

function createTraceChunk(input: {
  phase: "generation" | "completed" | "failed";
  requestId: string;
  runtimeTrace: WorkflowTraceEntry[];
  workflow: LessonWorkflowOutput;
}): UIMessageChunk {
  return {
    type: "data-trace",
    id: "lesson-authoring-trace",
    data: createWorkflowTraceData(input.workflow, input.requestId, input.runtimeTrace, input.phase),
  } as UIMessageChunk;
}

function createArtifactChunk(input: {
  content: string;
  isComplete: boolean;
  status: StructuredArtifactData["status"];
  workflow: LessonWorkflowOutput;
}): UIMessageChunk {
  return {
    type: "data-artifact",
    id: "lesson-authoring-artifact-html",
    data: createStructuredArtifactData(input.workflow, {
      content: input.content,
      isComplete: input.isComplete,
      status: input.status,
      title: "互动大屏 Artifact",
    }),
  } as UIMessageChunk;
}

function pushOrReplaceTraceEntry(
  runtimeTrace: WorkflowTraceEntry[],
  entry: WorkflowTraceEntry,
) {
  const existingIndex = runtimeTrace.findIndex((item) => item.step === entry.step);

  if (existingIndex >= 0) {
    runtimeTrace.splice(existingIndex, 1, entry);
    return;
  }

  runtimeTrace.push(entry);
}

function enqueueToolStart(controller: ReadableStreamDefaultController<UIMessageChunk>, input: {
  input: unknown;
  title: string;
  toolCallId: string;
  toolName: string;
}) {
  controller.enqueue({
    type: "tool-input-start",
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    title: input.title,
  });
  controller.enqueue({
    type: "tool-input-available",
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    title: input.title,
    input: input.input,
  });
}

function enqueueToolOutput(controller: ReadableStreamDefaultController<UIMessageChunk>, input: {
  output: unknown;
  toolCallId: string;
}) {
  controller.enqueue({
    type: "tool-output-available",
    toolCallId: input.toolCallId,
    output: input.output,
  });
}

function enqueueHtmlArtifactSnapshot(controller: ReadableStreamDefaultController<UIMessageChunk>, input: {
  isComplete: boolean;
  lessonPlan?: CompetitionLessonPlan;
  screenPlan: HtmlScreenPlan;
  sectionFragments: string[];
  status: StructuredArtifactData["status"];
  workflow: LessonWorkflowOutput;
}) {
  controller.enqueue(
    createArtifactChunk({
      content: renderDocument({
        lessonPlan: input.lessonPlan,
        screenPlan: input.screenPlan,
        sectionFragments: input.sectionFragments,
      }),
      isComplete: input.isComplete,
      status: input.status,
      workflow: input.workflow,
    }),
  );
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

function createStreamingHtmlChunkStream(input: {
  lessonPlan: string;
  messages: SmartEduUIMessage[];
  modelId: string;
  projectId?: string;
  requestId: string;
  screenPlan: HtmlScreenPlan;
  workflow: LessonWorkflowOutput;
}) {
  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      const workflow = normalizeHtmlWorkflow(input.workflow);
      const runtimeTrace = [...workflow.trace];
      const lessonPlan = parseLessonPlan(input.lessonPlan);
      const textId = "server-html-document";
      const system = buildHtmlServerSystemPrompt(workflow.system);
      const assetToolCallId = `${input.requestId}-html-assets`;

      controller.enqueue({ type: "start-step" });
      enqueueToolStart(controller, {
        input: {
          sectionCount: input.screenPlan.sections.length,
          mode: "html-screen-visual-assets",
        },
        title: "生成大屏辅助图片",
        toolCallId: assetToolCallId,
        toolName: "generateHtmlScreenVisualAssets",
      });
      pushOrReplaceTraceEntry(
        runtimeTrace,
        createWorkflowTraceStep(
          "generate-html-visual-assets",
          "running",
          "正在生成并上传互动大屏需要的辅助图片。",
        ),
      );
      controller.enqueue(createTraceChunk({
        phase: "generation",
        requestId: input.requestId,
        runtimeTrace,
        workflow,
      }));

      try {
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

        pushOrReplaceTraceEntry(
          runtimeTrace,
          createWorkflowTraceStep(
            "generate-html-visual-assets",
            visualAssetResult.generatedCount > 0 ? "success" : "blocked",
            visualAssetResult.generatedCount > 0
              ? `已生成 ${visualAssetResult.generatedCount} 张互动大屏辅助图片。`
              : visualAssetResult.skippedReason ?? "没有需要生成的互动大屏辅助图片。",
          ),
        );
        enqueueToolOutput(controller, {
          toolCallId: assetToolCallId,
          output: {
            generatedCount: visualAssetResult.generatedCount,
            skippedReason: visualAssetResult.skippedReason,
            warnings: visualAssetResult.warnings,
          },
        });
        controller.enqueue(createTraceChunk({
          phase: "generation",
          requestId: input.requestId,
          runtimeTrace,
          workflow,
        }));

        const screenPlan = visualAssetResult.screenPlan;
        const sectionFragments = createInitialSectionFragments(screenPlan);

        enqueueHtmlArtifactSnapshot(controller, {
          isComplete: false,
          lessonPlan,
          screenPlan,
          sectionFragments,
          status: "streaming",
          workflow,
        });

        await mapWithConcurrency(
          screenPlan.sections,
          resolveSectionConcurrency(),
          async (section, sectionIndex) => {
            const sectionToolCallId = `${input.requestId}-html-section-${sectionIndex + 1}`;

            enqueueToolStart(controller, {
              input: {
                pageRole: section.pageRole,
                sectionIndex,
                title: section.title,
                visualMode: section.visualMode ?? "html",
              },
              title: `生成第 ${sectionIndex + 1} 页 HTML`,
              toolCallId: sectionToolCallId,
              toolName: "generateHtmlScreenSection",
            });
            pushOrReplaceTraceEntry(
              runtimeTrace,
              createWorkflowTraceStep(
                "generate-html-sections",
                "running",
                `正在生成第 ${sectionIndex + 1}/${screenPlan.sections.length} 页：${section.title}。`,
              ),
            );
            controller.enqueue(createTraceChunk({
              phase: "generation",
              requestId: input.requestId,
              runtimeTrace,
              workflow,
            }));

            return generateSectionFragment({
              lessonPlan: input.lessonPlan,
              messages: input.messages,
              modelId: input.modelId,
              requestId: input.requestId,
              section,
              sectionIndex,
              system,
              totalSections: screenPlan.sections.length,
              visualSystem: screenPlan.visualSystem,
            });
          },
          (fragment, sectionIndex) => {
            const section = screenPlan.sections[sectionIndex]!;
            const sectionToolCallId = `${input.requestId}-html-section-${sectionIndex + 1}`;
            sectionFragments[sectionIndex] = fragment;
            enqueueToolOutput(controller, {
              toolCallId: sectionToolCallId,
              output: {
                title: section.title,
                characters: fragment.length,
                sectionIndex,
              },
            });
            enqueueHtmlArtifactSnapshot(controller, {
              isComplete: false,
              lessonPlan,
              screenPlan,
              sectionFragments,
              status: "streaming",
              workflow,
            });
          },
        );

        pushOrReplaceTraceEntry(
          runtimeTrace,
          createWorkflowTraceStep(
            "generate-html-sections",
            "success",
            `已完成 ${screenPlan.sections.length} 个互动大屏页面片段。`,
          ),
        );
        controller.enqueue(createTraceChunk({
          phase: "generation",
          requestId: input.requestId,
          runtimeTrace,
          workflow,
        }));

        const finalHtml = renderDocument({
          lessonPlan,
          screenPlan,
          sectionFragments,
        });

        enqueueHtmlArtifactSnapshot(controller, {
          isComplete: true,
          lessonPlan,
          screenPlan,
          sectionFragments,
          status: "ready",
          workflow,
        });
        controller.enqueue({ type: "text-start", id: textId });
        controller.enqueue({ type: "text-delta", id: textId, delta: finalHtml });
        controller.enqueue({ type: "text-end", id: textId });
        controller.enqueue({ type: "finish-step" });
        controller.enqueue({ type: "finish", finishReason: "stop" });
        controller.close();
      } catch (error) {
        const errorText = error instanceof Error ? error.message : "互动大屏生成失败。";

        pushOrReplaceTraceEntry(
          runtimeTrace,
          createWorkflowTraceStep("generate-html-document", "failed", errorText),
        );
        controller.enqueue(createTraceChunk({
          phase: "failed",
          requestId: input.requestId,
          runtimeTrace,
          workflow,
        }));
        controller.enqueue({ type: "error", errorText });
        controller.enqueue({ type: "finish", finishReason: "error" });
        controller.close();
      }
    },
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

  return createStreamingHtmlChunkStream({
    lessonPlan: input.lessonPlan,
    messages: input.messages,
    modelId,
    projectId: input.projectId,
    requestId: input.requestId,
    screenPlan: input.screenPlan,
    workflow: input.workflow,
  });
}
