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
      createChunkStream([{ type: "finish", finishReason: "stop" }]),
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

const workflow = {
  system: "system prompt\n\n项目教学记忆",
  standardsContext: "",
  standards: {
    requestedMarket: "cn-compulsory-2022",
    resolvedMarket: "cn-compulsory-2022",
    corpus: {
      corpusId: "cn",
      displayName: "义务教育体育与健康课程标准",
      issuer: "教育部",
      version: "2022",
      url: "https://example.com/standards",
      availability: "ready",
    },
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
  },
  trace: [],
} satisfies LessonWorkflowOutput;

const clarificationWorkflow = {
  ...workflow,
  uiHints: [],
  decision: {
    type: "clarify",
    text: "请明确你是要：\n1. 生成一份新的体育课时计划；",
    intentResult: createIntentResult("clarify"),
  },
  trace: [
    {
      step: "prepare-intent-clarification-response",
      status: "blocked",
      detail: "入口意图不够明确，工作流已返回任务方向澄清提示。",
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

async function readFirstChunks(stream: ReadableStream<UIMessageChunk>, count: number) {
  const reader = stream.getReader();
  const chunks: UIMessageChunk[] = [];

  try {
    while (chunks.length < count) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      chunks.push(value);
    }

    return chunks;
  } finally {
    await reader.cancel().catch(() => undefined);
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

  it("clarify decision 会直接走 clarification adapter，而不是生成课时计划", async () => {
    mockWorkflowResult(clarificationWorkflow);
    const { streamLessonAuthoring } = await import("./lesson_authoring");

    const result = await streamLessonAuthoring({
      messages: [
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "帮我看看这个" }],
        },
      ],
      mode: "lesson",
    });
    const chunks = await readFirstChunks(result.stream, 3);

    expect(chunks[0]).toEqual(
      expect.objectContaining({
        type: "start",
      }),
    );
    expect(chunks[1]).toEqual(
      expect.objectContaining({
        type: "data-trace",
      }),
    );
    expect(chunks.filter((chunk) => chunk.type === "start")).toHaveLength(1);
    expect(mocks.runLessonGenerationWithRepair).not.toHaveBeenCalled();
    expect(mocks.createLessonClarificationStreamAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("请明确你是要"),
        workflow: expect.objectContaining({
          trace: expect.arrayContaining([
            expect.objectContaining({
              status: "blocked",
              step: "prepare-intent-clarification-response",
            }),
          ]),
        }),
      }),
    );
  }, 15000);

  it("会把 project memory 传入 workflow，但不再回写 intake memory", async () => {
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
    expect(memoryPersistence.rememberFromIntake).not.toHaveBeenCalled();
  });

  it("顶层流统一负责 assistant message 生命周期与最终持久化", async () => {
    const chatPersistence = {
      saveMessages: vi.fn().mockResolvedValue(undefined),
    };
    const { streamLessonAuthoring } = await import("./lesson_authoring");

    const result = await streamLessonAuthoring({
      chatPersistence,
      messages: [
        {
          id: "user-persist-1",
          role: "user",
          parts: [{ type: "text", text: "生成一份四年级足球课时计划" }],
        },
      ],
      mode: "lesson",
      projectId: "00000000-0000-4000-8000-000000000099",
    });
    const chunks = await readChunks(result.stream);

    expect(chunks.filter((chunk) => chunk.type === "start")).toHaveLength(1);
    expect(chatPersistence.saveMessages).toHaveBeenCalledOnce();
    expect(chatPersistence.saveMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            role: "assistant",
          }),
        ],
        projectId: "00000000-0000-4000-8000-000000000099",
        requestId: result.requestId,
      }),
    );
  });

  it("restores persisted reasoning parts and filters data parts from history", async () => {
    const start = mockWorkflowResult(workflow);
    const { streamLessonAuthoring } = await import("./lesson_authoring");

    const result = await streamLessonAuthoring({
      mastraStorageAdapter: {
        listMessages: vi.fn(async () => [
          {
            id: "history-1",
            threadId: "project-1",
            role: "assistant",
            content: "历史回复",
            createdAt: "2026-04-29T00:00:00.000Z",
            metadata: {
              uiMessage: {
                id: "history-1",
                role: "assistant",
                parts: [
                  { type: "reasoning", text: "先看课标。", state: "done" },
                  { type: "text", text: "历史回复" },
                  {
                    type: "data-artifact",
                    id: "artifact-1",
                    data: {
                      protocolVersion: "structured-v1",
                      stage: "lesson",
                      contentType: "lesson-json",
                      content: JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN),
                      isComplete: true,
                      status: "ready",
                      source: "data-part",
                      updatedAt: "2026-04-29T00:00:00.000Z",
                    },
                  },
                  {
                    type: "data-trace",
                    id: "trace-1",
                    data: {
                      protocolVersion: "structured-v1",
                      requestId: "req-1",
                      mode: "lesson",
                      phase: "completed",
                      responseTransport: "structured-data-part",
                      requestedMarket: "cn-compulsory-2022",
                      resolvedMarket: "cn-compulsory-2022",
                      warnings: [],
                      uiHints: [],
                      trace: [],
                      updatedAt: "2026-04-29T00:00:00.000Z",
                    },
                  },
                ],
              },
            },
          },
        ]),
      } as never,
      messages: [
        {
          id: "user-history-1",
          role: "user",
          parts: [{ type: "text", text: "继续生成" }],
        },
      ],
      mode: "lesson",
      projectId: "00000000-0000-4000-8000-000000000010",
    });
    await readChunks(result.stream);

    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        inputData: expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              id: "history-1",
              parts: [
                expect.objectContaining({ type: "reasoning", text: "先看课标。" }),
                expect.objectContaining({ type: "text", text: "历史回复" }),
              ],
            }),
          ]),
        }),
      }),
    );
  });

  it("parses stringified uiMessage and falls back to plain text when only data parts remain", async () => {
    const start = mockWorkflowResult(workflow);
    const { streamLessonAuthoring } = await import("./lesson_authoring");

    const result = await streamLessonAuthoring({
      mastraStorageAdapter: {
        listMessages: vi.fn(async () => [
          {
            id: "history-2",
            threadId: "project-1",
            role: "assistant",
            content: "只剩文本回退",
            createdAt: "2026-04-29T00:00:00.000Z",
            metadata: {
              uiMessage: JSON.stringify({
                id: "history-2",
                role: "assistant",
                parts: [
                  {
                    type: "data-artifact",
                    id: "artifact-2",
                    data: {
                      protocolVersion: "structured-v1",
                      stage: "lesson",
                      contentType: "lesson-json",
                      content: JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN),
                      isComplete: true,
                      status: "ready",
                      source: "data-part",
                      updatedAt: "2026-04-29T00:00:00.000Z",
                    },
                  },
                ],
              }),
            },
          },
        ]),
      } as never,
      messages: [
        {
          id: "user-history-2",
          role: "user",
          parts: [{ type: "text", text: "继续写" }],
        },
      ],
      mode: "lesson",
      projectId: "00000000-0000-4000-8000-000000000011",
    });
    await readChunks(result.stream);

    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        inputData: expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              id: "history-2",
              parts: [{ type: "text", text: "只剩文本回退" }],
            }),
          ]),
        }),
      }),
    );
  });

  it("falls back to plain text when persisted uiMessage is invalid", async () => {
    const start = mockWorkflowResult(workflow);
    const { streamLessonAuthoring } = await import("./lesson_authoring");

    const result = await streamLessonAuthoring({
      mastraStorageAdapter: {
        listMessages: vi.fn(async () => [
          {
            id: "history-3",
            threadId: "project-1",
            role: "assistant",
            content: "非法 JSON 回退",
            createdAt: "2026-04-29T00:00:00.000Z",
            metadata: {
              uiMessage: "{not-json",
            },
          },
          {
            id: "history-4",
            threadId: "project-1",
            role: "assistant",
            content: "结构非法回退",
            createdAt: "2026-04-29T00:00:00.000Z",
            metadata: {
              uiMessage: {
                id: "history-4",
                role: "assistant",
                parts: [{ type: "data-artifact" }],
              },
            },
          },
        ]),
      } as never,
      messages: [
        {
          id: "user-history-3",
          role: "user",
          parts: [{ type: "text", text: "继续" }],
        },
      ],
      mode: "lesson",
      projectId: "00000000-0000-4000-8000-000000000012",
    });
    await readChunks(result.stream);

    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        inputData: expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              id: "history-3",
              parts: [{ type: "text", text: "非法 JSON 回退" }],
            }),
            expect.objectContaining({
              id: "history-4",
              parts: [{ type: "text", text: "结构非法回退" }],
            }),
          ]),
        }),
      }),
    );
  });

  it("patch decision 会走 lesson patch skill，并返回结构化课时流", async () => {
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

  it("会把 repair trace 和 final lesson promise 传给 structured adapter", async () => {
    const repairedPromise = Promise.resolve(DEFAULT_COMPETITION_LESSON_PLAN);

    mocks.runLessonGenerationWithRepair.mockImplementation(async ({ onTrace }) => {
      onTrace?.({
        step: "lesson-repair-started",
        status: "running",
        detail: "正在自动完善结构化课时计划。",
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
          parts: [{ type: "text", text: "生成一份五年级足球课时计划" }],
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
                  title: "课时计划已自动修复",
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

  it("会先把 intent handover 传给 html planning skill，再进入大屏生成", async () => {
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
          reason: "教师已经确认课时计划，当前目标是生成课堂互动大屏。",
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
        additionalInstructions: expect.stringContaining("当前入口判定"),
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
