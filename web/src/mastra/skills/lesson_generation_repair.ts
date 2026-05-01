import type { FullOutput } from "@mastra/core/stream";
import { convertToModelMessages } from "ai";

import {
  competitionLessonPlanSchema,
  type CompetitionLessonPlan,
} from "@/lib/competition-lesson-contract";
import type { SmartEduUIMessage, WorkflowTraceEntry } from "@/lib/lesson-authoring-contract";

import {
  formatLessonValidationIssues,
  performLessonBusinessValidation,
} from "./lesson_generation_validation";
import {
  runLessonGenerationSkill,
  runModelOperationWithRetry,
} from "./lesson_generation_skill";

type AgentModelMessages = Awaited<ReturnType<typeof convertToModelMessages>>;

type LessonRepairGenerateOptions = {
  system: string;
  maxSteps: number;
  providerOptions: {
    openai: {
      store: true;
    };
  };
  structuredOutput: {
    schema: typeof competitionLessonPlanSchema;
    instructions: string;
    jsonPromptInjection: boolean;
  };
};

export type LessonRepairGenerateRunner = (
  messages: AgentModelMessages,
  options: LessonRepairGenerateOptions,
) => Promise<FullOutput<CompetitionLessonPlan>>;

function nowIsoString() {
  return new Date().toISOString();
}

function createRepairTraceEntry(
  step: string,
  status: WorkflowTraceEntry["status"],
  detail: string,
): WorkflowTraceEntry {
  return {
    detail,
    status,
    step,
    timestamp: nowIsoString(),
  };
}

function buildRepairSystemPrompt(baseSystem: string) {
  return [
    "你正在执行体育课时计划结构化修复任务，不是自由续写对话。",
    "目标是在尽量保留原有教学意图、环节结构和已完成内容的前提下，修正占位符、缺失项、业务结构不一致和明显未完成字段。",
    "你必须只输出符合 CompetitionLessonPlan schema 的完整对象，不要输出解释、Markdown、代码围栏或额外文本。",
    baseSystem,
  ].join("\n\n");
}

function buildStandardsRepairHints(input: {
  workflow: Parameters<typeof runLessonGenerationSkill>[0]["workflow"];
}) {
  const references = input.workflow.standards?.references;

  if (!references?.length) {
    return undefined;
  }

  return [
    "修复时请继续保持与以下课程标准依据一致：",
    ...references.slice(0, 5).map((reference) => {
      return `- ${reference.title}：${reference.summary}（${reference.citation}）`;
    }),
  ].join("\n");
}

function normalizeCitationText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function formatTextbookCitationForLesson(input: {
  citation: string;
  edition: string | null;
  module: string;
  publisher: string;
  textbookName: string;
}) {
  const citation = normalizeCitationText(input.citation);
  const edition = input.edition ? `，${input.edition}` : "";

  return `${input.publisher}${edition}《${input.textbookName}》${input.module}：${citation}`;
}

function buildTextbookCitationLine(workflow: Parameters<typeof runLessonGenerationSkill>[0]["workflow"]) {
  const references = workflow.textbook?.references ?? [];
  const citations = [
    ...new Set(
      references
        .filter((reference) => reference.sourceKind === "teacher-guide" || reference.sourceKind === "textbook-body")
        .map((reference) =>
          formatTextbookCitationForLesson({
            citation: reference.citation,
            edition: reference.edition,
            module: reference.module,
            publisher: reference.publisher,
            textbookName: reference.textbookName,
          }),
        )
        .filter(Boolean),
    ),
  ].slice(0, 3);

  if (citations.length === 0) {
    return undefined;
  }

  return `教材依据：${citations.join("；")}。`;
}

function hasTextbookCitationLine(lessonPlan: CompetitionLessonPlan) {
  return lessonPlan.narrative.textbookAnalysis.some((line) => /^教材依据[:：]/.test(line.trim()));
}

export function appendTextbookCitationsToLessonPlan(
  lessonPlan: CompetitionLessonPlan,
  workflow: Parameters<typeof runLessonGenerationSkill>[0]["workflow"],
) {
  const citationLine = buildTextbookCitationLine(workflow);
  const analysisWithoutUntrustedCitations = lessonPlan.narrative.textbookAnalysis.filter(
    (line) => !/^教材依据[:：]/.test(line.trim()),
  );

  if (!citationLine && !hasTextbookCitationLine(lessonPlan)) {
    return lessonPlan;
  }

  return competitionLessonPlanSchema.parse({
    ...lessonPlan,
    narrative: {
      ...lessonPlan.narrative,
      textbookAnalysis: citationLine
        ? [...analysisWithoutUntrustedCitations, citationLine]
        : analysisWithoutUntrustedCitations,
    },
  });
}

function buildRepairInstruction(input: {
  draft: CompetitionLessonPlan;
  issues: ReturnType<typeof performLessonBusinessValidation>["issues"];
  workflow: Parameters<typeof runLessonGenerationSkill>[0]["workflow"];
}) {
  return [
    "请修正下面这份结构化体育课时计划。",
    "修复要求：",
    "1. 保留原有教学目标、项目主题和课堂结构，不要无故重写整份课时计划。",
    "2. 不要保留 XXX、待补充、同上 等占位符。",
    "3. 课时计划至少覆盖准备部分、基本部分、结束部分。",
    "4. 评价标准必须包含三颗星、二颗星、一颗星各 1 条。",
    "5. 仅输出合法的 CompetitionLessonPlan 对象。",
    "",
    "发现的问题：",
    formatLessonValidationIssues(input.issues),
    "",
    buildStandardsRepairHints({ workflow: input.workflow }) ?? "本轮未提供额外课程标准提示。",
    "",
    buildTextbookCitationLine(input.workflow) ??
      "本轮未提供可引用的教材检索来源；不要虚构教材出处。",
    "",
    "待修复的当前课时计划 JSON：",
    JSON.stringify(input.draft, null, 2),
  ].join("\n");
}

