import { generateText, streamText, type UIMessageChunk } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_COMPETITION_LESSON_PLAN,
} from "@/lib/competition-lesson-contract";
import type { SmartEduUIMessage } from "@/lib/lesson-authoring-contract";
import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

import {
  runLessonGenerationSkill,
  runLessonGenerationWithPostProcess,
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

function mockLessonProtocolStream(text: string) {
  vi.mocked(streamText).mockReturnValueOnce({
    text: Promise.resolve(text),
  } as unknown as ReturnType<typeof streamText>);
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

describe("generation skills", () => {
  beforeEach(() => {
    vi.mocked(generateText).mockReset();
    vi.mocked(streamText).mockReset();
    vi.unstubAllEnvs();
  });

  it("server-side lesson generation uses one lesson line protocol pass and local parser", async () => {
    vi.stubEnv("AI_BASE_URL", "http://proxy.example.test/v1");
    mockLessonProtocolStream(completeLessonProtocol);
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
      workflow,
    });
    const chunks = await readAll(result.stream);

    await expect(result.finalLessonPlanPromise).resolves.toMatchObject({
      flowSummary: ["课堂常规", "专项热身", "球性游戏", "技术学练", "教学比赛", "放松拉伸"],
      meta: expect.objectContaining({
        grade: "七年级",
        level: "水平四",
        topic: "篮球三步上篮",
      }),
      title: "篮球三步上篮",
    });

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
    mockLessonProtocolStream(`
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
`);
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
      workflow,
    });

    await expect(result.finalLessonPlanPromise).rejects.toThrow("教案行协议生成失败");
    await expect(result.finalLessonPlanPromise).rejects.toThrow("教案协议缺少 @flow 基本部分");
  });

  it("server-side lesson generation keeps concise flow summary derived by parser", async () => {
    vi.stubEnv("AI_BASE_URL", "http://proxy.example.test/v1");
    mockLessonProtocolStream(
      completeLessonProtocol.replace(
        "content=课堂常规、专项热身、球性练习",
        "content=课堂常规：集合整队，宣布本课内容与安全要求。2. 球性游戏：学生运球移动，听教师报数后完成反应练习。3. 专项热身：动态拉伸结合高低运球和跨步协调练习。",
      ),
    );
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
      workflow,
    });

    const plan = await result.finalLessonPlanPromise;

    expect(plan.flowSummary.slice(0, 3)).toEqual(["课堂常规", "球性游戏", "专项热身"]);
    expect(plan.flowSummary).not.toContain("课堂评价");
    expect(plan.flowSummary).not.toContain("课后作业");
    expect(plan.flowSummary.every((item) => item.length <= 18)).toBe(true);
  });

  it("post-processing keeps successful drafts and emits validate trace", async () => {
    mockLessonProtocolStream(completeLessonProtocol);
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
      workflow,
    });

    await expect(result.finalLessonPlanPromise).resolves.toMatchObject({
      title: "篮球三步上篮",
    });
    expect(onTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        step: "validate-lesson-output",
        status: "success",
      }),
    );
  });

  it("lesson generation appends textbook citations into textbook analysis when retrieval references exist", async () => {
    mockLessonProtocolStream(completeLessonProtocol);
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
    mockLessonProtocolStream(
      completeLessonProtocol.replace(
        "坚持健康第一，以学生发展为中心，通过学练赛一体化活动提升篮球三步上篮能力。",
        "待补充",
      ),
    );
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

  it("server html generation creates one single-page document from the full storyboard", async () => {
    vi.mocked(streamText).mockReturnValueOnce({
      text: Promise.resolve(
        `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>篮球行进间运球</title>
  <style>body{margin:0;overflow:hidden;background:#0f172a;color:#fff}</style>
</head>
<body>
  <main data-html-screen-document="single-page">
    <h1>篮球行进间运球</h1>
    <div>首页封面</div>
    <div>热身任务</div>
    <div>比赛挑战</div>
  </main>
</body>
</html>`,
      ),
    } as unknown as ReturnType<typeof streamText>);
    const { runServerHtmlGenerationSkill } = await import("./server_html_generation_skill");

    const stream = await runServerHtmlGenerationSkill({
      lessonPlan: JSON.stringify(concreteLessonPlan),
      messages: [
        {
          id: "user-html",
          role: "user",
          parts: [{ type: "text", text: "生成互动大屏" }],
        },
      ] as SmartEduUIMessage[],
      requestId: "request-html-single-page",
      workflow,
    });
    const chunks = await readAll(stream);
    const html = chunks
      .filter((chunk): chunk is Extract<UIMessageChunk, { type: "text-delta" }> => chunk.type === "text-delta")
      .map((chunk) => chunk.delta)
      .join("");

    expect(generateText).toHaveBeenCalledTimes(0);
    expect(streamText).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(streamText).mock.calls[0]?.[0].messages)).toContain("已确认课时计划第九部分 JSON");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('data-html-screen-document="single-page"');
    expect(html).toContain("首页封面");
    expect(html).toContain("热身任务");
    expect(html).toContain("比赛挑战");
    expect(html).not.toContain('<section class="slide"');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("data-start");
    expect(html).not.toContain("cover-shell");
    expect(html).not.toContain("cover-stage");
    expect(html).not.toContain("glass-panel");
    expect(html).not.toContain("controls.style.display");
    expect(html).not.toContain("backdrop-filter");
    expect(html).not.toContain("@keyframes ambientShift");
    expect(html).not.toContain("data-support-module=");
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
