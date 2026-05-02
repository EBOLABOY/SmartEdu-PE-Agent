import { z } from "zod";

import { isArtifactImageProxyUrl } from "@/lib/s3/artifact-image-url";

const imageResourceUrlSchema = z
  .string()
  .trim()
  .refine((value) => z.string().url().safeParse(value).success || isArtifactImageProxyUrl(value), {
    message: "图片资源必须是标准 URL 或受控 artifact 图片代理路径。",
  });

export const htmlScreenSectionPlanSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    pageRole: z
      .enum(["cover", "warmup", "learnPractice", "competition", "fitness", "cooldown", "summary", "other"])
      .optional(),
    durationSeconds: z.number().int().positive().max(14_400).optional(),
    sourceRowIndex: z.number().int().nonnegative().optional(),
    sourceRowIndexes: z.array(z.number().int().nonnegative()).min(1).max(24).optional(),
    objective: z.string().trim().min(1).max(500).optional(),
    studentActions: z.array(z.string().trim().min(1).max(200)).min(1).max(5).optional(),
    safetyCue: z.string().trim().min(1).max(300).optional(),
    evaluationCue: z.string().trim().min(1).max(300).optional(),
    visualIntent: z.string().trim().min(1).max(800).optional(),
    visualMode: z.enum(["html", "image", "hybrid"]).optional(),
    imagePrompt: z.string().trim().min(1).max(2000).optional(),
    visualAsset: z
      .object({
        alt: z.string().trim().min(1).max(300),
        aspectRatio: z.literal("16:9").optional(),
        caption: z.string().trim().min(1).max(500).optional(),
        height: z.number().int().positive().optional(),
        imageUrl: imageResourceUrlSchema,
        prompt: z.string().trim().min(1).max(2000).optional(),
        source: z.enum(["ai-generated", "uploaded"]),
        width: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
    pagePrompt: z.string().trim().min(1).max(4000),
    reason: z.string().trim().min(1).max(800).optional(),
  })
  .strict();

export type HtmlScreenSectionPlan = z.infer<typeof htmlScreenSectionPlanSchema>;

export const htmlScreenPlanSchema = z
  .object({
    visualSystem: z.string().trim().min(1).max(1600),
    sections: z.array(htmlScreenSectionPlanSchema).min(1).max(24),
  })
  .strict();

export type HtmlScreenPlan = z.infer<typeof htmlScreenPlanSchema>;
