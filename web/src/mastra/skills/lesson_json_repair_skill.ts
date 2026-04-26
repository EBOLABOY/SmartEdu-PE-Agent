import { generateObject } from "ai";

import { competitionLessonPlanSchema, type CompetitionLessonPlan } from "@/lib/competition-lesson-contract";

import { createChatModel } from "../models";

export type LessonJsonRepairInput = {
  draftText: string;
  issue: string;
};

export type LessonJsonRepairSkill = (input: LessonJsonRepairInput) => Promise<CompetitionLessonPlan>;

const MAX_REPAIR_ATTEMPTS = 3;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRepairDelayMs(attempt: number) {
  return Math.min(500 * 2 ** (attempt - 1), 3_000);
}

export async function runLessonJsonRepairSkill(
  input: LessonJsonRepairInput,
  options: { modelId: string },
): Promise<CompetitionLessonPlan> {
  const model = createChatModel(options.modelId);
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS; attempt += 1) {
    try {
      const result = await generateObject({
        model,
        schema: competitionLessonPlanSchema,
        system: `你是体育教案结构化修复助手。你只负责把模型草稿修复为 CompetitionLessonPlan JSON 对象。

硬约束：
1. 必须严格依据用户提供的模型草稿抽取字段，不能编造另一节课。
2. 不得使用 XXX、默认模板、示例学校、示例教师或示例足球教案内容。
3. 缺失字段必须从草稿上下文合理补全，但主题、年级、教材、器材、课时流程必须保持一致。
4. rows 必须至少包含准备部分、基本部分、结束部分。
5. evaluation 必须包含三颗星、二颗星、一颗星三行。
6. 输出必须是严格符合 schema 的对象，不得夹带 Markdown、HTML、代码围栏或解释性文字。
7. 所有文本使用简体中文，适合一线体育教师直接放入正式打印版。`,
        prompt: `结构化转换失败原因：
${input.issue}

请把下面模型草稿修复并转换为 CompetitionLessonPlan JSON：

${input.draftText}`,
      });

      return result.object;
    } catch (error) {
      lastError = error;

      if (attempt >= MAX_REPAIR_ATTEMPTS) {
        break;
      }

      await sleep(getRepairDelayMs(attempt));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("结构化教案自动修复失败。");
}
