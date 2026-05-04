import {
  convertToModelMessages,
  streamText,
  type UIMessageChunk,
} from "ai";

import {
  competitionLessonPlanSchema,
  type CompetitionLessonPlan,
} from "@/lib/lesson/contract";
import { ensureCompleteHtmlDocument } from "@/lib/html-screen-editor";
import { HTML_SCREEN_DESIGN_DIRECTION } from "@/lib/html-screen-visual-language";
import type { SmartEduUIMessage } from "@/lib/lesson/authoring-contract";
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
    "你正在执行服务端 HTML 大屏正式生成任务，输出内容会直接进入 HTML artifact 解析和预览链路。",
    "你必须直接输出一个完整可运行的 HTML 文档，正文只包含 HTML 本身。",
    "HTML 必须包含 <!DOCTYPE html>、<html lang=\"zh-CN\">、<head>、<meta charset=\"utf-8\">、<meta name=\"viewport\">、<title>、<body>。",
    "最终页面必须是一个完整 HTML 文件，并适配前端 iframe srcDoc 沙箱中的 1920×1080 16:9 投屏画布；可以在同一 HTML 画布内使用阶段区域、流程条、任务卡、倒计时、计分器和路线图组织课堂信息。",
    "输出内容专注完整 HTML 文档本体，页面结构适配单个 iframe 投屏画布和离线自包含运行。",
    "使用原生 HTML、内联 CSS、SVG 和少量内联 JavaScript；数据状态放在当前页面内存中，资源使用文档内联内容。",
    "页面必须适合横板大屏远距离观看：大字号、强层级、短句、清晰模块、明确安全边界和巨大的倒计时或时间节奏。",
    "教学流程保持深简约：呈现教师上课真正需要看的关键信息，用短句、流程条、倒计时和图形区提炼教案内容。",
    "倒计时必须是真实可运行的计时器：用 DOM 文本节点显示剩余时间，由内联 JavaScript 维护剩余秒数并按秒更新，提供开始、暂停/继续、重置或等效控制；教师点击运行后数字必须随时间变化。",
    "评价区域写现场观察点或完成标准，使用课堂观察语言表达。",
    "学练或战术区域使用 HTML/CSS/SVG 绘制路线、队形、轮换、攻防、配合或器材路径；非学习类区域以居中巨型倒计时为核心，背景使用契合当前阶段的速度线、粒子、光晕、场地纹理、呼吸渐变或节奏脉冲等视觉特效。",
    "【极度重要】把整节课整合为同一个 iframe 投屏画布内可操作、可投屏、可离线运行的完整 HTML。",
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
        "1. 必须直接输出完整 HTML 文档，内容专注 HTML 文档本体。",
        "2. 必须把课时计划主要环节组织到同一个 iframe 投屏画布中，包含明显的课程主状态区、流程条、当前任务、动作图解或战术板；非学习环节以居中巨型倒计时为核心。",
        "3. 倒计时必须由内联 JavaScript 驱动真实更新，教师点击运行后剩余时间数字按秒变化，并提供开始、暂停/继续、重置或等效控制。",
        "4. 教学流程深简约，用短句、流程条、倒计时和图形区提炼教案内容。",
        "5. 评价区域使用现场观察点或完成标准。",
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
