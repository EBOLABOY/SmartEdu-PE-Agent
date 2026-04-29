import type { UIMessageChunk } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    getAgent: vi.fn(() => ({
      stream: agentStream,
    })),
    getWorkflow: vi.fn(),
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
  createStructuredAuthoringStreamAdapter: mocks.createStructuredAuthoringStreamAdapter,
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

function getAgentStreamCall(index = 0) {
  const call = mocks.agentStream.mock.calls[index] as unknown as [
    unknown,
    {
      system: string;
    },
  ];

  return call;
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
  });

  it("入口直接调用 peTeacherAgent.stream，并把 Agentic 工具提示注入 system", async () => {
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
    expect(mocks.getAgent).toHaveBeenCalledWith("peTeacherAgent");
    expect(mocks.agentStream).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        maxSteps: 7,
        system: expect.stringContaining("analyze_requirements"),
      }),
    );
    expect(getAgentStreamCall()[1].system).toContain("年级：三年级");
    expect(getAgentStreamCall()[1].system).toContain("主题：篮球运球接力");
  }, 15000);

  it("会构造 Agentic 兼容 workflow，并交给结构化 Artifact adapter", async () => {
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
        allowTextOnlyResponse: true,
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
              step: "agentic-entry",
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

    expect(getAgentStreamCall()[1].system).toContain("当前已确认课时计划 JSON");
    expect(getAgentStreamCall()[1].system).toContain("submit_html_screen");
    expect(mocks.createStructuredAuthoringStreamAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "html",
        lessonPlan: JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN),
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

    const serializedMessages = JSON.stringify(getAgentStreamCall()[0]);

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

    const serializedMessages = JSON.stringify(getAgentStreamCall()[0]);

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
