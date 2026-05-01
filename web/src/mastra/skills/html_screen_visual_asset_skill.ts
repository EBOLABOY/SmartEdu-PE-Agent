import { createHash, randomUUID } from "node:crypto";

import sharp from "sharp";

import type { HtmlScreenPlan, HtmlScreenSectionPlan } from "@/lib/html-screen-plan-contract";
import { getS3ObjectStorageConfig } from "@/lib/s3/object-storage-config";
import { putS3Object } from "@/lib/s3/s3-rest-client";

import {
  getImageGenerationConfig,
  IMAGE_GENERATION_REQUIRED_ENV_NAMES,
  type ImageGenerationConfig,
} from "./image_generation_config";

const SCREEN_IMAGE_WIDTH = 1600;
const SCREEN_IMAGE_HEIGHT = 900;

export type HtmlScreenVisualAssetResult = {
  generatedCount: number;
  screenPlan: HtmlScreenPlan;
  skippedReason?: string;
  warnings: string[];
};

function buildPublicS3ObjectUrl(input: {
  bucket: string;
  endpoint: string;
  key: string;
}) {
  const endpoint = input.endpoint.replace(/\/+$/, "");
  const path = [input.bucket, ...input.key.split("/")].map(encodeURIComponent).join("/");

  return `${endpoint}/${path}`;
}

function shouldGenerateVisualAsset(section: HtmlScreenSectionPlan) {
  return (
    section.pageRole !== "cover" &&
    (section.visualMode === "image" || section.visualMode === "hybrid") &&
    Boolean(section.imagePrompt?.trim()) &&
    !section.visualAsset
  );
}

