import { Mastra } from "@mastra/core/mastra";
import { withMastra } from "@mastra/ai-sdk";

import { createPeTeacherAgent } from "./agents/pe_teacher";
import { createModelProvider } from "./models";
import { searchStandardsTool } from "./tools/search_standards";
import { lessonAuthoringWorkflow } from "./workflows/lesson_workflow";

const provider = createModelProvider();
const modelName = process.env.AI_MODEL ?? "gpt-4.1-mini";

export const peTeacherAgent = createPeTeacherAgent(withMastra(provider.chat(modelName)));

export const mastra = new Mastra({
  agents: {
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
