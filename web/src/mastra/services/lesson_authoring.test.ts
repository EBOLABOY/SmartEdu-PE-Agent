import type { UIMessageChunk } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";
import { DEFAULT_COMPETITION_LESSON_PLAN } from "@/lib/competition-lesson-contract";

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
      createChunkStream([
        { type: "start" },
        { type: "finish", finishReason: "stop" },
      ]),
    ),
    createStructuredAuthoringStreamAdapter: vi.fn(() =>
      createChunkStream([{ type: "finish", finishReason: "stop" }]),
    ),
    toAISdkStream: vi.fn(() =>
      createChunkStream([{ type: "finish", finishReason: "stop" }]),
    ),
    getAgent: vi.fn(() => ({
      generate: vi.fn(),
      stream: vi.fn(),
    })),
    getWorkflow: vi.fn(),
    runHtmlScreenGenerationSkill: vi.fn(),
    runHtmlScreenPlanningSkill: vi.fn(),
    runLessonGenerationWithRepair: vi.fn(),
    runCompetitionLessonPatchSkill: vi.fn(),
  };
});

function createIntentResult(
  intent: "clarify" | "generate_lesson" | "patch_lesson" | "generate_html" | "consult_standards",
  overrides: Partial<{
    confidence: number;
    reason: string;
  }> = {},
) {
  return {
    intent,
    confidence: overrides.confidence ?? 0.93,
    reason: overrides.reason ?? "测试用意图判定。",
  };
}

const readyIntakeResult = {
  intake: {
    readyToGenerate: true,
    known: {
      grade: "五年级",
      topic: "篮球行进间运球",
    },
    missing: [],
    questions: [],
    summary: "五年级篮球行进间运球。",
    reason: "年级和课题已明确。",
  },
  modelMessageCount: 1,
  source: "agent" as const,
};

const clarifyIntakeResult = {
  intake: {
    readyToGenerate: false,
    known: {
      topic: "篮球课",
    },
    missing: ["grade" as const],
    questions: ["本次课是几年级？"],
    reason: "缺少年级。",
  },
  memoryUsed: true,
  modelMessageCount: 1,
  source: "agent" as const,
};

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
  uiHints: [
    {
      action: "switch_tab",
      params: {
        tab: "lesson",
      },
    },
  ],
  decision: {
    type: "generate",
    intentResult: createIntentResult("generate_lesson"),
    intakeResult: readyIntakeResult,
  },
  trace: [],
} satisfies LessonWorkflowOutput;

