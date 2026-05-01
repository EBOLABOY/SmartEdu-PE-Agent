#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { createClient } from "@supabase/supabase-js";

const DEFAULT_CACHE_DIR = ".cache/textbook-corpus-pep-section-aware-v6";
const DEFAULT_MARKET = "cn-compulsory-2022";
const DEFAULT_STAGE = "小学";
const DEFAULT_PUBLISHER = "人教版";
const DEFAULT_LIMIT = 5;
const DEFAULT_EMBEDDING_MODEL = "nvidia/llama-3.2-nv-embedqa-1b-v2";
const DEFAULT_EMBEDDING_DIMENSIONS = 1536;
const EMBEDDING_QUERY_INPUT_TYPE = "query";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, "..");

const CASES = [
  {
    name: "三年级篮球行进间运球",
    query: "三年级 篮球 行进间运球 教材分析 动作方法 教学建议",
    grade: "三年级",
    expectedTerms: ["篮球", "运球"],
    preferredSections: ["教材分析", "动作方法", "教学建议", "易犯错误与纠正"],
  },
  {
    name: "五年级足球脚内侧传球",
    query: "五年级 足球 脚内侧传球 教材分析 动作要点 教学建议",
    grade: "五年级",
    expectedTerms: ["足球", "脚内侧", "传球"],
    preferredSections: ["教材分析", "动作方法", "动作要点", "教学建议", "易犯错误与纠正"],
  },
  {
    name: "四年级快速跑",
    query: "四年级 快速跑 教材分析 动作方法 教学建议",
    grade: "四年级",
    expectedTerms: ["跑", "快速"],
    preferredSections: ["教材分析", "动作方法", "教学建议", "易犯错误与纠正"],
  },
  {
    name: "四年级立定跳远",
    query: "四年级 立定跳远 动作方法 动作要点 教学建议",
    grade: "四年级",
    expectedTerms: ["立定跳远", "跳远", "跳跃"],
    preferredSections: ["教材分析", "动作方法", "动作要点", "教学建议", "易犯错误与纠正"],
  },
  {
    name: "五年级武术长拳",
    query: "五年级 武术 长拳 动作要点 教学建议 安全提示",
    grade: "五年级",
    expectedTerms: ["武术", "长拳"],
    preferredSections: ["教材分析", "动作方法", "动作要点", "教学建议", "安全提示"],
  },
  {
    name: "五年级排球正面双手垫球",
    query: "五年级 排球 正面双手垫球 动作方法 易犯错误 教学建议",
    grade: "五年级",
    expectedTerms: ["排球", "垫球"],
    preferredSections: ["教材分析", "动作方法", "动作要点", "教学建议", "易犯错误与纠正"],
  },
];

const PUBLISHER_CACHE_DIRS = new Map([
  ["人教版", ".cache/textbook-corpus-pep-section-aware-v6"],
  ["北京版", ".cache/textbook-corpus-e58c97e4baace78988-section-aware-v1"],
  ["华东师大版", ".cache/textbook-corpus-e58d8ee4b89ce5b888e5a4a7e78988-section-aware-v1"],
  ["冀教版", ".cache/textbook-corpus-e58680e69599e78988-section-aware-v1"],
]);

function parseArgs(argv) {
  const args = {
    cacheDir: resolve(webRoot, DEFAULT_CACHE_DIR),
    json: false,
    limit: DEFAULT_LIMIT,
    market: DEFAULT_MARKET,
    online: false,
    publisher: DEFAULT_PUBLISHER,
    stage: DEFAULT_STAGE,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    switch (token) {
      case "--cache-dir":
        args.cacheDir = resolve(webRoot, next);
        index += 1;
        break;
      case "--json":
        args.json = true;
        break;
      case "--limit":
        args.limit = Number.parseInt(next, 10);
        index += 1;
        break;
      case "--market":
        args.market = next;
        index += 1;
        break;
      case "--online":
        args.online = true;
        break;
      case "--publisher":
        args.publisher = next;
        index += 1;
        break;
      case "--stage":
        args.stage = next;
        index += 1;
        break;
      default:
        throw new Error(`未知参数：${token}`);
    }
  }

  if (!Number.isInteger(args.limit) || args.limit <= 0) {
    throw new Error("--limit 必须是正整数");
  }

  if (!argv.includes("--cache-dir")) {
    args.cacheDir = resolve(webRoot, PUBLISHER_CACHE_DIRS.get(args.publisher) ?? DEFAULT_CACHE_DIR);
  }

  return args;
}

