import { convertToModelMessages, streamText, type UIMessageChunk } from "ai";

import { extractHtmlDocumentFromText } from "@/lib/artifact-protocol";
import type { SmartEduUIMessage } from "@/lib/lesson-authoring-contract";
import { createChatModel } from "@/mastra/models";
import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

import { runModelOperationWithRetry } from "./lesson_generation_skill";

const DEFAULT_HTML_MODEL_ID = process.env.AI_HTML_MODEL ?? process.env.AI_MODEL ?? "gpt-4.1-mini";

function buildHtmlServerSystemPrompt(system: string) {
  return [
    system,
    "你正在执行服务端 HTML 大屏生成任务，不是工具调用或聊天回复。",
    "只输出完整 HTML 文档本身，必须从 <!DOCTYPE html> 或 <html lang=\"zh-CN\"> 开始。",
    "不要调用 submit_html_screen，不要输出 Markdown、代码围栏、解释文字或 JSON。",
    "HTML 必须是单文件：内联 CSS 和少量内联 JavaScript；禁止外链脚本、样式、媒体和 CDN。",
  ].join("\n\n");
}

async function buildHtmlModelMessages(input: {
  lessonPlan: string;
  originalMessages: SmartEduUIMessage[];
}) {
  const userMessages = input.originalMessages.filter((message) => message.role === "user");
  const latestUserText = userMessages
    .at(-1)
    ?.parts.filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");

  return convertToModelMessages([
    {
      role: "user",
      parts: [
        {
          type: "text",
          text: [
            "请基于下面已确认课时计划生成课堂学习辅助大屏 HTML。",
            latestUserText ? `教师本轮要求：${latestUserText}` : "",
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

export async function runServerHtmlGenerationSkill(input: {
  lessonPlan: string;
  messages: SmartEduUIMessage[];
  modelId?: string;
  requestId: string;
  workflow: LessonWorkflowOutput;
}): Promise<ReadableStream<UIMessageChunk>> {
  const modelMessages = await buildHtmlModelMessages({
    lessonPlan: input.lessonPlan,
    originalMessages: input.messages,
  });

  const result = await runModelOperationWithRetry(
    () =>
      Promise.resolve(
        streamText({
          model: createChatModel(input.modelId ?? DEFAULT_HTML_MODEL_ID),
          system: buildHtmlServerSystemPrompt(input.workflow.system),
          messages: modelMessages,
          temperature: 0.2,
        }),
      ),
    {
      mode: "html",
      requestId: input.requestId,
    },
  );

  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      const id = "server-html-stream";
      let rawHtml = "";

      controller.enqueue({ type: "text-start", id });

      try {
        for await (const delta of result.textStream) {
          rawHtml += delta;
          controller.enqueue({ type: "text-delta", id, delta });
        }

        controller.enqueue({ type: "text-end", id });

        const extraction = extractHtmlDocumentFromText(rawHtml);
        if (!extraction.html.trim()) {
          controller.enqueue({
            type: "error",
            errorText: "模型响应中未提取到 HTML 文档，无法生成互动大屏。",
          });
          controller.enqueue({ type: "finish", finishReason: "error" });
          controller.close();
          return;
        }

        controller.enqueue({ type: "finish", finishReason: "stop" });
        controller.close();
      } catch (error) {
        controller.enqueue({
          type: "error",
          errorText: error instanceof Error ? error.message : "HTML 生成流异常。",
        });
        controller.enqueue({ type: "finish", finishReason: "error" });
        controller.close();
      }
    },
  });
}
