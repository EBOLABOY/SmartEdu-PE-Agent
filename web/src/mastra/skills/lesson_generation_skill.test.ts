import type { FullOutput, MastraModelOutput } from "@mastra/core/stream";
import type { UIMessageChunk } from "ai";
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_COMPETITION_LESSON_PLAN,
  agentLessonGenerationSchema,
  type AgentLessonGenerationResult,
  type CompetitionLessonPlan,
} from "@/lib/competition-lesson-contract";
import type { LessonScreenPlan, SmartEduUIMessage } from "@/lib/lesson-authoring-contract";
import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

import { runHtmlScreenGenerationSkill, runHtmlScreenPlanningSkill, runLessonGenerationSkill } from "./index";
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

function fullOutput<T>(object: T) {
  return { object } as FullOutput<T>;
}

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

  it("lesson generation preserves official partial output stream when the streamer provides it", async () => {
    async function* partialOutputStream() {
      yield { title: "羽毛球草稿" };
    }

    const stream = new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue({ type: "finish", finishReason: "stop" });
        controller.close();
      },
    });
    const structuredStream = vi.fn().mockResolvedValue({
      partialOutputStream: partialOutputStream(),
      stream,
    });
    const messages = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "grade 5 badminton lesson" }],
      },
    ] as SmartEduUIMessage[];

    const result = await runLessonGenerationSkill({
      messages,
      modelId: "gpt-test",
      requestId: "request-partial",
      structuredStream,
      workflow,
    });

    const partials = [];

    for await (const partial of result.partialOutputStream ?? []) {
      partials.push(partial);
    }

    expect(result.stream).toBe(stream);
    expect(partials).toEqual([{ title: "羽毛球草稿" }]);
  });

  it("lesson generation uses Mastra Agent structured output with the planning wrapper", async () => {
    const convertedStream = new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue({ type: "text-start", id: "lesson-json" });
        controller.enqueue({ type: "text-delta", id: "lesson-json", delta: JSON.stringify(concreteLessonPlan) });
        controller.enqueue({ type: "text-end", id: "lesson-json" });
        controller.enqueue({ type: "finish", finishReason: "stop" });
        controller.close();
      },
    });
    const mastraOutput = {} as unknown as MastraModelOutput<CompetitionLessonPlan>;
    const agentStream = vi.fn().mockResolvedValue(mastraOutput);
    const toUIMessageStream = vi.fn().mockReturnValue(convertedStream);
    const messages = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "五年级篮球运球，40人，40分钟，篮球场，篮球40个" }],
      },
    ] as SmartEduUIMessage[];

    const result = await runLessonGenerationSkill({
      agentStream,
      messages,
      requestId: "request-mastra-lesson",
      toUIMessageStream,
      workflow,
    });

    const partials = [];

    for await (const partial of result.partialOutputStream ?? []) {
      partials.push(partial);
    }

    expect(result.stream).toBe(convertedStream);
    expect(partials).toEqual([]);
    expect(agentStream).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ role: "user" })]),
      expect.objectContaining({
        maxSteps: 3,
        modelSettings: {
          maxRetries: 3,
        },
        system: "system prompt",
        structuredOutput: expect.objectContaining({
          schema: agentLessonGenerationSchema,
          jsonPromptInjection: true,
        }),
      }),
    );
  });

  it("lesson generation maps wrapped partial object stream to lessonPlan drafts", async () => {
    const partialWrapper = {
      lessonPlan: {
        title: "羽毛球草稿",
      },
    } as Partial<AgentLessonGenerationResult>;
    const objectStream = new ReadableStream<Partial<AgentLessonGenerationResult>>({
      start(controller) {
        controller.enqueue(partialWrapper);
        controller.close();
      },
    });
    const convertedStream = new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue({ type: "finish", finishReason: "stop" });
        controller.close();
      },
    });
    const mastraOutput = { objectStream } as unknown as MastraModelOutput<AgentLessonGenerationResult>;
    const agentStream = vi.fn().mockResolvedValue(mastraOutput);
    const toUIMessageStream = vi.fn().mockReturnValue(convertedStream);
    const messages = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "五年级羽毛球正手发高远球" }],
      },
    ] as SmartEduUIMessage[];

    const result = await runLessonGenerationSkill({
      agentStream,
      messages,
      requestId: "request-mastra-partial-wrapper",
      toUIMessageStream,
      workflow,
    });

    const partials = [];

    for await (const partial of result.partialOutputStream ?? []) {
      partials.push(partial);
    }

    expect(partials).toEqual([{ title: "羽毛球草稿" }]);
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

  it("html screen planning uses an agent-generated section plan and merges deterministic details", async () => {
    const agentPlan: LessonScreenPlan = {
      sections: concreteLessonPlan.periodPlan.rows.map((row: { content: string[]; time: string }, index: number) => ({
        title: `${row.content[0]}-${index}`,
        durationSeconds: 120,
        supportModule: index === 1 ? "scoreboard" : "formation",
        sourceRowIndex: index,
        reason: "Agent 根据课堂环节重新规划页面。",
      })),
    };
    const agentGenerate = vi.fn().mockResolvedValue(fullOutput(agentPlan));

    const result = await runHtmlScreenPlanningSkill({
      agentGenerate,
      lessonPlan: JSON.stringify(concreteLessonPlan),
      maxSteps: 2,
      requestId: "request-plan",
    });

    expect(result.source).toBe("agent");
    expect(result.modelMessageCount).toBe(1);
    expect(result.plan.sections).toHaveLength(concreteLessonPlan.periodPlan.rows.length);
    expect(result.plan.sections[0]).toMatchObject({
      objective: expect.stringContaining("lesson"),
      sourceRowIndex: 0,
      title: "lesson-0",
    });
    expect(agentGenerate).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ role: "user" })]),
      expect.objectContaining({
        maxSteps: 2,
        structuredOutput: expect.objectContaining({
          schema: expect.any(Object),
        }),
      }),
    );
  });

  it("html screen planning falls back to the seed plan when the planning agent fails", async () => {
    const seedPlan: LessonScreenPlan = {
      sections: [
        {
          title: "比赛展示",
          durationSeconds: 360,
          supportModule: "scoreboard",
          reason: "已有结构化计划。",
        },
      ],
    };
    const agentGenerate = vi.fn().mockRejectedValue(new Error("planner schema failed"));

    const result = await runHtmlScreenPlanningSkill({
      agentGenerate,
      lessonPlan: "not-json",
      maxSteps: 2,
      requestId: "request-plan-fallback",
      seedPlan,
    });

    expect(result.source).toBe("seed-fallback");
    expect(result.warning).toContain("planner schema failed");
    expect(result.plan).toEqual(seedPlan);
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