async function loadEnvFile(path) {
  if (!existsSync(path)) {
    return;
  }

  const content = await readFile(path, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }

    const splitAt = line.indexOf("=");
    const key = line.slice(0, splitAt).trim();
    let value = line.slice(splitAt + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] ??= value;
  }
}

async function loadEnv() {
  await loadEnvFile(resolve(webRoot, ".env.local"));
  await loadEnvFile(resolve(webRoot, ".env"));
}

function resolveEnvReference(value = "") {
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => process.env[name] ?? "");
}

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`缺少环境变量 ${name}`);
  }

  return value;
}

function resolveGradeBand(grade) {
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

function resolveLevelAlias(grade) {
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

function buildRetrievalQuery(testCase, args) {
  const gradeBand = resolveGradeBand(testCase.grade);
  const levelAlias = resolveLevelAlias(testCase.grade);

  return [
    testCase.query,
    args.publisher,
    testCase.grade,
    gradeBand,
    levelAlias,
    "教师用书",
    "教材分析",
    "动作要点",
    "教学建议",
  ].filter(Boolean).join(" ");
}

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function entrySearchText(entry) {
  return normalizeText([
    entry.title,
    entry.module,
    entry.grade,
    entry.level,
    entry.volume,
    entry.sport_item,
    entry.section_path?.join(" "),
    entry.keywords?.join(" "),
    entry.summary,
    entry.body_excerpt,
    entry.teaching_analysis?.join(" "),
    entry.technical_points?.join(" "),
    entry.teaching_suggestions?.join(" "),
    entry.safety_notes?.join(" "),
  ].filter(Boolean).join(" "));
}

function scoreLocalEntry(entry, testCase) {
  const text = entrySearchText(entry);
  const sectionType = entry.metadata?.sectionType ?? "";
  const gradeBand = resolveGradeBand(testCase.grade);
  let score = 0;

  for (const term of testCase.expectedTerms) {
    if (entry.title?.includes(term)) {
      score += 22;
    }

    if (entry.module?.includes(term) || entry.sport_item?.includes(term)) {
      score += 20;
    }

    if (entry.keywords?.some((keyword) => keyword.includes(term))) {
      score += 14;
    }

    if (entry.summary?.includes(term)) {
      score += 10;
    }

    if (entry.body_excerpt?.includes(term)) {
      score += 8;
    }
  }

  if (entry.source_kind === "teacher-guide") {
    score += 12;
  }

  if (testCase.preferredSections.includes(sectionType)) {
    score += 10;
  }

  if (entry.grade?.includes(testCase.grade) || entry.grade?.includes(gradeBand) || entry.level === resolveLevelAlias(testCase.grade)) {
    score += 10;
  }

  if (text.includes("教材分析")) {
    score += 4;
  }

  if (text.includes("动作方法") || text.includes("动作要点")) {
    score += 4;
  }

  if (text.includes("教学建议")) {
    score += 4;
  }

  return score;
}

async function loadCacheEntries(cacheDir) {
  const files = (await readdir(cacheDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name);
  const entries = [];

  for (const fileName of files) {
    const content = JSON.parse(await readFile(resolve(cacheDir, fileName), "utf8"));
    entries.push(...(content.entries ?? []));
  }

  return entries;
}

function searchLocalCache(entries, testCase, args) {
  const gradeBand = resolveGradeBand(testCase.grade);
  const levelAlias = resolveLevelAlias(testCase.grade);

  return entries
    .filter((entry) =>
      !entry.grade ||
      entry.grade === testCase.grade ||
      entry.grade === gradeBand ||
      entry.grade.includes(gradeBand) ||
      entry.level === levelAlias
    )
    .map((entry) => ({
      entry,
      score: scoreLocalEntry(entry, testCase),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, args.limit)
    .map(({ entry, score }) => ({
      citation: entry.citation,
      module: entry.module,
      score,
      sectionTitle: entry.metadata?.sectionTitle ?? null,
      sectionType: entry.metadata?.sectionType ?? null,
      sourceKind: entry.source_kind,
      summary: entry.summary?.slice(0, 180),
      title: entry.title,
    }));
}

function getEmbeddingConfig() {
  return {
    apiKey: resolveEnvReference(
      process.env.AI_EMBEDDING_API_KEY ?? process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY,
    ),
    baseUrl: resolveEnvReference(process.env.AI_EMBEDDING_BASE_URL ?? process.env.AI_BASE_URL)?.replace(
      /\/+$/,
      "",
    ),
    dimensions: Number.parseInt(
      process.env.AI_EMBEDDING_DIMENSIONS ?? String(DEFAULT_EMBEDDING_DIMENSIONS),
      10,
    ),
    model: process.env.AI_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL,
  };
}

async function embedQuery(query) {
  const config = getEmbeddingConfig();

  if (!config.baseUrl) {
    throw new Error("缺少 AI_EMBEDDING_BASE_URL 或 AI_BASE_URL，无法执行线上教材检索回归。");
  }

  const response = await fetch(`${config.baseUrl}/embeddings`, {
    body: JSON.stringify({
      dimensions: config.dimensions,
      input: [query],
      input_type: EMBEDDING_QUERY_INPUT_TYPE,
      model: config.model,
    }),
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`生成教材查询向量失败：${response.status} ${await response.text()}`);
  }

  const json = await response.json();
  const embedding = json.data?.[0]?.embedding;

  if (!Array.isArray(embedding) || embedding.length !== config.dimensions) {
    throw new Error(`教材查询向量维度不匹配：期望 ${config.dimensions}，实际 ${embedding?.length ?? 0}`);
  }

  return embedding;
}

function createSupabaseAdminClient() {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SECRET_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function searchOnline(supabase, testCase, args) {
  const query = buildRetrievalQuery(testCase, args);
  const embedding = await embedQuery(query);
  const { data, error } = await supabase.rpc("match_textbook_entries_hybrid", {
    query_text: query,
    query_embedding: `[${embedding.join(",")}]`,
    match_limit: Math.max(args.limit * 4, args.limit),
    target_market: args.market,
    target_publisher: args.publisher,
    target_stage: args.stage,
    target_grade: resolveGradeBand(testCase.grade),
  });

  if (error) {
    throw error;
  }

  return (data ?? []).slice(0, args.limit).map((entry) => ({
    citation: entry.citation,
    module: entry.module,
    score: Math.round(Number(entry.similarity ?? 0) * 10000) / 100,
    sectionPath: entry.section_path,
    sourceKind: entry.source_kind,
    summary: entry.summary?.slice(0, 180),
    title: entry.title,
  }));
}

function summarizeHits(hits, testCase) {
  const top = hits[0];
  const topText = normalizeText([
    top?.title,
    top?.module,
    top?.summary,
    top?.sectionTitle,
    top?.sectionType,
    top?.sectionPath?.join(" "),
  ].filter(Boolean).join(" "));
  const topHasExpectedTerm = testCase.expectedTerms.some((term) => topText.includes(term));
  const teacherGuideHits = hits.filter((hit) => hit.sourceKind === "teacher-guide").length;

  return {
    hitCount: hits.length,
    status: hits.length > 0 && topHasExpectedTerm ? "pass" : "review",
    teacherGuideHits,
    topHasExpectedTerm,
  };
}

function printHumanReport(results) {
  for (const result of results) {
    console.log(`\n# ${result.name}`);

    if (result.local) {
      console.log(`本地 cache：${result.local.summary.status}，命中 ${result.local.summary.hitCount} 条，教师用书 ${result.local.summary.teacherGuideHits} 条`);
      result.local.hits.forEach((hit, index) => {
        console.log(`  ${index + 1}. [${hit.score}] ${hit.title}`);
        console.log(`     ${hit.citation}；${hit.sourceKind}；${hit.sectionType ?? "未标注"}`);
        console.log(`     ${hit.summary}`);
      });
    }

    if (result.online) {
      console.log(`线上 Supabase：${result.online.summary.status}，命中 ${result.online.summary.hitCount} 条，教师用书 ${result.online.summary.teacherGuideHits} 条`);
      result.online.hits.forEach((hit, index) => {
        console.log(`  ${index + 1}. [${hit.score}] ${hit.title}`);
        console.log(`     ${hit.citation}；${hit.sourceKind}`);
        console.log(`     ${hit.summary}`);
      });
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadEnv();

  const cacheEntries = await loadCacheEntries(args.cacheDir);
  const supabase = args.online ? createSupabaseAdminClient() : null;
  const results = [];

  for (const testCase of CASES) {
    const localHits = searchLocalCache(cacheEntries, testCase, args);
    const onlineHits = supabase ? await searchOnline(supabase, testCase, args) : null;

    results.push({
      name: testCase.name,
      query: testCase.query,
      local: {
        hits: localHits,
        summary: summarizeHits(localHits, testCase),
      },
      online: onlineHits
        ? {
            hits: onlineHits,
            summary: summarizeHits(onlineHits, testCase),
          }
        : null,
    });
  }

  if (args.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  printHumanReport(results);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
