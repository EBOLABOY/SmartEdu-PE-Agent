import { Mastra } from "@mastra/core/mastra";
import { withMastra } from "@mastra/ai-sdk";
import { createOpenAI } from "@ai-sdk/openai";

import { createPeTeacherAgent } from "./agents/pe_teacher";
import { searchStandardsTool } from "./tools/search_standards";
import { lessonAuthoringWorkflow } from "./workflows/lesson_workflow";

export function createModelProvider() {
  const baseURL = process.env.AI_BASE_URL;
  const apiKey = process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY;

  return createOpenAI({
    ...(baseURL ? { baseURL } : {}),
    ...(apiKey ? { apiKey } : {}),
  });
}

const provider = createModelProvider();
const modelName = process.env.AI_MODEL ?? "gpt-4.1-mini";

export const peTeacherAgent = createPeTeacherAgent(withMastra(provider(modelName)));

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
