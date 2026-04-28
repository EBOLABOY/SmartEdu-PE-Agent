import { Mastra } from "@mastra/core/mastra";
import { withMastra } from "@mastra/ai-sdk";

import { createHtmlScreenPlannerAgent } from "./agents/html_screen_planner";
import { createLessonIntakeAgent } from "./agents/lesson_intake";
import { createLessonPatchAgent } from "./agents/lesson_patch";
import { createPeTeacherAgent } from "./agents/pe_teacher";
import { createChatModel } from "./models";
import { searchStandardsTool } from "./tools/search_standards";
import { lessonAuthoringWorkflow } from "./workflows/lesson_workflow";

const modelName = process.env.AI_MODEL ?? "gpt-4.1-mini";
const htmlPlannerModelName = process.env.AI_HTML_PLANNER_MODEL ?? modelName;
const lessonIntakeModelName = process.env.AI_LESSON_INTAKE_MODEL ?? modelName;
const lessonPatchModelName = process.env.AI_LESSON_PATCH_MODEL ?? process.env.AI_PATCH_MODEL ?? modelName;

export const htmlScreenPlannerAgent = createHtmlScreenPlannerAgent(withMastra(createChatModel(htmlPlannerModelName)));
export const lessonIntakeAgent = createLessonIntakeAgent(withMastra(createChatModel(lessonIntakeModelName)));
export const lessonPatchAgent = createLessonPatchAgent(withMastra(createChatModel(lessonPatchModelName)));
export const peTeacherAgent = createPeTeacherAgent(withMastra(createChatModel(modelName)));

export const mastra = new Mastra({
  agents: {
    htmlScreenPlannerAgent,
    lessonIntakeAgent,
    lessonPatchAgent,
    peTeacherAgent,
  },
  tools: {
    searchStandardsTool,
  },
  workflows: {
    lessonAuthoringWorkflow,
  },
});

export { createChatModel, createModelProvider } from "./models";
