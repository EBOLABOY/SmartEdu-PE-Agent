import { Mastra } from "@mastra/core/mastra";
import { withMastra } from "@mastra/ai-sdk";

import { createLessonPatchAgent } from "./agents/lesson_patch";
import { createPeTeacherAgent } from "./agents/pe_teacher";
import { createChatModel } from "./models";
import { searchStandardsTool } from "./tools/search_standards";
import { lessonAuthoringWorkflow } from "./workflows/lesson_workflow";

const modelName = process.env.AI_MODEL ?? "gpt-4.1-mini";
const lessonPatchModelName = process.env.AI_LESSON_PATCH_MODEL ?? process.env.AI_PATCH_MODEL ?? modelName;

export const lessonPatchAgent = createLessonPatchAgent(withMastra(createChatModel(lessonPatchModelName)));
export const peTeacherAgent = createPeTeacherAgent(withMastra(createChatModel(modelName)));

export const mastra = new Mastra({
  agents: {
    lessonPatchAgent,
    peTeacherAgent,
  },
  tools: {
    searchStandards: searchStandardsTool,
  },
  workflows: {
    lessonAuthoringWorkflow,
  },
});

export { createChatModel, createModelProvider } from "./models";
