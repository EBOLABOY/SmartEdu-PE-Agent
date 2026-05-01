import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import {
  DEFAULT_STANDARDS_MARKET,
  standardsMarketSchema,
} from "@/lib/lesson-authoring-contract";

import { getTextbookRetrievalProvider } from "../knowledge/provider-registry";
import type {
  TextbookRetrievalOptions,
  TextbookSearchResult,
} from "../knowledge/provider-types";

const DEFAULT_LIMIT = 5;
const DEFAULT_STAGE = "小学";

export type {
  TextbookReference,
  TextbookSearchResult,
} from "../knowledge/provider-types";

export {
  buildTextbookContextFromReferences,
} from "../knowledge/textbook_context";

export async function searchTextbook(
  query: string,
  options: TextbookRetrievalOptions = {},
): Promise<TextbookSearchResult> {
  const provider = getTextbookRetrievalProvider();

  return provider.search(query, {
    grade: options.grade ?? "",
    limit: options.limit ?? DEFAULT_LIMIT,
    market: options.market ?? DEFAULT_STANDARDS_MARKET,
    publisher: options.publisher ?? "",
    stage: options.stage ?? DEFAULT_STAGE,
  });
}

export async function buildTextbookContext(
  query: string,
  options: TextbookRetrievalOptions = {},
) {
  return (await searchTextbook(query, options)).context;
}

export const searchTextbookToolInputSchema = z.object({
  query: z.string().describe("教师输入的课程主题、年级、运动项目、教材分析方向或动作技术问题。"),
  limit: z.coerce.number().int().min(1).max(10).optional().describe("最多返回的教材正文条目数量，默认 5 条。"),
  market: standardsMarketSchema.optional().describe("目标教育市场。当前教材库默认使用中国义务教育体育与健康教材。"),
  stage: z.string().trim().min(1).max(40).optional().describe("学段，默认小学。"),
  grade: z.string().trim().min(1).max(40).optional().describe("年级或水平，例如 三年级、5至6年级、水平二。"),
  publisher: z.string().trim().min(1).max(80).optional().describe("教材版本或出版社，例如 人教版。"),
});

export const searchTextbookTool = createTool({
  id: "searchTextbook",
  description: "检索体育与健康教材正文条目，用于生成教材分析、动作要点、教学建议和安全提示。",
  inputSchema: searchTextbookToolInputSchema,
  outputSchema: z.object({
    market: standardsMarketSchema,
    stage: z.string(),
    publisher: z.string().optional(),
    grade: z.string().optional(),
    warning: z.string().optional(),
    references: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        summary: z.string(),
        bodyExcerpt: z.string(),
        citation: z.string(),
        publisher: z.string(),
        textbookName: z.string(),
        edition: z.string().nullable(),
        grade: z.string().nullable(),
        level: z.string().nullable(),
        module: z.string(),
        sectionPath: z.array(z.string()),
        keywords: z.array(z.string()),
        sourceKind: z.string(),
        sportItem: z.string().nullable(),
        teachingAnalysis: z.array(z.string()),
        technicalPoints: z.array(z.string()),
        teachingSuggestions: z.array(z.string()),
        safetyNotes: z.array(z.string()),
        score: z.number(),
      }),
    ),
    context: z.string(),
  }),
  execute: async ({ query, limit, market, stage, grade, publisher }) => {
    return searchTextbook(query, {
      grade,
      limit,
      market,
      publisher,
      stage,
    });
  },
});
