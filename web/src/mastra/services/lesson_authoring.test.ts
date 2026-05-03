import type { UIMessageChunk } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_COMPETITION_LESSON_PLAN } from "@/lib/competition-lesson-contract";
import type { runLessonGenerationWithPostProcess } from "@/mastra/skills";

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
  const agentStream = vi.fn(async () => ({}));

  return {
    agentStream,
    createChunkStream,
    createMastraAgentUiMessageStream: vi.fn(() =>
      createChunkStream([
        { type: "text-start", id: "assistant-text" },
        { type: "text-delta", id: "assistant-text", delta: "我先确认教学需求。" },
        { type: "text-end", id: "assistant-text" },
        { type: "finish", finishReason: "stop" },
      ]),
    ),
    createStructuredAuthoringStreamAdapter: vi.fn(() =>
      createChunkStream([{ type: "finish", finishReason: "stop" }]),
    ),
    createServerStandardsPendingWorkflow: vi.fn((workflow) => ({
      ...workflow,
      trace: [
        ...workflow.trace.filter((entry: { step: string }) => entry.step !== "server-standards-retrieval"),
        {
          detail: "正在服务端检索体育课程标准；若向量库不可用，将自动降级继续生成。",
          status: "running",
          step: "server-standards-retrieval",
          timestamp: "2026-04-30T00:00:00.000Z",
        },
      ],
    })),
    createServerTextbookPendingWorkflow: vi.fn((workflow) => ({
      ...workflow,
      trace: [
        ...workflow.trace.filter((entry: { step: string }) => entry.step !== "server-textbook-retrieval"),
        {
          detail: "正在服务端检索教材正文；若教材库不可用，将自动降级继续生成。",
          status: "running",
          step: "server-textbook-retrieval",
          timestamp: "2026-04-30T00:00:00.000Z",
        },
      ],
    })),
    resolveWorkflowWithServerStandards: vi.fn(async ({ workflow }) => ({
      outcome: "success",
      workflow: {
        ...workflow,
        standardsContext: "课标上下文：长拳基本动作与套路要求。",
        standards: {
          ...workflow.standards,
          corpus: {
            availability: "ready",
            corpusId: "cn-compulsory-2022",
            displayName: "义务教育体育与健康课程标准",
            issuer: "教育部",
            url: "https://example.com/standards.pdf",
            version: "2022",
          },
          referenceCount: 1,
          references: [
            {
              citation: "课程标准 第1页",
              gradeBands: ["5-6年级"],
              id: "std-1",
              module: "武术",
              score: 0.9,
              sectionPath: ["运动技能", "中华传统体育"],
              summary: "学练长拳基本动作与套路。",
              title: "长拳内容要求",
            },
          ],
        },
        system: `${workflow.system}\n\n课标上下文：长拳基本动作与套路要求。`,
        trace: [
          ...workflow.trace.filter((entry: { step: string }) => entry.step !== "server-standards-retrieval"),
          {
            detail: "服务端已检索 1 条课标条目并注入结构化生成提示。",
            status: "success",
            step: "server-standards-retrieval",
            timestamp: "2026-04-30T00:00:00.000Z",
          },
        ],
      },
    })),
    resolveWorkflowWithServerTextbook: vi.fn(async ({ workflow }) => ({
      outcome: "success",
      workflow: {
        ...workflow,
        system: `${workflow.system}\n\n教材正文上下文：人教版篮球教材强调运球控球、空间观察和游戏化练习。`,
        trace: [
          ...workflow.trace.filter((entry: { step: string }) => entry.step !== "server-textbook-retrieval"),
          {
            detail: "服务端已检索 2 条教材正文条目并注入教材分析提示。",
            status: "success",
            step: "server-textbook-retrieval",
            timestamp: "2026-04-30T00:00:00.000Z",
          },
        ],
      },
    })),
    getAgent: vi.fn(() => ({
      stream: agentStream,
    })),
    getWorkflow: vi.fn(),
    runLessonGenerationWithPostProcess: vi.fn(async () => ({
      finalLessonPlanPromise: Promise.resolve(DEFAULT_COMPETITION_LESSON_PLAN),
      stream: createChunkStream([{ type: "finish", finishReason: "stop" }]),
    })),
    runServerHtmlGenerationSkill: vi.fn(async () =>
      createChunkStream([
        {
          type: "text-delta",
          id: "html",
          delta: "<!DOCTYPE html><html lang=\"zh-CN\"><head></head><body>大屏</body></html>",
        },
        { type: "finish", finishReason: "stop" },
      ]),
    ),
  };
});

