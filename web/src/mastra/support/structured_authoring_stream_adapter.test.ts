import type { UIMessageChunk } from "ai";
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_COMPETITION_LESSON_PLAN,
  competitionLessonPlanSchema,
} from "@/lib/competition-lesson-contract";
import {
  STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
  type StructuredArtifactData,
  type WorkflowTraceData,
} from "@/lib/lesson-authoring-contract";
import type { LessonAuthoringPersistence } from "@/lib/persistence/lesson-authoring-store";
import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

import { createStructuredAuthoringStreamAdapter } from "./structured_authoring_stream_adapter";

vi.mock("../skills/runtime/lesson_diagram_generation_skill", () => ({
  enrichLessonPlanWithDiagramAssets: vi.fn(async ({ lessonPlan }) => ({
    generatedCount: 0,
    lessonPlan,
    skippedReason: "test-default-skip",
  })),
}));

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
  const lessonPlan = JSON.parse(JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN).replaceAll("XXX", "羽毛球"));

  lessonPlan.periodPlan.rows[1].content = [
    "找准击球窗口：教师示范正手发高远球动作，学生明确击球点和挥拍路线。",
    "落点雷达练习：两人一组完成定点发球和落点控制。",
    "连中目标区挑战赛：小组比一比连续发入目标区域次数。",
    "体能充电站：结合并步移动和核心支撑提升专项体能。",
  ];

  return lessonPlan;
}

function createPlaceholderLessonPlan() {
  const lessonPlan = JSON.parse(JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN).replaceAll("XXX", "待补充"));

  lessonPlan.periodPlan.rows[1].content = [
    "关键发现：明确主要动作方法。",
    "伙伴试练：完成合作练习。",
    "小队比赛：开展小组比赛。",
    "体能补给：完成体能练习。",
  ];

  return lessonPlan;
}

