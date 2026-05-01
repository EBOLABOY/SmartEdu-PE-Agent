const DEFAULT_EMBEDDING_MODEL_ID = "nvidia/llama-3.2-nv-embedqa-1b-v2";
const DEFAULT_EMBEDDING_VECTOR_DIMENSIONS = 1536;
const EMBEDDING_QUERY_INPUT_TYPE = "query";

export function hasEmbeddingRuntimeConfig() {
  return Boolean(
    process.env.AI_EMBEDDING_BASE_URL ||
      process.env.AI_BASE_URL ||
      process.env.AI_EMBEDDING_API_KEY ||
      process.env.AI_API_KEY ||
      process.env.OPENAI_API_KEY,
  );
}

function resolveEnvReference(value?: string) {
  return value?.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => process.env[name] ?? "");
}

function getEmbeddingApiConfig() {
  return {
    apiKey: resolveEnvReference(
      process.env.AI_EMBEDDING_API_KEY ?? process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY,
    ),
    baseUrl: resolveEnvReference(process.env.AI_EMBEDDING_BASE_URL ?? process.env.AI_BASE_URL)?.replace(
      /\/+$/,
      "",
    ),
  };
}

function getEmbeddingModelId() {
  return process.env.AI_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL_ID;
}

function getEmbeddingDimensions() {
  return Number.parseInt(
    process.env.AI_EMBEDDING_DIMENSIONS ?? String(DEFAULT_EMBEDDING_VECTOR_DIMENSIONS),
    10,
  );
}

export function toPgVectorLiteral(embedding: number[]) {
  return `[${embedding.join(",")}]`;
}

export async function embedQueryForRetrieval(input: {
  label: string;
  query: string;
}) {
  const { apiKey, baseUrl } = getEmbeddingApiConfig();

  if (!baseUrl) {
    throw new Error(`缺少 AI_EMBEDDING_BASE_URL 或 AI_BASE_URL，无法生成${input.label}查询向量。`);
  }

  const response = await fetch(`${baseUrl}/embeddings`, {
    body: JSON.stringify({
      dimensions: getEmbeddingDimensions(),
      input: [input.query],
      input_type: EMBEDDING_QUERY_INPUT_TYPE,
      model: getEmbeddingModelId(),
    }),
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`${input.label}查询向量生成失败：${response.status} ${await response.text()}`);
  }

  const json = await response.json();
  const embedding = json.data?.[0]?.embedding;

  if (!Array.isArray(embedding)) {
    throw new Error(`${input.label}查询向量生成失败：embedding 响应为空。`);
  }

  if (embedding.length !== getEmbeddingDimensions()) {
    throw new Error(`${input.label}查询向量维度不匹配：期望 ${getEmbeddingDimensions()}，实际 ${embedding.length}。`);
  }

  return embedding;
}
