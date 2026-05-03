import {
  convertToModelMessages,
  streamText,
  type UIMessageChunk,
} from "ai";

import {
  competitionLessonPlanSchema,
  type CompetitionLessonPlan,
} from "@/lib/competition-lesson-contract";
import {
  ensureCompleteHtmlDocument,
  replaceHtmlScreenPageInnerHtml,
} from "@/lib/html-screen-editor";
import { HTML_SCREEN_DESIGN_DIRECTION } from "@/lib/html-screen-visual-language";
import type {
  HtmlFocusTarget,
  SmartEduUIMessage,
} from "@/lib/lesson-authoring-contract";
import { createChatModel } from "@/mastra/models";
import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

import { runModelOperationWithRetry } from "./lesson_generation_skill";

type AgentModelMessages = Awaited<ReturnType<typeof convertToModelMessages>>;

const DEFAULT_HTML_MODEL_ID = process.env.AI_HTML_MODEL ?? process.env.AI_LESSON_MODEL ?? process.env.AI_MODEL ?? "gpt-4.1-mini";

function tryParseLessonPlan(value: string): CompetitionLessonPlan | undefined {
  if (!value.trim()) {
    return undefined;
  }

  try {
    return competitionLessonPlanSchema.parse(JSON.parse(value));
  } catch {
    return undefined;
  }
}

function extractLessonPartNine(value: string) {
  const lessonPlan = tryParseLessonPlan(value);

  if (!lessonPlan) {
    return value.trim() || "未提供已确认课时计划。";
  }

  return JSON.stringify(
    {
      title: lessonPlan.title,
      subtitle: lessonPlan.subtitle,
      teacher: lessonPlan.teacher,
      meta: lessonPlan.meta,
      periodPlan: lessonPlan.periodPlan,
      venueEquipment: lessonPlan.venueEquipment,
      loadEstimate: lessonPlan.loadEstimate,
    },
    null,
    2,
  );
}