function createStructuredLessonOutputChunk(lessonPlan = createConcreteLessonPlan()): UIMessageChunk {
  return {
    type: "data-structured-output",
    data: {
      object: lessonPlan,
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

async function* createManyLessonDraftStream(count: number) {
  for (let index = 1; index <= count; index += 1) {
    yield {
      title: `羽毛球草稿 ${index}`,
    };
  }
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

describe("structured authoring stream adapter", () => {
  it("final lesson artifact 会等待站位图后处理并写入增强后的课时计划", async () => {
    const { enrichLessonPlanWithDiagramAssets } = await import("../skills/runtime/lesson_diagram_generation_skill");
    const enhancedLessonPlan = createConcreteLessonPlan();

    enhancedLessonPlan.periodPlan.rows[0].diagramAssets = [
      {
        alt: "集合整队站位图",
        caption: "集合整队",
        height: 320,
        imageUrl: "data:image/png;base64,diagram",
        kind: "formation",
        source: "ai-generated",
        width: 320,
      },
    ];
    vi.mocked(enrichLessonPlanWithDiagramAssets).mockResolvedValueOnce({
      generatedCount: 1,
      lessonPlan: enhancedLessonPlan,
      storageMode: "s3-compatible",
    });

    const stream = createStructuredAuthoringStreamAdapter({
      finalLessonPlanPromise: Promise.resolve(createConcreteLessonPlan()),
      mode: "lesson",
      originalMessages: [],
      requestId: "request-diagram-enhancement",
      workflow: baseWorkflow,
      stream: createChunkStream([{ type: "finish", finishReason: "stop" }]),
    });

    const chunks = await readAll(stream);
    const finalArtifact = chunks
      .filter((chunk) => chunk.type === "data-artifact")
      .map(getArtifactData)
      .at(-1);
    const parsed = competitionLessonPlanSchema.parse(JSON.parse(finalArtifact?.content ?? "{}"));
    const completedTrace = chunks.map(getTraceData).find((trace) => trace?.phase === "completed");

    expect(parsed.periodPlan.rows[0].diagramAssets?.[0]).toMatchObject({
      alt: "集合整队站位图",
      imageUrl: "data:image/png;base64,diagram",
    });
    expect(completedTrace?.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          step: "generate-lesson-diagrams",
          status: "success",
        }),
      ]),
    );
  });

  it("业务语义问题不再阻断最终 lesson artifact 输出", async () => {
    const stream = createStructuredAuthoringStreamAdapter({
      finalLessonPlanPromise: Promise.resolve(createPlaceholderLessonPlan()),
      mode: "lesson",
      originalMessages: [],
      requestId: "request-no-business-block",
      workflow: baseWorkflow,
      stream: createChunkStream([{ type: "finish", finishReason: "stop" }]),
    });

    const chunks = await readAll(stream);
    const finalArtifact = chunks
      .filter((chunk) => chunk.type === "data-artifact")
      .map(getArtifactData)
      .at(-1);
    const parsed = competitionLessonPlanSchema.parse(JSON.parse(finalArtifact?.content ?? "{}"));
    const completedTrace = chunks.map(getTraceData).find((trace) => trace?.phase === "completed");

    expect(chunks.some((chunk) => chunk.type === "error")).toBe(false);
    expect(parsed.title).toBe("待补充");
    expect(completedTrace?.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          step: "validate-lesson-output",
          status: "success",
        }),
      ]),
    );
  });

  it("allowTextOnlyResponse 为 true 时纯文本回复不输出 trace 或 artifact", async () => {
    const stream = createStructuredAuthoringStreamAdapter({
      allowTextOnlyResponse: true,
      mode: "lesson",
      originalMessages: [],
      requestId: "request-text-only",
      workflow: baseWorkflow,
      stream: createChunkStream([
        { type: "text-start", id: "text-only" },
        { type: "text-delta", id: "text-only", delta: "老师您好，请告诉我今天要准备什么课。" },
        { type: "text-end", id: "text-only" },
        { type: "finish", finishReason: "stop" },
      ] as UIMessageChunk[]),
    });

    const chunks = await readAll(stream);

    expect(chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text-delta", delta: "老师您好，请告诉我今天要准备什么课。" }),
        expect.objectContaining({ type: "finish", finishReason: "stop" }),
      ]),
    );
    expect(chunks.some((chunk) => chunk.type === "data-trace")).toBe(false);
    expect(chunks.some((chunk) => chunk.type === "data-artifact")).toBe(false);
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

  it("lesson ready artifact 仍以 finalLessonPlanPromise 为准", async () => {
    const draftLessonPlan = createPlaceholderLessonPlan();
    const finalLessonPlan = createConcreteLessonPlan();
    const stream = createStructuredAuthoringStreamAdapter({
      finalLessonPlanPromise: Promise.resolve(finalLessonPlan),
      mode: "lesson",
      originalMessages: [],
      requestId: "request-repaired-final-plan",
      workflow: baseWorkflow,
      stream: createChunkStream([createStructuredLessonOutputChunk(draftLessonPlan), { type: "finish", finishReason: "stop" }]),
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

  it("lesson structured-output 路径会生成 ready artifact", async () => {
    const stream = createStructuredAuthoringStreamAdapter({
      mode: "lesson",
      originalMessages: [],
      requestId: "request-structured-output-ready",
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

  it("html 纯文本整文档会直接抽取 htmlPages 并生成 artifact", async () => {
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
      requestId: "request-html-raw-extraction",
      workflow,
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
      htmlPages: [
        expect.objectContaining({
          pageIndex: 0,
          sectionHtml: expect.stringContaining("普通页面"),
        }),
      ],
    });
    expect(chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "finish",
          finishReason: "stop",
        }),
      ]),
    );
  });

  it("html 纯文本流会在结束时封装为 ready artifact", async () => {
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
      requestId: "request-html-progress-before-document",
      workflow,
      stream: createChunkStream([
        {
          type: "text-delta",
          id: "html-1",
          delta: "正在设计课堂大屏结构...\n",
        },
        {
          type: "text-delta",
          id: "html-1",
          delta: "<!DOCTYPE html><html lang=\"zh-CN\"><head></head><body><section class=\"slide\">课堂</section></body></html>",
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
    expect(finalArtifact?.content).toContain("正在设计课堂大屏结构");

    if (!finalArtifact || finalArtifact.stage !== "html") {
      throw new Error("Expected final HTML artifact.");
    }

    expect(finalArtifact.htmlPages[0]?.sectionHtml).toContain("课堂");
  });

  it("html 上游 artifact 流会被原样透传并作为最终结果持久化，不再由 text-delta 重复合成", async () => {
    const workflow = {
      ...baseWorkflow,
      generationPlan: {
        ...baseWorkflow.generationPlan,
        mode: "html",
        assistantTextPolicy: "suppress-html-text",
      },
    } as LessonWorkflowOutput;
    const html = "<!DOCTYPE html><html lang=\"zh-CN\"><head></head><body><section>上游最终大屏</section></body></html>";
    const upstreamArtifact: StructuredArtifactData = {
      protocolVersion: STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
      stage: "html",
      contentType: "html",
      content: html,
      htmlPages: [
        {
          pageIndex: 0,
          pageRole: "cover",
          pageTitle: "上游最终大屏",
          sectionHtml: '<section class="slide cover-slide active" data-slide-kind="cover"><h1>上游最终大屏</h1></section>',
        },
      ],
      isComplete: true,
      status: "ready",
      source: "data-part",
      title: "互动大屏 Artifact",
      updatedAt: "2026-05-02T00:00:00.000Z",
    };
    const persistence = {
      saveArtifactVersion: vi.fn(),
    } as unknown as LessonAuthoringPersistence;
    const stream = createStructuredAuthoringStreamAdapter({
      mode: "html",
      originalMessages: [],
      persistence,
      projectId: "11111111-1111-4111-8111-111111111111",
      requestId: "request-html-upstream-artifact",
      workflow,
      stream: createChunkStream([
        { type: "data-artifact", id: "lesson-authoring-artifact-html", data: upstreamArtifact } as UIMessageChunk,
        { type: "text-delta", id: "html-1", delta: html },
        { type: "finish", finishReason: "stop" },
      ]),
    });

    const chunks = await readAll(stream);
    const artifacts = chunks
      .filter((chunk) => chunk.type === "data-artifact")
      .map(getArtifactData)
      .filter(Boolean);

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({
      content: html,
      contentType: "html",
      isComplete: true,
      status: "ready",
    });
    expect(persistence.saveArtifactVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        artifact: expect.objectContaining({
          content: html,
          contentType: "html",
          isComplete: true,
          status: "ready",
        }),
      }),
    );
  });

  it("html 页级工具事件会按上游顺序流式输出，早于最终完成状态", async () => {
    const workflow = {
      ...baseWorkflow,
      generationPlan: {
        ...baseWorkflow.generationPlan,
        mode: "html",
        assistantTextPolicy: "suppress-html-text",
      },
    } as LessonWorkflowOutput;
    const html = "<!DOCTYPE html><html lang=\"zh-CN\"><head></head><body><section>第 1 页</section></body></html>";
    const upstreamArtifact: StructuredArtifactData = {
      protocolVersion: STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
      stage: "html",
      contentType: "html",
      content: html,
      htmlPages: [
        {
          pageIndex: 0,
          pageRole: "cover",
          pageTitle: "第 1 页",
          sectionHtml: '<section class="slide cover-slide active" data-slide-kind="cover"><h1>第 1 页</h1></section>',
        },
      ],
      isComplete: true,
      status: "ready",
      source: "data-part",
      title: "互动大屏 Artifact",
      updatedAt: "2026-05-02T00:00:00.000Z",
    };

    const stream = createStructuredAuthoringStreamAdapter({
      mode: "html",
      originalMessages: [],
      requestId: "request-html-document-streaming",
      workflow,
      stream: createChunkStream([
        { type: "start-step" },
        {
          type: "tool-input-start",
          toolCallId: "request-html-document-1",
          toolName: "generateHtmlScreenDocument",
          title: "生成单页 HTML",
        },
        {
          type: "tool-input-available",
          toolCallId: "request-html-document-1",
          toolName: "generateHtmlScreenDocument",
          title: "生成单页 HTML",
          input: {
            documentMode: "single-page",
            title: "首页",
          },
        },
        {
          type: "tool-output-available",
          toolCallId: "request-html-document-1",
          output: {
            title: "首页",
            characters: 1280,
            documentMode: "single-page",
          },
        },
        { type: "data-artifact", id: "lesson-authoring-artifact-html", data: upstreamArtifact },
        { type: "finish-step" },
        { type: "finish", finishReason: "stop" },
      ] as UIMessageChunk[]),
    });

    const chunks = await readAll(stream);
    const toolStartIndex = chunks.findIndex(
      (chunk) => chunk.type === "tool-input-start" && chunk.toolName === "generateHtmlScreenDocument",
    );
    const toolOutputIndex = chunks.findIndex(
      (chunk) => chunk.type === "tool-output-available" && chunk.toolCallId === "request-html-document-1",
    );
    const finalArtifactIndex = chunks.findIndex((chunk) => getArtifactData(chunk)?.status === "ready");
    const completedTraceIndex = chunks.findIndex((chunk) => getTraceData(chunk)?.phase === "completed");

    expect(toolStartIndex).toBeGreaterThan(-1);
    expect(toolOutputIndex).toBeGreaterThan(toolStartIndex);
    expect(finalArtifactIndex).toBeGreaterThan(toolOutputIndex);
    expect(completedTraceIndex).toBeGreaterThan(finalArtifactIndex);
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
          errorText: expect.stringContaining("CompetitionLessonPlan"),
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
      stream: createChunkStream([createStructuredLessonOutputChunk()]),
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
      stream: createChunkStream([createStructuredLessonOutputChunk(), { type: "finish", finishReason: "stop" }]),
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

  it("没有 partial output 时不再输出默认草稿首包，只保留真实生成进度", async () => {
    const stream = createStructuredAuthoringStreamAdapter({
      finalLessonPlanPromise: Promise.resolve(createConcreteLessonPlan()),
      mode: "lesson",
      originalMessages: [],
      requestId: "request-empty-draft-first-packet",
      workflow: baseWorkflow,
      stream: createChunkStream([{ type: "finish", finishReason: "stop" }]),
    });

    const chunks = await readAll(stream);
    const artifacts = chunks
      .filter((chunk) => chunk.type === "data-artifact")
      .map(getArtifactData)
      .filter(Boolean);
    const draftTrace = chunks
      .map(getTraceData)
      .find((trace) =>
        trace?.trace.some(
          (entry) =>
            entry.step === "stream-lesson-draft" &&
            entry.detail.includes("完成首个结构块后会同步右侧预览"),
        ),
      );

    expect(artifacts.some((artifact) => artifact?.status === "streaming")).toBe(false);
    expect(artifacts.at(-1)).toMatchObject({
      contentType: "lesson-json",
      isComplete: true,
      status: "ready",
    });
    expect(draftTrace).toBeDefined();
  });

  it("最终课时计划会先 ready，再执行教学站位图增强", async () => {
    const stream = createStructuredAuthoringStreamAdapter({
      finalLessonPlanPromise: Promise.resolve(createConcreteLessonPlan()),
      mode: "lesson",
      originalMessages: [],
      requestId: "request-ready-before-diagrams",
      workflow: baseWorkflow,
      stream: createChunkStream([{ type: "finish", finishReason: "stop" }]),
    });

    const chunks = await readAll(stream);
    const firstReadyChunkIndex = chunks.findIndex((chunk) => getArtifactData(chunk)?.status === "ready");
    const diagramTraceIndex = chunks.findIndex((chunk) => {
      const trace = getTraceData(chunk);

      return trace?.trace.some(
        (entry) => entry.step === "generate-lesson-diagrams" && entry.status === "running",
      );
    });

    expect(firstReadyChunkIndex).toBeGreaterThanOrEqual(0);
    expect(diagramTraceIndex).toBeGreaterThan(firstReadyChunkIndex);
  });

  it("服务端管线会在草稿和最终校验阶段实时输出 workflow trace", async () => {
    const workflow = {
      ...baseWorkflow,
      trace: [
        {
          step: "server-deterministic-entry",
          status: "success",
          detail: "已进入服务端课时计划结构化生成管线。",
          timestamp: "2026-04-30T00:00:00.000Z",
        },
        {
          step: "server-standards-retrieval",
          status: "success",
          detail: "服务端已检索 1 条课标条目并注入结构化生成提示。",
          timestamp: "2026-04-30T00:00:00.000Z",
        },
      ],
    } satisfies LessonWorkflowOutput;
    const stream = createStructuredAuthoringStreamAdapter({
      finalLessonPlanPromise: Promise.resolve(createConcreteLessonPlan()),
      lessonDraftStream: createLessonDraftStream(),
      mode: "lesson",
      originalMessages: [],
      requestId: "request-server-pipeline-trace",
      workflow,
      stream: createChunkStream([{ type: "finish", finishReason: "stop" }]),
    });

    const chunks = await readAll(stream);
    const traceChunks = chunks
      .map(getTraceData)
      .filter((trace): trace is WorkflowTraceData => Boolean(trace));
    const traceSteps = traceChunks.flatMap((trace) => trace.trace.map((entry) => entry.step));

    expect(traceChunks.length).toBeGreaterThanOrEqual(3);
    expect(traceChunks[0]).toMatchObject({
      phase: "generation",
      trace: expect.arrayContaining([
        expect.objectContaining({ step: "server-deterministic-entry" }),
        expect.objectContaining({ step: "server-standards-retrieval" }),
        expect.objectContaining({ step: "agent-stream-started" }),
      ]),
    });
    expect(traceSteps).toEqual(
      expect.arrayContaining([
        "stream-lesson-draft",
        "validate-lesson-output",
        "generation-finished",
      ]),
    );
    expect(traceChunks.at(-1)).toMatchObject({
      phase: "completed",
      trace: expect.arrayContaining([
        expect.objectContaining({
          step: "agent-stream-started",
          status: "success",
        }),
        expect.objectContaining({
          step: "stream-lesson-draft",
          status: "success",
        }),
        expect.objectContaining({
          step: "validate-lesson-output",
          status: "success",
        }),
      ]),
    });
    expect(traceChunks.at(-1)?.trace.filter((entry) => entry.status === "running")).toEqual([]);
  });

  it("草稿流 trace 会节流，最终仍收敛为成功状态", async () => {
    const stream = createStructuredAuthoringStreamAdapter({
      finalLessonPlanPromise: Promise.resolve(createConcreteLessonPlan()),
      lessonDraftStream: createManyLessonDraftStream(45),
      mode: "lesson",
      originalMessages: [],
      requestId: "request-throttled-draft-trace",
      workflow: baseWorkflow,
      stream: createChunkStream([{ type: "finish", finishReason: "stop" }]),
    });

    const chunks = await readAll(stream);
    const traceChunks = chunks
      .map(getTraceData)
      .filter((trace): trace is WorkflowTraceData => Boolean(trace));
    const draftTraceWrites = traceChunks.filter((trace) =>
      trace.trace.some((entry) => entry.step === "stream-lesson-draft"),
    );
    const completedTrace = traceChunks.at(-1);

    expect(draftTraceWrites.length).toBeLessThan(45);
    expect(completedTrace).toMatchObject({
      phase: "completed",
      trace: expect.arrayContaining([
        expect.objectContaining({
          step: "stream-lesson-draft",
          status: "success",
          detail: expect.stringContaining("共同步 45 次草稿更新"),
        }),
      ]),
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
        createStructuredLessonOutputChunk(),
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
      stream: createChunkStream([createStructuredLessonOutputChunk(), { type: "finish", finishReason: "stop" }]),
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
