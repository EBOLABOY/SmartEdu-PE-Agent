import { describe, expect, it, vi } from "vitest";

import type { SmartEduUIMessage } from "@/lib/lesson/authoring-contract";

import { runLessonIntentSkill } from "./lesson_intent_skill";

function createUserMessages(text: string): SmartEduUIMessage[] {
  return [
    {
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text }],
    },
  ] as SmartEduUIMessage[];
}

describe("lesson intent skill", () => {
  it("short-circuits to lesson generation for a blank lesson workspace", async () => {
    const generateIntent = vi.fn();

    const result = await runLessonIntentSkill({
      generateIntent,
      messages: createUserMessages("跳绳"),
      mode: "lesson",
      query: "跳绳",
      requestId: "request-intent-short-circuit",
    });

    expect(result).toMatchObject({
      intent: "generate_lesson",
      confidence: 1,
    });
    expect(generateIntent).not.toHaveBeenCalled();
  });

  it("still asks the model for standards consultation queries", async () => {
    const generateIntent = vi.fn().mockResolvedValue({
      intent: "consult_standards" as const,
      confidence: 0.93,
      reason: "用户在问课标依据。",
    });

    const result = await runLessonIntentSkill({
      generateIntent,
      messages: createUserMessages("这节跳绳课符合课标要求吗"),
      mode: "lesson",
      query: "这节跳绳课符合课标要求吗",
      requestId: "request-intent-standards",
    });

    expect(result.intent).toBe("consult_standards");
    expect(generateIntent).toHaveBeenCalledOnce();
  });

  it("does not swallow html requests when the workspace is still blank", async () => {
    const generateIntent = vi.fn().mockResolvedValue({
      intent: "generate_html" as const,
      confidence: 0.95,
      reason: "用户要生成互动大屏。",
    });

    const result = await runLessonIntentSkill({
      generateIntent,
      messages: createUserMessages("给我生成一个跳绳互动大屏"),
      mode: "lesson",
      query: "给我生成一个跳绳互动大屏",
      requestId: "request-intent-html",
    });

    expect(result.intent).toBe("generate_html");
    expect(generateIntent).toHaveBeenCalledOnce();
  });
});
