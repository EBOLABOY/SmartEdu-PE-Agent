import type { FullOutput } from "@mastra/core/stream";
import {
  convertToModelMessages,
  extractJsonMiddleware,
  generateText,
  Output,
  stepCountIs,
  wrapLanguageModel,
} from "ai";

import {
  competitionLessonPlanSchema,
  type CompetitionLessonPlan,
} from "@/lib/competition-lesson-contract";
import {
  htmlScreenPlanSchema,
  type HtmlScreenPlan,
} from "@/lib/html-screen-plan-contract";
import {
  type GenerationMode,
} from "@/lib/lesson-authoring-contract";
import { buildLessonScreenPlanFromLessonPlan } from "@/lib/lesson-screen-plan";

import {
  buildHtmlScreenPlanningSystemPrompt,
  formatLessonScreenPlanForPrompt,
} from "../agents/html_screen_planner";
import { createChatModel } from "../models";
import { runModelOperationWithRetry } from "./lesson_generation_skill";

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

export type HtmlScreenPlanningResult = {
  modelMessageCount: number;
  plan: HtmlScreenPlan;
  source: "agent";
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

function buildPlanningModelMessages(input: {
  lessonPlan?: string;
  seedPlan: HtmlScreenPlan;
}) {
  return [
    {
      role: "user" as const,
      content: [
        "请基于已确认课时计划输出最终 HtmlScreenPlan。必须自动判断课堂需要几个页面，并把首页作为 sections[0]。",
        "",
        "教学环节参考草案（只用于防止遗漏 periodPlan.rows，不是页面设计稿；你可以补首页、合并、拆分和重写视觉系统）：",
        formatLessonScreenPlanForPrompt(input.seedPlan),
        "",
        "已确认课时计划 JSON：",
        input.lessonPlan ?? "未提供已确认课时计划 JSON。",
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
  const modelMessages = buildPlanningModelMessages({
    lessonPlan: input.lessonPlan,
    seedPlan,
  });

  try {
    const result = await runModelOperationWithRetry(
      () =>
        input.agentGenerate(modelMessages, {
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
      {
        mode: "html" satisfies GenerationMode,
        requestId: input.requestId,
      },
    );

    return {
      modelMessageCount: modelMessages.length,
      plan: normalizeAgentPlan(result.object, seedPlan),
      source: "agent",
    };
  } catch (error) {
    const errorMessage = `HTML 大屏 Agent 分镜规划失败：${
      error instanceof Error ? error.message : "unknown-error"
    }`;

    console.warn("[lesson-authoring] html-screen-planning-failed", {
      requestId: input.requestId,
      message: error instanceof Error ? error.message : "unknown-error",
    });
    throw new HtmlScreenPlanningError(errorMessage, error);
  }
}

function createStructuredPlannerModel(modelId: string) {
  return wrapLanguageModel({
    model: createChatModel(modelId),
    middleware: extractJsonMiddleware(),
  });
}

export async function runServerHtmlScreenPlanningSkill(input: {
  additionalInstructions?: string;
  lessonPlan?: string;
  maxSteps: number;
  modelId?: string;
  requestId: string;
  seedPlan?: HtmlScreenPlan;
}) {
  const model = createStructuredPlannerModel(input.modelId ?? DEFAULT_HTML_PLANNER_MODEL_ID);
  const agentGenerate: HtmlScreenPlanAgentRunner = async (messages, options) => {
    const result = await generateText({
      model,
      system: options.system,
      messages,
      stopWhen: stepCountIs(options.maxSteps),
      temperature: 0,
      output: Output.object({
        schema: htmlScreenPlanSchema,
        name: "HtmlScreenPlan",
        description: options.structuredOutput.instructions,
      }),
    });

    return {
      object: result.output,
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
