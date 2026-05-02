import type { MastraModelOutput } from "@mastra/core/stream";
import {
  convertToModelMessages,
  extractJsonMiddleware,
  generateText,
  Output,
  stepCountIs,
  streamText,
  wrapLanguageModel,
  type DeepPartial,
  type UIMessageChunk,
} from "ai";
import { z } from "zod";

import {
  agentLessonGenerationSchema,
  type AgentLessonGenerationResult,
  competitionLessonAssessmentLoadSchema,
  competitionLessonPlanSchema,
  competitionLessonExecutionSchema,
  competitionLessonHeaderSchema,
  competitionLessonTeachingDesignSchema,
  type CompetitionLessonAssessmentLoad,
  type CompetitionLessonPlan,
  type CompetitionLessonExecution,
  type CompetitionLessonHeader,
  type CompetitionLessonTeachingDesign,
  unwrapAgentLessonGenerationResult,
} from "@/lib/competition-lesson-contract";
import {
  formatLessonPlanProtocolDiagnostics,
  parseLessonPlanProtocolToCompetitionLessonPlan,
} from "@/lib/competition-lesson-protocol";
import { extractJsonObjectText } from "@/lib/artifact-protocol";
import type { GenerationMode, SmartEduUIMessage } from "@/lib/lesson-authoring-contract";
import { createMastraAgentUiMessageStream } from "@/mastra/ai_sdk_stream";
import { createChatModel } from "@/mastra/models";
import {
  SUBMIT_LESSON_PLAN_TOOL_NAME,
  parseSubmitLessonPlanToolInput,
} from "@/mastra/tools/output_tools";
import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

import type { LessonBlockGenerationEvent, LessonBlockId } from "./artifact_stream_events";

type AgentModelMessages = Awaited<ReturnType<typeof convertToModelMessages>>;

type AgentStreamOptions = {
  system: string;
  maxSteps: number;
  modelSettings?: {
    maxRetries?: number;
  };
  providerOptions: {
    openai: {
      store: true;
    };
  };
  structuredOutput?: {
    schema: typeof agentLessonGenerationSchema;
    instructions: string;
    jsonPromptInjection: boolean;
  };
};

type ReadableObjectStream<T> = {
  getReader: () => {
    read: () => Promise<{ done: true; value?: undefined } | { done: false; value: T }>;
    releaseLock: () => void;
  };
};

export type AgentStreamRunner<OUTPUT = unknown> = (
  messages: AgentModelMessages,
  options: AgentStreamOptions,
) => Promise<MastraModelOutput<OUTPUT>>;

export type LessonStructuredGenerator = (options: {
  maxSteps: number;
  messages: AgentModelMessages;
  modelId: string;
  system: string;
}) => Promise<CompetitionLessonPlan>;

export type LessonStructuredStreamer = (options: {
  maxSteps: number;
  messages: AgentModelMessages;
  modelId: string;
  system: string;
}) => Promise<LessonGenerationStreams | ReadableStream<UIMessageChunk>>;

export type LessonGenerationStreams = {
  finalLessonPlanPromise?: Promise<CompetitionLessonPlan>;
  partialOutputStream?: AsyncIterable<DeepPartial<CompetitionLessonPlan>>;
  stream: ReadableStream<UIMessageChunk>;
};

const DEFAULT_LESSON_MODEL_ID = process.env.AI_LESSON_MODEL ?? process.env.AI_MODEL ?? "gpt-4.1-mini";
const MAX_MODEL_OPERATION_ATTEMPTS = 5;
const STRUCTURED_OUTPUT_MAX_RETRIES = 3;

type LessonStructuredBlockKey = "header" | "teaching" | "execution" | "assessmentLoad";

type LessonStructuredBlockContext = {
  execution?: CompetitionLessonExecution;
  header?: CompetitionLessonHeader;
  teaching?: CompetitionLessonTeachingDesign;
};

type LessonStructuredBlockResults = {
  assessmentLoad: CompetitionLessonAssessmentLoad;
  execution: CompetitionLessonExecution;
  header: CompetitionLessonHeader;
  teaching: CompetitionLessonTeachingDesign;
};

type LessonStructuredBlockPartial =
  | CompetitionLessonAssessmentLoad
  | CompetitionLessonExecution
  | CompetitionLessonHeader
  | CompetitionLessonTeachingDesign;

