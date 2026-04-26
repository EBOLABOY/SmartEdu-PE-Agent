import { createOpenAI } from "@ai-sdk/openai";

export function createModelProvider() {
  const baseURL = process.env.AI_BASE_URL;
  const apiKey = process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY;

  return createOpenAI({
    ...(baseURL ? { baseURL } : {}),
    ...(apiKey ? { apiKey } : {}),
  });
}

export function createChatModel(modelId: string) {
  return createModelProvider().chat(modelId);
}
