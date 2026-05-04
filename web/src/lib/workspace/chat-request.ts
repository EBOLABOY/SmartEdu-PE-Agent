import type { CompetitionLessonPlan } from "@/lib/lesson/contract";

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

export function buildHtmlChatRequestBody(input: {
  currentLessonPlan?: CompetitionLessonPlan;
}) {
  const lessonPlan = input.currentLessonPlan
    ? JSON.stringify(input.currentLessonPlan)
    : undefined;

  return {
    mode: "html" as const,
    ...(lessonPlan ? { lessonPlan } : {}),
  };
}