type LessonStructuredBlockGenerationResult = {
  finalLessonPlanPromise: Promise<CompetitionLessonPlan>;
  partialOutputStream: AsyncIterable<DeepPartial<CompetitionLessonPlan>>;
};

type LessonStructuredBlockDefinition = {
  blockId: LessonBlockId;
  description: string;
  instructions: string[];
  key: LessonStructuredBlockKey;
  name: string;
  schema: z.ZodTypeAny;
};

const STRUCTURED_LESSON_BLOCK_MAX_STEPS = 3;

const LESSON_STRUCTURED_BLOCKS: LessonStructuredBlockDefinition[] = [
  {
    blockId: "basic",
    key: "header",
    name: "CompetitionLessonHeaderBlock",
    description: "课时计划标题与元数据子块",
    schema: competitionLessonHeaderSchema,
    instructions: [
      "对象只能包含 title、subtitle、teacher、meta 四个顶层字段。",
      "teacher.school、teacher.name 必须填写；若用户未明确提供教师信息，可使用“未提供学校”“未提供教师”。",
      "meta 必须包含 topic、lessonNo、studentCount，并尽量补全年级和水平。",
    ],
  },
  {
    blockId: "objectives",
    key: "teaching",
    name: "CompetitionLessonTeachingDesignBlock",
    description: "课时计划教学设计子块",
    schema: competitionLessonTeachingDesignSchema,
    instructions: [
      "对象只能包含 narrative、learningObjectives、keyDifficultPoints、flowSummary 四个顶层字段。",
      "所有字段都必须是非空字符串数组。",
      "三维目标、重难点和流程摘要要与已确定的课题、年级和水平保持一致。",
    ],
  },
  {
    blockId: "periodPlan",
    key: "execution",
    name: "CompetitionLessonExecutionBlock",
    description: "课时计划场地器材与课堂执行子块",
    schema: competitionLessonExecutionSchema,
    instructions: [
      "对象只能包含 venueEquipment 与 periodPlan 两个顶层字段。",
      "venueEquipment.venue 只写 1 项核心教学场地；equipment 写 3-4 项直接支撑教学的核心器材。",
      "periodPlan 必须包含 mainContent、safety、rows、homework、reflection。",
      "periodPlan.rows 必须覆盖准备部分、基本部分、结束部分。",
      "整节课必须在真实活动中体现动作方法学习、有效练习、竞赛或展示、体能发展活动。",
    ],
  },
  {
    blockId: "evaluationLoad",
    key: "assessmentLoad",
    name: "CompetitionLessonAssessmentLoadBlock",
    description: "课时计划评价与运动负荷子块",
    schema: competitionLessonAssessmentLoadSchema,
    instructions: [
      "对象只能包含 evaluation 与 loadEstimate 两个顶层字段。",
      "evaluation 必须正好 3 项，level 依次为三颗星、二颗星、一颗星，description 要有区分度。",
      "loadEstimate 必须包含 loadLevel、targetHeartRateRange、averageHeartRate、groupDensity、individualDensity、chartPoints、rationale。",
      "chartPoints 至少给出 6 个时间点，并与 40 分钟课节节奏匹配。",
    ],
  },
];

export const lessonGenerationEnvelopeSchema = z
  .object({
    _thinking_process: z
      .string()
      .trim()
      .min(1)
      .describe("面向 trace 的课时计划设计草稿。业务层必须丢弃该字段，只保存 lessonPlan。"),
    lessonPlan: competitionLessonPlanSchema.describe("最终可渲染和持久化的纯净课时计划。"),
  })
  .strict();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorStatusCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) {
    return undefined;
  }

  const statusCode = (error as { statusCode?: unknown }).statusCode;

  return typeof statusCode === "number" ? statusCode : undefined;
}

function getRetryDelayMs(attempt: number) {
  const baseDelayMs = 500 * 2 ** (attempt - 1);
  const jitterMs = Math.floor(Math.random() * 250);

  return Math.min(baseDelayMs + jitterMs, 8_000);
}

function isRetryableModelOperationError(error: unknown) {
  const statusCode = getErrorStatusCode(error);
  const message = error instanceof Error ? error.message : String(error);

  if (statusCode && [408, 409, 425, 429, 500, 502, 503, 504].includes(statusCode)) {
    return true;
  }

  return /No available channels|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|network|timeout/i.test(message);
}

