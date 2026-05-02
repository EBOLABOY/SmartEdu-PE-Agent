import type { FullOutput, MastraModelOutput } from "@mastra/core/stream";
import { generateText, streamText, type UIMessageChunk } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_COMPETITION_LESSON_PLAN,
  agentLessonGenerationSchema,
  type AgentLessonGenerationResult,
} from "@/lib/competition-lesson-contract";
import type { HtmlScreenPlan } from "@/lib/html-screen-plan-contract";
import type { SmartEduUIMessage } from "@/lib/lesson-authoring-contract";
import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

import {
  runHtmlScreenPlanningSkill,
  runLessonGenerationSkill,
  runLessonGenerationWithPostProcess,
  runServerHtmlScreenPlanningSkill,
} from "./index";
import { runModelOperationWithRetry } from "./lesson_generation_skill";

vi.mock("@/mastra/models", () => ({
  createChatModel: vi.fn((modelId: string) => ({
    modelId,
    provider: "mock-provider",
  })),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();

  return {
    ...actual,
    generateText: vi.fn(),
    streamText: vi.fn(),
  };
});

const workflow = {
  system: "system prompt",
  generationPlan: {
    maxSteps: 5,
  },
} as LessonWorkflowOutput;

const concreteLessonPlan = JSON.parse(
  JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN).replaceAll("XXX", "lesson"),
);
const concreteLessonHeader = {
  meta: concreteLessonPlan.meta,
  subtitle: concreteLessonPlan.subtitle,
  teacher: concreteLessonPlan.teacher,
  title: concreteLessonPlan.title,
};
const concreteLessonTeachingDesign = {
  flowSummary: concreteLessonPlan.flowSummary,
  keyDifficultPoints: concreteLessonPlan.keyDifficultPoints,
  learningObjectives: concreteLessonPlan.learningObjectives,
  narrative: concreteLessonPlan.narrative,
};
const concreteLessonExecution = {
  periodPlan: concreteLessonPlan.periodPlan,
  venueEquipment: concreteLessonPlan.venueEquipment,
};
const concreteLessonAssessmentLoad = {
  evaluation: concreteLessonPlan.evaluation,
  loadEstimate: concreteLessonPlan.loadEstimate,
};
concreteLessonPlan.periodPlan.rows[0].content = ["体能唤醒和移动热身"];
concreteLessonPlan.periodPlan.rows[1].content = ["慢速护球练习、变向接力、星级闯关"];
concreteLessonPlan.periodPlan.rows[1].methods.teacher = ["示范低重心控球与变向保护，按学生表现调整闯关难度。"];
concreteLessonPlan.periodPlan.rows[1].methods.students = ["在穿梭、接力和闯关中完成观察、尝试、合作与展示。"];
const placeholderLessonPlan = JSON.parse(
  JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN).replaceAll("XXX", "待补充"),
);
const lessonProtocolText = `
@lesson
title=篮球行进间运球
topic=篮球行进间运球
grade=三年级
student_count=40人
lesson_no=第1课时
@section narrative.guiding_thought
坚持健康第一，通过游戏化练习提升篮球行进间运球能力。
@section narrative.textbook_analysis
行进间运球是篮球基础技能的重要内容。
@section narrative.student_analysis
三年级学生已有原地运球经验，但移动中控球稳定性仍需提升。
@section objectives.sport_ability
能在慢跑中完成连续行进间运球。
@section objectives.health_behavior
能保持安全距离并调整练习节奏。
@section objectives.sport_morality
能遵守规则并鼓励同伴。
@flow
part=准备部分
time=8分钟
content=体能唤醒和移动热身
teacher=组织热身并提示安全距离
students=按队形完成热身
organization=四列横队
@flow
part=基本部分
time=27分钟
content=行进间运球和绕桶接力
teacher=示范动作并巡回指导
students=分组练习并完成挑战
organization=四组纵队
@flow
part=结束部分
time=5分钟
content=放松拉伸和课堂评价
teacher=组织放松并总结
students=自评互评并整理器材
organization=圆形队伍
@evaluation
level=三颗星
description=能稳定完成行进间运球并遵守规则。
@evaluation
level=二颗星
description=能基本完成运球接力，偶有失误。
@evaluation
level=一颗星
description=能积极参与练习但控球仍需加强。
@equipment
venue=半个篮球场
equipment=篮球20个
equipment=标志桶8个
@safety
保持前后左右安全距离。
绕桶返回时不得逆向穿插。
@load
load_level=中等偏上
target_heart_rate_range=140-155次/分钟
average_heart_rate=145次/分钟
group_density=约75%
individual_density=约45%
rationale=准备部分逐步升温，基本部分保持中高强度，结束部分放松恢复。
`;

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

