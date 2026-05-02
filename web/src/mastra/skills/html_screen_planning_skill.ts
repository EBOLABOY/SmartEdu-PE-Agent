import type { FullOutput } from "@mastra/core/stream";
import {
  convertToModelMessages,
  generateText,
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
import {
  formatHtmlScreenPlanProtocolDiagnostics,
  parseHtmlScreenPlanProtocolToHtmlScreenPlan,
} from "@/lib/html-screen-plan-protocol";
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

function buildProtocolPlanningSystemPrompt(options: HtmlScreenPlanGenerateOptions) {
  return [
    options.system,
    "你正在执行服务端确定性 HTML 大屏分镜规划任务，不是工具调用或聊天回复。",
    "你必须只输出“自定义 HTML 分镜行协议”文本。不要输出 JSON、Markdown 标题、HTML、XML、代码围栏或解释文字。",
    "所有字段必须使用 UTF-8 中文内容。普通字段用 key=value；@visual_system 块内可以直接写正文行。",
    "必须包含：@visual_system、至少一个首页 @section、覆盖全部课时计划行的教学页 @section。",
    "第一个 @section 必须是 page_role=cover，首页不写 source_row_index，也不参与倒计时。",
    "非首页 @section 必须写 title、page_role、source_row_index 或 source_row_indexes、duration_seconds、objective、student_actions、safety_cue、evaluation_cue、visual_intent、visual_mode、page_prompt、reason。",
    "合并多个课时计划行时写 source_row_indexes=0,1；拆分同一行时可复用 source_row_index。",
    "student_actions 使用分号分隔 1-3 条动作；visual_mode 只能写 html、image 或 hybrid。",
    "visual_mode=image 或 hybrid 时必须写 image_prompt；visual_mode=html 时不要写 image_prompt。",
    "page_prompt 必须是一行完整提示词，交给后续 HTML 片段生成模型使用；不要在协议中输出真正 HTML。",
    "下面只是协议骨架，不是内容模板；具体分镜、视觉意图和页面提示词由你根据课时计划自主生成，不要照抄骨架说明：",
    "@visual_system",
    "整套课堂大屏的统一视觉系统描述。",
    "",
    "@section",
    "title=",
    "page_role=cover",
    "visual_mode=html",
    "page_prompt=",
    "reason=",
    "",
    "@section",
    "title=",
    "page_role=learnPractice",
    "source_row_index=0",
    "duration_seconds=",
    "objective=",
    "student_actions=",
    "safety_cue=",
    "evaluation_cue=",
    "visual_intent=",
    "visual_mode=html",
    "page_prompt=",
    "reason=",
  ].join("\n\n");
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
      system: buildProtocolPlanningSystemPrompt(options),
      messages,
      stopWhen: stepCountIs(options.maxSteps),
      temperature: 0,
    });

    let object: HtmlScreenPlan;

    try {
      object = parseHtmlScreenPlanProtocolToHtmlScreenPlan(result.text);
    } catch (error) {
      throw new Error(
        error && typeof error === "object" && "diagnostics" in error
          ? `HTML 分镜行协议生成失败：\n${formatHtmlScreenPlanProtocolDiagnostics(
              error as Parameters<typeof formatHtmlScreenPlanProtocolDiagnostics>[0],
            )}`
          : `HTML 分镜行协议生成失败：${error instanceof Error ? error.message : "unknown-error"}`,
      );
    }

    return {
      object,
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
