#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { PDFParse } from "pdf-parse";

const DEFAULT_INPUT_DIR = "downloads/smartedu-pe-health/pdf/小学";
const DEFAULT_MARKET = "cn-compulsory-2022";
const DEFAULT_STAGE = "小学";
const DEFAULT_SUBJECT = "体育与健康";
const DEFAULT_CURRICULUM_STANDARD_VERSION = "2022";
const DEFAULT_EMBEDDING_MODEL = "nvidia/llama-3.2-nv-embedqa-1b-v2";
const DEFAULT_EMBEDDING_DIMENSIONS = 1536;
const EMBEDDING_PASSAGE_INPUT_TYPE = "passage";
const MIN_TEXT_CHARS_PER_PAGE = 40;
const LOW_VALUE_PAGE_PATTERNS = [
  /^目\s*录/m,
  /前\s*言[\s\S]{0,500}目\s*录/,
  /第[一二三四五六七八九十]+章[\s\S]{0,80}第[一二三四五六七八九十]+章[\s\S]{0,80}第[一二三四五六七八九十]+章/,
  /…{3,}|\.{6,}|…………………………………………/,
  /联系方式[\s\S]{0,120}(电子邮箱|意见反馈平台|绿色印刷产品)/,
  /(评价表|得分|优秀|良好|合格|继续努力)[\s\S]{0,240}(男|女)[\s\S]{0,240}(\d+\.\d+|\d+\s+\d+\s+\d+)/,
  /(全年|上学期|下学期)[\s\S]{0,160}(课时建议|教学内容)[\s\S]{0,240}\d+\s+\d+/,
];
const PINYIN_LETTER_CLASS = "A-Za-zāáǎàōóǒòēéěèīíǐìūúǔùǖǘǚǜüńňǹḿɡɑê";
const CONTROL_GLYPH_PATTERN = /[\u0001-\u0008\u000b-\u001f\u007f-\u009f]/g;
const INLINE_PINYIN_PATTERN = new RegExp(
  `(?:^|[\\s\\t])([${PINYIN_LETTER_CLASS}0-9]{1,10})[\\s\\t]+(?=[\\u3400-\\u9fff])`,
  "g",
);
const PINYIN_PREFIX_PATTERN = new RegExp(
  `(^|[^\\u3400-\\u9fffA-Za-z])([${PINYIN_LETTER_CLASS}]{1,8}\\d?)(?=[\\u3400-\\u9fff])`,
  "g",
);
const SUSPICIOUS_GLYPH_PATTERN = /[\u1200-\u137f\u1400-\u167f\u1780-\u17ff\u0900-\u097f]/g;
const PINYIN_RESIDUE_PATTERN = /[A-Za-zāáǎàōóǒòēéěèīíǐìūúǔùǖǘǚǜüńňǹḿɡɑê]{2,}/g;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, "..");
const repoRoot = resolve(webRoot, "..");

const MODULE_PATTERNS = [
  "基本运动技能",
  "体能",
  "篮球",
  "足球",
  "排球",
  "乒乓球",
  "羽毛球",
  "网球",
  "田径",
  "体操",
  "游泳",
  "滑冰",
  "滑雪",
  "冰雪",
  "武术",
  "中华传统体育",
  "民族民间传统体育",
  "新兴体育",
  "健康教育",
  "定向运动",
  "花样跳绳",
  "轮滑",
  "健美操",
  "啦啦操",
];
const SECTION_TYPE_PATTERNS = [
  ["教材分析", /教材分析|教材内容价值|内容价值|教材特点|教学价值/],
  ["教学目标", /教学目标|学习目标|目标/],
  ["动作方法", /动作方法|技术方法|练习方法|学练方法/],
  ["动作要点", /动作要点|教学重点|教学难点|重点|难点|技术要点/],
  ["教学建议", /教学建议|教学提示|教学方法|组织教法|学练建议/],
  ["易犯错误与纠正", /易犯错误|纠正方法|错误与纠正/],
  ["教学评价", /教学评价|评价要点|综合性评价|量性评价|质性评价/],
  ["安全提示", /安全|保护与帮助|安全保障|防范措施/],
  ["课时计划", /课时计划|教学进度|教学工作计划|课时分配/],
  ["动作组合", /组合动作|组合练习|套路|成套动作/],
  ["教材正文", /第[一二三四五六七八九十]+[章节]|单元|活动/],
];
const GENERIC_SECTION_TITLES = new Set(["正文", "教材正文"]);
const SECTION_HEADING_PATTERN =
  /(第[一二三四五六七八九十]+[章节][\u3400-\u9fffA-Za-z0-9（）()、·\s]{0,28}|[一二三四五六七八九十]+、[\u3400-\u9fffA-Za-z0-9（）()、·\s]{2,32}|（[一二三四五六七八九十]+）[\u3400-\u9fffA-Za-z0-9（）()、·\s]{2,32}|【[^】]{2,24}】|(?:教学目标|学习目标|教材分析|教材内容价值|动作方法|动作要点|教学重点|教学难点|易犯错误与纠正(?:方法)?|纠正方法|教学建议|学练建议|教学评价(?:要点与建议)?|评价建议|安全提示|保护与帮助)[:：]?)/g;

