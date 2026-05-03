import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";

import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { loadEnvConfig } from "@next/env";
import {
  generateText,
  Output,
  stepCountIs,
} from "ai";
import { z } from "zod";

import {
  competitionLessonAssessmentLoadSchema,
  competitionLessonExecutionSchema,
  competitionLessonHeaderSchema,
  competitionLessonPlanSchema,
  competitionLessonTeachingDesignSchema,
} from "../src/lib/competition-lesson-contract";
import { createChatModel } from "../src/mastra/models";
import { runModelOperationWithRetry } from "../src/mastra/skills/runtime/lesson_generation_skill";
import {
  formatLessonValidationIssues,
  performLessonBusinessValidation,
} from "../src/mastra/support/lesson_generation_validation";

loadEnvConfig(process.cwd());

type ProbeMode = "native" | "project" | "both";
type ProbeExecutionMode = Exclude<ProbeMode, "both">;
type ProbeTarget = "full" | "header" | "teaching" | "assessment-load" | "execution" | "all";
type ProbeExecutionTarget = Exclude<ProbeTarget, "all">;
type ProbeModel = Parameters<typeof generateText>[0]["model"];

type ProbeOptions = {
  maxSteps: number;
  modelId: string;
  mode: ProbeMode;
  outputDir?: string;
  runs: number;
  target: ProbeTarget;
};

type ProbeRunSuccess = {
  businessIssues: string[];
  businessValid: boolean;
  durationMs: number;
  evaluationLevels: string[];
  mode: ProbeExecutionMode;
  outputFile?: string;
  rowStructures: string[];
  run: number;
  schemaValid: true;
  target: ProbeExecutionTarget;
  title: string;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};

type ProbeRunFailure = {
  durationMs: number;
  errorMessage: string;
  mode: ProbeExecutionMode;
  run: number;
  schemaValid: false;
  target: ProbeExecutionTarget;
};

type ProbeRunResult = ProbeRunSuccess | ProbeRunFailure;

type ProbeTargetDefinition = {
  description: string;
  name: string;
  promptRequirements: string[];
  schema: z.ZodTypeAny;
  systemRules: string[];
  target: ProbeExecutionTarget;
};

const PROBE_TARGET_DEFINITIONS: Record<ProbeExecutionTarget, ProbeTargetDefinition> = {
  "assessment-load": {
    description: "CompetitionLessonPlan 的评价与运动负荷子块",
    name: "CompetitionLessonAssessmentLoadBlock",
    promptRequirements: [
      "- evaluation 必须正好 3 项，level 依次为三颗星、二颗星、一颗星，description 要有区分度。",
      "- loadEstimate 必须包含 loadLevel、targetHeartRateRange、averageHeartRate、groupDensity、individualDensity、chartPoints、rationale。",
      "- chartPoints 至少给出 6 个时间点，并和 40 分钟课节节奏一致。",
    ],
    schema: competitionLessonAssessmentLoadSchema,
    systemRules: [
      "对象只能包含 evaluation 与 loadEstimate 两个顶层字段。",
      "不要输出 title、teacher、periodPlan、venueEquipment 等其他字段。",
    ],
    target: "assessment-load",
  },
  execution: {
    description: "CompetitionLessonPlan 的场地器材与课时执行子块",
    name: "CompetitionLessonExecutionBlock",
    promptRequirements: [
      "- venueEquipment.venue 只写 1 项核心教学场地。",
      "- venueEquipment.equipment 写 3-4 项直接支撑本课教学的核心器材。",
      "- periodPlan 必须包含 mainContent、safety、rows、homework、reflection。",
      "- rows 必须覆盖准备部分、基本部分、结束部分，并在真实活动中体现动作方法学习、有效练习、竞赛或展示、体能发展活动。",
    ],
    schema: competitionLessonExecutionSchema,
    systemRules: [
      "对象只能包含 venueEquipment 与 periodPlan 两个顶层字段。",
      "不要输出 title、teacher、meta、loadEstimate 等其他字段。",
    ],
    target: "execution",
  },
  full: {
    description: "完整 CompetitionLessonPlan 结构化课时计划对象",
    name: "CompetitionLessonPlan",
    promptRequirements: [
      "- 必须输出完整 CompetitionLessonPlan。",
      "- 整节课必须在真实课堂活动中体现动作方法学习、有效练习、竞赛或展示、体能发展活动。",
      "- 不允许占位符、未完成字段或缺失必要模块。",
    ],
    schema: competitionLessonPlanSchema,
    systemRules: [
      "对象必须完整包含 title、subtitle、teacher、meta、narrative、learningObjectives、keyDifficultPoints、flowSummary、evaluation、loadEstimate、venueEquipment、periodPlan。",
    ],
    target: "full",
  },
  header: {
    description: "CompetitionLessonPlan 的标题与元数据子块",
    name: "CompetitionLessonHeaderBlock",
    promptRequirements: [
      "- title、subtitle、teacher、meta 必须完整。",
      "- teacher.school、teacher.name 不能为空。",
      "- meta 必须包含 topic、lessonNo、studentCount，并补全年级与水平。",
    ],
    schema: competitionLessonHeaderSchema,
    systemRules: [
      "对象只能包含 title、subtitle、teacher、meta 四个顶层字段。",
      "不要输出 narrative、periodPlan、loadEstimate 等其他字段。",
    ],
    target: "header",
  },
  teaching: {
    description: "CompetitionLessonPlan 的教学设计子块",
    name: "CompetitionLessonTeachingDesignBlock",
    promptRequirements: [
      "- narrative、learningObjectives、keyDifficultPoints、flowSummary 都必须为非空字符串数组。",
      "- 三维目标、重难点和流程摘要要与四年级篮球行进间运球与变向运球相匹配。",
    ],
    schema: competitionLessonTeachingDesignSchema,
    systemRules: [
      "对象只能包含 narrative、learningObjectives、keyDifficultPoints、flowSummary 四个顶层字段。",
      "不要输出 teacher、meta、periodPlan、loadEstimate 等其他字段。",
    ],
    target: "teaching",
  },
};

