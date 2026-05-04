import { describe, expect, it } from "vitest";

import { DEFAULT_COMPETITION_LESSON_PLAN } from "@/lib/lesson/contract";

import { buildLessonChatRequestBody } from "./chat-request";

describe("chat-request", () => {
  it("includes the current lesson plan when continuing lesson chat from an existing artifact", () => {
    expect(
      buildLessonChatRequestBody({
        currentLessonPlan: DEFAULT_COMPETITION_LESSON_PLAN,
      }),
    ).toEqual({
      mode: "lesson",
      lessonPlan: JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN),
    });
  });

  it("omits lessonPlan when no current lesson artifact exists", () => {
    expect(buildLessonChatRequestBody({})).toEqual({
      mode: "lesson",
    });
  });
});
