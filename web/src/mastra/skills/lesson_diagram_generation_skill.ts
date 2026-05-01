import { createHash, randomUUID } from "node:crypto";

import sharp from "sharp";

import {
  competitionLessonPlanSchema,
  type CompetitionLessonDiagramAsset,
  type CompetitionLessonPlan,
  type CompetitionLessonPlanRow,
} from "@/lib/competition-lesson-contract";
import { getS3ObjectStorageConfig } from "@/lib/s3/object-storage-config";
import { putS3Object } from "@/lib/s3/s3-rest-client";

import {
  getImageGenerationConfig,
  IMAGE_GENERATION_REQUIRED_ENV_NAMES,
  type ImageGenerationConfig,
} from "./image_generation_config";

const DIAGRAM_GRID_COLUMNS = 3;
const DIAGRAM_GRID_ROWS = 3;
const DIAGRAM_PANEL_COUNT = DIAGRAM_GRID_COLUMNS * DIAGRAM_GRID_ROWS;

type DiagramPanelPlan = {
  alt: string;
  caption: string;
  index: number;
  prompt: string;
  row: CompetitionLessonPlanRow;
  rowIndex: number;
};

type GeneratedGridImage = {
  buffer: Buffer;
  height: number;
  sourceUrl?: string;
  width: number;
};

export type LessonDiagramGenerationResult = {
  lessonPlan: CompetitionLessonPlan;
  generatedCount: number;
  skippedReason?: string;
  storageMode?: "data-url" | "s3-compatible";
};

function compactLines(lines: string[]) {
  return lines.map((line) => line.trim()).filter(Boolean).join("；");
}

function inferDiagramKind(row: CompetitionLessonPlanRow): CompetitionLessonDiagramAsset["kind"] {
  const text = [
    ...row.content,
    ...row.organization,
    ...row.methods.teacher,
    ...row.methods.students,
  ].join(" ");

  if (/轮换|站点|分站|循环/i.test(text)) {
    return "station-rotation";
  }

  if (/路线|移动|跑|运球|传球|跳|投|绕|折返/i.test(text)) {
    return "movement";
  }

  if (/安全|边界|距离|间隔|保护/i.test(text)) {
    return "safety-layout";
  }

  return "formation";
}

function selectDiagramRows(lessonPlan: CompetitionLessonPlan) {
  return lessonPlan.periodPlan.rows.slice(0, DIAGRAM_PANEL_COUNT);
}

function buildPanelPrompt(input: {
  lessonPlan: CompetitionLessonPlan;
  row: CompetitionLessonPlanRow;
  rowIndex: number;
}) {
  const title = input.row.content[0] ?? input.row.structure;
  const prompt = [
    `第 ${input.rowIndex + 1} 阶段：${title}`,
    `课堂结构：${input.row.structure}`,
    `时间与强度：${input.row.time}，${input.row.intensity}`,
    `教师活动：${compactLines(input.row.methods.teacher)}`,
    `学生活动：${compactLines(input.row.methods.students)}`,
    `组织队形：${compactLines(input.row.organization)}`,
    `场地器材：${compactLines([
      ...input.lessonPlan.venueEquipment.venue,
      ...input.lessonPlan.venueEquipment.equipment,
    ])}`,
  ].join("\n");

  return prompt;
}

function buildDiagramPanelPlans(lessonPlan: CompetitionLessonPlan): DiagramPanelPlan[] {
  return selectDiagramRows(lessonPlan).map((row, index) => {
    const caption = row.content[0] ?? `${row.structure} ${index + 1}`;

    return {
      alt: `第 ${index + 1} 阶段教学组织站位图：${caption}`,
      caption,
      index: index + 1,
      prompt: buildPanelPrompt({ lessonPlan, row, rowIndex: index }),
      row,
      rowIndex: index,
    };
  });
}

function buildNineGridPrompt(input: {
  lessonPlan: CompetitionLessonPlan;
  panels: DiagramPanelPlan[];
}) {
  return [
    "生成一张 3x3 九宫格体育课教学组织站位示意图。",
    "每个宫格必须是俯视平面示意图，不要写大段文字，只允许清晰编号 1-9 和极短中文标题。",
    "统一图例：教师用橙色圆点并标注 T，学生用蓝色小圆点，器材用绿色方块，移动路线用红色箭头，安全边界用灰色虚线。",
    "每个宫格必须有明确边框，便于后续按 3x3 自动切图。",
    "画风要求：简洁、平面、白底、教学图解风格，不能生成真实人脸或照片风格。",
    `课题：${input.lessonPlan.meta.topic}`,
    `学生人数：${input.lessonPlan.meta.studentCount}`,
    `场地器材：${compactLines([
      ...input.lessonPlan.venueEquipment.venue,
      ...input.lessonPlan.venueEquipment.equipment,
    ])}`,
    "",
    "九个宫格内容如下：",
    ...input.panels.map((panel) => [`宫格 ${panel.index}`, panel.prompt].join("\n")),
  ].join("\n\n");
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
    throw new Error(`教学站位图生成失败：${response.status} ${text.slice(0, 500)}`);
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
      throw new Error(`教学站位图下载失败：${imageResponse.status} ${imageResponse.statusText}`);
    }

    return {
      buffer: Buffer.from(await imageResponse.arrayBuffer()),
      sourceUrl: first.url,
    };
  }

  throw new Error("教学站位图生成接口未返回 b64_json 或 url。");
}