export async function runModelOperationWithRetry<T>(
  operation: () => Promise<T>,
  context: {
    mode: GenerationMode;
    requestId: string;
  },
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_MODEL_OPERATION_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt >= MAX_MODEL_OPERATION_ATTEMPTS || !isRetryableModelOperationError(error)) {
        throw error;
      }

      const delayMs = getRetryDelayMs(attempt);
      console.warn("[lesson-authoring] retrying model operation", {
        requestId: context.requestId,
        mode: context.mode,
        attempt,
        nextAttempt: attempt + 1,
        maxAttempts: MAX_MODEL_OPERATION_ATTEMPTS,
        delayMs,
        statusCode: getErrorStatusCode(error),
        error: error instanceof Error ? error.message : String(error),
      });
      await sleep(delayMs);
    }
  }

  throw lastError;
}

function normalizeLessonGenerationStreams(
  output: LessonGenerationStreams | ReadableStream<UIMessageChunk>,
): LessonGenerationStreams {
  return output instanceof ReadableStream ? { stream: output } : output;
}

function shouldUseStructuredServerSideLessonGeneration() {
  return process.env.AI_SUPPORTS_STRUCTURED_OUTPUTS === "true" || !process.env.AI_BASE_URL?.trim();
}

function createStructuredLessonModel(modelId: string) {
  if (shouldUseStructuredServerSideLessonGeneration()) {
    return createChatModel(modelId);
  }

  return wrapLanguageModel({
    model: createChatModel(modelId),
    middleware: extractJsonMiddleware(),
  });
}

function buildStructuredLessonBlockSystemPrompt(system: string, definition: LessonStructuredBlockDefinition) {
  return [
    system,
    "你正在执行服务端确定性课时计划分块结构化生成任务，不是工具调用或聊天回复。",
    `当前只输出“${definition.description}”对应的结构化对象。`,
    "你必须只输出合法 JSON 对象本身，不要输出 Markdown、HTML、XML、代码围栏、解释文字或额外字段。",
    "所有可见文案必须使用 UTF-8 中文，且直接可用于正式课时计划。",
    ...definition.instructions,
  ].join("\n\n");
}

function buildStructuredLessonBlockMessages(input: {
  context: LessonStructuredBlockContext;
  definition: LessonStructuredBlockDefinition;
  messages: AgentModelMessages;
}) {
  const contextMessage =
    Object.keys(input.context).length > 0
      ? [
          "已确定的前置结构数据如下，当前子块必须与其保持一致，不得冲突：",
          JSON.stringify(input.context, null, 2),
        ].join("\n")
      : "当前是本轮第一个结构化子块，无前置结构数据。";

  const taskMessage = [
    `现在只生成“${input.definition.description}”。`,
    ...input.definition.instructions,
    contextMessage,
  ].join("\n");

  return [
    ...input.messages,
    {
      role: "user" as const,
      content: taskMessage,
    },
  ] as AgentModelMessages;
}

function parseStructuredLessonBlockText(input: {
  definition: LessonStructuredBlockDefinition;
  text: string;
}) {
  try {
    return input.definition.schema.parse(JSON.parse(extractJsonObjectText(input.text)));
  } catch (error) {
    throw new Error(
      `${input.definition.description} JSON 解析失败：${error instanceof Error ? error.message : "unknown-error"}`,
    );
  }
}

async function generateStructuredLessonBlock(input: {
  context: LessonStructuredBlockContext;
  definition: LessonStructuredBlockDefinition;
  maxSteps: number;
  messages: AgentModelMessages;
  modelId: string;
  system: string;
}) {
  const baseOptions = {
    model: createStructuredLessonModel(input.modelId),
    system: buildStructuredLessonBlockSystemPrompt(input.system, input.definition),
    messages: buildStructuredLessonBlockMessages({
      context: input.context,
      definition: input.definition,
      messages: input.messages,
    }),
    stopWhen: stepCountIs(Math.max(1, Math.min(input.maxSteps, STRUCTURED_LESSON_BLOCK_MAX_STEPS))),
    temperature: 0,
  } satisfies Parameters<typeof generateText>[0];

  if (!shouldUseStructuredServerSideLessonGeneration()) {
    const result = await generateText(baseOptions);

    return parseStructuredLessonBlockText({
      definition: input.definition,
      text: result.text,
    });
  }

  const result = await generateText({
    ...baseOptions,
    output: Output.object({
      schema: input.definition.schema,
      name: input.definition.name,
      description: input.definition.description,
    }),
  });

  return input.definition.schema.parse(result.output);
}

