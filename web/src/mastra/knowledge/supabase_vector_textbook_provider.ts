import { DEFAULT_STANDARDS_MARKET, type StandardsMarket } from "@/lib/lesson-authoring-contract";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  embedQueryForRetrieval,
  hasEmbeddingRuntimeConfig,
  toPgVectorLiteral,
} from "./embedding_query";
import type {
  TextbookReference,
  TextbookRetrievalProvider,
  TextbookSearchResult,
} from "./provider-types";
import { buildTextbookContextFromReferences } from "./textbook_context";

const DEFAULT_LIMIT = 5;
const DEFAULT_STAGE = "小学";
const SPORT_MODULE_HINTS = [
  "篮球",
  "足球",
  "排球",
  "乒乓球",
  "羽毛球",
  "田径",
  "体操",
  "游泳",
  "武术",
  "轮滑",
  "花样跳绳",
  "体能",
];

type MatchTextbookEntriesHybridRow =
  Database["public"]["Functions"]["match_textbook_entries_hybrid"]["Returns"][number];

function joinWarnings(...warnings: Array<string | undefined>) {
  const merged = warnings.map((warning) => warning?.trim()).filter(Boolean);
  return merged.length > 0 ? merged.join(" ") : undefined;
}

function createEmptyResult(input: {
  grade?: string;
  market: StandardsMarket;
  publisher?: string;
  stage: string;
  warning?: string;
}): TextbookSearchResult {
  const references: TextbookReference[] = [];

  return {
    market: input.market,
    stage: input.stage,
    publisher: input.publisher,
    grade: input.grade,
    references,
    context: buildTextbookContextFromReferences(references),
    warning: input.warning,
  };
}

function toNullableString(value: string | null) {
  return value?.trim() ? value : null;
}

function toReference(row: MatchTextbookEntriesHybridRow): TextbookReference {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    bodyExcerpt: row.body_excerpt,
    citation: row.citation,
    publisher: row.publisher,
    textbookName: row.textbook_name,
    edition: toNullableString(row.edition),
    grade: toNullableString(row.grade),
    level: toNullableString(row.level),
    module: row.module,
    sectionPath: row.section_path,
    keywords: row.keywords,
    sourceKind: row.source_kind,
    sportItem: toNullableString(row.sport_item),
    teachingAnalysis: row.teaching_analysis,
    technicalPoints: row.technical_points,
    teachingSuggestions: row.teaching_suggestions,
    safetyNotes: row.safety_notes,
    score: row.similarity * 100,
  };
}

function resolveGradeBand(grade: string) {
  if (/一|二|1|2/.test(grade)) {
    return "1至2年级";
  }

  if (/三|四|3|4|水平二/.test(grade)) {
    return "3至4年级";
  }

  if (/五|六|5|6|水平三/.test(grade)) {
    return "5至6年级";
  }

  return grade.trim();
}

function resolveLevelAlias(grade: string) {
  const band = resolveGradeBand(grade);

  switch (band) {
    case "1至2年级":
      return "水平一";
    case "3至4年级":
      return "水平二";
    case "5至6年级":
      return "水平三";
    default:
      return "";
  }
}

function buildRetrievalQuery(query: string, options: { grade?: string; publisher?: string }) {
  const gradeBand = options.grade ? resolveGradeBand(options.grade) : "";
  const levelAlias = options.grade ? resolveLevelAlias(options.grade) : "";

  return [
    query,
    options.publisher,
    options.grade,
    gradeBand,
    levelAlias,
    "教师用书",
    "教材分析",
    "动作要点",
    "教学建议",
  ].filter(Boolean).join(" ");
}

function getQuerySportHints(query: string) {
  return SPORT_MODULE_HINTS.filter((hint) => query.includes(hint));
}

function rerankReferences(references: TextbookReference[], query: string) {
  const sportHints = getQuerySportHints(query);

  return [...references].sort((left, right) => {
    const score = (reference: TextbookReference) => {
      const sportBonus = sportHints.some((hint) =>
        reference.module.includes(hint) ||
        reference.sportItem?.includes(hint) ||
        reference.keywords.some((keyword) => keyword.includes(hint)) ||
        reference.summary.includes(hint)
      )
        ? 20
        : 0;
      const sourceBonus = reference.sourceKind === "teacher-guide" ? 10 : 0;
      const analysisBonus = reference.teachingAnalysis.length > 0 ? 6 : 0;

      return reference.score + sportBonus + sourceBonus + analysisBonus;
    };

    return score(right) - score(left);
  });
}

export function createSupabaseVectorTextbookProvider(): TextbookRetrievalProvider {
  return {
    id: "supabase-vector-textbook-provider",
    async search(query, options): Promise<TextbookSearchResult> {
      const limit = options.limit ?? DEFAULT_LIMIT;
      const market = options.market ?? DEFAULT_STANDARDS_MARKET;
      const stage = options.stage ?? DEFAULT_STAGE;
      const retrievalQuery = buildRetrievalQuery(query, options);
      const targetGrade = options.grade ? resolveGradeBand(options.grade) : null;

      if (!hasEmbeddingRuntimeConfig()) {
        return createEmptyResult({
          grade: options.grade,
          market,
          publisher: options.publisher,
          stage,
          warning: "教材语义检索未启用：缺少 embedding 模型运行时配置。",
        });
      }

      const supabase = await createSupabaseServerClient();

      if (!supabase) {
        return createEmptyResult({
          grade: options.grade,
          market,
          publisher: options.publisher,
          stage,
          warning: "教材语义检索未启用：Supabase 服务端客户端不可用。",
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
          grade: options.grade,
          market,
          publisher: options.publisher,
          stage,
          warning: "教材语义检索需要登录态，当前返回空结果。",
        });
      }

      const embedding = await embedQueryForRetrieval({
        label: "教材",
        query: retrievalQuery,
      });

      const { data, error } = await supabase.rpc("match_textbook_entries_hybrid", {
        query_text: retrievalQuery,
        query_embedding: toPgVectorLiteral(embedding),
        match_limit: Math.max(limit * 4, limit),
        target_market: market,
        target_stage: stage,
        ...(options.publisher ? { target_publisher: options.publisher } : {}),
        ...(targetGrade ? { target_grade: targetGrade } : {}),
      });

      if (error) {
        throw error;
      }

      const references = rerankReferences((data ?? []).map(toReference), retrievalQuery).slice(0, limit);

      return {
        market,
        stage,
        publisher: options.publisher,
        grade: options.grade,
        references,
        context: buildTextbookContextFromReferences(references),
        warning: joinWarnings(
          references.length > 0
            ? undefined
            : "教材语义检索当前未返回匹配条目；请先灌入带 embedding 的教材数据后再检索。",
        ),
      };
    },
  };
}