async function normalizeGeneratedGridImage(input: {
  buffer: Buffer;
  sourceUrl?: string;
}): Promise<GeneratedGridImage> {
  const normalized = sharp(input.buffer).png();
  const metadata = await normalized.metadata();
  const buffer = await normalized.toBuffer();

  if (!metadata.width || !metadata.height) {
    throw new Error("教学站位图缺少可识别的宽高信息。");
  }

  return {
    buffer,
    height: metadata.height,
    sourceUrl: input.sourceUrl,
    width: metadata.width,
  };
}

async function splitNineGridImage(image: GeneratedGridImage) {
  const panelWidth = Math.floor(image.width / DIAGRAM_GRID_COLUMNS);
  const panelHeight = Math.floor(image.height / DIAGRAM_GRID_ROWS);
  const panels: Buffer[] = [];

  for (let row = 0; row < DIAGRAM_GRID_ROWS; row += 1) {
    for (let column = 0; column < DIAGRAM_GRID_COLUMNS; column += 1) {
      panels.push(
        await sharp(image.buffer)
          .extract({
            left: column * panelWidth,
            top: row * panelHeight,
            width: panelWidth,
            height: panelHeight,
          })
          .png()
          .toBuffer(),
      );
    }
  }

  return {
    height: panelHeight,
    panels,
    width: panelWidth,
  };
}

function buildPublicS3ObjectUrl(input: {
  bucket: string;
  endpoint: string;
  key: string;
}) {
  const endpoint = input.endpoint.replace(/\/+$/, "");
  const path = [input.bucket, ...input.key.split("/")].map(encodeURIComponent).join("/");

  return `${endpoint}/${path}`;
}

async function storeDiagramPanelImage(input: {
  buffer: Buffer;
  contentHash: string;
  panelIndex: number;
  projectId: string;
  requestId: string;
}) {
  const config = getS3ObjectStorageConfig("artifact");

  if (!config) {
    throw new Error("S3 artifact storage is not configured.");
  }

  const key = [
    "projects",
    input.projectId,
    "lesson-diagrams",
    input.requestId,
    `${String(input.panelIndex).padStart(2, "0")}-${input.contentHash.slice(0, 12)}.png`,
  ].join("/");

  await putS3Object({
    body: input.buffer,
    config,
    contentType: "image/png",
    key,
  });

  return {
    imageUrl: buildPublicS3ObjectUrl({
      bucket: config.bucket,
      endpoint: config.endpoint,
      key,
    }),
    storageMode: "s3-compatible" as const,
  };
}

function createLessonWithDiagramAssets(input: {
  assets: CompetitionLessonDiagramAsset[];
  lessonPlan: CompetitionLessonPlan;
  panels: DiagramPanelPlan[];
}) {
  const rows = input.lessonPlan.periodPlan.rows.map((row, rowIndex) => {
    const panelIndex = input.panels.findIndex((panel) => panel.rowIndex === rowIndex);
    const asset = panelIndex >= 0 ? input.assets[panelIndex] : undefined;

    if (!asset) {
      return row;
    }

    return {
      ...row,
      diagramAssets: [asset],
    };
  });

  return competitionLessonPlanSchema.parse({
    ...input.lessonPlan,
    periodPlan: {
      ...input.lessonPlan.periodPlan,
      rows,
    },
  });
}

export async function enrichLessonPlanWithDiagramAssets(input: {
  lessonPlan: CompetitionLessonPlan;
  projectId?: string;
  requestId: string;
}): Promise<LessonDiagramGenerationResult> {
  const config = getImageGenerationConfig();

  if (!config) {
    return {
      generatedCount: 0,
      lessonPlan: input.lessonPlan,
      skippedReason: `缺少 ${IMAGE_GENERATION_REQUIRED_ENV_NAMES}，已跳过教学站位图生成。`,
    };
  }

  if (!input.projectId || !getS3ObjectStorageConfig("artifact")) {
    return {
      generatedCount: 0,
      lessonPlan: input.lessonPlan,
      skippedReason: "缺少项目 ID 或 S3 artifact 对象存储配置，已跳过教学站位图生成以避免把大体积图片内嵌进课时计划 JSON。",
    };
  }

  const panels = buildDiagramPanelPlans(input.lessonPlan);

  if (!panels.length) {
    return {
      generatedCount: 0,
      lessonPlan: input.lessonPlan,
      skippedReason: "课时计划没有可生成教学站位图的教学环节。",
    };
  }

  const prompt = buildNineGridPrompt({ lessonPlan: input.lessonPlan, panels });
  const generated = await callImageGenerationApi({ config, prompt });
  const gridImage = await normalizeGeneratedGridImage(generated);
  const split = await splitNineGridImage(gridImage);
  const assets: CompetitionLessonDiagramAsset[] = [];
  let storageMode: LessonDiagramGenerationResult["storageMode"];

  for (let index = 0; index < panels.length; index += 1) {
    const buffer = split.panels[index];
    const panel = panels[index];

    if (!buffer || !panel) {
      continue;
    }

    const contentHash = createHash("sha256")
      .update(buffer)
      .update(panel.prompt)
      .digest("hex");
    const stored = await storeDiagramPanelImage({
      buffer,
      contentHash,
      panelIndex: panel.index,
      projectId: input.projectId,
      requestId: input.requestId || randomUUID(),
    });
    storageMode = storageMode ?? stored.storageMode;
    assets.push({
      alt: panel.alt,
      caption: panel.caption,
      height: split.height,
      imageUrl: stored.imageUrl,
      kind: inferDiagramKind(panel.row),
      prompt: panel.prompt,
      source: "ai-generated",
      width: split.width,
    });
  }

  return {
    generatedCount: assets.length,
    lessonPlan: createLessonWithDiagramAssets({
      assets,
      lessonPlan: input.lessonPlan,
      panels,
    }),
    storageMode,
  };
}
