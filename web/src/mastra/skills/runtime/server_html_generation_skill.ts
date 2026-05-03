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
    "最终页面必须是课堂投屏单页：使用 <main data-html-screen-document=\"single-page\"> 作为主体，不要做 PPT 式多页 slide、上下滑动分页或轮播控制。",
    "可以在一个页面内分区呈现课堂主题、热身、学练、比赛或展示、体能、放松、安全提醒、评价观察和时间节奏。",
    "只允许原生 HTML、内联 CSS、SVG 和少量内联 JavaScript；禁止外链脚本、外链样式、CDN、fetch/XHR/WebSocket/EventSource、cookie、localStorage、sessionStorage、表单提交和新窗口。",
    "页面必须适合横板大屏远距离观看：大字号、强层级、短句、清晰模块、明确安全边界和倒计时或时间节奏。",
    "教学流程必须深简约：只保留教师上课真正需要看的关键信息，不堆长段教案，不生成星级评价卡片，不把课时计划所有字段机械搬上屏。",
    "评价只写现场观察点或完成标准，禁止输出“三颗星/二颗星/一颗星”星级评价体系。",
    "学练区域不能只是文字板；涉及路线、队形、轮换、攻防、配合或器材路径时，必须用 HTML/CSS/SVG 绘制简洁图形。",
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
        "1. 直接输出完整 HTML 文档。",
        "2. 只做一个单页大屏，不要生成分镜协议、页面数组、Markdown 或解释文字。",
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
