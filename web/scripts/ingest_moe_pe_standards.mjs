import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import { PDFParse } from "pdf-parse";

const DEFAULT_PDF_URL =
  "http://www.moe.gov.cn/srcsite/A26/s8001/202204/W020220420582362336303.pdf";
const DEFAULT_MARKET = "cn-compulsory-2022";
const DEFAULT_VERSION = "2022";
const DEFAULT_DISPLAY_NAME = "义务教育体育与健康课程标准（2022年版）结构化知识库";
const DEFAULT_ISSUER = "中华人民共和国教育部";
const DEFAULT_EMBEDDING_MODEL = "nvidia/llama-3.2-nv-embedqa-1b-v2";
const DEFAULT_OCR_MODEL = "gpt-4.1-mini";
const MIN_DIRECT_TEXT_CHARS = 80;
const DEFAULT_EMBEDDING_DIMENSIONS = 1536;
const EMBEDDING_PASSAGE_INPUT_TYPE = "passage";
const TOP_LEVEL_SECTIONS = [
  "课程性质",
  "课程理念",
  "课程目标",
  "课程内容",
  "学业质量",
  "课程实施",
  "附录",
];
const SECOND_LEVEL_SECTIONS = [
  "核心素养内涵",
  "总目标",
  "水平目标",
  "基本运动技能",
  "体能",
  "健康教育",
  "专项运动技能",
  "跨学科主题学习",
  "学业质量内涵",
  "学业质量描述",
  "教学建议",
  "评价建议",
  "教材编写建议",
  "课程资源开发与利用",
  "教学研究与教师培训",
];
const SPORT_CATEGORY_SECTIONS = [
  "球类运动",
  "田径类运动",
  "体操类运动",
  "水上或冰雪类运动",
  "中华传统体育类运动",
  "新兴体育类运动",
];
const REQUIREMENT_MARKERS = ["内容要求", "学业要求", "教学提示"];

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

function parseArgs(argv) {
  const args = {
    batchSize: 24,
    cacheDir: resolve(repoRoot, ".cache", "moe-pe-standards"),
    chunkOverlap: 80,
    chunkSize: 700,
    displayName: DEFAULT_DISPLAY_NAME,
    dryRun: false,
    embeddingDimensions: Number.parseInt(
      process.env.AI_EMBEDDING_DIMENSIONS ?? String(DEFAULT_EMBEDDING_DIMENSIONS),
      10,
    ),
    embeddingModel: process.env.AI_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL,
    issuer: DEFAULT_ISSUER,
    market: DEFAULT_MARKET,
    ocr: "auto",
    ocrModel: DEFAULT_OCR_MODEL,
    pdfUrl: DEFAULT_PDF_URL,
    replace: false,
    sourceUrl: DEFAULT_PDF_URL,
    textFile: null,
    version: DEFAULT_VERSION,
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
        args.cacheDir = resolve(repoRoot, next);
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
      case "--display-name":
        args.displayName = next;
        index += 1;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--embedding-model":
        args.embeddingModel = next;
        index += 1;
        break;
      case "--embedding-dimensions":
        args.embeddingDimensions = Number.parseInt(next, 10);
        index += 1;
        break;
      case "--issuer":
        args.issuer = next;
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
      case "--ocr":
        args.ocr = next;
        index += 1;
        break;
      case "--ocr-model":
        args.ocrModel = next;
        index += 1;
        break;
      case "--pdf-url":
        args.pdfUrl = next;
        args.sourceUrl = next;
        index += 1;
        break;
      case "--replace":
        args.replace = true;
        break;
      case "--source-url":
        args.sourceUrl = next;
        index += 1;
        break;
      case "--text-file":
        args.textFile = resolve(repoRoot, next);
        index += 1;
        break;
      case "--version":
        args.version = next;
        index += 1;
        break;
      default:
        throw new Error(`未知参数：${token}`);
    }
  }

  if (!["auto", "always", "never"].includes(args.ocr)) {
    throw new Error("--ocr 只能是 auto、always 或 never");
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

  if (args.limitPages !== undefined && (!Number.isInteger(args.limitPages) || args.limitPages <= 0)) {
    throw new Error("--limit-pages 必须是正整数");
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
  await loadEnvFile(resolve(repoRoot, ".env.local"));
  await loadEnvFile(resolve(repoRoot, ".env"));
}

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`缺少环境变量 ${name}`);
  }
  return value;
}

