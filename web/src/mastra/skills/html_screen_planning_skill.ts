import type { FullOutput } from "@mastra/core/stream";
import { convertToModelMessages } from "ai";

import {
  competitionLessonPlanSchema,
  type CompetitionLessonPlan,
} from "@/lib/competition-lesson-contract";
import {
  lessonScreenPlanSchema,
  type GenerationMode,
  type LessonScreenPlan,
} from "@/lib/lesson-authoring-contract";
import { buildLessonScreenPlanFromLessonPlan } from "@/lib/lesson-screen-plan";

import {
  buildHtmlScreenPlanningSystemPrompt,
  formatLessonScreenPlanForPrompt,
} from "../agents/html_screen_planner";
import { runModelOperationWithRetry } from "./lesson_generation_skill";

type AgentModelMessages = Awaited<ReturnType<typeof convertToModelMessages>>;

type HtmlScreenPlanGenerateOptions = {
  system: string;
  maxSteps: number;
  providerOptions: {
    openai: {
      store: true;
    };
  };
  structuredOutput: {
    schema: typeof lessonScreenPlanSchema;
    instructions: string;
    jsonPromptInjection: boolean;
  };
};

export type HtmlScreenPlanAgentRunner = (
  messages: AgentModelMessages,
  options: HtmlScreenPlanGenerateOptions,
) => Promise<FullOutput<LessonScreenPlan>>;

export type HtmlScreenPlanningResult = {
  modelMessageCount: number;
  plan: LessonScreenPlan;
  source: "agent" | "deterministic-fallback" | "seed-fallback" | "minimal-fallback";
  warning?: string;
};

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

function buildMinimalScreenPlan(): LessonScreenPlan {
  return {
    sections: [
      {
        title: "课堂学习辅助",
        durationSeconds: 300,
        supportModule: "formation",
        objective: "在无法解析结构化课时行时，提供安全的课堂组织提示页。",
        studentActions: ["看清当前任务", "保持练习距离", "听教师口令切换"],
        safetyCue: "保持前后左右安全距离，按教师口令开始与停止。",
        evaluationCue: "观察学生是否按提示完成动作并遵守安全边界。",
        visualIntent: "绘制课堂组织队形图和安全边界提示。",
        reason: "未能从已确认教案中解析课时行，使用最小可运行页面计划。",
      },
    ],
  };
}

export function buildFallbackHtmlScreenPlan(input: {
  lessonPlan?: string;
  seedPlan?: LessonScreenPlan;
}): Pick<HtmlScreenPlanningResult, "plan" | "source"> {
  const parsedLessonPlan = parseConfirmedLessonPlan(input.lessonPlan);

  if (parsedLessonPlan) {
    return {
      plan: buildLessonScreenPlanFromLessonPlan(parsedLessonPlan),
      source: "deterministic-fallback",
    };
  }

  const parsedSeedPlan = lessonScreenPlanSchema.safeParse(input.seedPlan);

  if (parsedSeedPlan.success) {
    return {
      plan: parsedSeedPlan.data,
      source: "seed-fallback",
    };
  }

  return {
    plan: buildMinimalScreenPlan(),
    source: "minimal-fallback",
  };
}

function buildPlanningModelMessages(input: {
  fallbackPlan: LessonScreenPlan;
  lessonPlan?: string;
  seedPlan?: LessonScreenPlan;
}) {
  return [
    {
      role: "user" as const,
      content: [
        "请基于已确认教案输出最终 LessonScreenPlan。必须自动判断课堂有几个真实教学环节页。",
        "",
        "确定性初始计划（可修正但不能遗漏环节）：",
        formatLessonScreenPlanForPrompt(input.seedPlan ?? input.fallbackPlan),
        "",
        "已确认教案 JSON：",
        input.lessonPlan ?? "未提供已确认教案 JSON。",
      ].join("\n"),
    },
  ] as AgentModelMessages;
}

function findFallbackSection(fallbackPlan: LessonScreenPlan, section: LessonScreenPlan["sections"][number], index: number) {
  if (section.sourceRowIndex !== undefined) {
    const matched = fallbackPlan.sections.find((fallback) => fallback.sourceRowIndex === section.sourceRowIndex);

    if (matched) {
      return matched;
    }
  }

  return fallbackPlan.sections[index];
}

function normalizeAgentPlan(agentPlan: LessonScreenPlan, fallbackPlan: LessonScreenPlan) {
  const parsed = lessonScreenPlanSchema.parse(agentPlan);

  if (parsed.sections.length < fallbackPlan.sections.length) {
    throw new Error(
      `HTML 大屏规划页数少于结构化教案环节数：agent=${parsed.sections.length}, fallback=${fallbackPlan.sections.length}`,
    );
  }

  return lessonScreenPlanSchema.parse({
    sections: parsed.sections.map((section, index) => {
      const fallbackSection = findFallbackSection(fallbackPlan, section, index);

      return {
        ...fallbackSection,
        ...section,
      };
    }),
  });
}

export async function runHtmlScreenPlanningSkill(input: {
  agentGenerate: HtmlScreenPlanAgentRunner;
  lessonPlan?: string;
  maxSteps: number;
  requestId: string;
  seedPlan?: LessonScreenPlan;
}): Promise<HtmlScreenPlanningResult> {
  const fallback = buildFallbackHtmlScreenPlan({
    lessonPlan: input.lessonPlan,
    seedPlan: input.seedPlan,
  });
  const modelMessages = buildPlanningModelMessages({
    fallbackPlan: fallback.plan,
    lessonPlan: input.lessonPlan,
    seedPlan: input.seedPlan,
  });

  try {
    const result = await runModelOperationWithRetry(
      () =>
        input.agentGenerate(modelMessages, {
          system: buildHtmlScreenPlanningSystemPrompt(),
          maxSteps: input.maxSteps,
          providerOptions: {
            openai: {
              store: true,
            },
          },
          structuredOutput: {
            schema: lessonScreenPlanSchema,
            instructions: "只输出符合 LessonScreenPlan schema 的结构化对象，不要输出 HTML 或解释文字。",
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
      plan: normalizeAgentPlan(result.object, fallback.plan),
      source: "agent",
    };
  } catch (error) {
    const warning = `HTML 大屏 Agent 分镜规划失败，已使用${fallback.source}：${
      error instanceof Error ? error.message : "unknown-error"
    }`;

    console.warn("[lesson-authoring] html-screen-planning-fallback", {
      requestId: input.requestId,
      source: fallback.source,
      message: error instanceof Error ? error.message : "unknown-error",
    });

    return {
      modelMessageCount: modelMessages.length,
      plan: fallback.plan,
      source: fallback.source,
      warning,
    };
  }
}
