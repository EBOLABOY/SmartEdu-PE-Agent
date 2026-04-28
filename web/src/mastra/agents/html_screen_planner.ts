import { Agent } from "@mastra/core/agent";
import type { AgentConfig } from "@mastra/core/agent";

import type { LessonScreenPlan, LessonScreenSectionPlan } from "@/lib/lesson-authoring-contract";

const SECTION_FIELD_LABELS: Array<keyof LessonScreenSectionPlan> = [
  "objective",
  "studentActions",
  "safetyCue",
  "evaluationCue",
  "visualIntent",
  "reason",
];

function formatOptionalField(section: LessonScreenSectionPlan, field: keyof LessonScreenSectionPlan) {
  const value = section[field];

  if (Array.isArray(value)) {
    return value.length ? `${field}=${value.join(" / ")}` : "";
  }

  if (typeof value === "string" || typeof value === "number") {
    return `${field}=${value}`;
  }

  return "";
}

export function formatLessonScreenPlanForPrompt(screenPlan?: LessonScreenPlan) {
  if (!screenPlan?.sections.length) {
    return "";
  }

  return screenPlan.sections
    .map((section, index) => {
      const duration = section.durationSeconds ? `，durationSeconds=${section.durationSeconds}` : "";
      const sourceRow = section.sourceRowIndex !== undefined ? `，sourceRowIndex=${section.sourceRowIndex}` : "";
      const details = SECTION_FIELD_LABELS.map((field) => formatOptionalField(section, field))
        .filter(Boolean)
        .join("；");

      return [
        `${index + 1}. ${section.title}：supportModule=${section.supportModule}${duration}${sourceRow}`,
        details ? `   ${details}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
}

export const HTML_SCREEN_PLANNER_SYSTEM_PROMPT = `
你是“创AI”的课堂学习辅助大屏分镜规划 Agent。你的任务不是写 HTML，而是阅读已确认体育教案，自动判断应该拆成几个课堂内容页，并输出可校验的 LessonScreenPlan。

规划原则：
1. 封面“课堂运行总览”不计入 sections；sections 只描述真实教学环节页。
2. 优先按 periodPlan.rows 的顺序拆分页面；如果某一行包含多个独立教学内容，可拆成多个相邻页面，但不得遗漏准备、基本、结束环节。
3. 每个 section 必须面向课堂投屏执行，写清 objective、studentActions、safetyCue、evaluationCue 和 visualIntent。
4. supportModule 只能是 tacticalBoard、scoreboard、rotation、formation。
5. durationSeconds 必须来自教案时间；“3-5分钟”取中间值，1 分钟等于 60 秒。
6. 不要输出 HTML、Markdown、解释文字或代码围栏；只通过结构化输出返回 LessonScreenPlan。`;

export function buildHtmlScreenPlanningSystemPrompt() {
  return `${HTML_SCREEN_PLANNER_SYSTEM_PROMPT}

字段要求：
- title：课堂页面标题，来自具体教学内容。
- sourceRowIndex：对应 periodPlan.rows 的 0 基索引；拆分同一行时可复用同一个索引。
- objective：本页解决的课堂执行问题。
- studentActions：1-3 条学生看屏即可执行的动作步骤。
- safetyCue：本页最关键安全边界。
- evaluationCue：教师或同伴观察评价点。
- visualIntent：页面应该绘制的视觉模块，例如战术板、队形图、轮换路线或计分板。
- reason：说明为什么这样拆页和选择 supportModule。`;
}

export function createHtmlScreenPlannerAgent(model: AgentConfig["model"]) {
  return new Agent({
    id: "html-screen-planner-agent",
    name: "创AI课堂大屏分镜规划智能体",
    description: "基于已确认体育教案自动拆分课堂大屏内容页，并输出结构化 LessonScreenPlan。",
    instructions: HTML_SCREEN_PLANNER_SYSTEM_PROMPT,
    model,
  });
}