function getTargetDefinitions(target: ProbeTarget) {
  if (target === "all") {
    return [
      PROBE_TARGET_DEFINITIONS.header,
      PROBE_TARGET_DEFINITIONS.teaching,
      PROBE_TARGET_DEFINITIONS["assessment-load"],
      PROBE_TARGET_DEFINITIONS.execution,
      PROBE_TARGET_DEFINITIONS.full,
    ];
  }

  return [PROBE_TARGET_DEFINITIONS[target]];
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`参数值无效：${value}。必须是正整数。`);
  }

  return parsed;
}

function parseArgs(argv: string[]): ProbeOptions {
  const options: ProbeOptions = {
    maxSteps: 5,
    modelId: process.env.AI_LESSON_MODEL ?? process.env.AI_MODEL ?? "gpt-5.5",
    mode: "native",
    runs: 3,
    target: "full",
  };

  argv.forEach((arg) => {
    if (arg.startsWith("--mode=")) {
      const mode = arg.slice("--mode=".length) as ProbeMode;

      if (mode !== "native" && mode !== "project" && mode !== "both") {
        throw new Error(`不支持的 --mode：${mode}。可选值：native、project、both。`);
      }

      options.mode = mode;
      return;
    }

    if (arg.startsWith("--target=")) {
      const target = arg.slice("--target=".length) as ProbeTarget;

      if (
        target !== "full" &&
        target !== "header" &&
        target !== "teaching" &&
        target !== "assessment-load" &&
        target !== "execution" &&
        target !== "all"
      ) {
        throw new Error(
          `不支持的 --target：${target}。可选值：full、header、teaching、assessment-load、execution、all。`,
        );
      }

      options.target = target;
      return;
    }

    if (arg.startsWith("--model=")) {
      options.modelId = arg.slice("--model=".length).trim() || options.modelId;
      return;
    }

    if (arg.startsWith("--runs=")) {
      options.runs = parsePositiveInteger(arg.slice("--runs=".length), options.runs);
      return;
    }

    if (arg.startsWith("--max-steps=")) {
      options.maxSteps = parsePositiveInteger(arg.slice("--max-steps=".length), options.maxSteps);
      return;
    }

    if (arg.startsWith("--output-dir=")) {
      options.outputDir = arg.slice("--output-dir=".length).trim() || undefined;
      return;
    }

    if (arg === "--help") {
      printHelp();
      process.exit(0);
    }

    throw new Error(`未知参数：${arg}`);
  });

  return options;
}

