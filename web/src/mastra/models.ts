import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export function createModelProvider() {
  const baseURL = process.env.AI_BASE_URL;
  const apiKey = process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY;

  if (baseURL) {
    return createOpenAICompatible({
      name: process.env.AI_PROVIDER_NAME ?? "openaiCompatible",
      baseURL,
      ...(apiKey ? { apiKey } : {}),
      includeUsage: true,
      supportsStructuredOutputs: process.env.AI_SUPPORTS_STRUCTURED_OUTPUTS === "true",
    });
  }

  return createOpenAI({
    ...(apiKey ? { apiKey } : {}),
  });
}

export function createChatModel(modelId: string) {
  const provider = createModelProvider();

  return "chatModel" in provider ? provider.chatModel(modelId) : provider.chat(modelId);
}
