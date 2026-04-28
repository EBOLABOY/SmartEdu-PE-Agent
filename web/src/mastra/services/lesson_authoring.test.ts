import type { UIMessageChunk } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

const mocks = vi.hoisted(() => {
  const createChunkStream = (chunks: UIMessageChunk[]) =>
    new ReadableStream<UIMessageChunk>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }

        controller.close();
      },
    });

  return {
    createChunkStream,
    createLessonClarificationStreamAdapter: vi.fn(() =>
      createChunkStream([{ type: "finish", finishReason: "stop" }]),
    ),
    createStructuredAuthoringStreamAdapter: vi.fn(() =>
      createChunkStream([{ type: "finish", finishReason: "stop" }]),
    ),
    getAgent: vi.fn(() => ({
      generate: vi.fn(),
      stream: vi.fn(),
    })),
    getWorkflow: vi.fn(),
    runHtmlScreenGenerationSkill: vi.fn(),
    runHtmlScreenPlanningSkill: vi.fn(),
    runLessonGenerationSkill: vi.fn(),
    runLessonIntakeSkill: vi.fn(),
  };
});

const workflow = {
  system: "system prompt",
  standardsContext: "",
  standards: {
    requestedMarket: "cn-compulsory-2022",
    resolvedMarket: "cn-compulsory-2022",
    corpusId: "cn",
    displayName: "义务教育体育与健康课程标准",
    officialStatus: "ready",
    sourceName: "课程标准",
    issuer: "教育部",
    version: "2022",
    url: "https://example.com/standards",
    availability: "ready",
    referenceCount: 0,
  },
  generationPlan: {
    mode: "lesson",
    confirmedLessonRequired: false,
    outputProtocol: "lesson-json",
    responseTransport: "structured-data-part",
    assistantTextPolicy: "suppress-json-text",
    maxSteps: 3,
    protocolVersion: "structured-v1",
  },
  safety: {
    htmlSandboxRequired: false,
    externalNetworkAllowed: false,
    forbiddenCapabilities: [],
    warnings: [],
  },
  trace: [],
} satisfies LessonWorkflowOutput;

async function readChunks(stream: ReadableStream<UIMessageChunk>) {
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

vi.mock("@/mastra", () => ({
  mastra: {
    getAgent: mocks.getAgent,
    getWorkflow: mocks.getWorkflow,
  },
}));

vi.mock("@/mastra/skills", () => ({
  createLessonClarificationStreamAdapter: mocks.createLessonClarificationStreamAdapter,
  createStructuredAuthoringStreamAdapter: mocks.createStructuredAuthoringStreamAdapter,
  runHtmlScreenGenerationSkill: mocks.runHtmlScreenGenerationSkill,
  runHtmlScreenPlanningSkill: mocks.runHtmlScreenPlanningSkill,
  runLessonGenerationSkill: mocks.runLessonGenerationSkill,
  runLessonIntakeSkill: mocks.runLessonIntakeSkill,
}));

describe("lesson authoring service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorkflow.mockReturnValue({
      createRun: vi.fn(async () => ({
        start: vi.fn(async () => ({
          result: workflow,
          status: "success",
        })),
      })),
    });
  });

  it("asks clarification questions instead of generating a lesson when intake is incomplete", async () => {
    mocks.runLessonIntakeSkill.mockResolvedValue({
      intake: {
        readyToGenerate: false,
        known: {
          topic: "篮球课",
        },
        missing: ["grade"],
        questions: ["本次课是几年级？"],
        reason: "缺少年级。",
      },
      modelMessageCount: 1,
      source: "agent",
    });
    const { streamLessonAuthoring } = await import("./lesson_authoring");

    const result = await streamLessonAuthoring({
      messages: [
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "帮我写一个篮球课教案" }],
        },
      ],
      mode: "lesson",
    });
    const chunks = await readChunks(result.stream);

    expect(chunks[0]).toEqual(
      expect.objectContaining({
        type: "data-trace",
      }),
    );
    expect(mocks.runLessonGenerationSkill).not.toHaveBeenCalled();
    expect(mocks.createLessonClarificationStreamAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("本次课是几年级？"),
        workflow: expect.objectContaining({
          trace: expect.arrayContaining([
            expect.objectContaining({
              status: "blocked",
              step: "collect-lesson-requirements",
            }),
          ]),
        }),
      }),
    );
  });

  it("passes project memory into lesson intake and saves the updated memory", async () => {
    const memoryPersistence = {
      loadMemory: vi.fn(),
      rememberFromIntake: vi.fn(),
    };
    const intake = {
      readyToGenerate: false,
      known: {
        topic: "篮球行进间运球",
      },
      missing: ["grade"],
      questions: ["本次课是几年级？"],
      reason: "缺少年级。",
    };
    mocks.runLessonIntakeSkill.mockResolvedValue({
      intake,
      memoryUsed: true,
      modelMessageCount: 1,
      source: "agent",
    });
    const { streamLessonAuthoring } = await import("./lesson_authoring");

    const result = await streamLessonAuthoring({
      memory: {
        defaults: {
          grade: "五年级",
        },
        updatedAt: "2026-04-28T03:00:00.000Z",
      },
      memoryPersistence,
      messages: [
        {
          id: "user-2",
          role: "user",
          parts: [{ type: "text", text: "继续写篮球课" }],
        },
      ],
      mode: "lesson",
      projectId: "00000000-0000-4000-8000-000000000001",
    });
    await readChunks(result.stream);

    expect(mocks.runLessonIntakeSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        memory: expect.objectContaining({
          defaults: expect.objectContaining({
            grade: "五年级",
          }),
        }),
      }),
    );
    expect(memoryPersistence.rememberFromIntake).toHaveBeenCalledWith(
      expect.objectContaining({
        intake,
        projectId: "00000000-0000-4000-8000-000000000001",
      }),
    );
  });
});