async function readNextWithTimeout(
  reader: ReadableStreamDefaultReader<UIMessageChunk>,
  timeoutMs = 500,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("stream read timed out")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

describe("generation skills", () => {
  beforeEach(() => {
    vi.mocked(generateText).mockReset();
    vi.mocked(streamText).mockReset();
    vi.unstubAllEnvs();
  });

  it("server-side lesson generation uses structured block schemas when structured outputs are enabled", async () => {
    vi.stubEnv("AI_BASE_URL", "http://proxy.example.test/v1");
    vi.stubEnv("AI_SUPPORTS_STRUCTURED_OUTPUTS", "true");
    vi.mocked(generateText)
      .mockResolvedValueOnce({
        output: concreteLessonHeader,
      } as Awaited<ReturnType<typeof generateText>>)
      .mockResolvedValueOnce({
        output: concreteLessonTeachingDesign,
      } as Awaited<ReturnType<typeof generateText>>)
      .mockResolvedValueOnce({
        output: concreteLessonExecution,
      } as Awaited<ReturnType<typeof generateText>>)
      .mockResolvedValueOnce({
        output: concreteLessonAssessmentLoad,
      } as Awaited<ReturnType<typeof generateText>>);
    const messages = [
      {
        id: "user-structured-blocks",
        role: "user",
        parts: [{ type: "text", text: "生成三年级篮球行进间运球课" }],
      },
    ] as SmartEduUIMessage[];

    const result = await runLessonGenerationSkill({
      messages,
      modelId: "gpt-5.5",
      requestId: "request-structured-blocks",
      serverSide: true,
      workflow,
    });
    const chunks = await readAll(result.stream);
    const partials = [];

    await expect(result.finalLessonPlanPromise).resolves.toMatchObject({
      meta: concreteLessonPlan.meta,
      title: concreteLessonPlan.title,
    });
    for await (const partial of result.partialOutputStream ?? []) {
      partials.push(partial);
    }

    expect(partials).toHaveLength(4);
    expect(partials[0]).toMatchObject({ title: concreteLessonPlan.title });
    expect(partials[1]).toMatchObject({ learningObjectives: concreteLessonPlan.learningObjectives });
    expect(partials[2]).toMatchObject({ periodPlan: concreteLessonPlan.periodPlan });
    expect(partials[3]).toMatchObject({ evaluation: concreteLessonPlan.evaluation });
    expect(generateText).toHaveBeenCalledTimes(4);
    expect(streamText).not.toHaveBeenCalled();
    const generateTextCalls = vi.mocked(generateText).mock.calls;
    expect(generateTextCalls[0]?.[0]).toEqual(
      expect.objectContaining({
        model: expect.anything(),
        system: expect.stringContaining("标题与元数据子块"),
      }),
    );
    expect(JSON.stringify(generateTextCalls[0]?.[0].messages)).toContain("现在只生成“课时计划标题与元数据子块”");
    expect(generateTextCalls[3]?.[0]).toEqual(
      expect.objectContaining({
        system: expect.stringContaining("评价与运动负荷子块"),
      }),
    );
    expect(JSON.stringify(generateTextCalls[3]?.[0].messages)).toContain("已确定的前置结构数据如下");
    expect(chunks).toEqual([expect.objectContaining({ type: "finish", finishReason: "stop" })]);
  });

  it("server-side lesson generation falls back to the custom line protocol when structured block generation fails", async () => {
    vi.stubEnv("AI_BASE_URL", "http://proxy.example.test/v1");
    vi.stubEnv("AI_SUPPORTS_STRUCTURED_OUTPUTS", "true");
    vi.mocked(generateText).mockRejectedValueOnce(new Error("schema block failed"));
    vi.mocked(streamText).mockReturnValueOnce({
      text: Promise.resolve(lessonProtocolText),
    } as unknown as ReturnType<typeof streamText>);
    const messages = [
      {
        id: "user-structured-fallback",
        role: "user",
        parts: [{ type: "text", text: "生成三年级篮球行进间运球课" }],
      },
    ] as SmartEduUIMessage[];

    const result = await runLessonGenerationSkill({
      messages,
      modelId: "gpt-5.5",
      requestId: "request-structured-fallback",
      serverSide: true,
      workflow,
    });
    await expect(result.finalLessonPlanPromise).resolves.toMatchObject({
      meta: {
        topic: "篮球行进间运球",
      },
      title: "篮球行进间运球",
    });
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.objectContaining({ modelId: "gpt-5.5" }),
        system: expect.stringContaining("@lesson"),
      }),
    );
  });

  it("server-side lesson generation uses structured block streaming even when structured outputs are disabled", async () => {
    vi.stubEnv("AI_BASE_URL", "http://proxy.example.test/v1");
    vi.stubEnv("AI_SUPPORTS_STRUCTURED_OUTPUTS", "false");
    vi.mocked(generateText)
      .mockResolvedValueOnce({
        text: `说明\n${JSON.stringify(concreteLessonHeader)}\n结束`,
      } as Awaited<ReturnType<typeof generateText>>)
      .mockResolvedValueOnce({
        text: `\`\`\`json\n${JSON.stringify(concreteLessonTeachingDesign)}\n\`\`\``,
      } as Awaited<ReturnType<typeof generateText>>)
      .mockResolvedValueOnce({
        text: JSON.stringify(concreteLessonExecution),
      } as Awaited<ReturnType<typeof generateText>>)
      .mockResolvedValueOnce({
        text: JSON.stringify(concreteLessonAssessmentLoad),
      } as Awaited<ReturnType<typeof generateText>>);
    const messages = [
      {
        id: "user-protocol",
        role: "user",
        parts: [{ type: "text", text: "生成三年级篮球行进间运球课" }],
      },
    ] as SmartEduUIMessage[];

    const result = await runLessonGenerationSkill({
      messages,
      modelId: "mimo-v2.5-pro",
      requestId: "request-protocol",
      serverSide: true,
      workflow,
    });
    const chunks = await readAll(result.stream);
    const partials = [];

    await expect(result.finalLessonPlanPromise).resolves.toMatchObject({
      meta: concreteLessonPlan.meta,
      title: concreteLessonPlan.title,
    });
    for await (const partial of result.partialOutputStream ?? []) {
      partials.push(partial);
    }

    expect(partials).toHaveLength(4);
    expect(generateText).toHaveBeenCalledTimes(4);
    expect(vi.mocked(generateText).mock.calls.every(([options]) => !("output" in options))).toBe(true);
    expect(streamText).not.toHaveBeenCalled();
    expect(chunks).toEqual([expect.objectContaining({ type: "finish", finishReason: "stop" })]);
  });

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
        maxSteps: 5,
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
    await expect(result.finalLessonPlanPromise).resolves.toEqual(concreteLessonPlan);
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
    const mastraOutput = {
      object: Promise.resolve({
        _thinking_process: "先设计教学流程。",
        lessonPlan: concreteLessonPlan,
      }),
    } as unknown as MastraModelOutput<AgentLessonGenerationResult>;
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

    const chunks = await readAll(result.stream);

    expect(partials).toEqual([]);
    await expect(result.finalLessonPlanPromise).resolves.toEqual(concreteLessonPlan);
    expect(chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text-start", id: "lesson-json" }),
        expect.objectContaining({ type: "finish", finishReason: "stop" }),
      ]),
    );
    expect(agentStream).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ role: "user" })]),
      expect.objectContaining({
        maxSteps: 5,
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

  it("lesson generation prefers submit_lesson_plan tool input over legacy structured output", async () => {
    const submittedLessonPlan = JSON.parse(JSON.stringify(concreteLessonPlan));
    submittedLessonPlan.title = "tool-submitted-lesson";
    const convertedStream = new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue({
          type: "tool-input-available",
          toolCallId: "tool-1",
          toolName: "submit_lesson_plan",
          input: {
            lessonPlan: submittedLessonPlan,
            summary: "使用工具提交最终课时计划",
          },
        } as UIMessageChunk);
        controller.enqueue({ type: "finish", finishReason: "stop" });
        controller.close();
      },
    });
    const mastraOutput = {
      object: Promise.resolve({
        _thinking_process: "legacy fallback",
        lessonPlan: concreteLessonPlan,
      }),
    } as unknown as MastraModelOutput<AgentLessonGenerationResult>;
    const agentStream = vi.fn().mockResolvedValue(mastraOutput);
    const toUIMessageStream = vi.fn().mockReturnValue(convertedStream);

    const result = await runLessonGenerationSkill({
      agentStream,
      messages: [
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "生成篮球课" }],
        },
      ] as SmartEduUIMessage[],
      requestId: "request-tool-first",
      toUIMessageStream,
      workflow,
    });

    await expect(result.finalLessonPlanPromise).resolves.toMatchObject({
      title: "tool-submitted-lesson",
    });
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

  it("post-processing keeps successful drafts and emits validate trace", async () => {
    const convertedStream = new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue({ type: "finish", finishReason: "stop" });
        controller.close();
      },
    });
    const agentStream = vi.fn().mockResolvedValue({
      object: Promise.resolve({
        _thinking_process: "先设计教学流程。",
        lessonPlan: concreteLessonPlan,
      }),
    } as Partial<MastraModelOutput<AgentLessonGenerationResult>>);
    const onTrace = vi.fn();
    const messages = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "生成五年级篮球行进间运球课时计划" }],
      },
    ] as SmartEduUIMessage[];

    const result = await runLessonGenerationWithPostProcess({
      agentStream,
      messages,
      onTrace,
      requestId: "request-repair-skip",
      toUIMessageStream: () => convertedStream,
      workflow,
    });

    await expect(result.finalLessonPlanPromise).resolves.toEqual(concreteLessonPlan);
    expect(onTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        step: "validate-lesson-output",
        status: "success",
      }),
    );
  });

  it("lesson generation appends textbook citations into textbook analysis when retrieval references exist", async () => {
    const structuredGenerate = vi.fn().mockResolvedValue(concreteLessonPlan);
    const workflowWithTextbook = {
      ...workflow,
      textbook: {
        market: "cn-compulsory-2022",
        stage: "小学",
        referenceCount: 1,
        references: [
          {
            id: "textbook-ref-1",
            title: "篮球 - 三年级 - 教学建议 - 第 161-161 页",
            summary: "小篮球教材建议从原地运球过渡到行进间运球。",
            citation: "义务教育教师用书 体育与健康 3至4年级 全一册，人教版，第 161-161 页",
            publisher: "人教版",
            textbookName: "义务教育教师用书 体育与健康 3至4年级 全一册",
            edition: "3至4年级",
            grade: "3至4年级",
            level: "水平二",
            module: "篮球",
            sectionPath: ["球类活动", "小篮球", "教学建议"],
            sourceKind: "teacher-guide",
            score: 90,
          },
        ],
      },
    } as LessonWorkflowOutput;

    const result = await runLessonGenerationWithPostProcess({
      messages: [
        {
          id: "user-textbook-citation",
          role: "user",
          parts: [{ type: "text", text: "生成三年级篮球行进间运球课时计划" }],
        },
      ] as SmartEduUIMessage[],
      requestId: "request-textbook-citation",
      structuredGenerate,
      workflow: workflowWithTextbook,
    });

    await expect(result.finalLessonPlanPromise).resolves.toMatchObject({
      narrative: {
        textbookAnalysis: expect.arrayContaining([
          expect.stringContaining("教材依据：人教版，3至4年级《义务教育教师用书 体育与健康 3至4年级 全一册》篮球"),
        ]),
      },
    });
  });

  it("business validation issues no longer trigger a second repair round when the first draft still contains placeholders", async () => {
    const convertedStream = new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue({ type: "finish", finishReason: "stop" });
        controller.close();
      },
    });
    const agentStream = vi.fn().mockResolvedValue({
      object: Promise.resolve({
        _thinking_process: "先设计教学流程。",
        lessonPlan: placeholderLessonPlan,
      }),
    } as Partial<MastraModelOutput<AgentLessonGenerationResult>>);
    const onTrace = vi.fn();
    const messages = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "生成五年级篮球行进间运球课时计划" }],
      },
    ] as SmartEduUIMessage[];

    const result = await runLessonGenerationWithPostProcess({
      agentStream,
      messages,
      onTrace,
      requestId: "request-repair-once",
      toUIMessageStream: () => convertedStream,
      workflow,
    });

    await expect(result.finalLessonPlanPromise).resolves.toEqual(placeholderLessonPlan);
    expect(onTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        step: "validate-lesson-output",
        status: "success",
      }),
    );
    expect(onTrace).not.toHaveBeenCalledWith(
      expect.objectContaining({
        step: "lesson-repair-started",
      }),
    );
  });

  it("protocol-based server generation no longer enters repair flow after business validation issues", async () => {
    vi.mocked(streamText).mockReturnValueOnce({
      text: Promise.resolve(lessonProtocolText.replace("篮球行进间运球", "待补充")),
    } as unknown as ReturnType<typeof streamText>);
    const onTrace = vi.fn();
    const messages = [
      {
        id: "user-protocol-repair",
        role: "user",
        parts: [{ type: "text", text: "生成一节篮球课" }],
      },
    ] as SmartEduUIMessage[];

    const result = await runLessonGenerationWithPostProcess({
      messages,
      onTrace,
      requestId: "request-protocol-repair",
      serverSide: true,
      workflow,
    });

    await expect(result.finalLessonPlanPromise).resolves.toMatchObject({
      title: "待补充",
    });
    expect(onTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        step: "validate-lesson-output",
        status: "success",
      }),
    );
    expect(onTrace).not.toHaveBeenCalledWith(
      expect.objectContaining({
        step: "lesson-repair-started",
      }),
    );
  });

  it("html screen planning uses an agent-generated section plan and merges deterministic details", async () => {
    const agentPlan: HtmlScreenPlan = {
      visualSystem: "统一清爽的体育课堂投屏系统，首页和教学页共享同一套色彩、按钮、倒计时和图形语言。",
      sections: [
        {
          title: "篮球行进间运球",
          pageRole: "cover",
          pagePrompt: "生成首页封面，大标题居中，学校和教师姓名位于标题下方，并呈现开始上课按钮视觉。",
          reason: "首页作为课堂启动页。",
        },
        ...concreteLessonPlan.periodPlan.rows.map((row: { content: string[]; time: string }, index: number) => ({
          title: `${row.content[0]}-${index}`,
          durationSeconds: 120,
          sourceRowIndex: index,
          pagePrompt: `为 ${row.content[0]} 生成页面片段。`,
          reason: "Agent 根据课堂环节重新规划页面。",
        })),
      ],
    };
    const agentGenerate = vi.fn().mockResolvedValue(fullOutput(agentPlan));

    const result = await runHtmlScreenPlanningSkill({
      additionalInstructions: "隐藏执行说明：优先突出比赛展示。",
      agentGenerate,
      lessonPlan: JSON.stringify(concreteLessonPlan),
      maxSteps: 2,
      requestId: "request-plan",
    });

    expect(result.source).toBe("agent");
    expect(result.modelMessageCount).toBe(1);
    expect(result.plan.visualSystem).toContain("统一清爽");
    expect(result.plan.sections).toHaveLength(concreteLessonPlan.periodPlan.rows.length + 1);
    expect(result.plan.sections[0]).toMatchObject({
      pageRole: "cover",
      title: "篮球行进间运球",
    });
    expect(result.plan.sections[1]).toMatchObject({
      objective: expect.stringContaining("体能唤醒和移动热身"),
      sourceRowIndex: 0,
      title: "体能唤醒和移动热身-0",
      visualMode: "html",
      pagePrompt: "为 体能唤醒和移动热身 生成页面片段。",
    });
    expect(agentGenerate).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ role: "user" })]),
      expect.objectContaining({
        maxSteps: 2,
        system: expect.stringContaining("隐藏执行说明"),
        structuredOutput: expect.objectContaining({
          schema: expect.any(Object),
        }),
      }),
    );
  });

  it("server html screen planning parses the custom line protocol without schema-bound output", async () => {
    const sectionProtocol = concreteLessonPlan.periodPlan.rows
      .map((row: { content: string[]; time: string }, index: number) =>
        [
          "@section",
          `title=${row.content[0]}-${index}`,
          "page_role=learnPractice",
          `source_row_index=${index}`,
          "duration_seconds=120",
          `objective=组织学生完成 ${row.content[0]}。`,
          "student_actions=看清任务；保持距离；听口令切换",
          "safety_cue=前后左右保持安全距离，听到停止口令立即停球。",
          "evaluation_cue=观察控球稳定性和规则执行情况。",
          "visual_intent=使用清晰路线和任务模块帮助学生理解练习顺序。",
          "visual_mode=html",
          `page_prompt=为 ${row.content[0]} 生成页面片段。`,
          "reason=Agent 根据课堂环节重新规划页面。",
        ].join("\n"),
      )
      .join("\n\n");
    vi.mocked(generateText).mockResolvedValueOnce({
      text: [
        "@visual_system",
        "统一清爽的体育课堂投屏系统，首页和教学页共享同一套色彩、按钮、倒计时和图形语言。",
        "",
        "@section",
        "title=篮球行进间运球",
        "page_role=cover",
        "visual_mode=html",
        "page_prompt=生成首页封面，大标题居中，学校和教师姓名位于标题下方，并呈现开始上课按钮视觉。",
        "reason=首页作为课堂启动页。",
        "",
        sectionProtocol,
      ].join("\n"),
    } as Awaited<ReturnType<typeof generateText>>);

    const result = await runServerHtmlScreenPlanningSkill({
      additionalInstructions: "优先突出比赛展示。",
      lessonPlan: JSON.stringify(concreteLessonPlan),
      maxSteps: 2,
      modelId: "mimo-v2.5-pro",
      requestId: "request-plan-server",
    });

    expect(result.plan.sections[0]).toMatchObject({
      pageRole: "cover",
      title: "篮球行进间运球",
    });
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.objectContaining({ modelId: "mimo-v2.5-pro" }),
        system: expect.stringContaining("你必须只输出“自定义 HTML 分镜行协议”文本"),
      }),
    );
    expect(generateText).toHaveBeenCalledWith(
      expect.not.objectContaining({
        output: expect.anything(),
      }),
    );
  });

  it("html screen planning fails when the planning agent fails by default", async () => {
    const agentGenerate = vi.fn().mockRejectedValue(new Error("planner schema failed"));

    await expect(
      runHtmlScreenPlanningSkill({
        agentGenerate,
        lessonPlan: JSON.stringify(concreteLessonPlan),
        maxSteps: 2,
        requestId: "request-plan-failed",
      }),
    ).rejects.toThrow("HTML 大屏 Agent 分镜规划失败：planner schema failed");
  });

  it("server html generation uses section page prompts in parallel and assembles one document", async () => {
    vi.mocked(generateText)
      .mockImplementationOnce(async () => ({ text: "<div>首页片段</div>" }) as Awaited<ReturnType<typeof generateText>>)
      .mockImplementationOnce(async () => ({ text: "<div>片段A</div>" }) as Awaited<ReturnType<typeof generateText>>)
      .mockImplementationOnce(async () => ({ text: "<div>片段B</div>" }) as Awaited<ReturnType<typeof generateText>>);
    const { runServerHtmlGenerationSkill } = await import("./server_html_generation_skill");
    const screenPlan: HtmlScreenPlan = {
      visualSystem: "统一清爽的体育课堂投屏系统，首页和教学页共享同一套色彩、按钮、倒计时和图形语言。",
      sections: [
        {
          title: "篮球行进间运球",
          pageRole: "cover",
          pagePrompt: "生成首页封面，大标题居中，学校和教师姓名位于标题下方，并呈现开始上课按钮视觉。",
        },
        {
          title: "热身",
          pageRole: "warmup",
          durationSeconds: 180,
          pagePrompt: "生成热身页面片段，自由选择最适合远距离投屏的视觉表达。",
        },
        {
          title: "比赛",
          pageRole: "competition",
          durationSeconds: 300,
          pagePrompt: "生成比赛页面片段，自由设计规则、挑战目标和即时评价呈现。",
        },
      ],
    };

    const stream = await runServerHtmlGenerationSkill({
      lessonPlan: JSON.stringify(concreteLessonPlan),
      messages: [
        {
          id: "user-html",
          role: "user",
          parts: [{ type: "text", text: "生成互动大屏" }],
        },
      ] as SmartEduUIMessage[],
      requestId: "request-html-sections",
      screenPlan,
      workflow,
    });
    const chunks = await readAll(stream);
    const html = chunks
      .filter((chunk): chunk is Extract<UIMessageChunk, { type: "text-delta" }> => chunk.type === "text-delta")
      .map((chunk) => chunk.delta)
      .join("");

    expect(generateText).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(vi.mocked(generateText).mock.calls[0]?.[0].messages)).toContain(
      "生成首页封面",
    );
    expect(JSON.stringify(vi.mocked(generateText).mock.calls[0]?.[0].messages)).toContain(
      "cover-content",
    );
    expect(JSON.stringify(vi.mocked(generateText).mock.calls[1]?.[0].messages)).toContain(
      "生成热身页面片段",
    );
    expect(JSON.stringify(vi.mocked(generateText).mock.calls[2]?.[0].messages)).toContain(
      "生成比赛页面片段",
    );
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("首页片段");
    expect(html).toContain("片段A");
    expect(html).toContain("片段B");
    expect(html).toContain("data-start");
    expect(html).toContain("color-scheme: dark");
    expect(html).toContain("cover-shell");
    expect(html).toContain("cover-stage");
    expect(html).toContain("justify-self: center");
    expect(html).toContain('controls.style.display = index === 0 ? "none" : "flex";');
    expect(html).toContain("glass-panel");
    expect(html).not.toContain("backdrop-filter");
    expect(html).not.toContain("@keyframes ambientShift");
    expect(html).not.toContain("data-support-module=");
  });

  it("server html generation streams tool calls and preview artifact before section HTML completes", async () => {
    vi.mocked(generateText).mockReset();
    let resolveSection: ((value: Awaited<ReturnType<typeof generateText>>) => void) | undefined;
    vi.mocked(generateText).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSection = resolve as (value: Awaited<ReturnType<typeof generateText>>) => void;
        }) as ReturnType<typeof generateText>,
    );
    const { runServerHtmlGenerationSkill } = await import("./server_html_generation_skill");
    const screenPlan: HtmlScreenPlan = {
      visualSystem: "统一清爽的体育课堂投屏系统。",
      sections: [
        {
          title: "课堂首页",
          pageRole: "cover",
          pagePrompt: "生成首页封面。",
        },
      ],
    };

    const stream = await runServerHtmlGenerationSkill({
      lessonPlan: JSON.stringify(concreteLessonPlan),
      messages: [
        {
          id: "user-html-streaming",
          role: "user",
          parts: [{ type: "text", text: "生成互动大屏" }],
        },
      ] as SmartEduUIMessage[],
      requestId: "request-html-streaming",
      screenPlan,
      workflow,
    });
    const reader = stream.getReader();
    const earlyChunks: UIMessageChunk[] = [];

    while (
      !earlyChunks.some((chunk) => chunk.type === "data-artifact") ||
      !earlyChunks.some(
        (chunk) => chunk.type === "tool-input-start" && chunk.toolName === "generateHtmlScreenSection",
      )
    ) {
      const { done, value } = await readNextWithTimeout(reader);

      if (done) {
        throw new Error("HTML stream ended before early tool and artifact chunks were emitted.");
      }

      earlyChunks.push(value);
    }

    expect(generateText).toHaveBeenCalledTimes(1);
    expect(earlyChunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool-input-start",
          toolName: "generateHtmlScreenVisualAssets",
        }),
        expect.objectContaining({
          type: "tool-input-start",
          toolName: "generateHtmlScreenSection",
        }),
        expect.objectContaining({
          type: "data-artifact",
          data: expect.objectContaining({
            contentType: "html",
            isComplete: false,
            status: "streaming",
          }),
        }),
      ]),
    );

    resolveSection?.({ text: "<div>首页片段</div>" } as Awaited<ReturnType<typeof generateText>>);

    const remainingChunks: UIMessageChunk[] = [];
    while (true) {
      const { done, value } = await readNextWithTimeout(reader);

      if (done) {
        break;
      }

      remainingChunks.push(value);
    }

    const allChunks = [...earlyChunks, ...remainingChunks];
    const html = allChunks
      .filter((chunk): chunk is Extract<UIMessageChunk, { type: "text-delta" }> => chunk.type === "text-delta")
      .map((chunk) => chunk.delta)
      .join("");

    expect(allChunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool-output-available",
          toolCallId: "request-html-streaming-html-section-1",
        }),
      ]),
    );
    expect(html).toContain("首页片段");
  });

  it("server html generation limits concurrent section calls", async () => {
    vi.mocked(generateText).mockReset();
    vi.stubEnv("AI_HTML_SECTION_CONCURRENCY", "2");
    let inFlight = 0;
    let maxInFlight = 0;
    vi.mocked(generateText).mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight -= 1;

      return { text: "<div>片段</div>" } as Awaited<ReturnType<typeof generateText>>;
    });
    const { runServerHtmlGenerationSkill } = await import("./server_html_generation_skill");
    const screenPlan: HtmlScreenPlan = {
      visualSystem: "统一清爽的体育课堂投屏系统，首页和教学页共享同一套色彩、按钮、倒计时和图形语言。",
      sections: [
        {
          title: "课堂首页",
          pageRole: "cover",
          pagePrompt: "生成首页封面。",
        },
        ...Array.from({ length: 4 }, (_, index) => ({
          title: `分镜${index + 1}`,
          durationSeconds: 120,
          pagePrompt: `生成第 ${index + 1} 页。`,
        })),
      ],
    };

    await readAll(
      await runServerHtmlGenerationSkill({
        lessonPlan: JSON.stringify(concreteLessonPlan),
        messages: [
          {
            id: "user-html-concurrency",
            role: "user",
            parts: [{ type: "text", text: "生成互动大屏" }],
          },
        ] as SmartEduUIMessage[],
        requestId: "request-html-concurrency",
        screenPlan,
        workflow,
      }),
    );

    expect(generateText).toHaveBeenCalledTimes(5);
    expect(maxInFlight).toBeLessThanOrEqual(2);
    vi.unstubAllEnvs();
  });

  it("server html generation renders image visual assets without calling the HTML model for that page", async () => {
    vi.mocked(generateText).mockReset();
    vi.mocked(generateText).mockImplementationOnce(
      async () => ({ text: "<div>首页片段</div>" }) as Awaited<ReturnType<typeof generateText>>,
    );
    const { runServerHtmlGenerationSkill } = await import("./server_html_generation_skill");
    const screenPlan: HtmlScreenPlan = {
      visualSystem: "统一清爽的体育课堂投屏系统，首页和教学页共享同一套色彩、按钮、倒计时和图形语言。",
      sections: [
        {
          title: "课堂首页",
          pageRole: "cover",
          pagePrompt: "生成首页封面。",
        },
        {
          title: "五步拳动作学习",
          pageRole: "learnPractice",
          durationSeconds: 600,
          objective: "看图理解五步拳动作结构，并完成分解练习。",
          studentActions: ["观察动作顺序", "跟随口令练习", "同伴互评动作稳定性"],
          safetyCue: "四列横队散开，前后左右保持一臂距离。",
          evaluationCue: "观察弓步、马步和冲拳方向是否稳定清晰。",
          visualMode: "image",
          visualAsset: {
            alt: "五步拳动作学习辅助讲解图",
            aspectRatio: "16:9",
            caption: "五步拳动作学习",
            height: 900,
            imageUrl:
              "/api/projects/33333333-3333-3333-3333-333333333333/artifact-images/html-screen-visuals/request-html-image-section/01-demo.png",
            source: "ai-generated",
            width: 1600,
          },
          imagePrompt: "生成一张 16:9 横板五步拳动作辅助讲解图。",
          pagePrompt: "本页使用生图资产作为主体，叠加少量动作提示。",
        },
      ],
    };

    const stream = await runServerHtmlGenerationSkill({
      lessonPlan: JSON.stringify(concreteLessonPlan),
      messages: [
        {
          id: "user-html-image",
          role: "user",
          parts: [{ type: "text", text: "生成五步拳互动大屏" }],
        },
      ] as SmartEduUIMessage[],
      requestId: "request-html-image-section",
      screenPlan,
      workflow,
    });
    const chunks = await readAll(stream);
    const html = chunks
      .filter((chunk): chunk is Extract<UIMessageChunk, { type: "text-delta" }> => chunk.type === "text-delta")
      .map((chunk) => chunk.delta)
      .join("");

    expect(generateText).toHaveBeenCalledTimes(1);
    expect(html).toContain("teaching-image-layout");
    expect(html).toContain(
      "/api/projects/33333333-3333-3333-3333-333333333333/artifact-images/html-screen-visuals/request-html-image-section/01-demo.png",
    );
    expect(html).toContain("看图理解五步拳动作结构");
    expect(html).toContain("data-duration=\"600\"");
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