function parseArgs(argv) {
  const args = {
    batchSize: 12,
    cacheDir: resolve(webRoot, ".cache", "textbook-corpus"),
    chunkOverlap: 100,
    chunkSize: 900,
    dryRun: false,
    embeddingDimensions: Number.parseInt(
      process.env.AI_EMBEDDING_DIMENSIONS ?? String(DEFAULT_EMBEDDING_DIMENSIONS),
      10,
    ),
    embeddingModel: process.env.AI_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL,
    inputDir: resolve(repoRoot, DEFAULT_INPUT_DIR),
    limitFiles: undefined,
    limitPages: undefined,
    market: DEFAULT_MARKET,
    matchFile: "",
    ocr: "never",
    replace: false,
    sectionAware: false,
    skipEmptyBooks: false,
    stage: DEFAULT_STAGE,
    subject: DEFAULT_SUBJECT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    switch (token) {
      case "--batch-size":
        args.batchSize = Number.parseInt(next, 10);
        index += 1;
        break;
      case "--cache-dir":
        args.cacheDir = resolve(webRoot, next);
        index += 1;
        break;
      case "--chunk-overlap":
        args.chunkOverlap = Number.parseInt(next, 10);
        index += 1;
        break;
      case "--chunk-size":
        args.chunkSize = Number.parseInt(next, 10);
        index += 1;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--embedding-dimensions":
        args.embeddingDimensions = Number.parseInt(next, 10);
        index += 1;
        break;
      case "--embedding-model":
        args.embeddingModel = next;
        index += 1;
        break;
      case "--input-dir":
        args.inputDir = resolve(repoRoot, next);
        index += 1;
        break;
      case "--limit-files":
        args.limitFiles = Number.parseInt(next, 10);
        index += 1;
        break;
      case "--limit-pages":
        args.limitPages = Number.parseInt(next, 10);
        index += 1;
        break;
      case "--market":
        args.market = next;
        index += 1;
        break;
      case "--match-file":
        args.matchFile = next;
        index += 1;
        break;
      case "--ocr":
        args.ocr = next;
        index += 1;
        break;
      case "--replace":
        args.replace = true;
        break;
      case "--section-aware":
        args.sectionAware = true;
        break;
      case "--skip-empty-books":
        args.skipEmptyBooks = true;
        break;
      case "--stage":
        args.stage = next;
        index += 1;
        break;
      case "--subject":
        args.subject = next;
        index += 1;
        break;
      default:
        throw new Error(`未知参数：${token}`);
    }
  }

  if (args.ocr !== "never") {
    throw new Error("教材入库脚本当前仅支持 --ocr never。请先确认 PDF 可直接提取文本。");
  }

  for (const [name, value] of [
    ["--batch-size", args.batchSize],
    ["--chunk-overlap", args.chunkOverlap],
    ["--chunk-size", args.chunkSize],
    ["--embedding-dimensions", args.embeddingDimensions],
  ]) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${name} 必须是正整数`);
    }
  }

  if (args.chunkOverlap >= args.chunkSize) {
    throw new Error("--chunk-overlap 必须小于 --chunk-size");
  }

  return args;
}

async function loadEnvFile(path) {
  if (!existsSync(path)) {
    return;
  }

  const content = await readFile(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const splitAt = trimmed.indexOf("=");
    const key = trimmed.slice(0, splitAt).trim();
    let value = trimmed.slice(splitAt + 1).trim();

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

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`缺少环境变量 ${name}`);
  }
  return value;
}

function getEmbeddingConfig() {
  return {
    apiKey: resolveEnvReference(
      process.env.AI_EMBEDDING_API_KEY ?? process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY,
    ),
    baseUrl: resolveEnvReference(
      process.env.AI_EMBEDDING_BASE_URL ?? process.env.AI_BASE_URL ?? "https://api.openai.com/v1",
    ).replace(/\/+$/, ""),
  };
}

function createHeaders(apiKey) {
  return {
    "Content-Type": "application/json",
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
}

function createSupabaseAdminClient() {
  return createClient(getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"), getRequiredEnv("SUPABASE_SECRET_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function cleanText(text) {
  const normalized = text
    .replace(/--\s*\d+\s+of\s+\d+\s*--/g, " ")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  const meaningfulLines = normalized
    .split(/\r?\n/)
    .map((line) => normalizeExtractedLine(line.trim()))
    .filter((line) => !isNoiseTextLine(line));

  return normalizeExtractedLine(mergeChineseSoftBreaks(meaningfulLines.join("\n")))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeExtractedLine(line) {
  return line
    .replace(/\u0000/g, "")
    .replace(CONTROL_GLYPH_PATTERN, "")
    .replace(INLINE_PINYIN_PATTERN, "")
    .replace(PINYIN_PREFIX_PATTERN, "$1")
    .replace(/\t+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

function isNoiseTextLine(line) {
  if (!line) {
    return true;
  }

  const metrics = getTextQualityMetrics(line);
  if (metrics.suspiciousGlyphRatio > 0.12) {
    return true;
  }

  const hasCjk = /[\u3400-\u9fff]/.test(line);

  if (hasCjk) {
    return false;
  }

  if (/^\d{1,3}$/.test(line)) {
    return true;
  }

  if (/^[A-Za-zāáǎàōóǒòēéěèīíǐìūúǔùǖǘǚǜüńňǹḿɡɑêê̄ếê̌ề·\s'’\-.,:;!?()（）$#&]+$/.test(line)) {
    return true;
  }

  return line.length <= 2;
}

function getTextQualityMetrics(text) {
  const length = Math.max(text.length, 1);
  const cjkCount = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const asciiCount = text.match(PINYIN_RESIDUE_PATTERN)?.join("").length ?? 0;
  const newlineCount = text.match(/\n/g)?.length ?? 0;
  const suspiciousGlyphCount = text.match(SUSPICIOUS_GLYPH_PATTERN)?.length ?? 0;

  return {
    asciiRatio: asciiCount / length,
    cjkRatio: cjkCount / length,
    newlineRatio: newlineCount / length,
    suspiciousGlyphRatio: suspiciousGlyphCount / length,
  };
}

function mergeChineseSoftBreaks(text) {
  return text
    .replace(/(?<=[\u3400-\u9fff，。、；：！？“”‘’《》（）])\n(?=[\u3400-\u9fff，。、；：！？“”‘’《》（）])/g, "")
    .replace(/(?<=[\u3400-\u9fff])\n(?=\d+\s*[年月日届])/g, "")
    .replace(/(?<=[\d年月日届])\n(?=[\u3400-\u9fff])/g, "")
    .replace(/(?<=[\u3400-\u9fff])\n(?=[A-Za-z]{1,2}\b)/g, "")
    .replace(/(?<=\b[A-Za-z]{1,2})\n(?=[\u3400-\u9fff])/g, "");
}

async function listPdfFiles(rootDir) {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = resolve(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listPdfFiles(fullPath));
      continue;
    }

    if (entry.isFile() && extname(entry.name).toLowerCase() === ".pdf") {
      files.push(fullPath);
    }
  }

  return files.sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function stripUuidSuffix(fileName) {
  return fileName
    .replace(/_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i, "")
    .replace(/\.pdf$/i, "");
}

function parseBookMetadata(filePath, args) {
  const fileName = basename(filePath);
  const displayBase = stripUuidSuffix(fileName);
  const publisher = basename(dirname(filePath));
  const isTeacherGuide = /教师用书/.test(displayBase);
  const sourceKind = isTeacherGuide ? "teacher-guide" : "textbook-body";
  const level = displayBase.match(/水平[一二三四五六]/)?.[0] ?? null;
  const gradeRange = displayBase.match(/([一二三四五六七八九]年级|[1-9]至[1-9]年级)/)?.[0] ?? null;
  const volume = displayBase.match(/全一册|上册|下册/)?.[0] ?? "全一册";
  const textbookName = displayBase.replace(/^[^_]+_[^_]+_[^_]+_/, "");

  return {
    displayBase,
    edition: level ?? gradeRange ?? volume,
    grade: gradeRange,
    level,
    publisher,
    sourceKind,
    subject: args.subject,
    textbookName,
    volume,
  };
}

async function extractPages(filePath, args) {
  const data = await readFile(filePath);
  const parser = new PDFParse({ data });

  try {
    const result = await parser.getText();
    const pages = result.pages.slice(0, args.limitPages ?? result.pages.length).map((page) => ({
      pageNumber: page.num,
      text: cleanText(page.text ?? ""),
    }));

    return pages.filter((page) => page.text.length >= MIN_TEXT_CHARS_PER_PAGE);
  } finally {
    await parser.destroy();
  }
}

function findTextbookModule(text) {
  const matches = MODULE_PATTERNS
    .map((pattern, priority) => ({
      index: text.indexOf(pattern),
      pattern,
      priority,
    }))
    .filter((match) => match.index >= 0)
    .sort((a, b) => a.index - b.index || a.priority - b.priority);

  return matches[0]?.pattern ?? "体育与健康";
}

function resolveSectionType(text) {
  return SECTION_TYPE_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] ?? "正文";
}

function isGenericSectionTitle(title) {
  return !title || GENERIC_SECTION_TITLES.has(title);
}

function normalizeSectionTitle(title) {
  return title
    .replace(/[ \t]+/g, " ")
    .replace(/^【(.+)】$/, "$1")
    .replace(/[:：]+$/g, "")
    .trim()
    .slice(0, 80);
}

function findKeywords(text, metadata) {
  const keywords = new Set([
    metadata.publisher,
    metadata.level,
    metadata.grade,
    metadata.volume,
    metadata.sourceKind === "teacher-guide" ? "教师用书" : "教科书",
  ].filter(Boolean));

  for (const pattern of MODULE_PATTERNS) {
    if (text.includes(pattern)) {
      keywords.add(pattern);
    }
  }

  return [...keywords].slice(0, 16);
}

function splitSentences(text) {
  return cleanText(text)
    .split(/(?<=[。！？!?；;])\s*/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 8);
}

function summarizeText(text, maxLength = 260) {
  const sentences = splitSentences(text);
  const summary = sentences.join("");

  return (summary || cleanText(text)).slice(0, maxLength);
}

function pickLines(text, patterns, limit) {
  const lines = cleanText(text)
    .split(/\n|(?<=[。！？!?；;])\s*/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 8 && patterns.some((pattern) => pattern.test(line)));

  return [...new Set(lines)].slice(0, limit);
}

function createChunks(pages, args) {
  const chunks = [];
  let buffer = "";
  let startPage = null;
  let endPage = null;

  const flush = () => {
    const text = cleanText(buffer);
    if (text.length >= 120 && startPage !== null && endPage !== null) {
      chunks.push({
        index: chunks.length,
        startPage,
        endPage,
        text,
      });
    }
  };

  for (const page of pages) {
    if (!buffer) {
      startPage = page.pageNumber;
    }

    buffer = [buffer, page.text].filter(Boolean).join("\n\n");
    endPage = page.pageNumber;

    while (buffer.length >= args.chunkSize) {
      const slice = buffer.slice(0, args.chunkSize);
      const cutAt = Math.max(
        slice.lastIndexOf("\n\n"),
        slice.lastIndexOf("。"),
        slice.lastIndexOf("；"),
      );
      const safeCut = cutAt > args.chunkSize * 0.55 ? cutAt + 1 : args.chunkSize;
      const chunkText = cleanText(buffer.slice(0, safeCut));

      chunks.push({
        index: chunks.length,
        startPage,
        endPage,
        text: chunkText,
      });

      buffer = buffer.slice(Math.max(0, safeCut - args.chunkOverlap));
      startPage = page.pageNumber;
    }
  }

  flush();

  return chunks;
}

function markSectionHeadings(text) {
  return text.replace(SECTION_HEADING_PATTERN, "\n@@SECTION_HEADING@@$1\n");
}

function isMarkedSectionHeading(line) {
  return line.startsWith("@@SECTION_HEADING@@");
}

function unmarkSectionHeading(line) {
  return normalizeSectionTitle(line.replace(/^@@SECTION_HEADING@@/, ""));
}

function createSectionChunksFromText(input) {
  const chunks = [];
  let buffer = input.text;
  const overlapAnchor = isGenericSectionTitle(input.sectionTitle) ? "" : input.sectionTitle;

  while (buffer.length >= input.chunkSize) {
    const slice = buffer.slice(0, input.chunkSize);
    const cutAt = Math.max(
      slice.lastIndexOf("\n\n"),
      slice.lastIndexOf("。"),
      slice.lastIndexOf("；"),
    );
    const safeCut = cutAt > input.chunkSize * 0.55 ? cutAt + 1 : input.chunkSize;
    const chunkText = cleanText(buffer.slice(0, safeCut));

    if (chunkText.length >= 120) {
      chunks.push({
        sectionAware: true,
        endPage: input.endPage,
        moduleHint: input.moduleHint,
        sectionTitle: input.sectionTitle,
        sectionType: input.sectionType,
        startPage: input.startPage,
        text: chunkText,
      });
    }

    buffer = [
      overlapAnchor,
      buffer.slice(Math.max(0, safeCut - input.chunkOverlap)),
    ].filter(Boolean).join("\n");
  }

  const tailText = cleanText(buffer);
  if (tailText.length >= 120) {
    chunks.push({
      sectionAware: true,
      endPage: input.endPage,
      moduleHint: input.moduleHint,
      sectionTitle: input.sectionTitle,
      sectionType: input.sectionType,
      startPage: input.startPage,
      text: tailText,
    });
  }

  return chunks;
}

function createSectionAwareChunks(pages, args, metadata) {
  const sections = [];
  let current = null;

  const flush = () => {
    if (!current) {
      return;
    }

    const text = cleanText(current.lines.join("\n"));
    if (text.length >= 120) {
      sections.push({
        endPage: current.endPage,
        sectionTitle: current.sectionTitle,
        sectionType: current.sectionType,
        startPage: current.startPage,
        text,
      });
    }
  };

  for (const page of pages) {
    const lines = markSectionHeadings(page.text)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      if (isMarkedSectionHeading(line)) {
        flush();
        const sectionTitle = unmarkSectionHeading(line);
        current = {
          endPage: page.pageNumber,
          lines: [sectionTitle],
          sectionTitle,
          sectionType: resolveSectionType(sectionTitle),
          startPage: page.pageNumber,
        };
        continue;
      }

      if (!current) {
        current = {
          endPage: page.pageNumber,
          lines: [],
          sectionTitle: "正文",
          sectionType: "正文",
          startPage: page.pageNumber,
        };
      }

      current.endPage = page.pageNumber;
      current.lines.push(line);
    }
  }

  flush();

  const meaningfulSectionCount = sections.filter(
    (section) => section.sectionType !== "正文" || !isGenericSectionTitle(section.sectionTitle),
  ).length;
  const hasOvergrownGenericSection = sections.some(
    (section) =>
      isGenericSectionTitle(section.sectionTitle) &&
      section.endPage - section.startPage + 1 > 2,
  );

  // 学生教科书常常没有可稳定抽取的小标题。此时回退到页码感知的普通切分，
  // 避免把整本书聚合成“正文 第 2-51 页”一类低可引用性条目。
  if (
    metadata.sourceKind !== "teacher-guide" &&
    (meaningfulSectionCount < 3 || hasOvergrownGenericSection)
  ) {
    return createChunks(pages, args);
  }

  const chunks = sections.flatMap((section) =>
    createSectionChunksFromText({
      chunkOverlap: args.chunkOverlap,
      chunkSize: args.chunkSize,
      ...section,
    }),
  );

  if (chunks.length === 0) {
    return createChunks(pages, args);
  }

  return chunks.map((chunk, index) => ({
    ...chunk,
    index,
  }));
}

function isLowValueChunk(text) {
  const normalized = cleanText(text);
  const digitRatio = (normalized.match(/\d/g)?.length ?? 0) / Math.max(normalized.length, 1);
  const punctuationRatio = (normalized.match(/[.…·\-\t]/g)?.length ?? 0) / Math.max(normalized.length, 1);
  const quality = getTextQualityMetrics(normalized);

  return (
    LOW_VALUE_PAGE_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    quality.suspiciousGlyphRatio > 0.005 ||
    quality.cjkRatio < 0.45 ||
    (quality.cjkRatio < 0.55 && digitRatio > 0.2) ||
    (digitRatio > 0.12 && punctuationRatio > 0.08)
  );
}

function createExternalId(filePath, chunk) {
  const digest = createHash("sha1")
    .update(`${relative(repoRoot, filePath)}:${chunk.startPage}:${chunk.endPage}:${chunk.index}`)
    .digest("hex")
    .slice(0, 12);

  return `textbook-${digest}-p${chunk.startPage}-${chunk.endPage}-c${String(chunk.index + 1).padStart(4, "0")}`;
}

function toEntry(filePath, metadata, chunk, args) {
  const rawSectionTitle = chunk.sectionTitle ?? null;
  const sectionTitle = isGenericSectionTitle(rawSectionTitle) ? null : rawSectionTitle;
  const sectionType = chunk.sectionType ?? (chunk.sectionAware ? "正文" : null);
  const textbookModule =
    chunk.moduleHint ?? findTextbookModule([sectionTitle, chunk.text].filter(Boolean).join("\n"));
  const keywords = findKeywords(chunk.text, metadata);
  const sectionPath = [
    metadata.publisher,
    metadata.textbookName,
    metadata.level ?? metadata.grade ?? args.stage,
    textbookModule,
    sectionType && sectionType !== "正文" ? sectionType : null,
    sectionTitle,
  ].filter(Boolean);
  const displayTitleParts = [
    textbookModule,
    metadata.level ?? metadata.grade ?? args.stage,
    sectionType && sectionType !== "正文" ? sectionType : null,
    sectionTitle && sectionTitle !== sectionType && sectionTitle !== "正文" ? sectionTitle : null,
  ].filter(Boolean);

  return {
    body_excerpt: chunk.text.slice(0, 1200),
    citation: `${metadata.textbookName}，${metadata.publisher}，第 ${chunk.startPage}-${chunk.endPage} 页`,
    embedding: null,
    external_id: createExternalId(filePath, chunk),
    grade: metadata.grade,
    keywords,
    lesson: null,
    level: metadata.level,
    metadata: {
      fileName: basename(filePath),
      moduleHint: chunk.moduleHint ?? null,
      relativePath: relative(repoRoot, filePath),
      sectionAware: Boolean(chunk.sectionAware),
      sectionTitle,
      sectionType,
    },
    module: textbookModule,
    page_end: chunk.endPage,
    page_start: chunk.startPage,
    safety_notes: pickLines(chunk.text, [/安全|保护|帮助|间距|危险|避免|损伤|准备活动/], 4),
    section_path: sectionPath,
    source_kind: metadata.sourceKind,
    sport_item: textbookModule === "体育与健康" ? null : textbookModule,
    summary: summarizeText(chunk.text),
    teaching_analysis: pickLines(chunk.text, [/教材|内容|目标|重点|难点|学习|掌握|了解|发展|提高/], 4),
    teaching_suggestions: pickLines(chunk.text, [/教学|练习|组织|方法|建议|评价|活动|游戏|比赛|示范/], 5),
    technical_points: pickLines(chunk.text, [/动作|技术|姿势|用力|节奏|方向|路线|重心|协调|控制/], 5),
    title: `${displayTitleParts.join(" - ")} - 第 ${chunk.startPage}-${chunk.endPage} 页`,
    unit: null,
    volume: metadata.volume,
  };
}

function embeddingInput(entry) {
  return [
    entry.title,
    entry.module,
    entry.grade,
    entry.level,
    entry.volume,
    entry.sport_item,
    entry.section_path.join(" > "),
    entry.keywords.join(" "),
    entry.summary,
    entry.body_excerpt,
    ...entry.teaching_analysis,
    ...entry.technical_points,
    ...entry.teaching_suggestions,
    ...entry.safety_notes,
  ].filter(Boolean).join("\n");
}

async function embedBatch(args, entries) {
  const { apiKey, baseUrl } = getEmbeddingConfig();
  if (!apiKey && !process.env.AI_EMBEDDING_BASE_URL && !process.env.AI_BASE_URL) {
    throw new Error(
      "Embedding 需要 AI_EMBEDDING_API_KEY、AI_API_KEY、OPENAI_API_KEY，或可匿名访问的 AI_EMBEDDING_BASE_URL/AI_BASE_URL",
    );
  }

  const response = await fetch(`${baseUrl}/embeddings`, {
    body: JSON.stringify({
      dimensions: args.embeddingDimensions,
      input: entries.map(embeddingInput),
      input_type: EMBEDDING_PASSAGE_INPUT_TYPE,
      model: args.embeddingModel,
    }),
    headers: createHeaders(apiKey),
    method: "POST",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`生成 embedding 失败：${response.status} ${detail}`);
  }

  const json = await response.json();
  const vectors = json.data?.map((item) => item.embedding) ?? [];

  if (vectors.length !== entries.length) {
    throw new Error(`embedding 返回数量不匹配：期望 ${entries.length}，实际 ${vectors.length}`);
  }

  return vectors.map((vector) => {
    if (!Array.isArray(vector) || vector.length !== args.embeddingDimensions) {
      throw new Error(`embedding 维度不匹配：期望 ${args.embeddingDimensions}，实际 ${vector?.length}`);
    }

    return `[${vector.join(",")}]`;
  });
}

async function upsertCorpus(supabase, filePath, metadata, args) {
  const { data, error } = await supabase
    .from("textbook_corpora")
    .upsert(
      {
        curriculum_standard_version: DEFAULT_CURRICULUM_STANDARD_VERSION,
        education_stage: args.stage,
        edition: metadata.edition,
        license_scope: "local-authorized",
        market: args.market,
        metadata: {
          fileName: basename(filePath),
          relativePath: relative(repoRoot, filePath),
          sourceKind: metadata.sourceKind,
        },
        publisher: metadata.publisher,
        source_path: relative(repoRoot, filePath),
        subject: args.subject,
        textbook_name: metadata.textbookName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "market,publisher,textbook_name,edition" },
    )
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data.id;
}

async function replaceCorpusEntries(supabase, corpusId) {
  const { error } = await supabase.from("textbook_entries").delete().eq("corpus_id", corpusId);

  if (error) {
    throw error;
  }
}

async function upsertEntries(supabase, corpusId, entries) {
  const payload = entries.map((entry) => ({
    ...entry,
    corpus_id: corpusId,
  }));

  const externalIds = payload.map((entry) => entry.external_id);
  const { error: deleteError } = await supabase
    .from("textbook_entries")
    .delete()
    .eq("corpus_id", corpusId)
    .in("external_id", externalIds);

  if (deleteError) {
    throw deleteError;
  }

  const { error } = await supabase.from("textbook_entries").insert(payload);

  if (error) {
    throw error;
  }
}

async function readCacheJson(path) {
  if (!existsSync(path)) {
    return null;
  }

  return JSON.parse(await readFile(path, "utf8"));
}

async function writeCacheJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), "utf8");
}

async function prepareBook(filePath, args) {
  const metadata = parseBookMetadata(filePath, args);
  const cacheKey = createHash("sha1")
    .update([
      relative(repoRoot, filePath),
      "textbookIngestVersion=section-aware-hybrid-v5",
      `sectionAware=${args.sectionAware}`,
      `chunkSize=${args.chunkSize}`,
      `chunkOverlap=${args.chunkOverlap}`,
    ].join(":"))
    .digest("hex")
    .slice(0, 16);
  const cachePath = resolve(args.cacheDir, `${cacheKey}.json`);
  const cached = await readCacheJson(cachePath);

  if (cached) {
    return cached;
  }

  const pages = await extractPages(filePath, args);
  const chunks = args.sectionAware
    ? createSectionAwareChunks(pages, args, metadata)
    : createChunks(pages, args);
  const entries = chunks
    .filter((chunk) => !isLowValueChunk(chunk.text))
    .map((chunk) => toEntry(filePath, metadata, chunk, args));
  const prepared = {
    filePath,
    metadata,
    pageCount: pages.length,
    entries,
  };

  await writeCacheJson(cachePath, prepared);
  return prepared;
}

function printDryRun(preparedBooks) {
  const entries = preparedBooks.flatMap((book) => book.entries);
  const moduleCounts = entries.reduce((counts, entry) => {
    counts[entry.module] = (counts[entry.module] ?? 0) + 1;
    return counts;
  }, {});
  const sourceKindCounts = entries.reduce((counts, entry) => {
    counts[entry.source_kind] = (counts[entry.source_kind] ?? 0) + 1;
    return counts;
  }, {});
  const sectionTypeCounts = entries.reduce((counts, entry) => {
    const sectionType = entry.metadata?.sectionType ?? "正文";
    counts[sectionType] = (counts[sectionType] ?? 0) + 1;
    return counts;
  }, {});
  const checksum = createHash("sha256")
    .update(entries.map(embeddingInput).join("\n\n"))
    .digest("hex");
  const suspiciousQualityEntries = entries
    .map((entry) => ({
      citation: entry.citation,
      metrics: getTextQualityMetrics(entry.body_excerpt),
      module: entry.module,
      sectionTitle: entry.metadata?.sectionTitle,
      sectionType: entry.metadata?.sectionType ?? "正文",
      sourceKind: entry.source_kind,
      summary: entry.summary.slice(0, 220),
      title: entry.title,
    }))
    .filter((entry) =>
      entry.metrics.suspiciousGlyphRatio > 0.005 ||
      entry.metrics.asciiRatio > 0.08 ||
      entry.metrics.cjkRatio < 0.45
    );
  const qualitySamples = suspiciousQualityEntries.slice(0, 12);
  const uploadRecommendation = entries.length === 0
    ? "暂缓上传：未生成任何可入库条目，请检查 PDF 是否为扫描版、乱码抽取或目录残页"
    : suspiciousQualityEntries.length === 0
      ? "可进入小批量正式上传验证"
      : "暂缓全量上传：请先检查 qualitySamples 中的抽取噪声";

  console.log(JSON.stringify({
    books: preparedBooks.length,
    entries: entries.length,
    moduleCounts,
    sectionTypeCounts,
    sourceKindCounts,
    checksum,
    quality: {
      suspiciousEntries: suspiciousQualityEntries.length,
      suspiciousSampleLimit: qualitySamples.length,
      uploadRecommendation,
    },
    qualitySamples,
    samples: entries.slice(0, 8).map((entry) => ({
      citation: entry.citation,
      keywords: entry.keywords,
      module: entry.module,
      sectionTitle: entry.metadata?.sectionTitle,
      sectionType: entry.metadata?.sectionType ?? "正文",
      sourceKind: entry.source_kind,
      summary: entry.summary,
      title: entry.title,
    })),
  }, null, 2));
}

async function main() {
  await loadEnv();
  const args = parseArgs(process.argv.slice(2));
  let files = await listPdfFiles(args.inputDir);

  if (args.matchFile) {
    files = files.filter((filePath) => basename(filePath).includes(args.matchFile));
  }

  if (args.limitFiles !== undefined) {
    files = files.slice(0, args.limitFiles);
  }

  if (files.length === 0) {
    throw new Error(`未找到 PDF 文件：${args.inputDir}`);
  }

  console.log(`发现教材 PDF：${files.length} 个`);
  const preparedBooks = [];

  for (const filePath of files) {
    const prepared = await prepareBook(filePath, args);
    preparedBooks.push(prepared);
    console.log(
      `prepared ${preparedBooks.length}/${files.length}: ${relative(repoRoot, filePath)} pages=${prepared.pageCount} entries=${prepared.entries.length}`,
    );
  }

  if (args.dryRun) {
    printDryRun(preparedBooks);
    return;
  }

  const supabase = createSupabaseAdminClient();

  for (const prepared of preparedBooks) {
    if (prepared.entries.length === 0) {
      const message = `教材未生成可入库条目：${relative(repoRoot, prepared.filePath)}。请先检查 PDF 是否为扫描版、乱码抽取或目录残页。`;

      if (args.skipEmptyBooks) {
        console.warn(`skipped-empty-book ${message}`);
        continue;
      }

      throw new Error(`已拒绝写入空 corpus：${message}`);
    }

    const embeddedEntries = [];
    for (let index = 0; index < prepared.entries.length; index += args.batchSize) {
      const batch = prepared.entries.slice(index, index + args.batchSize);
      const embeddings = await embedBatch(args, batch);
      embeddedEntries.push(
        ...batch.map((entry, batchIndex) => ({
          ...entry,
          embedding: embeddings[batchIndex],
        })),
      );
      console.log(
        `embedded ${relative(repoRoot, prepared.filePath)} ${Math.min(index + batch.length, prepared.entries.length)}/${prepared.entries.length}`,
      );
    }

    const corpusId = await upsertCorpus(supabase, prepared.filePath, prepared.metadata, args);

    if (args.replace) {
      await replaceCorpusEntries(supabase, corpusId);
    }

    for (let index = 0; index < embeddedEntries.length; index += args.batchSize) {
      const batch = embeddedEntries.slice(index, index + args.batchSize);
      await upsertEntries(supabase, corpusId, batch);
      console.log(
        `uploaded ${relative(repoRoot, prepared.filePath)} ${Math.min(index + batch.length, embeddedEntries.length)}/${embeddedEntries.length}`,
      );
    }
  }

  console.log(`完成：books=${preparedBooks.length}, entries=${preparedBooks.flatMap((book) => book.entries).length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