function printHelp() {
  console.log(
    [
      "CompetitionLessonPlan 复杂 schema 探针",
      "",
      "用法：",
      "  npm run probe:lesson-schema -- [--mode=native|project|both] [--target=full|header|teaching|assessment-load|execution|all] [--model=gpt-5.5] [--runs=3] [--max-steps=5] [--output-dir=artifacts/probes]",
      "",
      "说明：",
      "  native  直接声明 provider 支持 structured outputs，用于验证底层 schema 约束能力。",
      "  project 使用当前项目运行时配置与 JSON middleware，用于验证现有应用链路的稳定性。",
      "  both    同时执行两种模式，便于比较“底层能力”和“项目现状”的差异。",
      "  target  指定探测完整教案或某个自然子块；all 会依次执行全部子块与完整对象。",
    ].join("\n"),
  );
}

function resolveEnvReference(value?: string) {
  return value?.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => process.env[name] ?? "");
}

function assertModelCredentials() {
  const apiKey = resolveEnvReference(process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY);

  if (!apiKey) {
    throw new Error("未检测到 AI_API_KEY 或 OPENAI_API_KEY，无法执行教案 schema 探针。");
  }
}

function resolveChatModel(
  provider: {
    chat?: (modelId: string) => unknown;
    chatModel?: (modelId: string) => unknown;
  },
  modelId: string,
): ProbeModel {
  if (typeof provider.chatModel === "function") {
    return provider.chatModel(modelId) as ProbeModel;
  }

  if (typeof provider.chat === "function") {
    return provider.chat(modelId) as ProbeModel;
  }

  throw new Error("当前 provider 未暴露 chatModel/chat 接口，无法执行 schema 探针。");
}

function createNativeStructuredModel(modelId: string) {
  assertModelCredentials();
  const baseURL = resolveEnvReference(process.env.AI_BASE_URL);
  const apiKey = resolveEnvReference(process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY);

  if (baseURL) {
    const provider = createOpenAICompatible({
      name: `${process.env.AI_PROVIDER_NAME ?? "openaiCompatible"}-native-probe`,
      baseURL,
      apiKey,
      includeUsage: true,
      supportsStructuredOutputs: true,
    });

    return resolveChatModel(provider, modelId);
  }

  const provider = createOpenAI({ apiKey });
  return resolveChatModel(provider, modelId);
}

function createProjectStructuredModel(modelId: string) {
  assertModelCredentials();

  return createChatModel(modelId) as ProbeModel;
}

function buildSystemPrompt(definition: ProbeTargetDefinition) {
  return [
    "你是广东省小学体育教学与教研专家，负责输出正式可用的结构化体育课时计划对象。",
    `当前任务是“${definition.description}”的 schema 稳定性探针，不是聊天回复。`,
    "你必须只输出合法的结构化对象本身，不要输出解释、Markdown、HTML、代码围栏或额外字段。",
    "所有文本必须直接可用，不允许出现 XXX、待补充、同上、略、示例等占位内容。",
    ...definition.systemRules,
  ].join("\n\n");
}

function buildUserPrompt(definition: ProbeTargetDefinition) {
  return [
    `请生成一份广东省小学体育比赛课时计划的${definition.description}。`,
    "",
    "固定条件：",
    "- 年级：四年级",
    "- 水平：水平二",
    "- 课题：篮球行进间运球与变向运球",
    "- 课次：第2课时",
    "- 学生人数：40人",
    "- 课时：40分钟",
    "- 场地：学校篮球场半场",
    "- 器材：篮球20个、标志桶12个、分组背心4套、口哨1个",
    "",
    "课堂质量要求：",
    "- 准备部分要包含课堂常规、热身移动和球性唤醒。",
    "- 基本部分必须同时体现动作方法学习、分层有效练习、竞赛或展示、专项体能发展。",
    "- 结束部分要包含放松整理、课堂评价和器材回收。",
    "- 评价标准必须有清晰区分度，不能只是优良及格换词。",
    "- 运动负荷必须填写 averageHeartRate、targetHeartRateRange、groupDensity、individualDensity、chartPoints、rationale。",
    "- venueEquipment.venue 只写 1 项核心场地；equipment 写 3-4 项核心器材。",
    "- periodPlan.mainContent、safety、homework、reflection 都必须完整、具体、可执行。",
    ...definition.promptRequirements,
    "",
    "请直接返回结构化对象。",
  ].join("\n");
}

