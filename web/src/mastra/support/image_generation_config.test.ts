import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_COMPETITION_LESSON_PLAN } from "@/lib/competition-lesson-contract";
import type { HtmlScreenPlan } from "@/lib/html-screen-plan-contract";

import { enrichHtmlScreenPlanWithVisualAssets } from "../skills/runtime/html_screen_visual_asset_skill";
import { getImageGenerationConfig } from "./image_generation_config";
import { enrichLessonPlanWithDiagramAssets } from "../skills/runtime/lesson_diagram_generation_skill";

const IMAGE_CONFIG_TEST_ENV_NAMES = [
  "AI_IMAGE_BASE_URL",
  "AI_IMAGE_API_KEY",
  "AI_IMAGE_MODEL",
  "AI_IMAGE_SIZE",
  "AI_EMBEDDING_BASE_URL",
  "AI_EMBEDDING_API_KEY",
];

let originalEnv: Record<string, string | undefined>;

function clearImageConfigTestEnv() {
  for (const name of IMAGE_CONFIG_TEST_ENV_NAMES) {
    delete process.env[name];
  }
}

function restoreImageConfigTestEnv() {
  for (const name of IMAGE_CONFIG_TEST_ENV_NAMES) {
    const value = originalEnv[name];

    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

describe("image generation config", () => {
  beforeEach(() => {
    originalEnv = Object.fromEntries(IMAGE_CONFIG_TEST_ENV_NAMES.map((name) => [name, process.env[name]]));
    clearImageConfigTestEnv();
  });

  it("requires image credentials instead of embedding credentials", () => {
    process.env.AI_EMBEDDING_BASE_URL = "https://embedding.example/v1";
    process.env.AI_EMBEDDING_API_KEY = "embedding-key";
    process.env.AI_IMAGE_MODEL = "gpt-image-1";

    expect(getImageGenerationConfig()).toBeNull();
  });

  it("uses only AI_IMAGE_* values for image generation", () => {
    process.env.AI_EMBEDDING_BASE_URL = "https://embedding.example/v1";
    process.env.AI_EMBEDDING_API_KEY = "embedding-key";
    process.env.AI_IMAGE_BASE_URL = "https://image.example/v1/";
    process.env.AI_IMAGE_API_KEY = "image-key";
    process.env.AI_IMAGE_MODEL = "gpt-image-1";
    process.env.AI_IMAGE_SIZE = "1536x1024";

    expect(getImageGenerationConfig()).toEqual({
      apiKey: "image-key",
      baseUrl: "https://image.example/v1",
      model: "gpt-image-1",
      size: "1536x1024",
    });
  });

  it("does not specify image size unless AI_IMAGE_SIZE is configured", () => {
    process.env.AI_IMAGE_BASE_URL = "https://image.example/v1/";
    process.env.AI_IMAGE_API_KEY = "image-key";
    process.env.AI_IMAGE_MODEL = "gpt-image-1";

    expect(getImageGenerationConfig()).toEqual({
      apiKey: "image-key",
      baseUrl: "https://image.example/v1",
      model: "gpt-image-1",
    });
  });

  it("does not use embedding credentials for HTML screen visual assets", async () => {
    process.env.AI_EMBEDDING_BASE_URL = "https://embedding.example/v1";
    process.env.AI_EMBEDDING_API_KEY = "embedding-key";
    process.env.AI_IMAGE_MODEL = "gpt-image-1";
    const screenPlan: HtmlScreenPlan = {
      visualSystem: "test visual system",
      sections: [
        {
          imagePrompt: "生成一张跳跃动作示意图。",
          pagePrompt: "生成页面。",
          title: "跳跃学练",
          visualMode: "image",
        },
      ],
    };

    const result = await enrichHtmlScreenPlanWithVisualAssets({
      projectId: "project-1",
      requestId: "request-1",
      screenPlan,
    });

    expect(result.generatedCount).toBe(0);
    expect(result.skippedReason).toContain("AI_IMAGE_BASE_URL");
    expect(result.skippedReason).not.toContain("AI_EMBEDDING_BASE_URL");
  });

  it("does not use embedding credentials for lesson diagram assets", async () => {
    process.env.AI_EMBEDDING_BASE_URL = "https://embedding.example/v1";
    process.env.AI_EMBEDDING_API_KEY = "embedding-key";
    process.env.AI_IMAGE_MODEL = "gpt-image-1";
    const lessonPlan = structuredClone(DEFAULT_COMPETITION_LESSON_PLAN);
    lessonPlan.periodPlan.rows = lessonPlan.periodPlan.rows.map((row) => ({
      ...row,
      content: ["教学环节"],
      methods: {
        students: ["学生练习"],
        teacher: ["教师组织"],
      },
      organization: ["分组队形"],
    }));

    const result = await enrichLessonPlanWithDiagramAssets({
      lessonPlan,
      projectId: "project-1",
      requestId: "request-1",
    });

    expect(result.generatedCount).toBe(0);
    expect(result.skippedReason).toContain("AI_IMAGE_BASE_URL");
    expect(result.skippedReason).not.toContain("AI_EMBEDDING_BASE_URL");
  });

  afterEach(() => {
    restoreImageConfigTestEnv();
  });
});