const clarificationWorkflow = {
  ...workflow,
  uiHints: [],
  decision: {
    type: "clarify",
    text: "请先补充：\n1. 本次课是几年级？",
    intentResult: createIntentResult("generate_lesson"),
    intakeResult: clarifyIntakeResult,
  },
  trace: [
    {
      step: "collect-lesson-requirements",
      status: "blocked",
      detail: "缺少年级。",
    },
  ],
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

vi.mock("@mastra/ai-sdk", () => ({
  toAISdkStream: mocks.toAISdkStream,
}));

vi.mock("@/mastra/skills", () => ({
  createLessonClarificationStreamAdapter: mocks.createLessonClarificationStreamAdapter,
  createStructuredAuthoringStreamAdapter: mocks.createStructuredAuthoringStreamAdapter,
  runCompetitionLessonPatchSkill: mocks.runCompetitionLessonPatchSkill,
  runHtmlScreenGenerationSkill: mocks.runHtmlScreenGenerationSkill,
  runHtmlScreenPlanningSkill: mocks.runHtmlScreenPlanningSkill,
  runLessonGenerationWithRepair: mocks.runLessonGenerationWithRepair,
}));

function mockWorkflowResult(result: LessonWorkflowOutput) {
  const start = vi.fn(async () => ({
    result,
    status: "success",
  }));

  mocks.getWorkflow.mockReturnValue({
    createRun: vi.fn(async () => ({
      start,
    })),
  });

  return start;
}

describe("lesson authoring service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkflowResult(workflow);
    mocks.runLessonGenerationWithRepair.mockResolvedValue({
      finalLessonPlanPromise: Promise.resolve(DEFAULT_COMPETITION_LESSON_PLAN),
      partialOutputStream: undefined,
      stream: mocks.createChunkStream([{ type: "finish", finishReason: "stop" }]),
    });
    mocks.runCompetitionLessonPatchSkill.mockResolvedValue({
      patch: {
        operations: [],
      },
      lessonPlan: DEFAULT_COMPETITION_LESSON_PLAN,
    });
  });

  it("asks clarification questions from workflow decision instead of generating a lesson", async () => {
    mockWorkflowResult(clarificationWorkflow);
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
    expect(mocks.runLessonGenerationWithRepair).not.toHaveBeenCalled();
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

  it("passes project memory into workflow and saves the updated memory from workflow decision", async () => {
    const memoryPersistence = {
      loadMemory: vi.fn(),
      rememberFromIntake: vi.fn(),
    };
    const start = mockWorkflowResult(workflow);
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

    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        inputData: expect.objectContaining({
          memory: expect.objectContaining({
            defaults: expect.objectContaining({
              grade: "五年级",
            }),
          }),
          messages: expect.arrayContaining([
            expect.objectContaining({
              id: "user-2",
            }),
          ]),
        }),
      }),
    );
    expect(memoryPersistence.rememberFromIntake).toHaveBeenCalledWith(
      expect.objectContaining({
        intake: readyIntakeResult.intake,
        projectId: "00000000-0000-4000-8000-000000000001",
      }),
    );
  });

  it("routes patch decision into lesson patch skill and returns a structured lesson artifact stream", async () => {
    mockWorkflowResult({
      ...workflow,
      decision: {
        type: "patch",
        intentResult: createIntentResult("patch_lesson", {
          reason: "用户已经提供成稿，且本轮只要求调整热身时间。",
        }),
      },
    });
    const { streamLessonAuthoring } = await import("./lesson_authoring");

    await readChunks(
      (
        await streamLessonAuthoring({
          lessonPlan: JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN),
          messages: [
            {
              id: "user-3",
              role: "user",
              parts: [{ type: "text", text: "把准备部分热身时间改成 8 分钟" }],
            },
          ],
          mode: "lesson",
        })
      ).stream,
    );

    expect(mocks.runCompetitionLessonPatchSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        instruction: "把准备部分热身时间改成 8 分钟",
        lessonPlan: expect.objectContaining({
          title: DEFAULT_COMPETITION_LESSON_PLAN.title,
        }),
      }),
      expect.objectContaining({
        additionalInstructions: expect.stringContaining("用户已经提供成稿"),
        maxSteps: workflow.generationPlan.maxSteps,
      }),
    );
    expect(mocks.runLessonGenerationWithRepair).not.toHaveBeenCalled();
    expect(mocks.createStructuredAuthoringStreamAdapter).toHaveBeenCalled();
  });

  it("passes repair trace and final lesson promise into the structured adapter", async () => {
    const repairedPromise = Promise.resolve(DEFAULT_COMPETITION_LESSON_PLAN);

    mocks.runLessonGenerationWithRepair.mockImplementation(async ({ onTrace }) => {
      onTrace?.({
        step: "lesson-repair-started",
        status: "running",
        detail: "正在自动完善结构化教案。",
      });
      onTrace?.({
        step: "lesson-repair-finished",
        status: "success",
        detail: "已完成自动修复。",
      });

      return {
        finalLessonPlanPromise: repairedPromise,
        partialOutputStream: undefined,
        stream: mocks.createChunkStream([{ type: "finish", finishReason: "stop" }]),
      };
    });

    const { streamLessonAuthoring } = await import("./lesson_authoring");
    const result = await streamLessonAuthoring({
      messages: [
        {
          id: "user-4",
          role: "user",
          parts: [{ type: "text", text: "生成一份五年级足球教案" }],
        },
      ],
      mode: "lesson",
    });
    const chunks = await readChunks(result.stream);

    expect(chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "data-trace",
          data: expect.objectContaining({
            trace: expect.arrayContaining([
              expect.objectContaining({
                step: "lesson-repair-started",
                status: "running",
              }),
              expect.objectContaining({
                step: "lesson-repair-finished",
                status: "success",
              }),
            ]),
            uiHints: expect.arrayContaining([
              expect.objectContaining({
                action: "show_toast",
                params: expect.objectContaining({
                  level: "success",
                  title: "教案已自动修复",
                }),
              }),
            ]),
          }),
        }),
      ]),
    );
    expect(mocks.runLessonGenerationWithRepair).toHaveBeenCalledWith(
      expect.objectContaining({
        workflow: expect.objectContaining({
          system: expect.stringContaining("入口意图接力说明"),
        }),
      }),
    );
    expect(mocks.createStructuredAuthoringStreamAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        finalLessonPlanPromise: repairedPromise,
        runtimeUiHints: expect.arrayContaining([
          expect.objectContaining({
            action: "show_toast",
          }),
        ]),
      }),
    );
  });

  it("passes intent handover into html planning skill before screen generation", async () => {
    mockWorkflowResult({
      ...workflow,
      generationPlan: {
        ...workflow.generationPlan,
        mode: "html",
        confirmedLessonRequired: true,
        outputProtocol: "html-document",
        assistantTextPolicy: "suppress-html-text",
      },
      uiHints: [
        {
          action: "switch_tab",
          params: {
            tab: "canvas",
          },
        },
      ],
      decision: {
        type: "generate",
        intentResult: createIntentResult("generate_html", {
          reason: "教师已经确认教案，当前目标是生成课堂互动大屏。",
        }),
      },
    });
    mocks.runHtmlScreenPlanningSkill.mockResolvedValue({
      modelMessageCount: 1,
      plan: {
        sections: [
          {
            title: "比赛展示",
            durationSeconds: 360,
            supportModule: "scoreboard",
          },
        ],
      },
      source: "agent",
    });
    mocks.runHtmlScreenGenerationSkill.mockResolvedValue({
      modelMessageCount: 1,
      result: {},
    });

    const { streamLessonAuthoring } = await import("./lesson_authoring");
    await readChunks(
      (
        await streamLessonAuthoring({
          lessonPlan: JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN),
          messages: [
            {
              id: "user-5",
              role: "user",
              parts: [{ type: "text", text: "请生成互动大屏" }],
            },
          ],
          mode: "html",
        })
      ).stream,
    );

    expect(mocks.runHtmlScreenPlanningSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        additionalInstructions: expect.stringContaining("当前目标是生成课堂互动大屏"),
      }),
    );
    expect(mocks.runHtmlScreenGenerationSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        workflow: expect.objectContaining({
          system: expect.stringContaining("入口意图接力说明"),
        }),
      }),
    );
  });
});