function stripCodeFence(value: string) {
  const trimmed = value.trim();
  const fenceMatch = /^```(?:html)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);

  return fenceMatch?.[1]?.trim() ?? trimmed;
}

function shouldInjectFullHtmlWrapper(value: string) {
  return !/<html\b/i.test(value) || !/<body\b/i.test(value);
}

function createTextDeltaStreamFromText(input: {
  id: string;
  text: PromiseLike<string> | string;
}): ReadableStream<UIMessageChunk> {
  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      controller.enqueue({ type: "text-start", id: input.id });

      try {
        const raw = await input.text;
        const html = shouldInjectFullHtmlWrapper(raw) ? ensureCompleteHtmlDocument(raw) : raw;
        controller.enqueue({ type: "text-delta", id: input.id, delta: html });
        controller.enqueue({ type: "text-end", id: input.id });
        controller.enqueue({ type: "finish", finishReason: "stop" });
      } catch (error) {
        controller.enqueue({
          type: "error",
          errorText: `HTML 大屏生成失败：${error instanceof Error ? error.message : "unknown-error"}`,
        });
        controller.enqueue({ type: "finish", finishReason: "error" });
      } finally {
        controller.close();
      }
    },
  });
}

function createUiMessageStreamFromTextStream(input: {
  id: string;
  textStream: AsyncIterable<string>;
}) {
  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      controller.enqueue({ type: "text-start", id: input.id });

      try {
        for await (const delta of input.textStream) {
          controller.enqueue({ type: "text-delta", id: input.id, delta });
        }

        controller.enqueue({ type: "text-end", id: input.id });
        controller.enqueue({ type: "finish", finishReason: "stop" });
      } catch (error) {
        controller.enqueue({
          type: "error",
          errorText: `HTML 大屏生成失败：${error instanceof Error ? error.message : "unknown-error"}`,
        });
        controller.enqueue({ type: "finish", finishReason: "error" });
      } finally {
        controller.close();
      }
    },
  });
}

function buildDirectHtmlSystemPrompt(workflowSystem: string) {
  return [
    workflowSystem,
    "你正在执行服务端 HTML 大屏正式生成任务，不是聊天回复，也不是分镜规划。",
    "你必须直接输出一个完整可运行的 HTML 文档，只输出 HTML 本身，不要输出 Markdown、代码围栏、解释文字或 JSON。",
    "HTML 必须包含 <!DOCTYPE html>、<html lang=\"zh-CN\">、<head>、<meta charset=\"utf-8\">、<meta name=\"viewport\">、<title>、<body>。",
    "最终页面必须是多页幻灯片序列：每页使用 <section class=\"slide\" data-slide-kind=\"环节名\" data-duration=\"时长秒数\"> 封装。第一页固定为首页。不要再将所有内容压缩到单页中。",
    "不要做上下滑动分页，所有 slide 平铺或隐藏皆可，底层引擎会自动控制 .slide 的显示隐藏与轮播切换。",
    "只允许原生 HTML、内联 CSS、SVG 和少量内联 JavaScript；禁止外链脚本、外链样式、CDN、fetch/XHR/WebSocket/EventSource、cookie、localStorage、sessionStorage、表单提交和新窗口。",
    "页面必须适合横板大屏远距离观看：大字号、强层级、短句、清晰模块、明确安全边界和巨大的倒计时或时间节奏。",
    "教学流程必须深简约：只保留教师上课真正需要看的关键信息，不堆长段教案，不生成星级评价卡片，不把课时计划所有字段机械搬上屏。",
    "评价只写现场观察点或完成标准，禁止输出“三颗星/二颗星/一颗星”星级评价体系。",
    "学练或战术区域不能只是文字板；涉及路线、队形、轮换、攻防、配合或器材路径时，必须用 HTML/CSS/SVG 绘制简洁图形战术板。非学习类页面必须保留巨大的倒计时位置（class 包含 duration-display 或 timer-display）。",
    "【极度重要】严禁生成单页！你必须将整个课程（准备活动、多个基本技术学练环节、体能补偿、放松总结等）拆分为至少 5-8 个独立的 `<section class=\"slide\">` 页面。如果生成的页面只有 1 页，将被视为严重错误！",
    HTML_SCREEN_DESIGN_DIRECTION,
  ].join("\n\n");
}

function getLatestUserText(messages: SmartEduUIMessage[]) {
  return messages
    .findLast((message) => message.role === "user")
    ?.parts.filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim() ?? "";
}

function buildDirectHtmlMessages(input: {
  lessonPlan: string;
  messages: AgentModelMessages;
  originalMessages: SmartEduUIMessage[];
}) {
  const latestUserText = getLatestUserText(input.originalMessages);

  return [
    ...input.messages,
    {
      role: "user" as const,
      content: [
        "请基于下面的已确认课时计划第九部分和用户本轮要求，一次性生成完整互动大屏 HTML。",
        "",
        "用户本轮要求：",
        latestUserText || "生成课堂互动大屏。",
        "",
        "已确认课时计划第九部分 JSON：",
        extractLessonPartNine(input.lessonPlan),
        "",
        "生成要求：",
        "1. 必须直接输出完整 HTML 文档，务必拆分为多个 `<section class=\"slide\">`。严禁将所有流程写在同一个 slide 内！",
        "2. 必须根据课时计划的环节数量生成等量的幻灯片（通常至少 5-8 页），首尾要有明显的课程首页与总结页，环节要有动作图解或战术板，非学习环节要留出倒计时大字区。",
        "3. 教学流程深简约，不把教案全文搬到页面上。",
        "4. 不输出三颗星、二颗星、一颗星等星级评价。",
      ].join("\n"),
    },
  ] as AgentModelMessages;
}

