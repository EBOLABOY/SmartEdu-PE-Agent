import type { CompetitionLessonPlan } from "@/lib/competition-lesson-contract";
import type { HtmlScreenPageSelection } from "@/lib/html-screen-editor";

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
  currentHtml: string;
  currentLessonPlan?: CompetitionLessonPlan;
  selectedPage?: HtmlScreenPageSelection | null;
}) {
  const lessonPlan = input.currentLessonPlan
    ? JSON.stringify(input.currentLessonPlan)
    : undefined;

  return {
    mode: "html" as const,
    ...(lessonPlan ? { lessonPlan } : {}),
    ...(input.selectedPage
      ? {
        htmlFocus: {
          currentHtml: input.currentHtml,
          pageIndex: input.selectedPage.pageIndex,
          ...(input.selectedPage.pageRole ? { pageRole: input.selectedPage.pageRole } : {}),
          ...(input.selectedPage.pageTitle ? { pageTitle: input.selectedPage.pageTitle } : {}),
        },
      }
      : {}),
  };
}
