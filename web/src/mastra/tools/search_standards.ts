import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import {
  DEFAULT_STANDARDS_MARKET,
  standardsMarketSchema,
  type StandardsMarket,
} from "@/lib/lesson-authoring-contract";

import {
  buildStandardsContextFromReferences,
  resolveStandardsMarketMetadata,
} from "../knowledge/local_scoring_standards_provider";
import {
  getStandardsRetrievalProvider,
} from "../knowledge/provider-registry";
import type {
  StandardReference,
  StandardsCorpusMetadata,
  StandardsRetrievalOptions,
  StandardsSearchResult,
} from "../knowledge/provider-types";

const DEFAULT_LIMIT = 6;

export type {
  StandardReference,
  StandardsCorpusMetadata,
  StandardsSearchResult,
} from "../knowledge/provider-types";

export {
  buildStandardsContextFromReferences,
  resolveStandardsMarketMetadata,
} from "../knowledge/local_scoring_standards_provider";

export async function searchStandards(
  query: string,
  options: StandardsRetrievalOptions = {},
): Promise<StandardsSearchResult> {
  const provider = getStandardsRetrievalProvider();

  return provider.search(query, {
    limit: options.limit ?? DEFAULT_LIMIT,
    market: options.market ?? DEFAULT_STANDARDS_MARKET,
  });
}

export async function buildStandardsContext(
  query: string,
  options: StandardsRetrievalOptions = {},
) {
  return (await searchStandards(query, options)).context;
}

export const searchStandardsToolInputSchema = z.object({
  query: z.string().describe("教师输入的课程主题、年级、运动项目、安全要求或评价要求。"),
  limit: z.coerce.number().int().min(1).max(10).optional().describe("最多返回的课标条目数量，默认 6 条。"),
  market: standardsMarketSchema.optional().describe("目标教育市场。当前仓库默认支持中国义务教育体育课标。"),
});

export const searchStandardsTool = createTool({
  id: "search-standards",
  description: "检索体育课程标准结构化条目，用于生成合规体育课时计划，并返回目标市场与语料解析信息。",
  inputSchema: searchStandardsToolInputSchema,
  outputSchema: z.object({
    requestedMarket: standardsMarketSchema,
    resolvedMarket: standardsMarketSchema,
    corpus: z.object({
      corpusId: z.string(),
      displayName: z.string(),
      officialStatus: z.string(),
      sourceName: z.string(),
      issuer: z.string(),
      version: z.string(),
      url: z.string().url(),
      availability: z.enum(["ready", "planned"]),
    }),
    warning: z.string().optional(),
    references: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        summary: z.string(),
        source: z.string(),
        officialVersion: z.string(),
        gradeBands: z.array(z.string()),
        module: z.string(),
        sectionPath: z.array(z.string()),
        keywords: z.array(z.string()),
        requirements: z.array(z.string()),
        teachingImplications: z.array(z.string()),
        citation: z.string(),
        score: z.number(),
      }),
    ),
    context: z.string(),
  }),
  execute: async ({ query, limit, market }) => {
    return searchStandards(query, { limit, market });
  },
});