async function writeProbeArtifact(input: {
  mode: ProbeExecutionMode;
  outputDir: string;
  payload: unknown;
  run: number;
  target: ProbeExecutionTarget;
}) {
  const absoluteDir = path.isAbsolute(input.outputDir)
    ? input.outputDir
    : path.resolve(process.cwd(), input.outputDir);

  await mkdir(absoluteDir, { recursive: true });

  const filePath = path.join(
    absoluteDir,
    `competition-lesson-schema-probe.${input.mode}.${input.target}.run-${input.run}.json`,
  );
  await writeFile(filePath, `${JSON.stringify(input.payload, null, 2)}\n`, "utf8");

  return filePath;
}

async function runSingleProbe(input: {
  maxSteps: number;
  mode: ProbeExecutionMode;
  modelId: string;
  outputDir?: string;
  run: number;
  target: ProbeTargetDefinition;
}): Promise<ProbeRunResult> {
  const startedAt = performance.now();

  try {
    const model =
      input.mode === "native"
        ? createNativeStructuredModel(input.modelId)
        : createProjectStructuredModel(input.modelId);

    const result = await runModelOperationWithRetry(
      () =>
        generateText({
          model,
          system: buildSystemPrompt(input.target),
          messages: [{ role: "user", content: buildUserPrompt(input.target) }],
          stopWhen: stepCountIs(input.maxSteps),
          temperature: 0,
          output: Output.object({
            schema: input.target.schema,
            name: input.target.name,
            description: input.target.description,
          }),
        }),
      {
        mode: "lesson",
        requestId: `competition-lesson-schema-probe-${input.mode}-${input.target.target}-${input.run}`,
      },
    );

    const payload = input.target.schema.parse(result.output);
    const fullPlan = input.target.target === "full" ? competitionLessonPlanSchema.parse(payload) : undefined;
    const businessValidation = fullPlan
      ? performLessonBusinessValidation(fullPlan)
      : { isValid: true, issues: [] };
    const outputFile = input.outputDir
      ? await writeProbeArtifact({
          mode: input.mode,
          outputDir: input.outputDir,
          payload,
          run: input.run,
          target: input.target.target,
        })
      : undefined;

    return {
      businessIssues: businessValidation.issues.map((issue) => issue.message),
      businessValid: businessValidation.isValid,
      durationMs: Math.round(performance.now() - startedAt),
      evaluationLevels: fullPlan?.evaluation.map((item) => item.level) ?? [],
      mode: input.mode,
      outputFile,
      rowStructures: fullPlan?.periodPlan.rows.map((row) => row.structure) ?? [],
      run: input.run,
      schemaValid: true,
      target: input.target.target,
      title: fullPlan?.title ?? `${input.target.target} 子块`,
      usage: {
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
        totalTokens: result.usage?.totalTokens,
      },
    };
  } catch (error) {
    return {
      durationMs: Math.round(performance.now() - startedAt),
      errorMessage: error instanceof Error ? error.message : String(error),
      mode: input.mode,
      run: input.run,
      schemaValid: false,
      target: input.target.target,
    };
  }
}

function formatUsage(usage: ProbeRunSuccess["usage"]) {
  if (!usage.totalTokens) {
    return "tokens=unknown";
  }

  return `tokens=${usage.totalTokens} (in=${usage.inputTokens ?? "?"}, out=${usage.outputTokens ?? "?"})`;
}

function isSuccessfulRun(result: ProbeRunResult): result is ProbeRunSuccess {
  return result.schemaValid;
}

function logRunResult(result: ProbeRunResult) {
  if (!result.schemaValid) {
    console.log(
      `[${result.mode}/${result.target}] 第 ${result.run} 轮：SCHEMA FAIL，${result.durationMs}ms，${result.errorMessage}`,
    );
    return;
  }

  const businessStatus =
    result.target === "full"
      ? result.businessValid
        ? "BUSINESS PASS"
        : "BUSINESS FAIL"
      : "BUSINESS N/A";
  const summary = [
    `[${result.mode}/${result.target}] 第 ${result.run} 轮：SCHEMA PASS / ${businessStatus}`,
    `${result.durationMs}ms`,
    `title=${result.title}`,
    result.rowStructures.length > 0 ? `rows=${result.rowStructures.join("/")}` : undefined,
    result.evaluationLevels.length > 0 ? `evaluation=${result.evaluationLevels.join("/")}` : undefined,
    formatUsage(result.usage),
  ].filter(Boolean);

  console.log(summary.join(" | "));

  if (result.target === "full" && !result.businessValid) {
    console.log(
      formatLessonValidationIssues(
        result.businessIssues.map((message) => ({ code: "section-missing", message })),
      ),
    );
  }

  if (result.outputFile) {
    console.log(`  输出文件：${result.outputFile}`);
  }
}

