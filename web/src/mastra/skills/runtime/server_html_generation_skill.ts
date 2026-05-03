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
import {
  createHtmlArtifactPages,
  extractHtmlScreenPages,
  replaceHtmlScreenPageInnerHtml,
} from "@/lib/html-screen-editor";
import type {
  HtmlFocusTarget,
  StructuredArtifactData,
  SmartEduUIMessage,
  WorkflowTraceEntry,
} from "@/lib/lesson-authoring-contract";
import { isArtifactImageProxyUrl } from "@/lib/s3/artifact-image-url";
import { createChatModel } from "@/mastra/models";
import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

import { enrichHtmlScreenPlanWithVisualAssets } from "./html_screen_visual_asset_skill";
import {
  formatEnhancementError,
  resolvePositiveIntegerEnv,
} from "../../support/enhancement_execution";
import { runModelOperationWithRetry } from "./lesson_generation_skill";
import {
  createStructuredArtifactData,
  createWorkflowTraceData,
  createWorkflowTraceStep,
} from "../../support/structured_authoring_stream_adapter";

const DEFAULT_HTML_MODEL_ID = process.env.AI_HTML_MODEL ?? process.env.AI_MODEL ?? "gpt-4.1-mini";
const DEFAULT_SECTION_CONCURRENCY = 4;
const DEFAULT_SECTION_TIMEOUT_MS = 120_000;
const DEFAULT_STANDARDS_MARKET = "cn-compulsory-2022" as const;

type SectionFragmentResult = {
  fragment: string;
  source: "agent";
  warnings: string[];
};

function resolveSectionConcurrency() {
  const parsed = Number.parseInt(process.env.AI_HTML_SECTION_CONCURRENCY ?? "", 10);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_SECTION_CONCURRENCY;
  }

  return Math.min(8, Math.max(1, parsed));
}

function resolveSectionTimeoutMs() {
  return resolvePositiveIntegerEnv("AI_HTML_SECTION_TIMEOUT_MS", DEFAULT_SECTION_TIMEOUT_MS);
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
  onResult?: (result: R, index: number) => void,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  let firstError: unknown;

  async function worker() {
    while (nextIndex < values.length && !firstError) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      try {
        results[currentIndex] = await mapper(values[currentIndex]!, currentIndex);
        onResult?.(results[currentIndex]!, currentIndex);
      } catch (error) {
        firstError ??= error;
        return;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );

  if (firstError) {
    throw firstError;
  }

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
    "服务端不会再注入统一暗色 CSS、控制栏或全局交互脚本；片段必须通过自身结构、SVG、局部类名和必要的 inline style 完成页面表现。",
    HTML_SCREEN_SUPPORTED_FRAGMENT_CLASS_GUIDE,
  ].join("\n\n");
}