function buildScreenImagePrompt(section: HtmlScreenSectionPlan) {
  return [
    section.imagePrompt,
    "",
    "统一输出要求：16:9 横板体育课堂投屏辅助图，画面清晰、留白合理、动作或组织结构一眼可懂。",
    "不要生成真实人脸、照片化杂乱背景、大段文字、品牌标识或与课堂无关的装饰。",
    section.safetyCue ? `安全边界：${section.safetyCue}` : "",
    section.evaluationCue ? `观察评价：${section.evaluationCue}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function callImageGenerationApi(input: {
  config: ImageGenerationConfig;
  prompt: string;
}) {
  const body = {
    model: input.config.model,
    n: 1,
    prompt: input.prompt,
    ...(input.config.size ? { size: input.config.size } : {}),
  };

  const response = await fetch(`${input.config.baseUrl}/images/generations`, {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${input.config.apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const text = await response.text();
  let payload: unknown;

  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }

  if (!response.ok) {
    throw new Error(`互动大屏辅助图生成失败：${response.status} ${text.slice(0, 500)}`);
  }

  const first = (payload as { data?: Array<{ b64_json?: string; url?: string }> }).data?.[0];

  if (first?.b64_json) {
    return {
      buffer: Buffer.from(first.b64_json, "base64"),
      sourceUrl: first.url,
    };
  }

  if (first?.url) {
    const imageResponse = await fetch(first.url);

    if (!imageResponse.ok) {
      throw new Error(`互动大屏辅助图下载失败：${imageResponse.status} ${imageResponse.statusText}`);
    }

    return {
      buffer: Buffer.from(await imageResponse.arrayBuffer()),
      sourceUrl: first.url,
    };
  }

  throw new Error("互动大屏辅助图生成接口未返回 b64_json 或 url。");
}

async function normalizeScreenImage(input: {
  buffer: Buffer;
}) {
  const buffer = await sharp(input.buffer)
    .resize(SCREEN_IMAGE_WIDTH, SCREEN_IMAGE_HEIGHT, {
      background: { alpha: 1, b: 245, g: 248, r: 246 },
      fit: "contain",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();

  return {
    buffer,
    height: SCREEN_IMAGE_HEIGHT,
    width: SCREEN_IMAGE_WIDTH,
  };
}

async function storeScreenVisualAsset(input: {
  buffer: Buffer;
  contentHash: string;
  projectId: string;
  requestId: string;
  sectionIndex: number;
}) {
  const config = getS3ObjectStorageConfig("artifact");

  if (!config) {
    throw new Error("S3 artifact storage is not configured.");
  }

  const key = [
    "projects",
    input.projectId,
    "html-screen-visuals",
    input.requestId,
    `${String(input.sectionIndex + 1).padStart(2, "0")}-${input.contentHash.slice(0, 12)}.png`,
  ].join("/");

  await putS3Object({
    body: input.buffer,
    config,
    contentType: "image/png",
    key,
  });

  return buildPublicS3ObjectUrl({
    bucket: config.bucket,
    endpoint: config.endpoint,
    key,
  });
}

async function generateSectionVisualAsset(input: {
  config: ImageGenerationConfig;
  projectId: string;
  requestId: string;
  section: HtmlScreenSectionPlan;
  sectionIndex: number;
}) {
  const prompt = buildScreenImagePrompt(input.section);
  const generated = await callImageGenerationApi({ config: input.config, prompt });
  const normalized = await normalizeScreenImage({ buffer: generated.buffer });
  const contentHash = createHash("sha256")
    .update(normalized.buffer)
    .update(prompt)
    .digest("hex");
  const imageUrl = await storeScreenVisualAsset({
    buffer: normalized.buffer,
    contentHash,
    projectId: input.projectId,
    requestId: input.requestId || randomUUID(),
    sectionIndex: input.sectionIndex,
  });

  return {
    alt: `课堂大屏辅助讲解图：${input.section.title}`,
    aspectRatio: "16:9" as const,
    caption: input.section.title,
    height: normalized.height,
    imageUrl,
    prompt,
    source: "ai-generated" as const,
    width: normalized.width,
  };
}

export async function enrichHtmlScreenPlanWithVisualAssets(input: {
  projectId?: string;
  requestId: string;
  screenPlan: HtmlScreenPlan;
}): Promise<HtmlScreenVisualAssetResult> {
  const candidates = input.screenPlan.sections
    .map((section, sectionIndex) => ({ section, sectionIndex }))
    .filter(({ section }) => shouldGenerateVisualAsset(section));

  if (!candidates.length) {
    return {
      generatedCount: 0,
      screenPlan: input.screenPlan,
      skippedReason: "互动大屏分镜没有需要生图的页面。",
      warnings: [],
    };
  }

  const config = getImageGenerationConfig();

  if (!config) {
    return {
      generatedCount: 0,
      screenPlan: input.screenPlan,
      skippedReason: `缺少 ${IMAGE_GENERATION_REQUIRED_ENV_NAMES}，已跳过互动大屏辅助图生成。`,
      warnings: [],
    };
  }

  if (!input.projectId || !getS3ObjectStorageConfig("artifact")) {
    return {
      generatedCount: 0,
      screenPlan: input.screenPlan,
      skippedReason: "缺少项目 ID 或 S3 artifact 对象存储配置，已跳过互动大屏辅助图生成以避免内嵌大体积图片。",
      warnings: [],
    };
  }

  const sections = [...input.screenPlan.sections];
  const warnings: string[] = [];
  let generatedCount = 0;

  for (const candidate of candidates) {
    try {
      const asset = await generateSectionVisualAsset({
        config,
        projectId: input.projectId,
        requestId: input.requestId,
        section: candidate.section,
        sectionIndex: candidate.sectionIndex,
      });
      sections[candidate.sectionIndex] = {
        ...candidate.section,
        visualAsset: asset,
      };
      generatedCount += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown-error";
      warnings.push(`第 ${candidate.sectionIndex + 1} 页“${candidate.section.title}”辅助图生成失败：${message}`);
      console.warn("[lesson-authoring] html-screen-visual-asset-failed", {
        message,
        sectionIndex: candidate.sectionIndex,
        title: candidate.section.title,
        requestId: input.requestId,
      });
    }
  }

  return {
    generatedCount,
    screenPlan: {
      ...input.screenPlan,
      sections,
    },
    warnings,
  };
}
