import type { FullOutput } from "@mastra/core/stream";
import {
  convertToModelMessages,
  generateText,
  Output,
  stepCountIs,
} from "ai";

import {
  competitionLessonPlanSchema,
  type CompetitionLessonPlan,
} from "@/lib/competition-lesson-contract";
import {
  htmlScreenPlanSchema,
  type HtmlScreenPlan,
} from "@/lib/html-screen-plan-contract";
import { buildLessonScreenPlanFromLessonPlan } from "@/lib/lesson-screen-plan";

import { buildHtmlScreenPlanningSystemPrompt } from "../../agents/html_screen_planner";
import { createChatModel } from "../../models";
import {
  resolvePositiveIntegerEnv,
  withEnhancementTimeout,
} from "../../support/enhancement_execution";

type AgentModelMessages = Awaited<ReturnType<typeof convertToModelMessages>>;

const DEFAULT_HTML_PLANNER_MODEL_ID =
  process.env.AI_HTML_PLANNER_MODEL ?? process.env.AI_MODEL ?? "gpt-4.1-mini";

type HtmlScreenPlanGenerateOptions = {
  system: string;
  maxSteps: number;
  providerOptions: {
    openai: {
      store: true;
    };
  };
  structuredOutput: {
    schema: typeof htmlScreenPlanSchema;
    instructions: string;
    jsonPromptInjection: boolean;
  };
};

export type HtmlScreenPlanAgentRunner = (
  messages: AgentModelMessages,
  options: HtmlScreenPlanGenerateOptions,
) => Promise<FullOutput<HtmlScreenPlan>>;

export type HtmlScreenPlanningSource = "agent";

export type HtmlScreenPlanningResult = {
  modelMessageCount: number;
  plan: HtmlScreenPlan;
  source: HtmlScreenPlanningSource;
  warnings: string[];
};

export class HtmlScreenPlanningError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "HtmlScreenPlanningError";
  }
}

function resolveHtmlScreenPlanningTimeoutMs() {
  return resolvePositiveIntegerEnv("AI_HTML_PLANNER_TIMEOUT_MS", 90_000);
}

