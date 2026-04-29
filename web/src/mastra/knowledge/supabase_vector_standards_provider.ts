import { DEFAULT_STANDARDS_MARKET, type StandardsMarket } from "@/lib/lesson-authoring-contract";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

import { buildStandardsContextFromReferences } from "./standards_context";
import { resolveStandardsMarketMetadata } from "./standards_market_metadata";
import type {
  StandardReference,
  StandardsCorpusMetadata,
  StandardsRetrievalProvider,
  StandardsSearchResult,
} from "./provider-types";

const DEFAULT_LIMIT = 6;
const DEFAULT_EMBEDDING_MODEL_ID = "nvidia/llama-3.2-nv-embedqa-1b-v2";
const DEFAULT_EMBEDDING_VECTOR_DIMENSIONS = 1536;
const EMBEDDING_QUERY_INPUT_TYPE = "query";

type MatchStandardEntriesHybridRow =
  Database["public"]["Functions"]["match_standard_entries_hybrid"]["Returns"][number];
type StandardsCorpusRow = Database["public"]["Tables"]["standards_corpora"]["Row"];

function joinWarnings(...warnings: Array<string | undefined>) {
  const merged = warnings.map((warning) => warning?.trim()).filter(Boolean);
  return merged.length > 0 ? merged.join(" ") : undefined;
}

function createEmptyResult(input: {
  market: StandardsMarket;
  warning?: string;
}): StandardsSearchResult {
  const resolved = resolveStandardsMarketMetadata(input.market);
  const references: StandardReference[] = [];

  return {
    requestedMarket: resolved.requestedMarket,
    resolvedMarket: resolved.resolvedMarket,
    references,
    context: buildStandardsContextFromReferences(references),
    corpus: null,
    warning: joinWarnings(resolved.warning, input.warning),
  };
}

function hasEmbeddingRuntimeConfig() {
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

function toReference(
  row: MatchStandardEntriesHybridRow,
  corpus: StandardsCorpusMetadata | null,
): StandardReference {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    source: corpus?.displayName ?? "课程标准",
    officialVersion: corpus?.version ?? "",
    gradeBands: row.grade_bands,
    module: row.module,
    sectionPath: row.section_path,
    keywords: row.keywords,
    requirements: row.requirements,
    teachingImplications: row.teaching_implications,
    citation: row.citation,
    score: row.similarity * 100,
  };
}

function toCorpusMetadata(row: StandardsCorpusRow): StandardsCorpusMetadata {
  return {
    corpusId: row.id,
    displayName: row.display_name,
    issuer: row.issuer,
    version: row.official_version,
    url: row.source_url,
    availability: row.availability === "planned" ? "planned" : "ready",
  };
}

function toPgVectorLiteral(embedding: number[]) {
  return `[${embedding.join(",")}]`;
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

async function embedQuery(query: string) {
  const { apiKey, baseUrl } = getEmbeddingApiConfig();

  if (!baseUrl) {
    throw new Error("缺少 AI_EMBEDDING_BASE_URL 或 AI_BASE_URL，无法生成课标查询向量。");
  }

  const response = await fetch(`${baseUrl}/embeddings`, {
    body: JSON.stringify({
      dimensions: getEmbeddingDimensions(),
      input: [query],
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
    throw new Error(`课程标准查询向量生成失败：${response.status} ${await response.text()}`);
  }

  const json = await response.json();
  const embedding = json.data?.[0]?.embedding;

  if (!Array.isArray(embedding)) {
    throw new Error("课程标准查询向量生成失败：embedding 响应为空。");
  }

  if (embedding.length !== getEmbeddingDimensions()) {
    throw new Error(`课程标准查询向量维度不匹配：期望 ${getEmbeddingDimensions()}，实际 ${embedding.length}。`);
  }

  return embedding;
}

export function createSupabaseVectorStandardsProvider(): StandardsRetrievalProvider {
  return {
    id: "supabase-vector-provider",
    async search(query, options): Promise<StandardsSearchResult> {
      const limit = options.limit ?? DEFAULT_LIMIT;
      const market = options.market ?? DEFAULT_STANDARDS_MARKET;
      const resolved = resolveStandardsMarketMetadata(market);

      if (!hasEmbeddingRuntimeConfig()) {
        return createEmptyResult({
          market,
          warning: "课程标准语义检索未启用：缺少 embedding 模型运行时配置。",
        });
      }

      const supabase = await createSupabaseServerClient();

      if (!supabase) {
        return createEmptyResult({
          market,
          warning: "课程标准语义检索未启用：Supabase 服务端客户端不可用。",
        });
      }

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        throw authError;
      }

      if (!user) {
        return createEmptyResult({
          market,
          warning: "课程标准语义检索需要登录态，当前返回空结果。",
        });
      }

      const { data: corpusRow, error: corpusError } = await supabase
        .from("standards_corpora")
        .select("*")
        .eq("market", resolved.resolvedMarket)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (corpusError) {
        throw corpusError;
      }

      const corpus = corpusRow ? toCorpusMetadata(corpusRow as StandardsCorpusRow) : null;

      const embedding = await embedQuery(query);

      const { data, error } = await supabase.rpc("match_standard_entries_hybrid", {
        query_text: query,
        query_embedding: toPgVectorLiteral(embedding),
        match_limit: limit,
        target_market: resolved.resolvedMarket,
      });

      if (error) {
        throw error;
      }

      const references = (data ?? []).map((row) => toReference(row, corpus));

      return {
        requestedMarket: resolved.requestedMarket,
        resolvedMarket: resolved.resolvedMarket,
        references,
        context: buildStandardsContextFromReferences(references),
        corpus,
        warning:
          references.length > 0
            ? resolved.warning
            : joinWarnings(
                resolved.warning,
                "课程标准语义检索当前未返回匹配条目；请先灌入带 embedding 的课标数据后再检索。",
              ),
      };
    },
  };
}
