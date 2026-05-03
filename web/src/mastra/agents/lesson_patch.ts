import { Agent } from "@mastra/core/agent";
import type { AgentConfig } from "@mastra/core/agent";

import type { CompetitionLessonPatchRequestBody } from "@/lib/competition-lesson-patch";

import { editLessonTools } from "../tools/edit_lesson_tools";

export const LESSON_PATCH_SYSTEM_PROMPT = `
你是“创AI”的体育课时计划修改专家。你的职责不是重新生成整份课时计划，也不是编写 JSON Pointer patch。
你的任务是理解教师的修改意图，并调用合适的语义工具来表达业务修改。

核心规则：
1. 直接调用工具，不要输出 Markdown、HTML 或解释文字。
2. 只修改用户要求涉及的最小业务字段，避免重写整份课时计划。
3. 不要传数组索引、JSON Pointer 或底层路径；教学环节只能用“准备部分 / 基本部分 / 结束部分”和原内容关键词定位。
4. 如果同一环节有多行，必须提供 targetContentKeyword；没有把握就选择最保守的单个工具调用。
5. 如果修改运动时间、强度、课堂结构或练习密度，必须同时检查是否需要调用 update_load_estimate。
6. 修改后必须保持广东省比赛体育课时计划结构完整，不能破坏学习评价三档、课时计划三段、运动负荷和安全保障。
7. reason 必须说明修改依据和同步检查要点，方便后台审计。
8. 当前课时计划完整 JSON 会提供给你作为参考，你只能通过工具提交修改意图。`;

export function buildLessonPatchSystemPrompt() {
  return LESSON_PATCH_SYSTEM_PROMPT;
}

function buildTargetPathHint(targetPaths?: string[]) {
  if (!targetPaths?.length) {
    return "用户未指定 UI 字段。你必须根据用户意图选择最小必要的语义工具，不要重写整份课时计划。";
  }

  return [
    "用户在 UI 中优先指向这些字段路径。它们只作为定位提示，不允许在工具参数中输出 JSON Pointer：",
    ...targetPaths.map((path) => `- ${path}`),
    "如果需要同步调整相关业务字段，使用相应的语义工具表达。",
  ].join("\n");
}

export function buildLessonPatchUserPrompt(input: CompetitionLessonPatchRequestBody) {
  return [
    "用户局部修改意见：",
    input.instruction,
    "",
    buildTargetPathHint(input.targetPaths),
    "",
    "当前 CompetitionLessonPlan JSON：",
    JSON.stringify(input.lessonPlan, null, 2),
    "",
    "请通过工具调用提交语义化修改，不要输出 JSON Pointer patch。",
  ].join("\n");
}

export function createLessonPatchAgent(model: AgentConfig["model"]) {
  return new Agent({
    id: "lesson-patch-agent",
    name: "创AI体育课时计划修改智能体",
    description: "把教师对已生成体育课时计划的后续修改意见转换成可校验的语义工具调用。",
    instructions: LESSON_PATCH_SYSTEM_PROMPT,
    model,
    tools: editLessonTools,
  });
}
