import type { FullOutput } from "@mastra/core/stream";
import { generateText, streamText, type UIMessageChunk } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_COMPETITION_LESSON_PLAN,
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
concreteLessonPlan.subtitle = "——lesson·lesson";
concreteLessonPlan.periodPlan.rows[0].content = ["体能唤醒和移动热身"];
concreteLessonPlan.periodPlan.rows[1].content = ["慢速护球练习、变向接力、星级闯关"];
concreteLessonPlan.periodPlan.rows[1].methods.teacher = ["示范低重心控球与变向保护，按学生表现调整闯关难度。"];
concreteLessonPlan.periodPlan.rows[1].methods.students = ["在穿梭、接力和闯关中完成观察、尝试、合作与展示。"];
const placeholderLessonPlan = JSON.parse(
  JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN).replaceAll("XXX", "待补充"),
);

const completeLessonProtocol = `
@lesson
title=篮球三步上篮
topic=篮球三步上篮
grade=七年级
student_count=40人
lesson_no=第1课时
level=水平四
teacher_school=未提供学校
teacher_name=未提供教师

@section narrative.guiding_thought
坚持健康第一，以学生发展为中心，通过学练赛一体化活动提升篮球三步上篮能力。

@section narrative.textbook_analysis
三步上篮是篮球进攻技术的重要内容，有助于学生建立移动中接球、起跳和投篮衔接意识。

@section narrative.student_analysis
七年级学生已有基本运球和投篮经验，但跨步节奏、起跳脚选择和身体控制仍需加强。

@section objectives.sport_ability
能说出三步上篮一大二小三高跳的动作要点。
能在慢速推进中完成三步上篮动作。

@section objectives.health_behavior
能根据练习强度调整呼吸和节奏。
能在上篮和返回路线中保持安全距离。

@section objectives.sport_morality
能遵守轮换规则。
能主动鼓励同伴并公平参与小组挑战。

@flow
part=准备部分
time=8分钟
intensity=中
content=课堂常规、专项热身、球性练习
teacher=讲解安全要求，组织热身，提示控球节奏
students=按队形完成热身，跟随口令进行球性练习
organization=四列横队散点展开

@flow
part=基本部分
time=27分钟
intensity=中高
content=三步上篮技术学练、分组练习、教学比赛、体能练习
teacher=示范动作，分层指导，纠正跨步节奏和起跳脚错误
students=分组练习，观察同伴动作，完成上篮挑战
organization=四组轮换，篮下安全间隔布置

@flow
part=结束部分
time=5分钟
intensity=低
content=放松拉伸、课堂评价、课后练习布置
teacher=组织放松，总结表现，布置家庭练习
students=完成拉伸，自评互评，整理器材
organization=圆形队伍集中

@evaluation
level=三颗星
description=能稳定完成三步上篮，节奏清楚，并能遵守轮换规则。

@evaluation
level=二颗星
description=能基本完成三步上篮，偶有跨步或出手失误。

@evaluation
level=一颗星
description=能积极参与练习，但步伐衔接和规则意识仍需加强。

@equipment
venue=篮球场
equipment=篮球20个
equipment=标志桶8个

@safety
保持前后左右安全距离。
上篮后从侧面返回，不得逆向穿插。
球滚出练习区时先观察再捡球。

@load
load_level=中等偏上
target_heart_rate_range=140-155次/分钟
average_heart_rate=145次/分钟
group_density=约75%
individual_density=约45%
rationale=准备部分逐步升温，基本部分通过分组轮换和上篮挑战形成中高强度，结束部分放松恢复。
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

  it("server-side lesson generation uses one lesson line protocol pass and local parser", async () => {
    vi.stubEnv("AI_BASE_URL", "http://proxy.example.test/v1");
    vi.mocked(streamText).mockReturnValueOnce({
      text: Promise.resolve(completeLessonProtocol),
    } as ReturnType<typeof streamText>);
    const messages = [
      {
        id: "user-protocol",
        role: "user",
        parts: [{ type: "text", text: "生成七年级篮球三步上篮课" }],
      },
    ] as SmartEduUIMessage[];

    const result = await runLessonGenerationSkill({
      messages,
      modelId: "gpt-5.5",
      requestId: "request-protocol",
      serverSide: true,
      workflow,
    });
    const chunks = await readAll(result.stream);
    const partials = [];

    await expect(result.finalLessonPlanPromise).resolves.toMatchObject({
      flowSummary: ["课堂常规", "专项热身", "球性游戏", "技术学练", "教学比赛", "放松拉伸"],
      meta: expect.objectContaining({
        grade: "七年级",
        level: "水平四",
        topic: "篮球三步上篮",
      }),
      title: "篮球三步上篮",
    });
    for await (const partial of result.partialOutputStream ?? []) {
      partials.push(partial);
    }

    expect(partials).toHaveLength(0);
    expect(streamText).toHaveBeenCalledTimes(1);
    expect(generateText).not.toHaveBeenCalled();
    const streamTextCalls = vi.mocked(streamText).mock.calls;
    expect(streamTextCalls[0]?.[0]).toEqual(
      expect.objectContaining({
        model: expect.anything(),
        system: expect.stringContaining("自定义教案行协议"),
      }),
    );
    expect(streamTextCalls[0]?.[0]).toEqual(
      expect.objectContaining({
        system: expect.stringContaining("@flow 的 content 只写本段课堂环节短语"),
      }),
    );
    expect(chunks).toEqual([expect.objectContaining({ type: "finish", finishReason: "stop" })]);
  });

  it("server-side lesson generation reports protocol diagnostics when required blocks are missing", async () => {
    vi.stubEnv("AI_BASE_URL", "http://proxy.example.test/v1");
    vi.mocked(streamText).mockReturnValueOnce({
      text: Promise.resolve(`