function parseConfirmedLessonPlan(lessonPlan?: string): CompetitionLessonPlan | undefined {
  if (!lessonPlan?.trim()) {
    return undefined;
  }

  try {
    const parsed = competitionLessonPlanSchema.safeParse(JSON.parse(lessonPlan));

    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function buildLessonPlanNinthSectionForPrompt(lessonPlan?: string) {
  const parsedLessonPlan = parseConfirmedLessonPlan(lessonPlan);

  if (!parsedLessonPlan) {
    return undefined;
  }

  return JSON.stringify({
    loadEstimate: parsedLessonPlan.loadEstimate,
    periodPlan: parsedLessonPlan.periodPlan,
    venueEquipment: parsedLessonPlan.venueEquipment,
  });
}

function buildLessonPlanCoverMetaForPrompt(lessonPlan?: string) {
  const parsedLessonPlan = parseConfirmedLessonPlan(lessonPlan);

  if (!parsedLessonPlan) {
    return undefined;
  }

  return JSON.stringify({
    meta: parsedLessonPlan.meta,
    subtitle: parsedLessonPlan.subtitle,
    teacher: parsedLessonPlan.teacher,
    title: parsedLessonPlan.title,
  });
}

function buildSeedHtmlScreenPlan(input: {
  lessonPlan?: string;
  seedPlan?: HtmlScreenPlan;
}): HtmlScreenPlan {
  const parsedLessonPlan = parseConfirmedLessonPlan(input.lessonPlan);

  if (parsedLessonPlan) {
    return buildLessonScreenPlanFromLessonPlan(parsedLessonPlan);
  }

  const parsedSeedPlan = htmlScreenPlanSchema.safeParse(input.seedPlan);

  if (parsedSeedPlan.success) {
    return parsedSeedPlan.data;
  }

  throw new HtmlScreenPlanningError("HTML 大屏分镜规划缺少可用课时计划，无法构造规划输入。");
}

function createSeedCoverSection(seedPlan: HtmlScreenPlan): HtmlScreenPlan["sections"][number] {
  const firstTeachingSection = seedPlan.sections.find((section) => section.pageRole !== "cover");
  const title = firstTeachingSection?.title ?? seedPlan.sections[0]?.title ?? "体育课堂";

  return {
    title,
    pageRole: "cover",
    visualMode: "html",
    pagePrompt: [
      `生成“${title}”互动大屏首页封面。`,
      "使用现代发布会幻灯片式课堂启动页结构，采用深色沉浸背景和具有张力的非对称排版。",
      "大标题使用超大字号并偏向屏幕中左侧，学校和教师姓名作为高对比小字号 Meta 信息下沉到右下角或底部，并保留清晰的开始上课按钮视觉。",
      "不要生成倒计时，不要输出完整 HTML、section、script、style 或 Markdown。",
    ].join("\n"),
    reason: "服务端根据课时计划补充首页草案，供分镜规划模型参考。",
  };
}

function createPlanningSeedPlan(seedPlan: HtmlScreenPlan): HtmlScreenPlan {
  const hasCover = seedPlan.sections[0]?.pageRole === "cover";

  return htmlScreenPlanSchema.parse({
    visualSystem: seedPlan.visualSystem,
    sections: hasCover ? seedPlan.sections : [createSeedCoverSection(seedPlan), ...seedPlan.sections],
  });
}

function buildPlanningModelMessages(input: {
  lessonPlan?: string;
  seedPlan: HtmlScreenPlan;
}) {
  const coverMeta = buildLessonPlanCoverMetaForPrompt(input.lessonPlan);
  const lessonPlanNinthSection = buildLessonPlanNinthSectionForPrompt(input.lessonPlan);

  return [
    {
      role: "user" as const,
      content: [
        "请基于已确认课时计划第九部分输出最终 HtmlScreenPlan。必须自动判断课堂需要几个页面，并把首页作为 sections[0]。",
        "",
        "首页元信息 JSON（仅用于首页标题、学校、教师、年级人数等 Meta 信息，不用于拆分教学页）：",
        coverMeta ?? "未提供首页元信息 JSON。",
        "",
        "已确认课时计划第九部分 JSON（仅包含 periodPlan、venueEquipment、loadEstimate）：",
        lessonPlanNinthSection ?? "未提供已确认课时计划第九部分 JSON。",
      ].join("\n"),
    },
  ] as AgentModelMessages;
}

function findSeedSection(seedPlan: HtmlScreenPlan, section: HtmlScreenPlan["sections"][number], index: number) {
  if (section.pageRole === "cover") {
    return undefined;
  }

  if (section.sourceRowIndex !== undefined) {
    const matched = seedPlan.sections.find((seedSection) => seedSection.sourceRowIndex === section.sourceRowIndex);

    if (matched) {
      return matched;
    }
  }

  const firstSourceRowIndex = section.sourceRowIndexes?.[0];

  if (firstSourceRowIndex !== undefined) {
    const matched = seedPlan.sections.find((seedSection) => seedSection.sourceRowIndex === firstSourceRowIndex);

    if (matched) {
      return matched;
    }
  }

  return seedPlan.sections[index];
}

function getCoveredSourceRowIndexes(section: HtmlScreenPlan["sections"][number]) {
  return new Set([
    ...(section.sourceRowIndexes ?? []),
    ...(section.sourceRowIndex !== undefined ? [section.sourceRowIndex] : []),
  ]);
}

function assertCoversSeedRows(agentPlan: HtmlScreenPlan, seedPlan: HtmlScreenPlan) {
  const required = seedPlan.sections
    .map((section) => section.sourceRowIndex)
    .filter((index): index is number => index !== undefined);
  const covered = new Set(
    agentPlan.sections.flatMap((section) => Array.from(getCoveredSourceRowIndexes(section))),
  );
  const missing = required.filter((index) => !covered.has(index));

  if (missing.length) {
    throw new Error(`HTML 大屏规划遗漏课时计划行：${missing.map((index) => index + 1).join("、")}`);
  }
}

function normalizeAgentPlan(agentPlan: HtmlScreenPlan, seedPlan: HtmlScreenPlan) {
  const parsed = htmlScreenPlanSchema.parse(agentPlan);

  if (parsed.sections[0]?.pageRole !== "cover") {
    throw new Error("HTML 大屏规划必须把首页作为 sections[0]，且 pageRole 必须为 cover。");
  }

  assertCoversSeedRows(parsed, seedPlan);

  return htmlScreenPlanSchema.parse({
    visualSystem: parsed.visualSystem,
    sections: parsed.sections.map((section, index) => {
      const seedSection = findSeedSection(seedPlan, section, index);

      return {
        ...(seedSection ?? {}),
        ...section,
        visualMode: section.visualMode ?? seedSection?.visualMode ?? "html",
      };
    }),
  });
}

export async function runHtmlScreenPlanningSkill(input: {
  additionalInstructions?: string;
  agentGenerate: HtmlScreenPlanAgentRunner;
  lessonPlan?: string;
  maxSteps: number;
  requestId: string;
  seedPlan?: HtmlScreenPlan;
}): Promise<HtmlScreenPlanningResult> {
  const seedPlan = buildSeedHtmlScreenPlan({
    lessonPlan: input.lessonPlan,
    seedPlan: input.seedPlan,
  });
  const planningSeedPlan = createPlanningSeedPlan(seedPlan);
  const modelMessages = buildPlanningModelMessages({
    lessonPlan: input.lessonPlan,
    seedPlan: planningSeedPlan,
  });
  const modelMessageCount = modelMessages.length;
  const timeoutMs = resolveHtmlScreenPlanningTimeoutMs();

  try {
    const result = await withEnhancementTimeout({
      operation: input.agentGenerate(modelMessages, {
        system: [buildHtmlScreenPlanningSystemPrompt(), input.additionalInstructions].filter(Boolean).join("\n\n"),
        maxSteps: input.maxSteps,
        providerOptions: {
          openai: {
            store: true,
          },
        },
        structuredOutput: {
          schema: htmlScreenPlanSchema,
          instructions: "只输出符合 HtmlScreenPlan schema 的结构化对象，不要输出 HTML 或解释文字。",
          jsonPromptInjection: true,
        },
      }),
      timeoutMessage: `HTML 大屏 AI 分镜规划超过 ${Math.round(timeoutMs / 1000)} 秒，请重试。`,
      timeoutMs,
    });

    return {
      modelMessageCount,
      plan: normalizeAgentPlan(result.object, planningSeedPlan),
      source: "agent",
      warnings: [],
    };
  } catch (error) {
    throw new HtmlScreenPlanningError(
      `HTML 大屏分镜规划失败：${error instanceof Error ? error.message : "unknown-error"}`,
      error,
    );
  }
}

export async function runServerHtmlScreenPlanningSkill(input: {
  additionalInstructions?: string;
  lessonPlan?: string;
  maxSteps: number;
  modelId?: string;
  requestId: string;
  seedPlan?: HtmlScreenPlan;
}) {
  const model = createChatModel(input.modelId ?? DEFAULT_HTML_PLANNER_MODEL_ID);
  const agentGenerate: HtmlScreenPlanAgentRunner = async (messages, options) => {
    const result = await generateText({
      model,
      system: [
        options.system,
        options.structuredOutput.instructions,
        "你正在执行服务端确定性 HTML 大屏分镜规划任务，不是工具调用或聊天回复。",
        "必须返回可被 HtmlScreenPlan schema 校验的结构化对象；不要输出 HTML、Markdown、XML、代码围栏或解释文字。",
        "sections[0] 必须是首页，pageRole 必须为 cover；非首页必须覆盖全部课时计划行，并写清 pagePrompt，供后续逐页 HTML 片段生成使用。",
      ].join("\n\n"),
      messages,
      maxRetries: 0,
      output: Output.object({
        schema: options.structuredOutput.schema,
        name: "HtmlScreenPlan",
        description: "HTML screen storyboard plan for a PE lesson.",
      }),
      stopWhen: stepCountIs(options.maxSteps),
      temperature: 0,
      timeout: resolveHtmlScreenPlanningTimeoutMs(),
    });

    return {
      object: htmlScreenPlanSchema.parse(result.output),
      toolResults: [],
      steps: [],
    } as unknown as FullOutput<HtmlScreenPlan>;
  };

  return runHtmlScreenPlanningSkill({
    additionalInstructions: input.additionalInstructions,
    agentGenerate,
    lessonPlan: input.lessonPlan,
    maxSteps: input.maxSteps,
    requestId: input.requestId,
    seedPlan: input.seedPlan,
  });
}
