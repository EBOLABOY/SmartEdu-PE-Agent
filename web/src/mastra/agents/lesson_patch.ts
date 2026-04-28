import { Agent } from "@mastra/core/agent";
import type { AgentConfig } from "@mastra/core/agent";

import type { CompetitionLessonPatchRequestBody } from "@/lib/competition-lesson-patch";

export const LESSON_PATCH_SYSTEM_PROMPT = `
你是“创AI”的体育教案结构化修改 Agent。你的职责不是重新生成整份教案，而是把教师的后续修改意见转成可校验、可回放、字段级的 JSON Pointer patch operations。

核心规则：
1. 只修改用户要求涉及的最小字段，避免重写整份教案。
2. path 必须使用 JSON Pointer，例如 /learningObjectives/sportAbility/0 或 /periodPlan/rows/1/methods/teacher/0。
3. op 只能使用 replace、append、remove。replace/remove 必须指向已存在字段或数组元素；append 必须指向数组字段。
4. value 必须是目标字段需要的新值，不要包含 Markdown 表格、HTML 标签、代码围栏或解释性文字。
5. reason 必须说明修改位置、理由和同步检查要点。
6. 修改后必须保持广东省比赛体育教案结构完整，不能破坏学习评价三档、课时计划三段、运动负荷和安全保障。
7. 如果修改运动时间、强度、课堂结构或练习密度，必须同步检查 /loadEstimate；必要时同时调整 /loadEstimate/loadLevel、/loadEstimate/targetHeartRateRange、/loadEstimate/averageHeartRate、/loadEstimate/groupDensity、/loadEstimate/individualDensity、/loadEstimate/chartPoints 和 /loadEstimate/rationale/0，保证文字说明与图表曲线一致。
8. 如果用户要求模糊，选择最保守、最小影响的 patch；不要借机扩写无关字段。

你只能返回符合 CompetitionLessonPatch schema 的结构化对象，不要输出 Markdown、HTML 或自然语言说明。
`;

export function buildLessonPatchSystemPrompt() {
  return LESSON_PATCH_SYSTEM_PROMPT;
}

function buildTargetPathHint(targetPaths?: string[]) {
  if (!targetPaths?.length) {
    return "用户未指定路径。你必须选择最小必要字段路径，不要重写整份教案。";
  }

  return [
    "用户允许优先修改这些路径：",
    ...targetPaths.map((path) => `- ${path}`),
    "如确需同步调整其他字段，最多额外增加 2 个直接相关路径。",
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
    "请只返回符合 schema 的 operations。",
  ].join("\n");
}

export function createLessonPatchAgent(model: AgentConfig["model"]) {
  return new Agent({
    id: "lesson-patch-agent",
    name: "创AI体育教案结构化修改智能体",
    description: "把教师对已生成体育教案的后续修改意见转换成可校验的字段级 JSON Pointer patch。",
    instructions: LESSON_PATCH_SYSTEM_PROMPT,
    model,
  });
}