function createLessonPartialFromStructuredBlock(input: {
  definition: LessonStructuredBlockDefinition;
  output: LessonStructuredBlockPartial;
}): DeepPartial<CompetitionLessonPlan> {
  return input.output as DeepPartial<CompetitionLessonPlan>;
}

function createLessonStructuredBlockCompletionEvent(input: {
  definition: LessonStructuredBlockDefinition;
  output: LessonStructuredBlockPartial;
  sequence: number;
}): LessonBlockGenerationEvent {
  return {
    blockId: input.definition.blockId,
    partial: createLessonPartialFromStructuredBlock({
      definition: input.definition,
      output: input.output,
    }),
    sequence: input.sequence,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, reject, resolve };
}

function createAsyncQueue<T>() {
  const values: T[] = [];
  const readers: Array<(result: IteratorResult<T>) => void> = [];
  let closed = false;
  let error: unknown;

  const settleNextReader = () => {
    const reader = readers.shift();

    if (!reader) {
      return;
    }

    if (error !== undefined) {
      reader(Promise.reject(error) as unknown as IteratorResult<T>);
      return;
    }

    const value = values.shift();

    if (value !== undefined) {
      reader({ done: false, value });
      return;
    }

    if (closed) {
      reader({ done: true, value: undefined });
      return;
    }

    readers.unshift(reader);
  };

  return {
    close() {
      closed = true;
      while (readers.length) {
        settleNextReader();
      }
    },
    error(nextError: unknown) {
      error = nextError;
      while (readers.length) {
        settleNextReader();
      }
    },
    push(value: T) {
      if (closed || error !== undefined) {
        return;
      }

      values.push(value);
      settleNextReader();
    },
    stream: {
      [Symbol.asyncIterator]() {
        return {
          next() {
            if (error !== undefined) {
              return Promise.reject(error);
            }

            const value = values.shift();

            if (value !== undefined) {
              return Promise.resolve({ done: false as const, value });
            }

            if (closed) {
              return Promise.resolve({ done: true as const, value: undefined });
            }

            return new Promise<IteratorResult<T>>((resolve) => {
              readers.push(resolve);
            });
          },
        };
      },
    } satisfies AsyncIterable<T>,
  };
}

function createStructuredBlockPartialStream(input: {
  blockGenerationPromise: Promise<LessonStructuredBlockResults>;
  events: AsyncIterable<LessonBlockGenerationEvent>;
}): AsyncIterable<DeepPartial<CompetitionLessonPlan>> {
  return (async function* partialOutputStream() {
    try {
      for await (const event of input.events) {
        yield event.partial as DeepPartial<CompetitionLessonPlan>;
      }
    } finally {
      await input.blockGenerationPromise.catch(() => undefined);
    }
  })();
}

