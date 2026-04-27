import type { MastraModelOutput } from "@mastra/core/stream";
import type { UIMessageChunk } from "ai";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_COMPETITION_LESSON_PLAN } from "@/lib/competition-lesson-contract";
import type { SmartEduUIMessage } from "@/lib/lesson-authoring-contract";
import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

import { runHtmlScreenGenerationSkill, runLessonGenerationSkill } from "./index";
import { runModelOperationWithRetry } from "./lesson_generation_skill";

const workflow = {
  system: "system prompt",
  generationPlan: {
    maxSteps: 3,
  },
} as LessonWorkflowOutput;

const streamResult = { mocked: "stream" } as unknown as MastraModelOutput<unknown>;
const concreteLessonPlan = JSON.parse(
  JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN).replaceAll("XXX", "lesson"),
);

async function readAll(stream: ReadableStream<UIMessageChunk>) {
  const reader = stream.getReader();
  const chunks: UIMessageChunk[] = [];

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      return chunks;
    }

    chunks.push(value);
  }
}

describe("generation skills", () => {
  it("lesson generation uses schema-bound streaming output and preserves text deltas", async () => {
    const structuredStream = vi.fn().mockImplementation(
      async () =>
        new ReadableStream<UIMessageChunk>({
          start(controller) {
            controller.enqueue({ type: "text-start", id: "lesson-json" });
            controller.enqueue({ type: "text-delta", id: "lesson-json", delta: "{\"title\":" });
            controller.enqueue({ type: "text-delta", id: "lesson-json", delta: "\"篮球\"" });
            controller.enqueue({ type: "text-end", id: "lesson-json" });
            controller.enqueue({ type: "finish", finishReason: "stop" });
            controller.close();
          },
        }),
    );
    const messages = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "grade 5 basketball dribbling lesson" }],
      },
    ] as SmartEduUIMessage[];

    const result = await runLessonGenerationSkill({
      messages,
      modelId: "gpt-test",
      requestId: "request-1",
      structuredStream,
      workflow,
    });

    expect(result.modelMessageCount).toBe(1);
    expect(structuredStream).toHaveBeenCalledWith(
      expect.objectContaining({
        maxSteps: 3,
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "user",
          }),
        ]),
        modelId: "gpt-test",
        system: "system prompt",
      }),
    );

    const chunks = await readAll(result.stream);

    expect(chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text-start", id: "lesson-json" }),
        expect.objectContaining({
          type: "text-delta",
          delta: "{\"title\":",
        }),
        expect.objectContaining({
          type: "text-delta",
          delta: "\"篮球\"",
        }),
        expect.objectContaining({ type: "text-end", id: "lesson-json" }),
        expect.objectContaining({ type: "finish", finishReason: "stop" }),
      ]),
    );
  });

  it("lesson generation keeps the legacy structured generator as a tested fallback", async () => {
    const structuredGenerate = vi.fn().mockResolvedValue(concreteLessonPlan);
    const messages = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "grade 5 basketball dribbling lesson" }],
      },
    ] as SmartEduUIMessage[];

    const result = await runLessonGenerationSkill({
      messages,
      modelId: "gpt-test",
      requestId: "request-legacy",
      structuredGenerate,
      workflow,
    });
    const chunks = await readAll(result.stream);

    expect(structuredGenerate).toHaveBeenCalledOnce();
    expect(chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text-delta",
          delta: expect.stringContaining("\"title\""),
        }),
      ]),
    );
  });

  it("html generation uses a slim message instead of passing the full chat history", async () => {
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
          content: expect.any(String),
          role: "user",
        }),
      ],
      expect.objectContaining({
        maxSteps: 3,
        system: "system prompt",
      }),
    );
  });

  it("retries retryable errors and does not retry fatal errors", async () => {
    const retryable = Object.assign(new Error("timeout"), { statusCode: 503 });
    const operation = vi.fn().mockRejectedValueOnce(retryable).mockResolvedValueOnce("ok");

    await expect(
      runModelOperationWithRetry(operation, {
        mode: "lesson",
        requestId: "request-3",
      }),
    ).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);

    const fatal = new Error("bad request");
    const fatalOperation = vi.fn().mockRejectedValue(fatal);

    await expect(
      runModelOperationWithRetry(fatalOperation, {
        mode: "lesson",
        requestId: "request-4",
      }),
    ).rejects.toThrow("bad request");
    expect(fatalOperation).toHaveBeenCalledTimes(1);
  });
});
