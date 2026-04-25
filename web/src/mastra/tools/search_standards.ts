import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { DEFAULT_STANDARDS_MARKET, standardsMarketSchema, type StandardsMarket } from "@/lib/lesson-authoring-contract";

import {
  peStandards2022Corpus,
  peStandards2022Entries,
  type PeStandardCorpus,
  type PeStandardEntry,
} from "../knowledge/standards_2022";

export type StandardReference = {
  id: string;
  title: string;
  summary: string;
  source: PeStandardEntry["source"];
  officialVersion: PeStandardEntry["officialVersion"];
  gradeBands: PeStandardEntry["gradeBands"];
  module: PeStandardEntry["module"];
  sectionPath: string[];
  keywords: string[];
  requirements: string[];
  teachingImplications: string[];
  citation: string;
  score: number;
};

export type StandardsCorpusMetadata = {
  corpusId: string;
  displayName: string;
  officialStatus: string;
  sourceName: string;
  issuer: string;
  version: string;
  url: string;
  availability: "ready" | "planned";
};

export type StandardsSearchResult = {
  requestedMarket: StandardsMarket;
  resolvedMarket: StandardsMarket;
  references: StandardReference[];
  context: string;
  corpus: StandardsCorpusMetadata;
  warning?: string;
};

const DEFAULT_LIMIT = 6;

const GRADE_BAND_ALIASES: Array<{ pattern: RegExp; gradeBand: PeStandardEntry["gradeBands"][number] }> = [
  { pattern: /一年级|二年级|1年级|2年级|低年级|水平一/, gradeBand: "1-2年级" },
  { pattern: /三年级|四年级|3年级|4年级|中年级|水平二/, gradeBand: "3-4年级" },
  { pattern: /五年级|六年级|5年级|6年级|高年级|水平三/, gradeBand: "5-6年级" },
  { pattern: /七年级|八年级|九年级|初一|初二|初三|初中|7年级|8年级|9年级|水平四/, gradeBand: "7-9年级" },
];

const MODULE_ALIASES: Array<{ pattern: RegExp; module: PeStandardEntry["module"] }> = [
  { pattern: /安全|风险|保护|损伤|器材|场地/, module: "安全管理" },
  { pattern: /评价|评估|达标|反馈|自评|互评/, module: "评价建议" },
  { pattern: /目标|素养|运动能力|健康行为|体育品德/, module: "核心素养" },
  { pattern: /体能|速度|力量|耐力|柔韧|灵敏|协调/, module: "课程内容" },
  { pattern: /单元|课时|教学|情境|比赛|游戏|分层/, module: "教学建议" },
  { pattern: /资源|器材不足|场地|校本|家庭|社区/, module: "资源开发" },
];

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function uniqueTerms(query: string) {
  const normalizedQuery = normalizeText(query);
  const matches = normalizedQuery.match(/[\p{Script=Han}a-z0-9]+/gu) ?? [];

  return Array.from(new Set(matches.filter((term) => term.length >= 2)));
}

function inferGradeBands(query: string) {
  return GRADE_BAND_ALIASES.filter(({ pattern }) => pattern.test(query)).map(({ gradeBand }) => gradeBand);
}

function inferModules(query: string) {
  return MODULE_ALIASES.filter(({ pattern }) => pattern.test(query)).map(({ module }) => module);
}

function entrySearchText(entry: PeStandardEntry) {
  return [
    entry.title,
    entry.module,
    entry.sectionPath.join(" "),
    entry.keywords.join(" "),
    entry.summary,
    entry.requirements.join(" "),
    entry.teachingImplications.join(" "),
    entry.citation,
  ]
    .join(" ")
    .toLowerCase();
}

function scoreEntry(entry: PeStandardEntry, query: string) {
  const terms = uniqueTerms(query);
  const gradeBands = inferGradeBands(query);
  const modules = inferModules(query);
  const searchText = entrySearchText(entry);
  let score = 0;

  for (const term of terms) {
    if (entry.title.toLowerCase().includes(term)) score += 8;
    if (entry.keywords.some((keyword) => keyword.toLowerCase().includes(term))) score += 6;
    if (entry.summary.toLowerCase().includes(term)) score += 4;
    if (entry.requirements.some((requirement) => requirement.toLowerCase().includes(term))) score += 3;
    if (entry.teachingImplications.some((implication) => implication.toLowerCase().includes(term))) score += 2;
    if (searchText.includes(term)) score += 1;
  }

  if (gradeBands.length > 0 && entry.gradeBands.some((band) => gradeBands.includes(band) || band === "全学段")) {
    score += 10;
  }

  if (modules.length > 0 && modules.includes(entry.module)) {
    score += 8;
  }

  if (score === 0 && query.trim().length < 2) {
    score = 1;
  }

  return score;
}