function startCompetitionLessonPlanStructuredBlockGeneration(input: {
  maxSteps: number;
  messages: AgentModelMessages;
  modelId: string;
  system: string;
}): LessonStructuredBlockGenerationResult {
  const eventQueue = createAsyncQueue<LessonBlockGenerationEvent>();
  const blockGeneration = createDeferred<LessonStructuredBlockResults>();

  const generationTask = (async () => {
    try {
      const emitBlock = async (sequence: number, definition: LessonStructuredBlockDefinition, output: LessonStructuredBlockPartial) => {
        eventQueue.push(createLessonStructuredBlockCompletionEvent({
          definition,
          output,
          sequence,
        }));
      };
      const headerDefinition = LESSON_STRUCTURED_BLOCKS[0]!;
      const teachingDefinition = LESSON_STRUCTURED_BLOCKS[1]!;
      const executionDefinition = LESSON_STRUCTURED_BLOCKS[2]!;
      const assessmentLoadDefinition = LESSON_STRUCTURED_BLOCKS[3]!;
      const header = competitionLessonHeaderSchema.parse(
        await generateStructuredLessonBlock({
          context: {},
          definition: headerDefinition,
          maxSteps: input.maxSteps,
          messages: input.messages,
          modelId: input.modelId,
          system: input.system,
        }),
      );
      await emitBlock(1, headerDefinition, header);
      const teaching = competitionLessonTeachingDesignSchema.parse(
        await generateStructuredLessonBlock({
          context: { header },
          definition: teachingDefinition,
          maxSteps: input.maxSteps,
          messages: input.messages,
          modelId: input.modelId,
          system: input.system,
        }),
      );
      await emitBlock(2, teachingDefinition, teaching);
      const execution = competitionLessonExecutionSchema.parse(
        await generateStructuredLessonBlock({
          context: { header, teaching },
          definition: executionDefinition,
          maxSteps: input.maxSteps,
          messages: input.messages,
          modelId: input.modelId,
          system: input.system,
        }),
      );
      await emitBlock(3, executionDefinition, execution);
      const assessmentLoad = competitionLessonAssessmentLoadSchema.parse(
        await generateStructuredLessonBlock({
          context: { execution, header, teaching },
          definition: assessmentLoadDefinition,
          maxSteps: input.maxSteps,
          messages: input.messages,
          modelId: input.modelId,
          system: input.system,
        }),
      );
      await emitBlock(4, assessmentLoadDefinition, assessmentLoad);

      const results = { assessmentLoad, execution, header, teaching };
      blockGeneration.resolve(results);
      eventQueue.close();

      return results;
    } catch (error) {
      blockGeneration.reject(error);
      eventQueue.error(error);
      throw error;
    }
  })();
  const finalLessonPlanPromise = generationTask.then(({ assessmentLoad, execution, header, teaching }) =>
    competitionLessonPlanSchema.parse({
      ...header,
      ...teaching,
      ...execution,
      ...assessmentLoad,
    }),
  );

  void blockGeneration.promise.catch(() => undefined);
  void generationTask.catch(() => undefined);
  void finalLessonPlanPromise.catch(() => undefined);

  return {
    finalLessonPlanPromise,
    partialOutputStream: createStructuredBlockPartialStream({
      blockGenerationPromise: blockGeneration.promise,
      events: eventQueue.stream,
    }),
  };
}

function createServerLessonProtocolSystemPrompt(system: string) {
  return [
    system,
    "你正在执行服务端确定性课时计划生成任务，不是工具调用或聊天回复。",
    "你必须只输出“自定义教案行协议”文本。不要输出 JSON、Markdown 标题、HTML、XML、代码围栏或解释文字。",
    "所有字段必须使用 UTF-8 中文内容。普通字段用 key=value；@section、@safety、@load 块内可以直接写正文行。",
    "必须包含：@lesson、三个 narrative @section、三个 objectives @section、六个 key_difficult_points/period_plan 扩展 @section、至少三个 @flow、三个 @evaluation、@equipment、@safety、@load。",
    "至少三个 @flow 必须覆盖 part=准备部分、part=基本部分、part=结束部分；基本部分应优先拆分为多个 @flow，每个 @flow 聚焦一个自然学练、比赛或体能活动。",
    "三个 @evaluation 必须分别覆盖 level=三颗星、level=二颗星、level=一颗星。",
    "@flow 的 content 只写本段课堂环节短语，不写时间和步骤细节；教师行为、学生行为、组织形式和安全要求分别写入对应字段。",
    "不要把整个基本部分压缩进单个 @flow 的多行 content；应优先使用多个 @flow 来表达动作学习、分组练习、比赛挑战、专项体能等真实活动。",
    "整节课需在真实活动中自然体现动作方法学习、有效练习、竞赛或展示、体能发展活动；不要把这些课标要求写成单字小标题或固定栏目标签。",
    "若能判断具体项目特点，应主动补充 key_difficult_points.*、period_plan.homework、period_plan.reflection，并在 @load 中给出 chartPoints。",
    "下面只是协议骨架，不是内容模板；具体教学内容由你根据用户需求、课标依据和教材上下文自主生成，不要照抄骨架说明：",
    "@lesson",
    "title=",
    "subtitle=",
    "topic=",
    "grade=",
    "student_count=",
    "lesson_no=",
    "level=",
    "teacher_school=",
    "teacher_name=",
    "",
    "@section narrative.guiding_thought",
    "",
    "@section narrative.textbook_analysis",
    "",
    "@section narrative.student_analysis",
    "",
    "@section objectives.sport_ability",
    "",
    "@section objectives.health_behavior",
    "",
    "@section objectives.sport_morality",
    "",
    "@section key_difficult_points.student_learning",
    "",
    "@section key_difficult_points.teaching_content",
    "",
    "@section key_difficult_points.teaching_organization",
    "",
    "@section key_difficult_points.teaching_method",
    "",
    "@section period_plan.homework",
    "",
    "@section period_plan.reflection",
    "",
    "@flow",
    "part=准备部分",
    "time=",
    "intensity=",
    "content=",
    "teacher=",
    "students=",
    "organization=",
    "",
    "@flow",
    "part=基本部分",
    "time=",
    "intensity=",
    "content=（当前活动的小标题或活动名）",
    "teacher=",
    "students=",
    "organization=",
    "",
    "@flow",
    "part=基本部分",
    "time=",
    "intensity=",
    "content=（下一个基本部分活动的小标题或活动名，可按课堂需要继续追加）",
    "teacher=",
    "students=",
    "organization=",
    "",
    "@flow",
    "part=结束部分",
    "time=",
    "intensity=",
    "content=",
    "teacher=",
    "students=",
    "organization=",
    "",
    "@evaluation",
    "level=三颗星",
    "description=",
    "",
    "@evaluation",
    "level=二颗星",
    "description=",
    "",
    "@evaluation",
    "level=一颗星",
    "description=",
    "",
    "@equipment",
    "venue=",
    "equipment=",
    "",
    "@safety",
    "",
    "@load",
    "load_level=",
    "target_heart_rate_range=",
    "average_heart_rate=",
    "group_density=",
    "individual_density=",
    "chartPoints=0'=90，8'=120，18'=145，28'=155，35'=140，40'=100",
    "rationale=",
  ].join("\n");
}