@lesson
title=跳绳
@flow
part=准备部分
content=热身
@flow
part=结束部分
content=放松
@evaluation
level=三颗星
description=优秀
`),
    } as ReturnType<typeof streamText>);
    const messages = [
      {
        id: "user-protocol-fail",
        role: "user",
        parts: [{ type: "text", text: "生成跳绳课" }],
      },
    ] as SmartEduUIMessage[];

    const result = await runLessonGenerationSkill({
      messages,
      modelId: "gpt-5.5",
      requestId: "request-protocol-fail",
      serverSide: true,
      workflow,
    });

    await expect(result.finalLessonPlanPromise).rejects.toThrow("教案行协议生成失败");
    await expect(result.finalLessonPlanPromise).rejects.toThrow("教案协议缺少 @flow 基本部分");
  });

  it("server-side lesson generation keeps concise flow summary derived by parser", async () => {
    vi.stubEnv("AI_BASE_URL", "http://proxy.example.test/v1");
    vi.mocked(streamText).mockReturnValueOnce({
      text: Promise.resolve(
        completeLessonProtocol.replace(
          "content=课堂常规、专项热身、球性练习",
          "content=课堂常规：集合整队，宣布本课内容与安全要求。2. 球性游戏：学生运球移动，听教师报数后完成反应练习。3. 专项热身：动态拉伸结合高低运球和跨步协调练习。",
        ),
      ),
    } as ReturnType<typeof streamText>);
    const messages = [
      {
        id: "user-flow-summary",
        role: "user",
        parts: [{ type: "text", text: "生成七年级篮球三步上篮课" }],
      },
    ] as SmartEduUIMessage[];

    const result = await runLessonGenerationSkill({
      messages,
      modelId: "gpt-5.5",
      requestId: "request-flow-summary",
      serverSide: true,
      workflow,
    });

    const plan = await result.finalLessonPlanPromise;

    expect(plan.flowSummary.slice(0, 3)).toEqual(["课堂常规", "球性游戏", "专项热身"]);
    expect(plan.flowSummary).not.toContain("课堂评价");
    expect(plan.flowSummary).not.toContain("课后作业");
    expect(plan.flowSummary.every((item) => item.length <= 18)).toBe(true);
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

  it("lesson generation keeps the injected structured generator path", async () => {
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
      requestId: "request-structured-generator",
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

  it("post-processing keeps successful drafts and emits validate trace", async () => {
    const structuredGenerate = vi.fn().mockResolvedValue(concreteLessonPlan);
    const onTrace = vi.fn();
    const messages = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "生成五年级篮球行进间运球课时计划" }],
      },
    ] as SmartEduUIMessage[];

    const result = await runLessonGenerationWithPostProcess({
      messages,
      onTrace,
      requestId: "request-repair-skip",
      structuredGenerate,
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

  it("business validation rejects drafts that still contain placeholders", async () => {
    const structuredGenerate = vi.fn().mockResolvedValue(placeholderLessonPlan);
    const onTrace = vi.fn();
    const messages = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "生成五年级篮球行进间运球课时计划" }],
      },
    ] as SmartEduUIMessage[];

    const result = await runLessonGenerationWithPostProcess({
      messages,
      onTrace,
      requestId: "request-repair-once",
      structuredGenerate,
      workflow,
    });

    await expect(result.finalLessonPlanPromise).rejects.toThrow("结构化课时计划未通过最终业务校验");
    expect(onTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        step: "validate-lesson-output",
        status: "failed",
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
          pagePrompt: "生成首页封面，采用深色沉浸背景，超大标题偏向左侧排版，学校和教师姓名作为 Meta 信息下沉到右下角，并呈现开始上课按钮视觉。",
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
    const plannerMessage = agentGenerate.mock.calls[0]?.[0][0]?.content;
    expect(plannerMessage).not.toContain("教学环节参考草案");
    expect(plannerMessage).not.toContain("统一视觉系统：");
    expect(plannerMessage).toContain("首页元信息 JSON");
    expect(plannerMessage).toContain("已确认课时计划第九部分 JSON");
    expect(plannerMessage).toContain("periodPlan");
    expect(plannerMessage).toContain("venueEquipment");
    expect(plannerMessage).toContain("loadEstimate");
    const coverMetaJson = plannerMessage
      ?.split("首页元信息 JSON（仅用于首页标题、学校、教师、年级人数等 Meta 信息，不用于拆分教学页）：")[1]
      ?.split("已确认课时计划第九部分 JSON")[0]
      ?.trim();
    expect(Object.keys(JSON.parse(coverMetaJson ?? "{}")).sort()).toEqual([
      "meta",
      "subtitle",
      "teacher",
      "title",
    ]);
    const ninthSectionJson = plannerMessage
      ?.split("已确认课时计划第九部分 JSON（仅包含 periodPlan、venueEquipment、loadEstimate）：")[1]
      ?.trim();
    expect(Object.keys(JSON.parse(ninthSectionJson ?? "{}")).sort()).toEqual([
      "loadEstimate",
      "periodPlan",
      "venueEquipment",
    ]);
  });

  it("server html screen planning uses schema-bound structured output", async () => {
    const structuredPlan: HtmlScreenPlan = {
      visualSystem: "统一清爽的体育课堂投屏系统，首页和教学页共享同一套色彩、按钮、倒计时和图形语言。",
      sections: [
        {
          title: "篮球行进间运球",
          pageRole: "cover",
          visualMode: "html",
          pagePrompt: "生成首页封面，采用深色沉浸背景，超大标题偏向左侧排版，学校和教师姓名作为 Meta 信息下沉到右下角，并呈现开始上课按钮视觉。",
          reason: "首页作为课堂启动页。",
        },
        ...concreteLessonPlan.periodPlan.rows.map((row: { content: string[]; time: string }, index: number) => ({
          title: `${row.content[0]}-${index}`,
          pageRole: "learnPractice" as const,
          durationSeconds: 120,
          sourceRowIndex: index,
          objective: `组织学生完成 ${row.content[0]}。`,
          studentActions: ["看清任务", "保持距离", "听口令切换"],
          safetyCue: "前后左右保持安全距离，听到停止口令立即停球。",
          evaluationCue: "观察控球稳定性和规则执行情况。",
          visualIntent: "使用清晰路线和任务模块帮助学生理解练习顺序。",
          visualMode: "html" as const,
          pagePrompt: `为 ${row.content[0]} 生成页面片段。`,
          reason: "Agent 根据课堂环节重新规划页面。",
        })),
      ],
    };
    vi.mocked(generateText).mockResolvedValueOnce({
      output: structuredPlan,
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
        output: expect.anything(),
        system: expect.stringContaining("必须返回可被 HtmlScreenPlan schema 校验的结构化对象"),
      }),
    );
  });

  it("html screen planning throws when the planning agent fails", async () => {
    const agentGenerate = vi.fn().mockRejectedValue(new Error("planner schema failed"));

    await expect(
      runHtmlScreenPlanningSkill({
        agentGenerate,
        lessonPlan: JSON.stringify(concreteLessonPlan),
        maxSteps: 2,
        requestId: "request-plan-failed",
      }),
    ).rejects.toThrow("HTML 大屏分镜规划失败：planner schema failed");
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
          pagePrompt: "生成首页封面，采用深色沉浸背景，超大标题偏向左侧排版，学校和教师姓名作为 Meta 信息下沉到右下角，并呈现开始上课按钮视觉。",
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
      "不要依赖服务端预置类名",
    );
    expect(JSON.stringify(vi.mocked(generateText).mock.calls[1]?.[0].messages)).toContain(
      "生成热身页面片段",
    );
    expect(JSON.stringify(vi.mocked(generateText).mock.calls[2]?.[0].messages)).toContain(
      "生成比赛页面片段",
    );
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<section class="slide"');
    expect(html).toContain("首页片段");
    expect(html).toContain("片段A");
    expect(html).toContain("片段B");
    expect(html).not.toContain("<style>");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("data-start");
    expect(html).not.toContain("color-scheme: dark");
    expect(html).not.toContain("cover-shell");
    expect(html).not.toContain("cover-stage");
    expect(html).not.toContain("glass-panel");
    expect(html).not.toContain("controls.style.display");
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

  it("server html generation returns an error stream when a section enhancement fails", async () => {
    vi.mocked(generateText).mockReset();
    const fatalSectionError = Object.assign(new Error("section schema failed"), { statusCode: 400 });
    vi.mocked(generateText)
      .mockResolvedValueOnce({ text: "<div>首页片段</div>" } as Awaited<ReturnType<typeof generateText>>)
      .mockRejectedValueOnce(fatalSectionError);
    const { runServerHtmlGenerationSkill } = await import("./server_html_generation_skill");
    const screenPlan: HtmlScreenPlan = {
      visualSystem: "统一清爽的体育课堂投屏系统。",
      sections: [
        {
          title: "课堂首页",
          pageRole: "cover",
          pagePrompt: "生成首页封面。",
        },
        {
          title: "脚内侧传球练习",
          pageRole: "learnPractice",
          durationSeconds: 300,
          objective: "掌握脚内侧传球支撑脚站位和击球部位。",
          studentActions: ["两人一组传接球", "看准支撑脚位置", "传球后快速调整"],
          safetyCue: "传球前确认同伴准备好，避免近距离大力踢球。",
          evaluationCue: "观察传球方向、力度和动作连贯性。",
          pagePrompt: "生成脚内侧传球练习页面。",
        },
      ],
    };

    const chunks = await readAll(
      await runServerHtmlGenerationSkill({
        lessonPlan: JSON.stringify(concreteLessonPlan),
        messages: [
          {
            id: "user-html-section-fallback",
            role: "user",
            parts: [{ type: "text", text: "生成足球互动大屏" }],
          },
        ] as SmartEduUIMessage[],
        requestId: "request-html-section-fallback",
        screenPlan,
        workflow,
      }),
    );
    const html = chunks
      .filter((chunk): chunk is Extract<UIMessageChunk, { type: "text-delta" }> => chunk.type === "text-delta")
      .map((chunk) => chunk.delta)
      .join("");

    expect(chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "error",
          errorText: "第 2 页 HTML 生成失败：section schema failed",
        }),
        expect.objectContaining({
          type: "finish",
          finishReason: "error",
        }),
      ]),
    );
    expect(chunks).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool-output-available",
          toolCallId: "request-html-section-fallback-html-section-2",
        }),
      ]),
    );
    expect(chunks).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "data-artifact",
          data: expect.objectContaining({
            contentType: "html",
            isComplete: true,
            status: "ready",
          }),
        }),
      ]),
    );
    expect(JSON.stringify(chunks)).not.toContain("基础片段继续生成");
    expect(html).toBe("");
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

  it("server html generation errors when an image-mode page has no usable visual asset", async () => {
    vi.mocked(generateText).mockReset();
    vi.mocked(generateText).mockImplementationOnce(
      async () => ({ text: "<div>首页片段</div>" }) as Awaited<ReturnType<typeof generateText>>,
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
        {
          title: "动作示意图讲解",
          pageRole: "learnPractice",
          durationSeconds: 240,
          objective: "观察图示并理解动作顺序。",
          studentActions: ["看图识别动作", "跟随口令模仿"],
          safetyCue: "两人之间保持安全距离。",
          evaluationCue: "观察动作顺序是否正确。",
          visualMode: "image",
          imagePrompt: "生成一张 16:9 体育动作讲解图。",
          pagePrompt: "本页以图片讲解为主。",
        },
      ],
    };

    const chunks = await readAll(
      await runServerHtmlGenerationSkill({
        lessonPlan: JSON.stringify(concreteLessonPlan),
        messages: [
          {
            id: "user-html-image-missing-asset",
            role: "user",
            parts: [{ type: "text", text: "生成动作示意大屏" }],
          },
        ] as SmartEduUIMessage[],
        requestId: "request-html-image-missing-asset",
        screenPlan,
        workflow,
      }),
    );

    expect(chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "error",
          errorText: "第 2 页 HTML 生成失败：缺少可用图片资源，无法生成 image 模式页面。",
        }),
        expect.objectContaining({
          type: "finish",
          finishReason: "error",
        }),
      ]),
    );
    expect(chunks).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "data-artifact",
          data: expect.objectContaining({
            isComplete: true,
            status: "ready",
          }),
        }),
      ]),
    );
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
