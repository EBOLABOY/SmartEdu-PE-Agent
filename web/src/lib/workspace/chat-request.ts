import type { CompetitionLessonPlan } from "@/lib/competition-lesson-contract";

export function buildLessonChatRequestBody(input: {
  currentLessonPlan?: CompetitionLessonPlan;
}) {
  const lessonPlan = input.currentLessonPlan
    ? JSON.stringify(input.currentLessonPlan)
    : undefined;

  return {
    mode: "lesson" as const,
    ...(lessonPlan ? { lessonPlan } : {}),
  };
}
