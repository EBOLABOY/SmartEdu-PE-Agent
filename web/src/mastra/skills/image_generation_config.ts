export const DEFAULT_IMAGE_GENERATION_MODEL = "gpt-image-2";
export const IMAGE_GENERATION_REQUIRED_ENV_NAMES = "AI_IMAGE_BASE_URL 或 AI_IMAGE_API_KEY";

export type ImageGenerationConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  size?: string;
};

function resolveEnvReference(value?: string) {
  return value?.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => process.env[name] ?? "");
}

function readEnv(name: string) {
  const value = resolveEnvReference(process.env[name])?.trim();
  return value || undefined;
}

export function getImageGenerationConfig(): ImageGenerationConfig | null {
  const baseUrl = readEnv("AI_IMAGE_BASE_URL")?.replace(/\/+$/, "");
  const apiKey = readEnv("AI_IMAGE_API_KEY");
  const model = readEnv("AI_IMAGE_MODEL") ?? DEFAULT_IMAGE_GENERATION_MODEL;
  const size = readEnv("AI_IMAGE_SIZE");

  if (!baseUrl || !apiKey) {
    return null;
  }

  return { apiKey, baseUrl, model, ...(size ? { size } : {}) };
}
