import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { competitionLessonPlanSchema } from "@/lib/competition-lesson-contract";

export const SUBMIT_LESSON_PLAN_TOOL_NAME = "submit_lesson_plan";
export const SUBMIT_HTML_SCREEN_TOOL_NAME = "submit_html_screen";

export const submitLessonPlanToolInputSchema = z.object({
  lessonPlan: competitionLessonPlanSchema,
  summary: z.string().trim().min(1).max(500).describe("本次课时计划生成或修改的简短摘要"),
});

export type SubmitLessonPlanToolInput = z.infer<typeof submitLessonPlanToolInputSchema>;

export const submitHtmlScreenToolInputSchema = z.object({
  html: z
    .string()
    .trim()
    .min(1)
    .max(5 * 1024 * 1024)
    .describe("完整可运行的单文件 HTML，必须内联 CSS 和 JavaScript"),
  summary: z.string().trim().min(1).max(500).describe("本次互动大屏生成的简短摘要"),
});

export type SubmitHtmlScreenToolInput = z.infer<typeof submitHtmlScreenToolInputSchema>;

export function parseSubmitLessonPlanToolInput(input: unknown) {
  return submitLessonPlanToolInputSchema.parse(input);
}

export function parseSubmitHtmlScreenToolInput(input: unknown) {
  return submitHtmlScreenToolInputSchema.parse(input);
}

export const submitLessonPlanTool = createTool({
  id: SUBMIT_LESSON_PLAN_TOOL_NAME,
  description:
    "当课时计划设计完成，或按用户要求修改完成后，必须调用此工具提交最终 CompetitionLessonPlan 和简短摘要。",
  inputSchema: submitLessonPlanToolInputSchema,
  execute: async ({ lessonPlan, summary }) => {
    return {
      message: "课时计划已提交到结构化 UI。",
      success: true,
      summary,
      title: lessonPlan.title,
    };
  },
});

export const submitHtmlScreenTool = createTool({
  id: SUBMIT_HTML_SCREEN_TOOL_NAME,
  description:
    "当互动大屏 HTML 完成后，必须调用此工具提交最终单文件 HTML 和简短摘要。",
  inputSchema: submitHtmlScreenToolInputSchema,
  execute: async ({ html, summary }) => {
    return {
      htmlLength: html.length,
      message: "互动大屏已提交到结构化 UI。",
      success: true,
      summary,
    };
  },
});
