import { Agent } from "@mastra/core/agent";
import type { AgentConfig } from "@mastra/core/agent";

import {
  buildPeTeacherSystemPrompt,
  PE_TEACHER_SYSTEM_PROMPT,
} from "../skills/pe_teacher_prompt";
import {
  submitHtmlScreenTool,
  submitLessonPlanTool,
} from "../tools/output_tools";
import { lessonAuthoringTools } from "../tools/lesson_authoring_tools";
import { searchStandardsTool } from "../tools/search_standards";

export type { GenerationMode, PeTeacherContext } from "@/lib/lesson-authoring-contract";
export { buildPeTeacherSystemPrompt, PE_TEACHER_SYSTEM_PROMPT };

export function createPeTeacherAgent(model: AgentConfig["model"]) {
  return new Agent({
    id: "pe-teacher-agent",
    name: "创AI体育课时计划与课堂学习辅助大屏智能体",
    description: "分阶段生成体育课时计划 JSON 与可结构化封装的课堂学习辅助大屏 HTML 文档。",
    instructions: PE_TEACHER_SYSTEM_PROMPT,
    model,
    tools: {
      ...lessonAuthoringTools,
      searchStandards: searchStandardsTool,
      submit_html_screen: submitHtmlScreenTool,
      submit_lesson_plan: submitLessonPlanTool,
    },
  });
}