function createEmptyUiStream(): ReadableStream<UIMessageChunk> {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      controller.enqueue({ type: "finish", finishReason: "stop" });
      controller.close();
    },
  });
}

async function streamCompetitionLessonPlanServerSideWithProtocol({
  maxSteps,
  messages,
  modelId,
  system,
}: {
  maxSteps: number;
  messages: AgentModelMessages;
  modelId: string;
  system: string;
}): Promise<LessonGenerationStreams> {
  const result = streamText({
    model: createChatModel(modelId),
    system: createServerLessonProtocolSystemPrompt(system),
    messages,
    stopWhen: stepCountIs(Math.max(1, maxSteps)),
    temperature: 0,
  });

  const finalLessonPlanPromise = Promise.resolve(result.text)
    .then((protocolText) => parseLessonPlanProtocolToCompetitionLessonPlan(protocolText))
    .catch((error) => {
      throw new Error(
        error && typeof error === "object" && "diagnostics" in error
          ? `教案行协议生成失败：\n${formatLessonPlanProtocolDiagnostics(
              error as Parameters<typeof formatLessonPlanProtocolDiagnostics>[0],
            )}`
          : `教案行协议生成失败：${error instanceof Error ? error.message : "unknown-error"}`,
      );
    });

  void finalLessonPlanPromise.catch(() => undefined);

  return {
    finalLessonPlanPromise,
    stream: createEmptyUiStream(),
  };
}

async function streamCompetitionLessonPlanServerSideWithStructuredBlocks({
  maxSteps,
  messages,
  modelId,
  system,
}: {
  maxSteps: number;
  messages: AgentModelMessages;
  modelId: string;
  system: string;
}): Promise<LessonGenerationStreams> {
  const generation = startCompetitionLessonPlanStructuredBlockGeneration({
    maxSteps,
    messages,
    modelId,
    system,
  });

  return {
    finalLessonPlanPromise: generation.finalLessonPlanPromise,
    partialOutputStream: generation.partialOutputStream,
    stream: createEmptyUiStream(),
  };
}

