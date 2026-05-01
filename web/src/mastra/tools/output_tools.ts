import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { competitionLessonPlanSchema } from "@/lib/competition-lesson-contract";

export const SUBMIT_LESSON_PLAN_TOOL_NAME = "submit_lesson_plan";

export const submitLessonPlanToolInputSchema = z.object({
  lessonPlan: competitionLessonPlanSchema,
  summary: z.string().trim().min(1).max(500).describe("本次课时计划生成或修改的简短摘要"),
});

export type SubmitLessonPlanToolInput = z.infer<typeof submitLessonPlanToolInputSchema>;

export function parseSubmitLessonPlanToolInput(input: unknown) {
  return submitLessonPlanToolInputSchema.parse(input);
}

export const submitLessonPlanTool = createTool({
  id: SUBMIT_LESSON_PLAN_TOOL_NAME,
  description:
    "[Deprecated legacy compatibility only] 旧版 Agent 工具链提交最终 CompetitionLessonPlan 的工具。正式新链路由服务端代码直接校验、封装和持久化，不应让 Agent 调用本工具搬运 JSON。",
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