async function buildRepairModelMessages(input: {
  draft: CompetitionLessonPlan;
  issues: ReturnType<typeof performLessonBusinessValidation>["issues"];
  messages: SmartEduUIMessage[];
  requestId: string;
  workflow: Parameters<typeof runLessonGenerationSkill>[0]["workflow"];
}) {
  return convertToModelMessages([
    ...input.messages,
    {
      id: `${input.requestId}-lesson-repair-draft`,
      role: "assistant",
      parts: [
        {
          type: "text",
          text: JSON.stringify(input.draft),
        },
      ],
    } satisfies SmartEduUIMessage,
    {
      id: `${input.requestId}-lesson-repair-request`,
      role: "user",
      parts: [
        {
          type: "text",
          text: buildRepairInstruction(input),
        },
      ],
    } satisfies SmartEduUIMessage,
  ]);
}

async function repairLessonPlan(input: {
  draft: CompetitionLessonPlan;
  issues: ReturnType<typeof performLessonBusinessValidation>["issues"];
  messages: SmartEduUIMessage[];
  repairGenerate: LessonRepairGenerateRunner;
  requestId: string;
  workflow: Parameters<typeof runLessonGenerationSkill>[0]["workflow"];
}) {
  const repairMessages = await buildRepairModelMessages(input);
  const repaired = await runModelOperationWithRetry(
    () =>
      input.repairGenerate(repairMessages, {
        maxSteps: Math.max(1, Math.min(input.workflow.generationPlan.maxSteps, 2)),
        providerOptions: {
          openai: {
            store: true,
          },
        },
        structuredOutput: {
          schema: competitionLessonPlanSchema,
          instructions:
            "只输出修复后的完整 CompetitionLessonPlan JSON 对象，不要输出解释、Markdown 或额外文字。",
          jsonPromptInjection: true,
        },
        system: buildRepairSystemPrompt(input.workflow.system),
      }),
    {
      mode: "lesson",
      requestId: input.requestId,
    },
  );

  return competitionLessonPlanSchema.parse(repaired.object);
}

export async function runLessonGenerationWithRepair(
  input: Parameters<typeof runLessonGenerationSkill>[0] & {
    onTrace?: (entry: WorkflowTraceEntry) => void;
    repairGenerate?: LessonRepairGenerateRunner;
  },
) {
  const generation = await runLessonGenerationSkill(input);

  const finalLessonPlanPromise = generation.finalLessonPlanPromise?.then(async (draft) => {
    const validation = performLessonBusinessValidation(draft);

    if (validation.isValid) {
      const citedDraft = appendTextbookCitationsToLessonPlan(draft, input.workflow);

      input.onTrace?.(
        createRepairTraceEntry(
          "validate-lesson-output",
          "success",
          input.workflow.textbook?.references?.length
            ? "结构化课时计划已通过业务语义校验，并已写入教材依据引用。"
            : "结构化课时计划已通过业务语义校验，无需自动修复。",
        ),
      );
      return citedDraft;
    }

    input.onTrace?.(
      createRepairTraceEntry(
        "lesson-repair-started",
        "running",
        `检测到 ${validation.issues.length} 处业务语义问题，正在自动完善结构化课时计划。`,
      ),
    );

    if (!input.repairGenerate) {
      const message = `结构化课时计划存在待修复问题，但当前未提供修复模型：\n${formatLessonValidationIssues(validation.issues)}`;

      input.onTrace?.(createRepairTraceEntry("lesson-repair-failed", "failed", message));
      throw new Error(message);
    }

    try {
      const repairedPlan = await repairLessonPlan({
        draft,
        issues: validation.issues,
        messages: input.messages,
        repairGenerate: input.repairGenerate,
        requestId: input.requestId,
        workflow: input.workflow,
      });
      const repairedValidation = performLessonBusinessValidation(repairedPlan);

      if (!repairedValidation.isValid) {
        throw new Error(
          `自动修复后仍存在业务问题：\n${formatLessonValidationIssues(repairedValidation.issues)}`,
        );
      }

      const citedRepairedPlan = appendTextbookCitationsToLessonPlan(repairedPlan, input.workflow);

      input.onTrace?.(
        createRepairTraceEntry(
          "lesson-repair-finished",
          "success",
          input.workflow.textbook?.references?.length
            ? `已完成自动修复，共修正 ${validation.issues.length} 处业务语义问题，并写入教材依据引用。`
            : `已完成自动修复，共修正 ${validation.issues.length} 处业务语义问题。`,
        ),
      );
      return citedRepairedPlan;
    } catch (error) {
      const message = `结构化课时计划自动修复失败：${error instanceof Error ? error.message : "unknown-error"}`;

      input.onTrace?.(createRepairTraceEntry("lesson-repair-failed", "failed", message));
      throw new Error(message);
    }
  });

  return {
    ...generation,
    finalLessonPlanPromise,
  };
}