async function executeMode(mode: ProbeExecutionMode, options: ProbeOptions) {
  const results: ProbeRunResult[] = [];

  for (const target of getTargetDefinitions(options.target)) {
    console.log(`目标块：${target.target}`);

    for (let run = 1; run <= options.runs; run += 1) {
      const result = await runSingleProbe({
        maxSteps: options.maxSteps,
        mode,
        modelId: options.modelId,
        outputDir: options.outputDir,
        run,
        target,
      });
      results.push(result);
      logRunResult(result);
    }
  }

  return results;
}

function buildAggregate(mode: ProbeExecutionMode, results: ProbeRunResult[]) {
  const schemaPassCount = results.filter((result) => result.schemaValid).length;
  const businessPassCount = results.filter(
    (result): result is ProbeRunSuccess => isSuccessfulRun(result) && result.target === "full" && result.businessValid,
  ).length;
  const durations = results.map((result) => result.durationMs);
  const totalDuration = durations.reduce((sum, value) => sum + value, 0);

  return {
    averageDurationMs: results.length ? Math.round(totalDuration / results.length) : 0,
    businessPassCount,
    mode,
    results,
    runs: results.length,
    schemaPassCount,
  };
}

function printAggregate(aggregate: ReturnType<typeof buildAggregate>) {
  console.log("");
  console.log(`[${aggregate.mode}] 汇总`);
  console.log(
    `- schema 通过：${aggregate.schemaPassCount}/${aggregate.runs}，完整教案业务校验通过：${aggregate.businessPassCount}/${aggregate.results.filter((result) => result.target === "full").length}，平均耗时：${aggregate.averageDurationMs}ms`,
  );

  const targets = Array.from(new Set(aggregate.results.map((result) => result.target)));

  targets.forEach((target) => {
    const scopedResults = aggregate.results.filter((result) => result.target === target);
    const scopedSchemaPass = scopedResults.filter((result) => result.schemaValid).length;
    const scopedBusinessPass = scopedResults.filter(
      (result): result is ProbeRunSuccess => isSuccessfulRun(result) && result.target === "full" && result.businessValid,
    ).length;
    const scopedAverage = Math.round(
      scopedResults.reduce((sum, result) => sum + result.durationMs, 0) / Math.max(scopedResults.length, 1),
    );

    console.log(
      `- ${target}: schema ${scopedSchemaPass}/${scopedResults.length}` +
        (target === "full" ? `，business ${scopedBusinessPass}/${scopedResults.length}` : "") +
        `，平均耗时 ${scopedAverage}ms`,
    );
  });
}

function shouldFail(results: ProbeRunResult[]) {
  return results.some((result) => !isSuccessfulRun(result) || (result.target === "full" && !result.businessValid));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const modes: ProbeExecutionMode[] =
    options.mode === "both" ? ["native", "project"] : [options.mode];

  console.log("CompetitionLessonPlan 复杂 schema 探针启动");
  console.log(
    `- model=${options.modelId} | runs=${options.runs} | maxSteps=${options.maxSteps} | mode=${options.mode} | target=${options.target}`,
  );
  let hasFailure = false;

  for (const mode of modes) {
    console.log("");
    console.log(`开始执行模式：${mode}`);
    const results = await executeMode(mode, options);
    const aggregate = buildAggregate(mode, results);
    printAggregate(aggregate);
    hasFailure ||= shouldFail(results);
  }

  if (hasFailure) {
    process.exitCode = 1;
    console.log("");
    console.log("探针结论：至少有 1 个目标块未通过 schema，或完整教案未通过业务校验。");
    return;
  }

  console.log("");
  console.log("探针结论：全部目标块均通过 schema，且完整教案通过业务校验。");
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