vi.mock("@/mastra", () => ({
  mastra: {
    getAgent: mocks.getAgent,
    getWorkflow: mocks.getWorkflow,
  },
}));

vi.mock("@/mastra/ai_sdk_stream", () => ({
  createMastraAgentUiMessageStream: mocks.createMastraAgentUiMessageStream,
}));

vi.mock("@/mastra/skills", () => ({
  createServerStandardsPendingWorkflow: mocks.createServerStandardsPendingWorkflow,
  createServerTextbookPendingWorkflow: mocks.createServerTextbookPendingWorkflow,
  createStructuredAuthoringStreamAdapter: mocks.createStructuredAuthoringStreamAdapter,
  resolveWorkflowWithServerStandards: mocks.resolveWorkflowWithServerStandards,
  resolveWorkflowWithServerTextbook: mocks.resolveWorkflowWithServerTextbook,
  runLessonGenerationWithPostProcess: mocks.runLessonGenerationWithPostProcess,
  runServerHtmlGenerationSkill: mocks.runServerHtmlGenerationSkill,
}));

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

describe("lesson authoring service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.agentStream.mockResolvedValue({});
    mocks.createMastraAgentUiMessageStream.mockReturnValue(
      mocks.createChunkStream([{ type: "finish", finishReason: "stop" }]),
    );
    mocks.createStructuredAuthoringStreamAdapter.mockReturnValue(
      mocks.createChunkStream([{ type: "finish", finishReason: "stop" }]),
    );
    mocks.createServerStandardsPendingWorkflow.mockImplementation((workflow) => ({
      ...workflow,
      trace: [
        ...workflow.trace.filter((entry: { step: string }) => entry.step !== "server-standards-retrieval"),
        {
          detail: "正在服务端检索体育课程标准；若向量库不可用，将自动降级继续生成。",
          status: "running",
          step: "server-standards-retrieval",
          timestamp: "2026-04-30T00:00:00.000Z",
        },
      ],
    }));
    mocks.createServerTextbookPendingWorkflow.mockImplementation((workflow) => ({
      ...workflow,
      trace: [
        ...workflow.trace.filter((entry: { step: string }) => entry.step !== "server-textbook-retrieval"),
        {
          detail: "正在服务端检索教材正文；若教材库不可用，将自动降级继续生成。",
          status: "running",
          step: "server-textbook-retrieval",
          timestamp: "2026-04-30T00:00:00.000Z",
        },
      ],
    }));
    mocks.resolveWorkflowWithServerStandards.mockImplementation(async ({ workflow }) => ({
      outcome: "success",
      workflow: {
        ...workflow,
        standardsContext: "课标上下文：长拳基本动作与套路要求。",
        standards: {
          ...workflow.standards,
          corpus: {
            availability: "ready",
            corpusId: "cn-compulsory-2022",
            displayName: "义务教育体育与健康课程标准",
            issuer: "教育部",
            url: "https://example.com/standards.pdf",
            version: "2022",
          },
          referenceCount: 1,
          references: [
            {
              citation: "课程标准 第1页",
              gradeBands: ["5-6年级"],
              id: "std-1",
              module: "武术",
              score: 0.9,
              sectionPath: ["运动技能", "中华传统体育"],
              summary: "学练长拳基本动作与套路。",
              title: "长拳内容要求",
            },
          ],
        },
        system: `${workflow.system}\n\n课标上下文：长拳基本动作与套路要求。`,
        trace: [
          ...workflow.trace.filter((entry: { step: string }) => entry.step !== "server-standards-retrieval"),
          {
            detail: "服务端已检索 1 条课标条目并注入结构化生成提示。",
            status: "success",
            step: "server-standards-retrieval",
            timestamp: "2026-04-30T00:00:00.000Z",
          },
        ],
      },
    }));
    mocks.resolveWorkflowWithServerTextbook.mockImplementation(async ({ workflow }) => ({
      outcome: "success",
      workflow: {
        ...workflow,
        system: `${workflow.system}\n\n教材正文上下文：人教版篮球教材强调运球控球、空间观察和游戏化练习。`,
        trace: [
          ...workflow.trace.filter((entry: { step: string }) => entry.step !== "server-textbook-retrieval"),
          {
            detail: "服务端已检索 2 条教材正文条目并注入教材分析提示。",
            status: "success",
            step: "server-textbook-retrieval",
            timestamp: "2026-04-30T00:00:00.000Z",
          },
        ],
      },
    }));
    mocks.runLessonGenerationWithPostProcess.mockResolvedValue({
      finalLessonPlanPromise: Promise.resolve(DEFAULT_COMPETITION_LESSON_PLAN),
      stream: mocks.createChunkStream([{ type: "finish", finishReason: "stop" }]),
    });
    mocks.runServerHtmlGenerationSkill.mockResolvedValue(
      mocks.createChunkStream([
        {
          type: "text-delta",
          id: "html",
          delta: "<!DOCTYPE html><html lang=\"zh-CN\"><head></head><body>大屏</body></html>",
        },
        { type: "finish", finishReason: "stop" },
      ]),
    );
  });

  it("课时计划生成请求进入服务端确定性生成管线", async () => {
    const { streamLessonAuthoring } = await import("./lesson_authoring");

    const result = await streamLessonAuthoring({
      context: {
        grade: "三年级",
        topic: "篮球运球接力",
      },
      messages: [
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "帮我做一节篮球运球接力课" }],
        },
      ],
      mode: "lesson",
    });
    await readChunks(result.stream);

    expect(mocks.getWorkflow).not.toHaveBeenCalled();
    expect(mocks.getAgent).not.toHaveBeenCalled();
    expect(mocks.createServerStandardsPendingWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        trace: expect.arrayContaining([
          expect.objectContaining({
            step: "server-deterministic-entry",
            status: "success",
          }),
        ]),
      }),
    );
    expect(mocks.resolveWorkflowWithServerStandards).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "帮我做一节篮球运球接力课",
        workflow: expect.objectContaining({
          generationPlan: expect.objectContaining({ mode: "lesson" }),
          trace: expect.arrayContaining([
            expect.objectContaining({
              step: "server-standards-retrieval",
              status: "running",
            }),
          ]),
        }),
      }),
    );
    expect(mocks.resolveWorkflowWithServerTextbook).toHaveBeenCalledWith(
      expect.objectContaining({
        grade: "三年级",
        market: undefined,
        query: "帮我做一节篮球运球接力课",
        stage: "小学",
        workflow: expect.objectContaining({
          trace: expect.arrayContaining([
            expect.objectContaining({
              step: "server-textbook-retrieval",
              status: "running",
            }),
          ]),
        }),
      }),
    );
    expect(mocks.runLessonGenerationWithPostProcess).toHaveBeenCalledWith(
      expect.objectContaining({
        workflow: expect.objectContaining({
          generationPlan: expect.objectContaining({ mode: "lesson" }),
          system: expect.stringContaining("年级：三年级"),
          trace: expect.arrayContaining([
            expect.objectContaining({
              step: "server-textbook-retrieval",
              status: "success",
            }),
          ]),
          standards: expect.objectContaining({
            referenceCount: 1,
          }),
        }),
      }),
    );
  }, 15000);

  it("会构造服务端创作 workflow，并交给结构化 Artifact adapter", async () => {
    const { streamLessonAuthoring } = await import("./lesson_authoring");

    const result = await streamLessonAuthoring({
      messages: [
        {
          id: "user-2",
          role: "user",
          parts: [{ type: "text", text: "生成一份四年级足球课时计划" }],
        },
      ],
      mode: "lesson",
      projectId: "00000000-0000-4000-8000-000000000001",
    });
    await readChunks(result.stream);

    expect(mocks.createStructuredAuthoringStreamAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "lesson",
        projectId: "00000000-0000-4000-8000-000000000001",
        workflow: expect.objectContaining({
          decision: expect.objectContaining({
            type: "generate",
          }),
          generationPlan: expect.objectContaining({
            maxSteps: 7,
            mode: "lesson",
            responseTransport: "structured-data-part",
          }),
          trace: expect.arrayContaining([
            expect.objectContaining({
              step: "authoring-entry",
              status: "success",
            }),
            expect.objectContaining({
              step: "server-deterministic-entry",
              status: "success",
            }),
            expect.objectContaining({
              step: "server-standards-retrieval",
              status: "success",
            }),
            expect.objectContaining({
              step: "server-textbook-retrieval",
              status: "success",
            }),
          ]),
          uiHints: expect.arrayContaining([
            expect.objectContaining({
              action: "switch_tab",
              params: { tab: "lesson" },
            }),
          ]),
        }),
      }),
    );
  });

  it("课标向量检索异常不会阻断课时计划流式生成", async () => {
    mocks.resolveWorkflowWithServerStandards.mockImplementationOnce(async ({ workflow }) => ({
      outcome: "failure",
      workflow: {
        ...workflow,
        standardsContext: "课标检索失败，已降级继续生成：vector rpc unavailable",
        standards: {
          ...workflow.standards,
          corpus: null,
          referenceCount: 0,
          references: [],
          warning: "服务端课标检索失败，已退回通用课标原则生成：vector rpc unavailable",
        },
        system: `${workflow.system}\n\n课标检索失败，已降级继续生成：vector rpc unavailable`,
        trace: [
          ...workflow.trace.filter((entry: { step: string }) => entry.step !== "server-standards-retrieval"),
          {
            detail: "服务端课标检索失败，已退回通用课标原则生成：vector rpc unavailable",
            status: "blocked",
            step: "server-standards-retrieval",
            timestamp: "2026-04-30T00:00:00.000Z",
          },
        ],
      },
    }));
    const { streamLessonAuthoring } = await import("./lesson_authoring");

    const result = await streamLessonAuthoring({
      messages: [
        {
          id: "user-standards-fallback",
          role: "user",
          parts: [{ type: "text", text: "生成一份三年级篮球运球课时计划" }],
        },
      ],
      mode: "lesson",
      projectId: "00000000-0000-4000-8000-000000000021",
    });
    const chunks = await readChunks(result.stream);

    expect(chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "start" }),
        expect.objectContaining({ type: "data-trace" }),
        expect.objectContaining({ type: "finish" }),
      ]),
    );
    expect(mocks.resolveWorkflowWithServerStandards).toHaveBeenCalledWith(
      expect.objectContaining({
        workflow: expect.objectContaining({
          trace: expect.arrayContaining([
            expect.objectContaining({
              step: "server-standards-retrieval",
              status: "running",
            }),
          ]),
        }),
      }),
    );
    expect(mocks.runLessonGenerationWithPostProcess).toHaveBeenCalledWith(
      expect.objectContaining({
        workflow: expect.objectContaining({
          standards: expect.objectContaining({
            referenceCount: 0,
            warning: expect.stringContaining("vector rpc unavailable"),
          }),
          trace: expect.arrayContaining([
            expect.objectContaining({
              step: "server-standards-retrieval",
              status: "blocked",
              detail: expect.stringContaining("vector rpc unavailable"),
            }),
          ]),
        }),
      }),
    );
    expect(mocks.createStructuredAuthoringStreamAdapter).toHaveBeenCalled();
  });

  it("教材向量检索异常不会阻断课时计划流式生成", async () => {
    mocks.resolveWorkflowWithServerTextbook.mockImplementationOnce(async ({ workflow }) => ({
      outcome: "failure",
      workflow: {
        ...workflow,
        system: `${workflow.system}\n\n教材检索失败，已降级继续生成：textbook vector rpc unavailable`,
        trace: [
          ...workflow.trace.filter((entry: { step: string }) => entry.step !== "server-textbook-retrieval"),
          {
            detail: "服务端教材检索失败，已退回通用教材分析原则生成：textbook vector rpc unavailable",
            status: "blocked",
            step: "server-textbook-retrieval",
            timestamp: "2026-04-30T00:00:00.000Z",
          },
        ],
      },
    }));
    const { streamLessonAuthoring } = await import("./lesson_authoring");

    const result = await streamLessonAuthoring({
      messages: [
        {
          id: "user-textbook-fallback",
          role: "user",
          parts: [{ type: "text", text: "生成一份三年级篮球运球课时计划" }],
        },
      ],
      mode: "lesson",
      projectId: "00000000-0000-4000-8000-000000000022",
    });
    const chunks = await readChunks(result.stream);

    expect(chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "start" }),
        expect.objectContaining({ type: "data-trace" }),
        expect.objectContaining({ type: "finish" }),
      ]),
    );
    expect(mocks.resolveWorkflowWithServerTextbook).toHaveBeenCalledWith(
      expect.objectContaining({
        workflow: expect.objectContaining({
          trace: expect.arrayContaining([
            expect.objectContaining({
              step: "server-textbook-retrieval",
              status: "running",
            }),
          ]),
        }),
      }),
    );
    expect(mocks.runLessonGenerationWithPostProcess).toHaveBeenCalledWith(
      expect.objectContaining({
        workflow: expect.objectContaining({
          system: expect.stringContaining("textbook vector rpc unavailable"),
          trace: expect.arrayContaining([
            expect.objectContaining({
              step: "server-textbook-retrieval",
              status: "blocked",
              detail: expect.stringContaining("textbook vector rpc unavailable"),
            }),
          ]),
        }),
      }),
    );
    expect(mocks.createStructuredAuthoringStreamAdapter).toHaveBeenCalled();
  });

  it("普通问候只走 Agent 文本流，不进入结构化 Artifact adapter", async () => {
    mocks.createMastraAgentUiMessageStream.mockReturnValue(
      mocks.createChunkStream([
        { type: "text-start", id: "assistant-text" },
        { type: "text-delta", id: "assistant-text", delta: "老师您好，我可以帮您准备体育课。" },
        { type: "text-end", id: "assistant-text" },
        { type: "finish", finishReason: "stop" },
      ]),
    );
    const { streamLessonAuthoring } = await import("./lesson_authoring");

    const result = await streamLessonAuthoring({
      messages: [
        {
          id: "user-hello",
          role: "user",
          parts: [{ type: "text", text: "你好" }],
        },
      ],
      mode: "lesson",
    });
    const chunks = await readChunks(result.stream);

    expect(mocks.getAgent).toHaveBeenCalledWith("peTeacherAgent");
    expect(mocks.createStructuredAuthoringStreamAdapter).not.toHaveBeenCalled();
    expect(chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text-delta", delta: "老师您好，我可以帮您准备体育课。" }),
      ]),
    );
    expect(chunks.some((chunk) => chunk.type === "data-trace")).toBe(false);
    expect(chunks.some((chunk) => chunk.type === "data-artifact")).toBe(false);
  });

  it("能力介绍请求保持普通聊天，不触发工作台状态", async () => {
    const { streamLessonAuthoring } = await import("./lesson_authoring");

    const result = await streamLessonAuthoring({
      messages: [
        {
          id: "user-capability",
          role: "user",
          parts: [{ type: "text", text: "你能做什么？" }],
        },
      ],
      mode: "lesson",
    });
    const chunks = await readChunks(result.stream);

    expect(mocks.createStructuredAuthoringStreamAdapter).not.toHaveBeenCalled();
    expect(chunks.some((chunk) => chunk.type === "data-trace")).toBe(false);
  });

  it("大屏请求会切到 html 模式，并注入当前课时计划作为工具上下文", async () => {
    const { streamLessonAuthoring } = await import("./lesson_authoring");

    const result = await streamLessonAuthoring({
      lessonPlan: JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN),
      messages: [
        {
          id: "user-3",
          role: "user",
          parts: [{ type: "text", text: "请给这份课生成互动大屏" }],
        },
      ],
      mode: "lesson",
    });
    await readChunks(result.stream);

    expect(mocks.getAgent).not.toHaveBeenCalled();
    expect(mocks.runServerHtmlGenerationSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        lessonPlan: JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN),
        workflow: expect.objectContaining({
          system: expect.stringContaining("当前已确认课时计划 JSON"),
          trace: expect.arrayContaining([
            expect.objectContaining({
              step: "html-screen-generation",
              status: "success",
            }),
          ]),
        }),
      }),
    );
    expect(mocks.createStructuredAuthoringStreamAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "html",
        workflow: expect.objectContaining({
          generationPlan: expect.objectContaining({
            mode: "html",
            outputProtocol: "html-document",
          }),
          uiHints: expect.arrayContaining([
            expect.objectContaining({
              action: "switch_tab",
              params: { tab: "canvas" },
            }),
          ]),
        }),
      }),
    );
  });

  it("会恢复历史 reasoning/text，并剥离高 token 的 artifact 与 trace", async () => {
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

    const generationCall = (
      mocks.runLessonGenerationWithPostProcess as unknown as ReturnType<
        typeof vi.fn<typeof runLessonGenerationWithPostProcess>
      >
    ).mock.calls.at(-1)?.[0];
    const serializedMessages = JSON.stringify(generationCall?.messages);

    expect(serializedMessages).toContain("先看课标");
    expect(serializedMessages).toContain("历史回复");
    expect(serializedMessages).not.toContain("data-artifact");
    expect(serializedMessages).not.toContain("data-trace");
  });

  it("历史 uiMessage 非法或仅剩 data part 时回退为纯文本", async () => {
    const { streamLessonAuthoring } = await import("./lesson_authoring");

    const result = await streamLessonAuthoring({
      mastraStorageAdapter: {
        listMessages: vi.fn(async () => [
          {
            id: "history-2",
            threadId: "project-1",
            role: "assistant",
            content: "非法 JSON 回退",
            createdAt: "2026-04-29T00:00:00.000Z",
            metadata: { uiMessage: "{not-json" },
          },
          {
            id: "history-3",
            threadId: "project-1",
            role: "assistant",
            content: "只剩 data 回退",
            createdAt: "2026-04-29T00:00:00.000Z",
            metadata: {
              uiMessage: JSON.stringify({
                id: "history-3",
                role: "assistant",
                parts: [{ type: "data-artifact", id: "artifact-only", data: {} }],
              }),
            },
          },
        ]),
      } as never,
      messages: [
        {
          id: "user-history-2",
          role: "user",
          parts: [{ type: "text", text: "继续" }],
        },
      ],
      mode: "lesson",
      projectId: "00000000-0000-4000-8000-000000000011",
    });
    await readChunks(result.stream);

    const generationCall = (
      mocks.runLessonGenerationWithPostProcess as unknown as ReturnType<
        typeof vi.fn<typeof runLessonGenerationWithPostProcess>
      >
    ).mock.calls.at(-1)?.[0];
    const serializedMessages = JSON.stringify(generationCall?.messages);

    expect(serializedMessages).toContain("非法 JSON 回退");
    expect(serializedMessages).toContain("只剩 data 回退");
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
});
