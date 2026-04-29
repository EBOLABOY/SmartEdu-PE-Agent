import type { UIMessageChunk } from "ai";
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_COMPETITION_LESSON_PLAN,
  competitionLessonPlanSchema,
} from "@/lib/competition-lesson-contract";
import type { StructuredArtifactData, WorkflowTraceData } from "@/lib/lesson-authoring-contract";
import type { LessonAuthoringPersistence } from "@/lib/persistence/lesson-authoring-store";
import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

import { createStructuredAuthoringStreamAdapter } from "./structured_authoring_stream_adapter";

function createIntentResult(
  intent: "clarify" | "generate_lesson" | "patch_lesson" | "generate_html" | "consult_standards" = "generate_lesson",
) {
  return {
    intent,
    confidence: 0.94,
    reason: "测试用意图。",
  };
}

const baseWorkflow = {
  system: "系统提示词",
  standardsContext: "课标上下文",
  generationPlan: {
    mode: "lesson",
    confirmedLessonRequired: false,
    outputProtocol: "lesson-json",
    responseTransport: "structured-data-part",
    assistantTextPolicy: "suppress-json-text",
    maxSteps: 5,
    protocolVersion: "structured-v1",
  },
  standards: {
    requestedMarket: "cn-compulsory-2022",
    resolvedMarket: "cn-compulsory-2022",
    corpus: {
      corpusId: "cn-compulsory-2022",
      displayName: "义务教育体育与健康课程标准",
      issuer: "教育部",
      version: "2022",
      url: "https://example.com/standards",
      availability: "ready",
    },
    referenceCount: 1,
    references: [],
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
    intentResult: createIntentResult(),
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

function createPlaceholderLessonPlan() {
  return JSON.parse(JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN).replaceAll("XXX", "待补充"));
}

function createStructuredLessonOutputChunk(lessonPlan = createConcreteLessonPlan()): UIMessageChunk {
  return {
    type: "data-structured-output",
    data: {
      object: {
        _thinking_process: "先完成教学设计草稿。",
        lessonPlan,
      },
    },
  } as UIMessageChunk;
}

function createLessonToolChunk(lessonPlan = createConcreteLessonPlan(), summary = "生成课时计划"): UIMessageChunk {
  return {
    type: "tool-input-available",
    toolCallId: "tool-lesson-1",
    toolName: "submit_lesson_plan",
    input: {
      lessonPlan,
      summary,
    },
  } as UIMessageChunk;
}

function createHtmlToolChunk(html: string, summary = "生成互动大屏"): UIMessageChunk {
  return {
    type: "tool-input-available",
    toolCallId: "tool-html-1",
    toolName: "submit_html_screen",
    input: {
      html,
      summary,
    },
  } as UIMessageChunk;
}

async function* createLessonDraftStream() {
  yield {
    learningObjectives: {
      sportAbility: ["能稳定完成正手发高远球"],
    },
    title: "羽毛球草稿",
  };
}

function getArtifactData(chunk: UIMessageChunk | undefined): StructuredArtifactData | undefined {
  return chunk?.type === "data-artifact" ? (chunk.data as StructuredArtifactData) : undefined;
}

function getTraceData(chunk: UIMessageChunk): WorkflowTraceData | undefined {
  return chunk.type === "data-trace" ? (chunk.data as WorkflowTraceData) : undefined;
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
  it("在任何文本之前先输出稳定 trace", async () => {
    const stream = createStructuredAuthoringStreamAdapter({
      mode: "lesson",
      originalMessages: [],
      requestId: "request-trace-before-text",
      workflow: baseWorkflow,
      stream: new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.close();
        },
      }),
    });

    const chunks = await readFirstChunks(stream, 2);
    const tracePhases = chunks
      .map(getTraceData)
      .filter((trace): trace is WorkflowTraceData => Boolean(trace))
      .map((trace) => trace.phase);

    expect(tracePhases).toEqual(expect.arrayContaining(["generation"]));
  });

  it("lesson 结构化输出流会直接输出可信的 lesson-json artifact", async () => {
    const stream = createStructuredAuthoringStreamAdapter({
      mode: "lesson",
      originalMessages: [],
      requestId: "request-structured-lesson",
      workflow: baseWorkflow,
      stream: createChunkStream([createStructuredLessonOutputChunk(), { type: "finish", finishReason: "stop" }]),
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
    });
  });

  it("submit_lesson_plan 工具输入会立即转换为 lesson artifact，并留下 trace", async () => {
    const stream = createStructuredAuthoringStreamAdapter({
      mode: "lesson",
      originalMessages: [],
      requestId: "request-tool-lesson",
      workflow: baseWorkflow,
      stream: createChunkStream([createLessonToolChunk(), { type: "finish", finishReason: "stop" }]),
    });

    const chunks = await readAll(stream);
    const artifacts = chunks
      .filter((chunk) => chunk.type === "data-artifact")
      .map(getArtifactData)
      .filter(Boolean);
    const trace = chunks.map(getTraceData).find((value) => value?.phase === "generation");

    expect(artifacts[0]).toMatchObject({
      contentType: "lesson-json",
      status: "streaming",
    });
    expect(artifacts.at(-1)).toMatchObject({
      contentType: "lesson-json",
      status: "ready",
    });
    expect(trace?.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          step: "submit-lesson-plan-tool",
          status: "success",
        }),
      ]),
    );
  });

  it("lesson ready artifact 仍以 repair 后的 finalLessonPlanPromise 为准", async () => {
    const draftLessonPlan = createPlaceholderLessonPlan();
    const repairedLessonPlan = createConcreteLessonPlan();
    const stream = createStructuredAuthoringStreamAdapter({
      finalLessonPlanPromise: Promise.resolve(repairedLessonPlan),
      mode: "lesson",
      originalMessages: [],
      requestId: "request-repaired-final-plan",
      workflow: baseWorkflow,
      stream: createChunkStream([createLessonToolChunk(draftLessonPlan), { type: "finish", finishReason: "stop" }]),
    });

    const chunks = await readAll(stream);
    const finalArtifact = chunks
      .filter((chunk) => chunk.type === "data-artifact")
      .map(getArtifactData)
      .at(-1);
    const parsed = JSON.parse(finalArtifact?.content ?? "{}");

    expect(finalArtifact).toMatchObject({
      contentType: "lesson-json",
      status: "ready",
      isComplete: true,
      title: "羽毛球",
    });
    expect(parsed.title).toBe("羽毛球");
    expect(parsed.title).not.toBe("待补充");
  });

  it("无工具提交时仍保留 legacy structured-output 路径", async () => {
    const stream = createStructuredAuthoringStreamAdapter({
      mode: "lesson",
      originalMessages: [],
      requestId: "request-legacy-structured-fallback",
      workflow: baseWorkflow,
      stream: createChunkStream([createStructuredLessonOutputChunk(), { type: "finish", finishReason: "stop" }]),
    });

    const chunks = await readAll(stream);
    const finalArtifact = chunks
      .filter((chunk) => chunk.type === "data-artifact")
      .map(getArtifactData)
      .at(-1);

    expect(finalArtifact).toMatchObject({
      contentType: "lesson-json",
      status: "ready",
    });
  });

  it("submit_html_screen 工具输入会直接转换为 html artifact", async () => {
    const workflow = {
      ...baseWorkflow,
      generationPlan: {
        ...baseWorkflow.generationPlan,
        mode: "html",
        assistantTextPolicy: "suppress-html-text",
      },
    } as LessonWorkflowOutput;
    const html = "<!DOCTYPE html><html lang=\"zh-CN\"><head></head><body><section class=\"slide\">课堂</section></body></html>";
    const stream = createStructuredAuthoringStreamAdapter({
      mode: "html",
      originalMessages: [],
      requestId: "request-tool-html",
      workflow,
      lessonPlan: "## 十、课时计划\n| 课堂常规 | 1分钟 |",
      stream: createChunkStream([createHtmlToolChunk(html), { type: "finish", finishReason: "stop" }]),
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
  });

  it("无工具提交时，html 原始文本提取路径仍可工作", async () => {
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
      requestId: "request-html-fallback",
      workflow,
      lessonPlan: "## 十、课时计划\n| 课堂常规 | 1分钟 |",
      stream: createChunkStream([
        {
          type: "text-delta",
          id: "html-1",
          delta: "<!DOCTYPE html><html lang=\"zh-CN\"><head></head><body><section class=\"slide\">普通页面</section></body></html>",
        },
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
  });

  it("非法输出工具输入会直接报错，不回退到猜测 JSON", async () => {
    const stream = createStructuredAuthoringStreamAdapter({
      mode: "lesson",
      originalMessages: [],
      requestId: "request-invalid-tool-input",
      workflow: baseWorkflow,
      stream: createChunkStream([
        {
          type: "tool-input-available",
          toolCallId: "tool-invalid",
          toolName: "submit_lesson_plan",
          input: {
            lessonPlan: { title: "只有标题" },
            summary: "不完整的提交",
          },
        } as UIMessageChunk,
      ]),
    });

    const chunks = await readAll(stream);

    expect(chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "error",
        }),
        expect.objectContaining({
          type: "finish",
          finishReason: "error",
        }),
      ]),
    );
  });

  it("只有原始 lesson 文本且没有工具或 structured output 时会报错", async () => {
    const stream = createStructuredAuthoringStreamAdapter({
      mode: "lesson",
      originalMessages: [],
      requestId: "request-raw-lesson-only",
      workflow: baseWorkflow,
      stream: createChunkStream([
        { type: "text-start", id: "text-1" },
        { type: "text-delta", id: "text-1", delta: JSON.stringify(createConcreteLessonPlan()) },
        { type: "text-end", id: "text-1" },
        { type: "finish", finishReason: "stop" },
      ]),
    });

    const chunks = await readAll(stream);

    expect(chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "error",
          errorText: expect.stringContaining("submit_lesson_plan"),
        }),
      ]),
    );
  });

  it("底层流自然关闭但没有 finish 时仍会完成最终校验并输出 ready artifact", async () => {
    const stream = createStructuredAuthoringStreamAdapter({
      mode: "lesson",
      originalMessages: [],
      requestId: "request-json-no-finish",
      workflow: baseWorkflow,
      stream: createChunkStream([createLessonToolChunk()]),
    });

    const chunks = await readAll(stream);
    const finalArtifact = chunks
      .filter((chunk) => chunk.type === "data-artifact")
      .map(getArtifactData)
      .at(-1);
    const completedTrace = chunks.map(getTraceData).find((trace) => trace?.phase === "completed");

    expect(finalArtifact).toMatchObject({
      contentType: "lesson-json",
      status: "ready",
      isComplete: true,
    });
    expect(completedTrace?.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          step: "generation-stream-closed-without-finish",
          status: "blocked",
        }),
      ]),
    );
  });

  it("有 partial output 时会输出可被模板消费的 streaming lesson draft", async () => {
    const stream = createStructuredAuthoringStreamAdapter({
      lessonDraftStream: createLessonDraftStream(),
      mode: "lesson",
      originalMessages: [],
      requestId: "request-draft-stream",
      workflow: baseWorkflow,
      stream: createChunkStream([createLessonToolChunk(), { type: "finish", finishReason: "stop" }]),
    });

    const chunks = await readAll(stream);
    const streamingDraft = chunks
      .filter((chunk) => chunk.type === "data-artifact")
      .map(getArtifactData)
      .find((artifact) => artifact?.status === "streaming" && artifact.title === "羽毛球草稿");

    expect(streamingDraft).toMatchObject({
      contentType: "lesson-json",
      isComplete: false,
      status: "streaming",
    });
    expect(competitionLessonPlanSchema.parse(JSON.parse(streamingDraft?.content ?? "{}"))).toMatchObject({
      learningObjectives: {
        sportAbility: ["能稳定完成正手发高远球"],
      },
      title: "羽毛球草稿",
    });
  });

  it("透传 reasoning、tool 和 source 等 AI SDK 原生 chunks", async () => {
    const stream = createStructuredAuthoringStreamAdapter({
      mode: "lesson",
      originalMessages: [],
      requestId: "request-pass-through",
      workflow: baseWorkflow,
      stream: createChunkStream([
        { type: "reasoning-start", id: "reasoning-1" },
        { type: "reasoning-delta", id: "reasoning-1", delta: "先匹配课标。" },
        { type: "reasoning-end", id: "reasoning-1" },
        { type: "start-step" },
        {
          type: "tool-input-start",
          toolCallId: "call-1",
          toolName: "searchStandards",
          title: "检索课标",
        },
        {
          type: "tool-input-available",
          toolCallId: "call-1",
          toolName: "searchStandards",
          input: { query: "篮球" },
          title: "检索课标",
        },
        {
          type: "source-url",
          sourceId: "source-1",
          url: "https://example.com/standards",
          title: "课程标准",
        },
        createLessonToolChunk(),
        { type: "finish-step" },
        { type: "finish", finishReason: "stop" },
      ] as UIMessageChunk[]),
    });

    const chunks = await readAll(stream);
    const traceChunks = chunks
      .map(getTraceData)
      .filter((trace): trace is WorkflowTraceData => Boolean(trace));

    expect(chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "reasoning-start", id: "reasoning-1" }),
        expect.objectContaining({ type: "tool-input-start", toolName: "searchStandards" }),
        expect.objectContaining({ type: "tool-input-available", toolName: "searchStandards" }),
        expect.objectContaining({ type: "source-url", sourceId: "source-1" }),
      ]),
    );
    expect(traceChunks.flatMap((trace) => trace.trace.map((entry) => entry.step))).not.toEqual(
      expect.arrayContaining(["agent-tool-call", "agent-tool-result", "agent-tool-error"]),
    );
  });

  it("artifact 持久化失败只写 trace，不中断主响应", async () => {
    const persistence = {
      saveArtifactVersion: vi.fn().mockRejectedValue(new Error("database unavailable")),
    } as unknown as LessonAuthoringPersistence;
    const stream = createStructuredAuthoringStreamAdapter({
      mode: "lesson",
      originalMessages: [],
      requestId: "request-persist-failure",
      workflow: baseWorkflow,
      persistence,
      projectId: "11111111-1111-4111-8111-111111111111",
      stream: createChunkStream([createLessonToolChunk(), { type: "finish", finishReason: "stop" }]),
    });

    const chunks = await readAll(stream);
    const completedTrace = chunks.map(getTraceData).find((trace) => trace?.phase === "completed");

    expect(persistence.saveArtifactVersion).toHaveBeenCalled();
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