function toReference(entry: PeStandardEntry, score: number): StandardReference {
  return {
    id: entry.id,
    title: entry.title,
    summary: entry.summary,
    source: entry.source,
    officialVersion: entry.officialVersion,
    gradeBands: entry.gradeBands,
    module: entry.module,
    sectionPath: entry.sectionPath,
    keywords: entry.keywords,
    requirements: entry.requirements,
    teachingImplications: entry.teachingImplications,
    citation: entry.citation,
    score,
  };
}

function toCorpusMetadata(corpus: PeStandardCorpus, availability: StandardsCorpusMetadata["availability"]): StandardsCorpusMetadata {
  return {
    corpusId: corpus.corpusId,
    displayName: corpus.displayName,
    officialStatus: corpus.officialStatus,
    sourceName: corpus.source.name,
    issuer: corpus.source.issuer,
    version: corpus.source.version,
    url: corpus.source.url,
    availability,
  };
}

function resolveStandardsMarket(market = DEFAULT_STANDARDS_MARKET) {
  if (market === "us-shape-k12") {
    return {
      requestedMarket: market,
      resolvedMarket: DEFAULT_STANDARDS_MARKET,
      corpus: toCorpusMetadata(peStandards2022Corpus, "ready"),
      warning: "当前仓库尚未接入 SHAPE 体育标准知识库，已自动回退到中国《义务教育体育与健康课程标准（2022年版）》结构化语料。",
    };
  }

  return {
    requestedMarket: market,
    resolvedMarket: market,
    corpus: toCorpusMetadata(peStandards2022Corpus, "ready"),
    warning: undefined,
  };
}

function scoreCorpusEntries(query: string, limit = DEFAULT_LIMIT) {
  const scoredReferences = peStandards2022Entries
    .map((entry) => toReference(entry, scoreEntry(entry, query)))
    .filter((reference) => reference.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));

  if (scoredReferences.length > 0) {
    return scoredReferences.slice(0, limit);
  }

  return peStandards2022Entries
    .filter((entry) => ["核心素养", "课程目标", "教学建议", "安全管理", "评价建议"].includes(entry.module))
    .slice(0, limit)
    .map((entry) => toReference(entry, 0));
}

export function buildStandardsContextFromReferences(references: StandardReference[]) {
  if (references.length === 0) {
    return "未检索到匹配的体育课程标准结构化条目；请以目标市场的正式现行课标文本为准。";
  }

  return references
    .map((reference, index) => {
      const requirements = reference.requirements.map((item) => `    - ${item}`).join("\n");
      const implications = reference.teachingImplications.map((item) => `    - ${item}`).join("\n");

      return [
        `${index + 1}. ${reference.title}`,
        `   来源：${reference.citation}`,
        `   学段：${reference.gradeBands.join("、")}；模块：${reference.module}`,
        `   摘要：${reference.summary}`,
        `   课标要求：\n${requirements}`,
        `   教学转化：\n${implications}`,
      ].join("\n");
    })
    .join("\n\n");
}

export function searchStandards(
  query: string,
  options: {
    limit?: number;
    market?: StandardsMarket;
  } = {},
): StandardsSearchResult {
  const { limit = DEFAULT_LIMIT, market = DEFAULT_STANDARDS_MARKET } = options;
  const resolved = resolveStandardsMarket(market);
  const references = scoreCorpusEntries(query, limit);

  return {
    requestedMarket: resolved.requestedMarket,
    resolvedMarket: resolved.resolvedMarket,
    references,
    context: buildStandardsContextFromReferences(references),
    corpus: resolved.corpus,
    warning: resolved.warning,
  };
}

export function buildStandardsContext(
  query: string,
  options: {
    limit?: number;
    market?: StandardsMarket;
  } = {},
) {
  return searchStandards(query, options).context;
}

export const searchStandardsTool = createTool({
  id: "search-standards",
  description: "检索体育课程标准结构化条目，用于生成合规体育教案，并返回目标市场与语料解析信息。",
  inputSchema: z.object({
    query: z.string().describe("教师输入的课程主题、年级、运动项目、安全要求或评价要求。"),
    limit: z.number().int().min(1).max(10).optional().describe("最多返回的课标条目数量，默认 6 条。"),
    market: standardsMarketSchema.optional().describe("目标教育市场。当前仓库默认支持中国义务教育体育课标。"),
  }),
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
