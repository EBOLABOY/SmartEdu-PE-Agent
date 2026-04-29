import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

function resolveEnvReference(value?: string) {
  return value?.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => process.env[name] ?? "");
}

export function createModelProvider() {
  const baseURL = resolveEnvReference(process.env.AI_BASE_URL);
  const apiKey = resolveEnvReference(process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY);

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

export function createEmbeddingModel(modelId: string) {
  const baseURL = resolveEnvReference(process.env.AI_EMBEDDING_BASE_URL ?? process.env.AI_BASE_URL);
  const apiKey = resolveEnvReference(
    process.env.AI_EMBEDDING_API_KEY ?? process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY,
  );

  if (baseURL) {
    return createOpenAICompatible({
      name: process.env.AI_EMBEDDING_PROVIDER_NAME ?? process.env.AI_PROVIDER_NAME ?? "openaiCompatible",
      baseURL,
      ...(apiKey ? { apiKey } : {}),
      includeUsage: true,
    }).embeddingModel(modelId);
  }

  return createOpenAI({
    ...(apiKey ? { apiKey } : {}),
  }).embeddingModel(modelId);
}