async function streamCompetitionLessonPlanServerSide({
  maxSteps,
  messages,
  modelId,
  system,
}: {
  maxSteps: number;
  messages: AgentModelMessages;
  modelId: string;
  system: string;
}): Promise<LessonGenerationStreams> {
  try {
    const structuredStreams = await streamCompetitionLessonPlanServerSideWithStructuredBlocks({
      maxSteps,
      messages,
      modelId,
      system,
    });
    const finalLessonPlanPromise = structuredStreams.finalLessonPlanPromise?.catch(async (error) => {
      console.warn("[lesson-authoring] structured-lesson-generation-fallback", {
        modelId,
        structuredOutputsEnabled: shouldUseStructuredServerSideLessonGeneration(),
        error: error instanceof Error ? error.message : String(error),
      });
      const fallback = await streamCompetitionLessonPlanServerSideWithProtocol({
        maxSteps,
        messages,
        modelId,
        system,
      });

      if (!fallback.finalLessonPlanPromise) {
        throw error;
      }

      return fallback.finalLessonPlanPromise;
    });

    void finalLessonPlanPromise?.catch(() => undefined);

    return {
      ...structuredStreams,
      finalLessonPlanPromise,
    };
  } catch (error) {
    console.warn("[lesson-authoring] structured-lesson-generation-fallback", {
      modelId,
      structuredOutputsEnabled: shouldUseStructuredServerSideLessonGeneration(),
      error: error instanceof Error ? error.message : String(error),
    });

    return streamCompetitionLessonPlanServerSideWithProtocol({
      maxSteps,
      messages,
      modelId,
      system,
    });
  }
}

function readToolInputPart(part: UIMessageChunk) {
  const candidate = part as {
    input?: unknown;
    toolCallId?: string;
    toolName?: string;
    type?: string;
  };

  if (candidate.type !== "tool-input-available" || typeof candidate.toolName !== "string") {
    return undefined;
  }

  return {
    input: candidate.input,
    toolCallId: typeof candidate.toolCallId === "string" ? candidate.toolCallId : undefined,
    toolName: candidate.toolName,
  };
}

async function readSubmittedLessonPlanFromToolStream(stream: ReadableStream<UIMessageChunk>) {
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        return undefined;
      }

      const toolInput = readToolInputPart(value);

      if (!toolInput || toolInput.toolName !== SUBMIT_LESSON_PLAN_TOOL_NAME) {
        continue;
      }

      return parseSubmitLessonPlanToolInput(toolInput.input).lessonPlan;
    }
  } finally {
    reader.releaseLock();
  }
}

function createToolFirstLessonPlanPromise(input: {
  legacyFinalLessonPlanPromise?: Promise<CompetitionLessonPlan>;
  toolStream: ReadableStream<UIMessageChunk>;
}) {
  const promise = (async () => {
    const submittedLessonPlan = await readSubmittedLessonPlanFromToolStream(input.toolStream);

    if (submittedLessonPlan) {
      return submittedLessonPlan;
    }

    if (input.legacyFinalLessonPlanPromise) {
      return input.legacyFinalLessonPlanPromise;
    }

    throw new Error("模型未通过 submit_lesson_plan 提交课时计划，且未返回兼容结构化输出。");
  })();

  void promise.catch(() => undefined);

  return promise;
}

async function streamCompetitionLessonPlanWithMastraAgent({
  agentStream,
  maxSteps,
  messages,
  system,
  toUIMessageStream,
}: {
  agentStream: AgentStreamRunner<AgentLessonGenerationResult>;
  maxSteps: number;
  messages: AgentModelMessages;
  system: string;
  toUIMessageStream?: (result: MastraModelOutput<AgentLessonGenerationResult>) => ReadableStream<UIMessageChunk>;
}): Promise<LessonGenerationStreams> {
  const result = await agentStream(messages, {
    system,
    maxSteps,
    modelSettings: {
      maxRetries: STRUCTURED_OUTPUT_MAX_RETRIES,
    },
    providerOptions: {
      openai: {
        store: true,
      },
    },
    structuredOutput: {
      schema: agentLessonGenerationSchema,
      instructions:
        "请先填写 _thinking_process 作为课时计划设计草稿，再把最终可渲染课时计划写入 lessonPlan。除 schema 字段外不要输出 Markdown、HTML、XML、代码围栏或解释文字。",
      jsonPromptInjection: true,
    },
  });

  const uiMessageStream =
    toUIMessageStream?.(result) ??
    createMastraAgentUiMessageStream(result, {
      sendStart: false,
      sendFinish: true,
    });
  const [toolInspectionStream, passthroughStream] = uiMessageStream.tee();
  const legacyFinalLessonPlanPromise = createFinalLessonPlanPromise(result);

  return {
    finalLessonPlanPromise: createToolFirstLessonPlanPromise({
      legacyFinalLessonPlanPromise,
      toolStream: toolInspectionStream,
    }),
    partialOutputStream: createLessonPartialOutputStream(result),
    stream: passthroughStream,
  };
}

