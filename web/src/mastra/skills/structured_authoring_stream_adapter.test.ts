import type { UIMessageChunk } from "ai";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_COMPETITION_LESSON_PLAN } from "@/lib/competition-lesson-contract";
import type { StructuredArtifactData, WorkflowTraceData } from "@/lib/lesson-authoring-contract";
import type { LessonAuthoringPersistence } from "@/lib/persistence/lesson-authoring-store";
import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

import { createStructuredAuthoringStreamAdapter } from "./structured_authoring_stream_adapter";

const baseWorkflow = {
  system: "系统提示词",
  standardsContext: "课标上下文",
  generationPlan: {
    mode: "lesson",
    confirmedLessonRequired: false,
    outputProtocol: "lesson-json",
    responseTransport: "structured-data-part",
    assistantTextPolicy: "suppress-json-text",
    maxSteps: 3,
    protocolVersion: "structured-v1",
  },
  standards: {
    requestedMarket: "cn-compulsory-2022",
    resolvedMarket: "cn-compulsory-2022",
    corpusId: "cn-compulsory-2022",
    displayName: "义务教育体育与健康课程标准",
    officialStatus: "现行",
    sourceName: "课程标准",
    issuer: "教育部",
    version: "2022",
    url: "https://example.com/standards",
    availability: "ready",
    referenceCount: 1,
  },
  safety: {
    htmlSandboxRequired: false,
    externalNetworkAllowed: false,
    forbiddenCapabilities: [],
    warnings: [],
  },
  trace: [],
} satisfies LessonWorkflowOutput;

function createChunkStream(chunks: UIMessageChunk[]) {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  });
}

function createConcreteLessonPlan() {
  return JSON.parse(JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN).replaceAll("XXX", "羽毛球"));
}

function getArtifactData(chunk: UIMessageChunk | undefined): StructuredArtifactData | undefined {
  if (!chunk) {
    return undefined;
  }

  return chunk.type === "data-artifact" ? (chunk.data as StructuredArtifactData) : undefined;
}

function getTraceData(chunk: UIMessageChunk): WorkflowTraceData | undefined {
  return chunk.type === "data-trace" ? (chunk.data as WorkflowTraceData) : undefined;
}