function buildFocusedPageEditSystemPrompt(system: string) {
  return [
    system,
    "你正在执行服务端 HTML 单页编辑任务，不是重新规划整套大屏。",
    "你每次只修改一个已存在的页面，并且只输出该页 <section> 标签内部的 HTML。",
    "禁止输出 <section>、<!DOCTYPE>、<html>、<head>、<body>、<script>、<style>、外链资源、Markdown 代码围栏、解释文字或 JSON。",
    "不要重写其他页面，不要新增全局导航、倒计时控制栏或外层容器。",
    "优先复用当前页面已经在使用的类名与结构，让现有样式继续生效。",
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
            "服务端只会保留最小的 <section class=\"slide\"> 分页外层和元数据，不再提供统一暗色 CSS、卡片、按钮、倒计时或全局脚本。",
            "不要输出完整文档、section 标签、script、style 或 Markdown。可以使用少量语义类名、SVG 和必要的 inline style，让本页视觉自洽。",
            "必须严格继承统一视觉系统，但页面的背景、排版、布局、层级和视觉节奏都要由你在本页内容里自己完成，不要假设存在服务端预置类名或外壳样式。",
            "请把视觉结构设计成横板课堂大屏片段：远距离可读、结构明确、图形清晰，并严格服从本课 visualSystem 已经推导出的风格基因与 Tailwind 视觉偏好，而不是普通网页卡片堆叠或空洞海报。",
            "必须包含：核心任务、学生行动、安全提醒、评价观察。允许用少量文字，禁止做成密集文字板。",
            input.section.pageRole === "cover"
              ? "本页是首页。首页结构自由，但必须自成完整封面：需要大标题、学校、教师、课堂主题或核心任务，以及清晰的“开始上课”视觉引导；不要只放孤立标题，也不要依赖服务端额外补按钮。"
              : "",
            "请根据 pagePrompt 和 visualIntent 自由选择最有教学帮助的视觉表达；不得受固定组件枚举限制。",
            input.section.visualMode === "hybrid" && input.section.visualAsset
              ? "本页已有服务端生成的 16:9 教学辅助图，图片面板会由服务端插入；你只生成图片旁边或下方的任务、提示、观察与安全信息，不要再输出 img 标签或外链资源。"
              : "如果本页是学习或练习内容，优先用 HTML/CSS/SVG 手搓动作结构、战术跑位、路线、器材路径、对抗关系或动作关键点，帮助学生形成认知。",
            "如果本页是比赛、体能训练、放松拉伸、课堂总结或其他非学练页，优先生成一个居中的任务模块，倒计时视觉可以保留为静态视觉表达，规则和安全提示只保留关键短句。",
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

async function buildFocusedPageEditMessages(input: {
  htmlFocus: HtmlFocusTarget;
  lessonPlan: string;
  originalMessages: SmartEduUIMessage[];
}) {
  const latestUserText = getLatestUserText(input.originalMessages);
  const page = extractHtmlScreenPages(input.htmlFocus.currentHtml)[input.htmlFocus.pageIndex];

  if (!page) {
    throw new Error(`当前 HTML 中不存在第 ${input.htmlFocus.pageIndex + 1} 页，无法执行定向修改。`);
  }

  const pageSpecificRule =
    page.pageRole === "cover"
      ? "当前页是首页封面。封面页只保留必要的主标题、署名、副标题、主视觉和开始按钮视觉，不要堆四宫格信息卡。"
      : "当前页是正文页。保持这页像一张 PPT，信息模块控制在 2-4 个，避免网页化长列表。";

  return convertToModelMessages([
    {
      role: "user",
      parts: [
        {
          type: "text",
          text: [
            "当前是互动大屏的 PPT 分页编辑模式。",
            "只修改锁定页面，其他页面保持不变。",
            "只返回这个页面 <section> 内部的 HTML 内容，不要返回 <section> 标签。",
            "不要输出完整 HTML 文档、脚本、样式、全局控制栏或其他页面内容。",
            pageSpecificRule,
            latestUserText ? `教师本轮修改要求：${latestUserText}` : "",
            `锁定页面：第 ${page.pageIndex + 1} 页`,
            page.pageTitle ? `当前标题：${page.pageTitle}` : "",
            page.pageRole ? `页面角色：${page.pageRole}` : "",
            "",
            "当前页面 HTML：",
            page.sectionHtml,
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

function renderVisualAssetPanel(section: HtmlScreenSectionPlan) {
  const asset = section.visualAsset;
  const imageUrl = asset?.imageUrl ? resolveSafeImageUrl(asset.imageUrl) : "";

  if (!asset || !imageUrl) {
    return "";
  }

  return `
    <figure class="teaching-image-panel" style="margin:0;display:grid;gap:12px;align-content:start;">
      <div class="teaching-image-frame" style="position:relative;overflow:hidden;border-radius:24px;background:#0f172a;aspect-ratio:16 / 9;">
        <img src="${imageUrl}" alt="${escapeHtml(asset.alt)}" loading="eager" decoding="async" style="display:block;width:100%;height:100%;object-fit:cover;">
      </div>
      <figcaption style="margin:0;color:#475569;font-size:14px;line-height:1.5;font-weight:600;">${escapeHtml(asset.caption ?? section.title)}</figcaption>
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
    <div class="teaching-image-layout" style="min-height:100vh;padding:32px;box-sizing:border-box;display:grid;grid-template-columns:minmax(0,1.18fr) minmax(280px,0.82fr);gap:24px;background:#f8fafc;color:#0f172a;">
      ${visualPanel}
      <aside class="teaching-image-cues" style="display:grid;gap:16px;align-content:start;">
        <div style="padding:18px 20px;border-radius:22px;background:#ffffff;border:1px solid #dbeafe;">
          <span style="display:inline-flex;margin-bottom:8px;padding:4px 10px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-size:13px;font-weight:700;">本页任务</span>
          <p style="margin:0;font-size:20px;line-height:1.5;font-weight:700;">${escapeHtml(section.objective ?? `学习并练习${section.title}`)}</p>
        </div>
        <div style="padding:18px 20px;border-radius:22px;background:#ffffff;border:1px solid #e2e8f0;">
          <span style="display:inline-flex;margin-bottom:8px;padding:4px 10px;border-radius:999px;background:#e2e8f0;color:#0f172a;font-size:13px;font-weight:700;">学生行动</span>
          <ol style="margin:0;padding-left:1.2em;font-size:18px;line-height:1.6;font-weight:600;">
            ${actions.map((action) => `<li>${escapeHtml(action)}</li>`).join("")}
          </ol>
        </div>
        <div class="safety" style="padding:18px 20px;border-radius:22px;background:#fff7ed;border:1px solid #fdba74;">
          <span style="display:inline-flex;margin-bottom:8px;padding:4px 10px;border-radius:999px;background:#ffedd5;color:#c2410c;font-size:13px;font-weight:700;">安全边界</span>
          <p style="margin:0;font-size:18px;line-height:1.6;font-weight:600;">${escapeHtml(section.safetyCue ?? "保持安全距离，按教师口令开始与停止。")}</p>
        </div>
        <div style="padding:18px 20px;border-radius:22px;background:#f8fafc;border:1px solid #cbd5e1;">
          <span style="display:inline-flex;margin-bottom:8px;padding:4px 10px;border-radius:999px;background:#e2e8f0;color:#334155;font-size:13px;font-weight:700;">观察评价</span>
          <p style="margin:0;font-size:18px;line-height:1.6;font-weight:600;">${escapeHtml(section.evaluationCue ?? "观察动作是否清晰、稳定、符合本页要求。")}</p>
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
  return `
    <section class="slide" data-page-index="${input.index}" data-page-title="${escapeHtml(input.section.title)}" data-slide-kind="${escapeHtml(input.section.pageRole ?? "lesson")}" data-duration="${input.section.pageRole === "cover" ? 0 : input.section.durationSeconds ?? 300}">
      ${input.fragment}
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
</head>
<body data-html-screen-document="standalone-pages">
  ${slides}
</body>
</html>`;
}

function renderPendingSectionFragment(section: HtmlScreenSectionPlan, index: number) {
  const actions = (section.studentActions?.length ? section.studentActions : ["等待页面内容生成", "保持课堂组织准备"])
    .slice(0, 3);

  return `
    <div class="center-module" style="min-height:100vh;padding:32px;box-sizing:border-box;display:grid;place-items:center;background:#f8fafc;color:#0f172a;">
      <div class="hero-stack" style="width:min(920px,100%);display:grid;gap:16px;padding:28px;border-radius:28px;background:#ffffff;border:1px solid #dbeafe;box-shadow:0 20px 50px rgba(15,23,42,0.08);">
        <span class="eyebrow" style="display:inline-flex;width:fit-content;padding:6px 12px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-size:14px;font-weight:700;">第 ${index + 1} 页生成中</span>
        <h2 style="margin:0;font-size:40px;line-height:1.1;">${escapeHtml(section.title)}</h2>
        <p style="margin:0;font-size:20px;line-height:1.6;color:#334155;">${escapeHtml(section.objective ?? "正在生成本页课堂任务、可视化结构与安全提示。")}</p>
        <div class="cue-grid" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;">
          ${actions.map((action) => `<div style="padding:16px;border-radius:20px;background:#eff6ff;border:1px solid #bfdbfe;"><strong style="display:block;margin-bottom:8px;color:#1d4ed8;font-size:14px;">学生行动</strong><p style="margin:0;font-size:17px;line-height:1.6;color:#0f172a;">${escapeHtml(action)}</p></div>`).join("")}
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
  const htmlPages = createHtmlArtifactPages(input.content);

  return {
    type: "data-artifact",
    id: "lesson-authoring-artifact-html",
    data: createStructuredArtifactData(input.workflow, {
      content: input.content,
      ...(htmlPages.length > 0 ? { htmlPages } : {}),
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
}): Promise<SectionFragmentResult> {
  if (input.section.visualMode === "image") {
    if (!input.section.visualAsset) {
      throw new Error(
        `第 ${input.sectionIndex + 1} 页 HTML 生成失败：缺少可用图片资源，无法生成 image 模式页面。`,
      );
    }

    const fragment = renderImageSectionFragment(input.section).trim();

    if (!fragment) {
      throw new Error(
        `第 ${input.sectionIndex + 1} 页 HTML 生成失败：缺少可用图片资源，无法生成 image 模式页面。`,
      );
    }

    return {
      fragment,
      source: "agent",
      warnings: [],
    };
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
          maxRetries: 0,
          temperature: 0.25,
          timeout: resolveSectionTimeoutMs(),
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

    return {
      fragment: mergedFragment,
      source: "agent",
      warnings: [],
    };
  } catch (error) {
    throw new Error(
      `第 ${input.sectionIndex + 1} 页 HTML 生成失败：${formatEnhancementError(error)}`,
    );
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
          (result, sectionIndex) => {
            const section = screenPlan.sections[sectionIndex]!;
            const sectionToolCallId = `${input.requestId}-html-section-${sectionIndex + 1}`;
            sectionFragments[sectionIndex] = result.fragment;
            enqueueToolOutput(controller, {
              toolCallId: sectionToolCallId,
              output: {
                title: section.title,
                characters: result.fragment.length,
                sectionIndex,
                source: result.source,
                warnings: result.warnings,
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
          createWorkflowTraceStep("generate-html-sections", "failed", errorText),
        );
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

async function generateFocusedPageInnerHtml(input: {
  htmlFocus: HtmlFocusTarget;
  lessonPlan: string;
  messages: SmartEduUIMessage[];
  modelId: string;
  system: string;
}) {
  const messages = await buildFocusedPageEditMessages({
    htmlFocus: input.htmlFocus,
    lessonPlan: input.lessonPlan,
    originalMessages: input.messages,
  });
  const result = await runModelOperationWithRetry(
    () =>
      generateText({
        model: createChatModel(input.modelId),
        system: buildFocusedPageEditSystemPrompt(input.system),
        messages,
        maxRetries: 0,
        temperature: 0.2,
        timeout: resolveSectionTimeoutMs(),
      }),
    {
      mode: "html",
      requestId: `focused-html-page-${input.htmlFocus.pageIndex + 1}`,
    },
  );

  const fragment = sanitizeSectionFragment(result.text).trim();

  if (!fragment) {
    throw new Error("当前页修改返回空内容，无法替换目标页面。");
  }

  return fragment;
}

function createFocusedHtmlEditChunkStream(input: {
  htmlFocus: HtmlFocusTarget;
  lessonPlan: string;
  messages: SmartEduUIMessage[];
  modelId: string;
  requestId: string;
  workflow: LessonWorkflowOutput;
}) {
  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      const workflow = normalizeHtmlWorkflow(input.workflow);
      const runtimeTrace = [...workflow.trace];

      controller.enqueue({ type: "start-step" });
      pushOrReplaceTraceEntry(
        runtimeTrace,
        createWorkflowTraceStep(
          "edit-html-focused-page",
          "running",
          `正在修改第 ${input.htmlFocus.pageIndex + 1} 页，其他页面保持不变。`,
        ),
      );
      controller.enqueue(createTraceChunk({
        phase: "generation",
        requestId: input.requestId,
        runtimeTrace,
        workflow,
      }));

      try {
        const nextInnerHtml = await generateFocusedPageInnerHtml({
          htmlFocus: input.htmlFocus,
          lessonPlan: input.lessonPlan,
          messages: input.messages,
          modelId: input.modelId,
          system: workflow.system,
        });
        const updatedHtml = replaceHtmlScreenPageInnerHtml({
          htmlContent: input.htmlFocus.currentHtml,
          nextInnerHtml,
          pageIndex: input.htmlFocus.pageIndex,
        });

        pushOrReplaceTraceEntry(
          runtimeTrace,
          createWorkflowTraceStep(
            "edit-html-focused-page",
            "success",
            `第 ${input.htmlFocus.pageIndex + 1} 页已完成定向修改，并已保留其他页面。`,
          ),
        );
        controller.enqueue(createArtifactChunk({
          content: updatedHtml,
          isComplete: true,
          status: "ready",
          workflow,
        }));
        controller.enqueue(createTraceChunk({
          phase: "completed",
          requestId: input.requestId,
          runtimeTrace,
          workflow,
        }));
      } catch (error) {
        const errorText = error instanceof Error ? error.message : "当前页修改失败。";
        pushOrReplaceTraceEntry(
          runtimeTrace,
          createWorkflowTraceStep(
            "edit-html-focused-page",
            "failed",
            errorText,
          ),
        );
        controller.enqueue(createTraceChunk({
          phase: "failed",
          requestId: input.requestId,
          runtimeTrace,
          workflow,
        }));
        controller.enqueue({ type: "error", errorText });
      } finally {
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

export async function runServerHtmlFocusedPageEditSkill(input: {
  htmlFocus: HtmlFocusTarget;
  lessonPlan: string;
  messages: SmartEduUIMessage[];
  modelId?: string;
  requestId: string;
  workflow: LessonWorkflowOutput;
}): Promise<ReadableStream<UIMessageChunk>> {
  return createFocusedHtmlEditChunkStream({
    htmlFocus: input.htmlFocus,
    lessonPlan: input.lessonPlan,
    messages: input.messages,
    modelId: input.modelId ?? DEFAULT_HTML_MODEL_ID,
    requestId: input.requestId,
    workflow: input.workflow,
  });
}
