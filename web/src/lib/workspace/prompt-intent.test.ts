import { describe, expect, it } from "vitest";

import { classifyPromptIntent } from "./prompt-intent";

describe("prompt-intent", () => {
  it("classifies lesson edit instructions as patch intent", () => {
    expect(classifyPromptIntent("把热身时间改为 8 分钟，并增加安全提示")).toBe("patch-lesson");
  });

  it("keeps screen generation instructions on generate intent", () => {
    expect(classifyPromptIntent("我确认教案无误，请生成互动大屏")).toBe("generate");
  });

  it("treats blank prompts as generate intent so callers can ignore them consistently", () => {
    expect(classifyPromptIntent("   ")).toBe("generate");
  });
});