function getAiConfig() {
  return {
    apiKey: resolveEnvReference(process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY),
    baseUrl: resolveEnvReference(process.env.AI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, ""),
  };
}

function getEmbeddingConfig() {
  return {
    apiKey: resolveEnvReference(
      process.env.AI_EMBEDDING_API_KEY ?? process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY,
    ),
    baseUrl: resolveEnvReference(
      process.env.AI_EMBEDDING_BASE_URL ?? process.env.AI_BASE_URL ?? "https://api.openai.com/v1",
    ).replace(
      /\/+$/,
      "",
    ),
  };
}

function resolveEnvReference(value = "") {
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => process.env[name] ?? "");
}

function createHeaders(apiKey) {
  return {
    "Content-Type": "application/json",
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
}

async function fetchArrayBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载 PDF 失败：${response.status} ${response.statusText}`);
  }
  return response.arrayBuffer();
}

async function getPdfBuffer(args) {
  await mkdir(args.cacheDir, { recursive: true });
  const cachePath = resolve(args.cacheDir, "source.pdf");

  if (existsSync(cachePath)) {
    return readFile(cachePath);
  }

  const arrayBuffer = await fetchArrayBuffer(args.pdfUrl);
  const buffer = Buffer.from(arrayBuffer);
  await writeFile(cachePath, buffer);
  return buffer;
}

function cleanText(text) {
  return text
    .replace(/--\s*\d+\s+of\s+\d+\s*--/g, " ")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function extractDirectTextPages(parser, totalPages, limitPages) {
  const result = await parser.getText();
  const pageLimit = Math.min(limitPages ?? totalPages, totalPages);

  return Array.from({ length: pageLimit }, (_, index) => {
    const pageNumber = index + 1;
    const page = result.pages.find((item) => item.num === pageNumber);
    return {
      pageNumber,
      text: cleanText(page?.text ?? ""),
    };
  });
}

async function readCachedOcr(args, pageNumber) {
  const path = resolve(args.cacheDir, "ocr", `${String(pageNumber).padStart(3, "0")}.txt`);
  if (!existsSync(path)) {
    return null;
  }
  return readFile(path, "utf8");
}

async function writeCachedOcr(args, pageNumber, text) {
  const path = resolve(args.cacheDir, "ocr", `${String(pageNumber).padStart(3, "0")}.txt`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, "utf8");
}

async function renderPageDataUrl(pdfBuffer, pageNumber) {
  const parser = new PDFParse({ data: pdfBuffer });
  try {
    const result = await parser.getScreenshot({
      desiredWidth: 1500,
      imageBuffer: false,
      imageDataUrl: true,
      partial: [pageNumber],
    });
    const page = result.pages[0];
    if (!page?.dataUrl) {
      throw new Error(`第 ${pageNumber} 页未能渲染为图片`);
    }
    return page.dataUrl;
  } finally {
    await parser.destroy();
  }
}

async function ocrPage(args, pdfBuffer, pageNumber) {
  const cached = await readCachedOcr(args, pageNumber);
  if (cached !== null) {
    return cleanText(cached);
  }

  const { apiKey, baseUrl } = getAiConfig();
  if (!apiKey && !process.env.AI_BASE_URL) {
    throw new Error("OCR 需要 AI_API_KEY、OPENAI_API_KEY，或可匿名访问的 AI_BASE_URL");
  }

  const dataUrl = await renderPageDataUrl(pdfBuffer, pageNumber);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    body: JSON.stringify({
      max_tokens: 2400,
      messages: [
        {
          content: [
            {
              text:
                "请对这页中文课程标准扫描图做忠实 OCR。只输出页面正文，保留标题、编号、表格中的关键文字；不要总结、不要改写、不要添加解释。若页面无正文，输出空字符串。",
              type: "text",
            },
            {
              image_url: {
                detail: "high",
                url: dataUrl,
              },
              type: "image_url",
            },
          ],
          role: "user",
        },
      ],
      model: args.ocrModel,
      temperature: 0,
    }),
    headers: createHeaders(apiKey),
    method: "POST",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`第 ${pageNumber} 页 OCR 失败：${response.status} ${detail}`);
  }

  const json = await response.json();
  const text = cleanText(json.choices?.[0]?.message?.content ?? "");
  await writeCachedOcr(args, pageNumber, text);
  return text;
}

async function getTextPages(args, pdfBuffer) {
  const parser = new PDFParse({ data: pdfBuffer });
  try {
    const info = await parser.getInfo();
    const directPages = await extractDirectTextPages(parser, info.total, args.limitPages);
    const pages = [];

    for (const page of directPages) {
      const needsOcr =
        args.ocr === "always" ||
        (args.ocr === "auto" && cleanText(page.text).length < MIN_DIRECT_TEXT_CHARS);

      if (needsOcr && args.ocr !== "never") {
        const ocrText = await ocrPage(args, pdfBuffer, page.pageNumber);
        pages.push({ ...page, text: ocrText, source: "ocr" });
      } else {
        pages.push({ ...page, source: "pdf-text" });
      }

      const current = pages[pages.length - 1];
      console.log(
        `page ${String(current.pageNumber).padStart(3, "0")}: ${current.source}, ${current.text.length} chars`,
      );
    }

    return pages.filter((page) => page.text.length > 0);
  } finally {
    await parser.destroy();
  }
}

function splitMarkdownTextIntoPages(text, textFile) {
  const lines = cleanText(text).split(/\r?\n/);
  const pages = [];
  let pageNumber = 1;
  let currentLines = [];

  const pushPage = () => {
    const pageText = cleanText(currentLines.join("\n"));

    if (pageText) {
      pages.push({
        pageNumber,
        source: "text-file",
        text: pageText,
      });
    }

    currentLines = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^\d{1,3}$/.test(trimmed) && currentLines.join("").length > 500) {
      pushPage();
      pageNumber = Number.parseInt(trimmed, 10) || pageNumber + 1;
      continue;
    }

    currentLines.push(line);
  }

  pushPage();

  if (pages.length > 1) {
    console.log(`text source: ${basename(textFile)}, detected_pages=${pages.length}`);
    return pages;
  }

  const paragraphPages = [];
  const normalized = cleanText(text);

  for (let offset = 0; offset < normalized.length; offset += 2400) {
    paragraphPages.push({
      pageNumber: paragraphPages.length + 1,
      source: "text-file",
      text: cleanText(normalized.slice(offset, offset + 2400)),
    });
  }

  console.log(`text source: ${basename(textFile)}, pseudo_pages=${paragraphPages.length}`);
  return paragraphPages;
}

async function getMarkdownTextPages(args) {
  const text = await readFile(args.textFile, "utf8");
  const pages = splitMarkdownTextIntoPages(text, args.textFile);
  const limitedPages = args.limitPages ? pages.slice(0, args.limitPages) : pages;

  for (const page of limitedPages) {
    console.log(`text page ${String(page.pageNumber).padStart(3, "0")}: ${page.text.length} chars`);
  }

  return limitedPages;
}

function splitParagraphs(text) {
  return text
    .split(/\n{1,}/)
    .map((item) => cleanText(item))
    .filter(Boolean);
}

function normalizeHeadingCandidate(text) {
  return cleanText(text)
    .replace(/[“”"·．。:：]+$/g, "")
    .replace(/^[\s、，,]+/g, "")
    .replace(/^[一二三四五六七八九十]+[、.．]\s*/g, "")
    .replace(/^[（(][一二三四五六七八九十]+[）)]\s*/g, "")
    .replace(/^\d+\s*[、.．，]\s*/g, "")
    .replace(/[ \t]+/g, "")
    .trim();
}

function stripRequirementMarker(text) {
  const match = text.match(/^〖\s*([^〗]+?)\s*〗$/);
  return match?.[1]?.trim();
}

function isNoiseParagraph(text) {
  const normalized = cleanText(text).replace(/\s+/g, "");
  return /^(体彦|序康|续表|題|学|\d{1,3})$/.test(normalized);
}

function findBodyStartIndex(paragraphs) {
  const actualStart = paragraphs.findIndex((paragraph, index) => {
    const title = normalizeHeadingCandidate(paragraph.text);
    const following = paragraphs
      .slice(index + 1, index + 4)
      .map((item) => item.text)
      .join("");

    return title === "课程性质" && following.includes("体育与健康教育是实现儿童青少年全面发展的重要途径");
  });

  if (actualStart >= 0) {
    return actualStart;
  }

  const firstCourseNature = paragraphs.findIndex(
    (paragraph) => normalizeHeadingCandidate(paragraph.text) === "课程性质",
  );
  return firstCourseNature >= 0 ? firstCourseNature : 0;
}

function getParagraphsWithPage(pages) {
  const paragraphs = [];

  for (const page of pages) {
    for (const text of splitParagraphs(page.text)) {
      if (!isNoiseParagraph(text)) {
        paragraphs.push({
          pageNumber: page.pageNumber,
          text,
        });
      }
    }
  }

  return paragraphs.slice(findBodyStartIndex(paragraphs));
}

function detectStructureHeading(text, context) {
  const requirementMarker = stripRequirementMarker(cleanText(text));
  if (requirementMarker && REQUIREMENT_MARKERS.includes(requirementMarker)) {
    return {
      level: 4,
      module: context.module,
      title: requirementMarker,
    };
  }

  const normalized = normalizeHeadingCandidate(text);
  const compact = cleanText(text).replace(/\s+/g, "");

  if (TOP_LEVEL_SECTIONS.includes(normalized)) {
    return {
      level: 1,
      module: normalized,
      title: normalized,
    };
  }

  if (/^附录/.test(normalized) && normalized.length <= 18) {
    return {
      level: 1,
      module: "附录",
      title: normalized,
    };
  }

  if (SECOND_LEVEL_SECTIONS.includes(normalized)) {
    return {
      level: 2,
      module: context.module,
      title: normalized,
    };
  }

  if (SPORT_CATEGORY_SECTIONS.includes(normalized)) {
    return {
      level: 2,
      module: context.module,
      title: normalized,
    };
  }

  if (/^达到水平[一二三四]目标要求$/.test(normalized)) {
    return {
      level: 3,
      module: context.module,
      title: normalized.replace("达到", ""),
    };
  }

  if (/^[一二三四五六七八九十]+[、.．]\s*课程实施$/.test(cleanText(text)) || normalized === "课程实施") {
    return {
      level: 1,
      module: "课程实施",
      title: "课程实施",
    };
  }

  if (/^\d+\s*[、.．，]/.test(cleanText(text)) && compact.length <= 44) {
    return {
      level: 3,
      module: context.module,
      title: normalized,
    };
  }

  if (/^（\d+）/.test(cleanText(text)) && compact.length <= 24) {
    return {
      level: 3,
      module: context.module,
      title: normalized,
    };
  }

  return null;
}

function updateStructureContext(context, heading) {
  if (heading.level === 1) {
    return {
      module: heading.module,
      stack: [],
    };
  }

  return {
    module: heading.module,
    stack: [
      ...context.stack.filter((item) => item.level < heading.level),
      {
        level: heading.level,
        title: heading.title,
      },
    ],
  };
}

function getContextPath(context) {
  return [context.module, ...context.stack.map((item) => item.title)].filter(Boolean);
}

function getChunkTitle(context, index) {
  const path = getContextPath(context);
  const visiblePath = path.filter((item) => item !== "课程标准");

  if (visiblePath.length === 0) {
    return `义务教育体育与健康课程标准片段 ${index + 1}`;
  }

  if (visiblePath.length === 1) {
    return visiblePath[0];
  }

  return trimToLength(visiblePath.slice(-3).join(" - "), 80);
}

function createChunks(pages, args) {
  const paragraphs = getParagraphsWithPage(pages);
  const chunks = [];
  let currentText = "";
  let context = {
    module: "课程标准",
    stack: [],
  };
  let currentContext = context;
  let startPage = paragraphs[0]?.pageNumber ?? pages[0]?.pageNumber ?? 1;
  let endPage = startPage;

  const pushCurrent = () => {
    const text = cleanText(currentText);
    if (!text) {
      return;
    }
    chunks.push({
      endPage,
      index: chunks.length,
      module: currentContext.module,
      sectionPath: getContextPath(currentContext),
      startPage,
      text,
      title: getChunkTitle(currentContext, chunks.length),
    });
    currentText = "";
  };

  for (const paragraph of paragraphs) {
    const heading = detectStructureHeading(paragraph.text, context);

    if (heading) {
      if (heading.level === 1 && heading.module === context.module) {
        continue;
      }

      pushCurrent();
      context = updateStructureContext(context, heading);
      continue;
    }

    if (!currentText) {
      startPage = paragraph.pageNumber;
      currentContext = context;
    }

    if (currentText.length + paragraph.text.length + 2 > args.chunkSize) {
      const overlapText = currentText.slice(Math.max(0, currentText.length - args.chunkOverlap));
      pushCurrent();
      startPage = paragraph.pageNumber;
      currentContext = context;
      currentText = cleanText(`${overlapText}\n${paragraph.text}`);
    } else {
      currentText = cleanText(`${currentText}\n${paragraph.text}`);
    }

    endPage = paragraph.pageNumber;
  }

  pushCurrent();
  const pathCounts = chunks.reduce((counts, chunk) => {
    const key = chunk.sectionPath.join(">");
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const pathSeen = {};

  return chunks.map((chunk) => {
    const key = chunk.sectionPath.join(">");
    pathSeen[key] = (pathSeen[key] ?? 0) + 1;

    if (pathCounts[key] <= 1) {
      return chunk;
    }

    return {
      ...chunk,
      title: trimToLength(`${chunk.title} - 片段${pathSeen[key]}`, 80),
    };
  });
}

function trimToLength(text, maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function inferModule(text) {
  const modules = [
    "课程性质",
    "课程理念",
    "课程目标",
    "课程内容",
    "学业质量",
    "课程实施",
    "附录",
  ];
  return modules.find((module) => text.includes(module)) ?? "课程标准";
}

function inferTitle(text, index) {
  const candidate = splitParagraphs(text).find((line) => line.length >= 4 && line.length <= 60);
  return trimToLength(candidate ?? `义务教育体育与健康课程标准片段 ${index + 1}`, 80);
}

function inferGradeBands(text) {
  const matches = new Set();
  const patterns = [
    /[一二三四五六七八九]年级/g,
    /\d\s*[-－—~～]\s*\d\s*年级/g,
    /水平[一二三四五六]/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      matches.add(match[0].replace(/\s+/g, ""));
    }
  }

  return matches.size > 0 ? Array.from(matches).slice(0, 8) : ["义务教育"];
}

function inferKeywords(text) {
  const dictionary = [
    "体育与健康",
    "核心素养",
    "运动能力",
    "健康行为",
    "体育品德",
    "课程目标",
    "课程内容",
    "学业质量",
    "课程实施",
    "专项运动技能",
    "基本运动技能",
    "体能",
    "健康教育",
    "球类运动",
    "田径",
    "体操",
    "武术",
    "游泳",
    "冰雪运动",
    "安全",
    "评价",
  ];

  return dictionary.filter((keyword) => text.includes(keyword)).slice(0, 12);
}

function splitRequirementText(text) {
  const normalized = cleanText(text);
  const parts = [];

  for (let index = 0; index < normalized.length; index += 520) {
    parts.push(normalized.slice(index, index + 520));
  }

  return parts.slice(0, 8);
}

function toEntry(chunk, args) {
  const sportModule = chunk.module ?? inferModule(chunk.text);
  const title = chunk.title ?? inferTitle(chunk.text, chunk.index);
  const keywords = inferKeywords(chunk.text);
  const sectionPath = chunk.sectionPath?.length ? chunk.sectionPath : [sportModule, title];
  const gradeBands = inferGradeBands([sectionPath.join(" "), title, chunk.text].join("\n"));
  const pageText =
    args.textFile && chunk.startPage === chunk.endPage
      ? `${basename(args.textFile)} 文本片段 ${chunk.startPage}`
      : args.textFile
        ? `${basename(args.textFile)} 文本片段 ${chunk.startPage}-${chunk.endPage}`
        : chunk.startPage === chunk.endPage
          ? `PDF 第 ${chunk.startPage} 页`
          : `PDF 第 ${chunk.startPage}-${chunk.endPage} 页`;

  return {
    citation: `${args.displayName}，${pageText}`,
    corpus_id: null,
    embedding: null,
    external_id: `moe-pe-2022-${args.textFile ? "text" : "pdf"}-${chunk.startPage}-${chunk.endPage}-c${String(chunk.index + 1).padStart(4, "0")}`,
    grade_bands: gradeBands,
    keywords,
    module: sportModule,
    requirements: splitRequirementText(chunk.text),
    section_path: args.textFile ? [basename(args.textFile), ...sectionPath] : sectionPath,
    summary: trimToLength(chunk.text, 260),
    teaching_implications: sectionPath.includes("教学提示") ? splitRequirementText(chunk.text) : [],
    title,
  };
}

function embeddingInput(entry) {
  return [
    entry.title,
    entry.module,
    entry.grade_bands.join(" "),
    entry.section_path.join(" > "),
    entry.keywords.join(" "),
    entry.summary,
    ...entry.requirements,
  ].join("\n");
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
    if (vector.length !== args.embeddingDimensions) {
      throw new Error(`embedding 维度不匹配：期望 ${args.embeddingDimensions}，实际 ${vector.length}`);
    }

    return `[${vector.join(",")}]`;
  });
}

function createSupabaseAdminClient() {
  const url = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = getRequiredEnv("SUPABASE_SECRET_KEY");
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function upsertCorpus(supabase, args) {
  const { data, error } = await supabase
    .from("standards_corpora")
    .upsert(
      {
        availability: "ready",
        display_name: args.displayName,
        issuer: args.issuer,
        market: args.market,
        official_version: args.version,
        source_url: args.sourceUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "market,official_version" },
    )
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data.id;
}

async function upsertEntries(supabase, corpusId, entries) {
  const payload = entries.map((entry) => ({
    ...entry,
    corpus_id: corpusId,
  }));
  const externalIds = payload.map((entry) => entry.external_id).filter(Boolean);

  if (externalIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("standard_entries")
      .delete()
      .eq("corpus_id", corpusId)
      .in("external_id", externalIds);

    if (deleteError) {
      throw deleteError;
    }
  }

  const { error } = await supabase.from("standard_entries").insert(payload);

  if (error) {
    throw error;
  }
}

async function replaceCorpusEntries(supabase, corpusId) {
  const { error } = await supabase.from("standard_entries").delete().eq("corpus_id", corpusId);

  if (error) {
    throw error;
  }
}

function printDryRun(entries, pages) {
  const checksum = createHash("sha256")
    .update(entries.map((entry) => embeddingInput(entry)).join("\n\n"))
    .digest("hex");
  const moduleCounts = entries.reduce((counts, entry) => {
    counts[entry.module] = (counts[entry.module] ?? 0) + 1;
    return counts;
  }, {});
  const suspectTitles = entries
    .filter((entry) => /内容\s*总体要求|项目具体要求|^学业要求$|^内容要求$|^教学提示$|^对应水平目标/.test(entry.title))
    .slice(0, 10)
    .map((entry) => ({
      external_id: entry.external_id,
      section_path: entry.section_path,
      title: entry.title,
    }));
  const focusedSamples = entries
    .filter((entry) => /专项运动技能|球类运动|体能|课程实施|附录/.test(entry.section_path.join(" ")))
    .slice(0, 12)
    .map((entry) => ({
      external_id: entry.external_id,
      module: entry.module,
      section_path: entry.section_path,
      title: entry.title,
    }));

  console.log(
    JSON.stringify(
      {
        checksum,
        entries: entries.length,
        module_counts: moduleCounts,
        pages: pages.length,
        sample: entries.slice(0, 10).map((entry) => ({
          citation: entry.citation,
          external_id: entry.external_id,
          keywords: entry.keywords,
          module: entry.module,
          section_path: entry.section_path,
          title: entry.title,
        })),
        focused_sample: focusedSamples,
        suspect_titles: suspectTitles,
      },
      null,
      2,
    ),
  );
}

async function main() {
  await loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const pdfBuffer = args.textFile ? null : await getPdfBuffer(args);
  const pages = args.textFile ? await getMarkdownTextPages(args) : await getTextPages(args, pdfBuffer);

  if (pages.length === 0) {
    throw new Error("没有得到可向量化的正文。请检查 --text-file 路径，或对 PDF 使用 --ocr auto。");
  }

  const chunks = createChunks(pages, args);
  const entries = chunks.map((chunk) => toEntry(chunk, args));

  if (args.dryRun) {
    printDryRun(entries, pages);
    return;
  }

  const embeddedEntries = [];

  for (let index = 0; index < entries.length; index += args.batchSize) {
    const batch = entries.slice(index, index + args.batchSize);
    const embeddings = await embedBatch(args, batch);
    embeddedEntries.push(
      ...batch.map((entry, batchIndex) => ({
        ...entry,
        embedding: embeddings[batchIndex],
      })),
    );

    console.log(`embedded ${Math.min(index + batch.length, entries.length)}/${entries.length}`);
  }

  const supabase = createSupabaseAdminClient();
  const corpusId = await upsertCorpus(supabase, args);

  if (args.replace) {
    await replaceCorpusEntries(supabase, corpusId);
  }

  for (let index = 0; index < embeddedEntries.length; index += args.batchSize) {
    const batch = embeddedEntries.slice(index, index + args.batchSize);

    await upsertEntries(supabase, corpusId, batch);
    console.log(`upserted ${Math.min(index + batch.length, embeddedEntries.length)}/${embeddedEntries.length}`);
  }

  console.log(`完成：corpus_id=${corpusId}, entries=${entries.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
