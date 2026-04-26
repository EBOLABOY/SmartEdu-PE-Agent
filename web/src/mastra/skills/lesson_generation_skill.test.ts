import type { MastraModelOutput } from "@mastra/core/stream";
import { describe, expect, it, vi } from "vitest";

import type { SmartEduUIMessage } from "@/lib/lesson-authoring-contract";
import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

import { runHtmlScreenGenerationSkill, runLessonGenerationSkill } from "./index";
import { runAgentStreamWithRetry } from "./lesson_generation_skill";

const workflow = {
  system: "系统提示词",
  generationPlan: {
    maxSteps: 3,
  },
} as LessonWorkflowOutput;

const streamResult = { mocked: "stream" } as unknown as MastraModelOutput<unknown>;

describe("generation skills", () => {
  it("lesson 阶段会把 UIMessage 转换为模型消息后调用 agent stream", async () => {
    const agentStream = vi.fn().mockResolvedValue(streamResult);
    const messages = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "五年级篮球运球课" }],
      },
    ] as SmartEduUIMessage[];

    const result = await runLessonGenerationSkill({
      messages,
      requestId: "request-1",
      workflow,
      agentStream,
    });

    expect(result.result).toBe(streamResult);
    expect(result.modelMessageCount).toBe(1);
    expect(agentStream).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          role: "user",
        }),
      ]),
      expect.objectContaining({
        system: "系统提示词",
        maxSteps: 3,
        providerOptions: { openai: { store: true } },
      }),
    );
  });

  it("html 阶段使用 slim message，不透传完整历史", async () => {
    const agentStream = vi.fn().mockResolvedValue(streamResult);

    const result = await runHtmlScreenGenerationSkill({
      requestId: "request-2",
      workflow,
      lessonPlanLength: 120,
      originalMessageCount: 8,
      agentStream,
    });

    expect(result.result).toBe(streamResult);
    expect(result.modelMessageCount).toBe(1);
    expect(agentStream).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("生成课堂学习辅助大屏 HTML"),
        }),
      ],
      expect.objectContaining({
        system: "系统提示词",
        maxSteps: 3,
      }),
    );
  });

  it("retryable error 会重试，非 retryable error 不重试", async () => {
    const retryable = Object.assign(new Error("timeout"), { statusCode: 503 });
    const operation = vi.fn().mockRejectedValueOnce(retryable).mockResolvedValueOnce("ok");

    await expect(
      runAgentStreamWithRetry(operation, {
        mode: "lesson",
        requestId: "request-3",
      }),
    ).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);

    const fatal = new Error("bad request");
    const fatalOperation = vi.fn().mockRejectedValue(fatal);

    await expect(
      runAgentStreamWithRetry(fatalOperation, {
        mode: "lesson",
        requestId: "request-4",
      }),
    ).rejects.toThrow("bad request");
    expect(fatalOperation).toHaveBeenCalledTimes(1);
  });
});