function streamCompleteHtml(input: {
  lessonPlan: string;
  messages: AgentModelMessages;
  modelId: string;
  originalMessages: SmartEduUIMessage[];
  workflow: LessonWorkflowOutput;
}) {
  const result = streamText({
    model: createChatModel(input.modelId),
    system: buildDirectHtmlSystemPrompt(input.workflow.system),
    messages: buildDirectHtmlMessages({
      lessonPlan: input.lessonPlan,
      messages: input.messages,
      originalMessages: input.originalMessages,
    }),
    temperature: 0.4,
  });

  if ("textStream" in result && result.textStream) {
    return createUiMessageStreamFromTextStream({
      id: "html-screen-document",
      textStream: result.textStream,
    });
  }

  return createTextDeltaStreamFromText({
    id: "html-screen-document",
    text: result.text,
  });
}

export async function runServerHtmlGenerationSkill(input: {
  lessonPlan: string;
  messages: SmartEduUIMessage[];
  modelId?: string;
  projectId?: string;
  requestId: string;
  workflow: LessonWorkflowOutput;
}) {
  const modelMessages = await convertToModelMessages(input.messages);

  return runModelOperationWithRetry(
    async () =>
      streamCompleteHtml({
        lessonPlan: input.lessonPlan,
        messages: modelMessages,
        modelId: input.modelId ?? DEFAULT_HTML_MODEL_ID,
        originalMessages: input.messages,
        workflow: input.workflow,
      }),
    { mode: "html", requestId: input.requestId },
  );
}

function buildFocusedEditPrompt(input: {
  htmlFocus: HtmlFocusTarget;
  lessonPlan: string;
  messages: SmartEduUIMessage[];
}) {
  return [
    "请只生成当前单页大屏 <main> 内部的新 HTML 片段，不要输出完整 HTML 文档、head、body、代码围栏或解释文字。",
    "片段必须继承原大屏风格，并根据用户要求完成定向修改。",
    "",
    "用户要求：",
    getLatestUserText(input.messages) || "修改当前互动大屏。",
    "",
    "当前页面信息：",
    `- 页面索引：${input.htmlFocus.pageIndex}`,
    input.htmlFocus.pageTitle ? `- 页面标题：${input.htmlFocus.pageTitle}` : "",
    input.htmlFocus.pageRole ? `- 页面角色：${input.htmlFocus.pageRole}` : "",
    "",
    "当前完整 HTML：",
    input.htmlFocus.currentHtml,
    "",
    "课时计划第九部分 JSON：",
    extractLessonPartNine(input.lessonPlan),
  ]
    .filter(Boolean)
    .join("\n");
}

export async function runServerHtmlFocusedPageEditSkill(input: {
  htmlFocus: HtmlFocusTarget;
  lessonPlan: string;
  messages: SmartEduUIMessage[];
  modelId?: string;
  requestId: string;
  workflow: LessonWorkflowOutput;
}) {
  const modelMessages = await convertToModelMessages(input.messages);
  const result = await runModelOperationWithRetry(
    async () =>
      streamText({
        model: createChatModel(input.modelId ?? DEFAULT_HTML_MODEL_ID),
        system: [
          input.workflow.system,
          "你正在修改课堂互动大屏的当前单页内容。只输出用于替换 <main> 内部的 HTML 片段，不要输出完整文档或解释。",
        ].join("\n\n"),
        messages: [
          ...modelMessages,
          {
            role: "user" as const,
            content: buildFocusedEditPrompt({
              htmlFocus: input.htmlFocus,
              lessonPlan: input.lessonPlan,
              messages: input.messages,
            }),
          },
        ] as AgentModelMessages,
        temperature: 0.3,
      }),
    { mode: "html", requestId: input.requestId },
  );
  const updatedInnerHtml = await result.text;
  const updatedDocument = replaceHtmlScreenPageInnerHtml({
    htmlContent: input.htmlFocus.currentHtml,
    nextInnerHtml: stripCodeFence(updatedInnerHtml),
    pageIndex: input.htmlFocus.pageIndex,
  });

  return createTextDeltaStreamFromText({
    id: "html-screen-document-edit",
    text: ensureCompleteHtmlDocument(updatedDocument),
  });
}