function createFinalLessonPlanPromise(result: MastraModelOutput<AgentLessonGenerationResult>) {
  const objectPromise = result.object;

  if (!objectPromise || typeof objectPromise.then !== "function") {
    return undefined;
  }

  return objectPromise.then((value) => unwrapAgentLessonGenerationResult(value));
}

function createLessonPartialOutputStream(result: MastraModelOutput<AgentLessonGenerationResult>) {
  const objectStream = result.objectStream;

  if (!objectStream || typeof objectStream.getReader !== "function") {
    return undefined;
  }

  return mapAgentLessonPartialOutputStream(
    objectStream as ReadableObjectStream<Partial<AgentLessonGenerationResult>>,
  );
}

async function* mapAgentLessonPartialOutputStream(
  objectStream: ReadableObjectStream<Partial<AgentLessonGenerationResult>>,
): AsyncIterable<DeepPartial<CompetitionLessonPlan>> {
  const reader = objectStream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        return;
      }

      if (value.lessonPlan) {
        yield value.lessonPlan as DeepPartial<CompetitionLessonPlan>;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function runLessonGenerationSkill(input: {
  agentStream?: AgentStreamRunner<AgentLessonGenerationResult>;
  messages: SmartEduUIMessage[];
  modelId?: string;
  requestId: string;
  serverSide?: boolean;
  structuredStream?: LessonStructuredStreamer;
  structuredGenerate?: LessonStructuredGenerator;
  toUIMessageStream?: (result: MastraModelOutput<AgentLessonGenerationResult>) => ReadableStream<UIMessageChunk>;
  workflow: LessonWorkflowOutput;
}) {
  const modelMessages = await convertToModelMessages(input.messages);
  const streamer =
    input.structuredStream ??
    (input.structuredGenerate
      ? async (options: Parameters<LessonStructuredStreamer>[0]) => {
          const lessonPlan = await input.structuredGenerate!(options);
          const content = JSON.stringify(competitionLessonPlanSchema.parse(lessonPlan));

          return {
            finalLessonPlanPromise: Promise.resolve(competitionLessonPlanSchema.parse(lessonPlan)),
            stream: new ReadableStream<UIMessageChunk>({
              start(controller) {
                const id = "lesson-json";

                controller.enqueue({ type: "text-start", id });
                controller.enqueue({ type: "text-delta", id, delta: content });
                controller.enqueue({ type: "text-end", id });
                controller.enqueue({ type: "finish", finishReason: "stop" });
                controller.close();
              },
            }),
          };
        }
      : input.serverSide === true || !input.agentStream
        ? (options: Parameters<LessonStructuredStreamer>[0]) =>
            streamCompetitionLessonPlanServerSide({
              maxSteps: options.maxSteps,
              messages: options.messages,
              modelId: options.modelId,
              system: options.system,
            })
        : input.agentStream
        ? (options: Parameters<LessonStructuredStreamer>[0]) =>
            streamCompetitionLessonPlanWithMastraAgent({
              agentStream: input.agentStream!,
              maxSteps: options.maxSteps,
              messages: options.messages,
              system: options.system,
              toUIMessageStream: input.toUIMessageStream,
            })
        : undefined);

  if (!streamer) {
    throw new Error("Lesson generation requires a server-side structured streamer or legacy Mastra Agent stream runner.");
  }

  const generationStreams = normalizeLessonGenerationStreams(
    await runModelOperationWithRetry(
      () =>
        streamer({
          maxSteps: input.workflow.generationPlan.maxSteps,
          messages: modelMessages,
          modelId: input.modelId ?? DEFAULT_LESSON_MODEL_ID,
          system: input.workflow.system,
        }),
      { mode: "lesson", requestId: input.requestId },
    ),
  );

  return {
    finalLessonPlanPromise: generationStreams.finalLessonPlanPromise,
    modelMessageCount: modelMessages.length,
    partialOutputStream: generationStreams.partialOutputStream,
    stream: generationStreams.stream,
  };
}