function isAssistantTextChunk(chunk: UIMessageChunk) {
  return chunk.type === "text-start" || chunk.type === "text-delta" || chunk.type === "text-end";
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

describe("structured authoring stream adapter", () => {
  it("浼氬湪妯″瀷棣栦釜 text delta 鍓嶅厛杈撳嚭 workflow trace锛屼緵宸︿晶瀹炴椂灞曠ず", async () => {
    const stream = createStructuredAuthoringStreamAdapter({
      mode: "lesson",
      originalMessages: [],
      requestId: "request-trace-before-text",
      workflow: baseWorkflow,
      stream: new ReadableStream<UIMessageChunk>(),
    });

    const chunks = await readFirstChunks(stream, 3);
    const tracePhases = chunks
      .map(getTraceData)
      .filter((trace): trace is WorkflowTraceData => Boolean(trace))
      .map((trace) => trace.phase);

    expect(tracePhases).toEqual(expect.arrayContaining(["generation"]));
    expect(chunks.some((chunk) => chunk.type === "text-delta")).toBe(false);
  });

  it("lesson JSON 流会实时输出 streaming lesson-json artifact", async () => {
    const stream = createStructuredAuthoringStreamAdapter({
      mode: "lesson",
      originalMessages: [],
      requestId: "request-1",
      workflow: baseWorkflow,
      stream: createChunkStream([
        { type: "text-start", id: "text-1" },
        { type: "text-delta", id: "text-1", delta: "{\"title\":\"羽毛球正手发球\"" },
        { type: "text-end", id: "text-1" },
        { type: "finish", finishReason: "stop" },
      ] as UIMessageChunk[]),
    });

    const chunks = await readAll(stream);
    const firstArtifact = getArtifactData(chunks.find((chunk) => chunk.type === "data-artifact"));

    expect(firstArtifact).toMatchObject({
      contentType: "lesson-json",
      status: "streaming",
      isComplete: false,
    });
    expect(firstArtifact?.content).toContain("\"title\"");
    expect(chunks.some(isAssistantTextChunk)).toBe(false);
    expect(chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "error",
          errorText: expect.stringContaining("模型未返回合法 CompetitionLessonPlan JSON"),
        }),
      ]),
    );
  });

  it("只有显式 mirror-json-text 时才会把 lesson JSON 镜像为 assistant text", async () => {
    const workflow = {
      ...baseWorkflow,
      generationPlan: {
        ...baseWorkflow.generationPlan,
        assistantTextPolicy: "mirror-json-text",
      },
    } satisfies LessonWorkflowOutput;
    const stream = createStructuredAuthoringStreamAdapter({
      mode: "lesson",
      originalMessages: [],
      requestId: "request-mirror-json",
      workflow,
      stream: createChunkStream([
        { type: "text-start", id: "text-1" },
        { type: "text-delta", id: "text-1", delta: JSON.stringify(createConcreteLessonPlan()) },
        { type: "text-end", id: "text-1" },
        { type: "finish", finishReason: "stop" },
      ] as UIMessageChunk[]),
    });

    const chunks = await readAll(stream);

    expect(chunks.filter(isAssistantTextChunk)).toEqual([
      expect.objectContaining({ type: "text-start", id: "text-1" }),
      expect.objectContaining({ type: "text-delta", id: "text-1" }),
      expect.objectContaining({ type: "text-end", id: "text-1" }),
    ]);
  });

  it("lesson JSON 流在结构化校验失败时会直接报错，不再自动调用修复模型", async () => {
    const stream = createStructuredAuthoringStreamAdapter({
      mode: "lesson",
      originalMessages: [],
      requestId: "request-invalid-json",
      workflow: baseWorkflow,
      stream: createChunkStream([
        { type: "text-start", id: "text-1" },
        { type: "text-delta", id: "text-1", delta: "{\"title\":\"羽毛球正手发球\"" },
        { type: "text-end", id: "text-1" },
        { type: "finish", finishReason: "stop" },
      ] as UIMessageChunk[]),
    });

    const chunks = await readAll(stream);
    const artifacts = chunks
      .filter((chunk) => chunk.type === "data-artifact")
      .map(getArtifactData);

    expect(artifacts.some((artifact) => artifact?.status === "ready")).toBe(false);
    expect(chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "error",
          errorText: expect.stringContaining("已停止自动修复"),
        }),
      ]),
    );
  });

  it("lesson 文本流收到合法 CompetitionLessonPlan JSON 时会输出 final lesson-json artifact", async () => {
    const stream = createStructuredAuthoringStreamAdapter({
      mode: "lesson",
      originalMessages: [],
      requestId: "request-json",
      workflow: baseWorkflow,
      stream: createChunkStream([
        { type: "text-start", id: "text-1" },
        { type: "text-delta", id: "text-1", delta: JSON.stringify(createConcreteLessonPlan()) },
        { type: "text-end", id: "text-1" },
        { type: "finish", finishReason: "stop" },
      ] as UIMessageChunk[]),
    });

    const chunks = await readAll(stream);
    const finalArtifact = chunks
      .filter((chunk) => chunk.type === "data-artifact")
      .map(getArtifactData)
      .at(-1);

    expect(finalArtifact).toMatchObject({
      contentType: "lesson-json",
      status: "ready",
      isComplete: true,
      title: "羽毛球",
    });
    expect(chunks.some(isAssistantTextChunk)).toBe(false);
  });

  it("html 文本流在非 PPT 结构时仍输出 ready html artifact", async () => {
    const workflow = {
      ...baseWorkflow,
      generationPlan: {
        ...baseWorkflow.generationPlan,
        mode: "html",
        assistantTextPolicy: "suppress-html-text",
      },
    } as LessonWorkflowOutput;
    const stream = createStructuredAuthoringStreamAdapter({
      mode: "html",
      originalMessages: [],
      requestId: "request-2",
      workflow,
      lessonPlan: "## 十、课时计划（教案）\n| 课堂常规 | 1分钟 |",
      stream: createChunkStream([
        { type: "text-start", id: "text-1" },
        { type: "text-delta", id: "text-1", delta: "<!DOCTYPE html><html lang=\"zh-CN\"><body>普通页面</body></html>" },
        { type: "text-end", id: "text-1" },
        { type: "finish", finishReason: "stop" },
      ] as UIMessageChunk[]),
    });

    const chunks = await readAll(stream);
    const finalArtifact = chunks
      .filter((chunk) => chunk.type === "data-artifact")
      .map(getArtifactData)
      .at(-1);

    expect(finalArtifact).toMatchObject({
      contentType: "html",
      status: "ready",
      isComplete: true,
    });
    expect(finalArtifact?.content.toLowerCase()).toContain("<!doctype html");
  });

  it("会透传模型 reasoning 流事件，供对话栏展示思考过程", async () => {
    const stream = createStructuredAuthoringStreamAdapter({
      mode: "lesson",
      originalMessages: [],
      requestId: "request-reasoning",
      workflow: baseWorkflow,
      stream: createChunkStream([
        { type: "reasoning-start", id: "reasoning-1" },
        { type: "reasoning-delta", id: "reasoning-1", delta: "先匹配课标。" },
        { type: "reasoning-end", id: "reasoning-1" },
        { type: "text-start", id: "text-1" },
        { type: "text-delta", id: "text-1", delta: JSON.stringify(createConcreteLessonPlan()) },
        { type: "text-end", id: "text-1" },
        { type: "finish", finishReason: "stop" },
      ] as UIMessageChunk[]),
    });

    const chunks = await readAll(stream);

    expect(chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "reasoning-start", id: "reasoning-1" }),
        expect.objectContaining({
          type: "reasoning-delta",
          id: "reasoning-1",
          delta: "先匹配课标。",
        }),
        expect.objectContaining({ type: "reasoning-end", id: "reasoning-1" }),
      ]),
    );
  });

  it("会透传 AI SDK 原生 step 与 tool chunks，避免把工具调用伪造成自定义 trace", async () => {
    const stream = createStructuredAuthoringStreamAdapter({
      mode: "lesson",
      originalMessages: [],
      requestId: "request-tools",
      workflow: baseWorkflow,
      stream: createChunkStream([
        { type: "start-step" },
        {
          type: "tool-input-start",
          toolCallId: "call-1",
          toolName: "searchStandards",
          title: "检索课标",
        },
        {
          type: "tool-input-delta",
          toolCallId: "call-1",
          inputTextDelta: "{\"query\":\"篮球\"}",
        },
        {
          type: "tool-input-available",
          toolCallId: "call-1",
          toolName: "searchStandards",
          input: { query: "篮球" },
          title: "检索课标",
        },
        {
          type: "tool-output-available",
          toolCallId: "call-1",
          output: { count: 6 },
        },
        { type: "finish-step" },
      ] as UIMessageChunk[]),
    });

    const chunks = await readAll(stream);
    const traceChunks = chunks
      .map(getTraceData)
      .filter((trace): trace is WorkflowTraceData => Boolean(trace));

    expect(chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "start-step" }),
        expect.objectContaining({
          type: "tool-input-start",
          toolCallId: "call-1",
          toolName: "searchStandards",
        }),
        expect.objectContaining({
          type: "tool-input-delta",
          toolCallId: "call-1",
          inputTextDelta: "{\"query\":\"篮球\"}",
        }),
        expect.objectContaining({
          type: "tool-input-available",
          toolCallId: "call-1",
          input: { query: "篮球" },
        }),
        expect.objectContaining({
          type: "tool-output-available",
          toolCallId: "call-1",
          output: { count: 6 },
        }),
        expect.objectContaining({ type: "finish-step" }),
      ]),
    );
    expect(traceChunks.flatMap((trace) => trace.trace.map((entry) => entry.step))).not.toEqual(
      expect.arrayContaining(["agent-tool-call", "agent-tool-result", "agent-tool-error"]),
    );
  });

  it("trace 会携带课标引用快照，供 sources 与 inline citation 展示", async () => {
    const workflow = {
      ...baseWorkflow,
      standards: {
        ...baseWorkflow.standards,
        references: [
          {
            id: "std-1",
            title: "运动能力",
            summary: "发展专项运动能力。",
            citation: "课程标准第 10 页",
            module: "核心素养",
            gradeBands: ["5-6年级"],
            sectionPath: ["课程目标", "核心素养"],
            score: 12,
          },
        ],
      },
    } satisfies LessonWorkflowOutput;
    const stream = createStructuredAuthoringStreamAdapter({
      mode: "lesson",
      originalMessages: [],
      requestId: "request-standards",
      workflow,
      stream: createChunkStream([
        { type: "text-start", id: "text-1" },
        { type: "text-delta", id: "text-1", delta: JSON.stringify(createConcreteLessonPlan()) },
        { type: "text-end", id: "text-1" },
        { type: "finish", finishReason: "stop" },
      ] as UIMessageChunk[]),
    });

    const chunks = await readAll(stream);
    const firstTrace = chunks.map(getTraceData).find(Boolean);

    expect(firstTrace?.standards).toMatchObject({
      displayName: "义务教育体育与健康课程标准",
      references: [
        expect.objectContaining({
          id: "std-1",
          title: "运动能力",
        }),
      ],
    });
  });

  it("artifact 持久化失败只写 trace，不中断主响应", async () => {
    const persistence = {
      saveArtifactVersion: vi.fn().mockRejectedValue(new Error("database unavailable")),
    } as unknown as LessonAuthoringPersistence;
    const stream = createStructuredAuthoringStreamAdapter({
      mode: "lesson",
      originalMessages: [],
      requestId: "request-3",
      workflow: baseWorkflow,
      persistence,
      projectId: "11111111-1111-4111-8111-111111111111",
      stream: createChunkStream([
        { type: "text-start", id: "text-1" },
        { type: "text-delta", id: "text-1", delta: JSON.stringify(createConcreteLessonPlan()) },
        { type: "text-end", id: "text-1" },
        { type: "finish", finishReason: "stop" },
      ] as UIMessageChunk[]),
    });

    const chunks = await readAll(stream);
    const completedTrace = chunks.map(getTraceData).find((trace) => trace?.phase === "completed");

    expect(persistence.saveArtifactVersion).toHaveBeenCalled();
    expect(chunks.at(-1)).toMatchObject({ type: "finish", finishReason: "stop" });
    expect(completedTrace?.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          step: "persist-artifact-version",
          status: "blocked",
        }),
      ]),
    );
  });
});
