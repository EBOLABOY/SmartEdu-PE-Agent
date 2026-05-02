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
