import { generateObject } from "ai";
import { z } from "zod";

import {
  DEFAULT_STANDARDS_MARKET,
  lessonPatchRequestBodySchema,
  lessonPatchResponseSchema,
} from "@/lib/lesson-authoring-contract";
import { createModelProvider } from "@/mastra";

export const runtime = "nodejs";
export const maxDuration = 45;

const patchObjectSchema = z.object({
  replacementText: z
    .string()
    .trim()
    .min(1)
    .max(6000)
    .describe("只包含替换后的目标节点正文，不要包含 Markdown 标题符号、列表符号、代码围栏或解释性前后缀。"),
  summary: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe("用一句中文说明本次局部修改的位置和理由。"),
});

const MAX_PATCH_ATTEMPTS = 5;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorStatusCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) {
    return undefined;
  }

  const statusCode = (error as { statusCode?: unknown }).statusCode;

  return typeof statusCode === "number" ? statusCode : undefined;
}

function getRetryDelayMs(attempt: number) {
  const baseDelayMs = 400 * 2 ** (attempt - 1);
  const jitterMs = Math.floor(Math.random() * 200);

  return Math.min(baseDelayMs + jitterMs, 5_000);
}

function isRetryablePatchError(error: unknown) {
  const statusCode = getErrorStatusCode(error);
  const message = error instanceof Error ? error.message : String(error);

  if (statusCode && [408, 409, 425, 429, 500, 502, 503, 504].includes(statusCode)) {
    return true;
  }

  return /No available channels|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|network|timeout/i.test(message);
}

async function generatePatchWithRetry<T>(operation: () => Promise<T>, nodeId: string) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_PATCH_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt >= MAX_PATCH_ATTEMPTS || !isRetryablePatchError(error)) {
        throw error;
      }

      const delayMs = getRetryDelayMs(attempt);
      console.warn("[lesson-patches] retrying patch generation", {
        nodeId,
        attempt,
        nextAttempt: attempt + 1,
        maxAttempts: MAX_PATCH_ATTEMPTS,
        delayMs,
        statusCode: getErrorStatusCode(error),
        message: error instanceof Error ? error.message : String(error),
      });
      await sleep(delayMs);
    }
  }

  throw lastError;
}

function getNodeTypeLabel(nodeType: string) {
  if (nodeType === "heading") {
    return "标题";
  }

  if (nodeType === "listItem") {
    return "列表项";
  }

  return "段落";
}

export async function POST(request: Request) {
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "请求体必须是 JSON。" }, { status: 400 });
  }

  const parsedBody = lessonPatchRequestBodySchema.safeParse(rawBody);

  if (!parsedBody.success) {
    return Response.json(
      {
        error: "局部修改请求体结构不合法。",
        details: parsedBody.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { instruction, target, market = DEFAULT_STANDARDS_MARKET } = parsedBody.data;
  const provider = createModelProvider();
  const model = provider(process.env.AI_PATCH_MODEL ?? process.env.AI_MODEL ?? "gpt-4.1-mini");

  try {
    const result = await generatePatchWithRetry(
      () =>
        generateObject({
          model,
          schema: patchObjectSchema,
          system: `你是体育教案局部编辑助手。你只负责改写用户指定的一个教案节点，不能重写整篇教案。

原则：
1. 严格围绕用户修改意见，只替换目标${getNodeTypeLabel(target.nodeType)}的正文。
2. 保持原教案事实、年级、课时、场地器材、教学流程逻辑一致，除非用户明确要求修改。
3. 不输出 Markdown 标题符号、列表符号、JSON、HTML、代码围栏或额外解释。
4. 如果用户要求会影响相邻内容，只在 summary 中提示后续应同步检查，不要擅自输出多个节点。
5. 使用简体中文，表达要符合一线体育教师可直接使用的教案语言。`,
          prompt: `目标市场：${market}
目标节点 ID：${target.nodeId}
目标节点类型：${target.nodeType}

目标节点当前正文：
${target.currentText}

相邻上下文：
${target.surroundingContext || "未提供。"}

用户局部修改意见：
${instruction}

请返回替换后的目标节点正文与一句修改摘要。`,
        }),
      target.nodeId,
    );

    const response = lessonPatchResponseSchema.parse({
      patch: {
        nodeId: target.nodeId,
        replacementText: result.object.replacementText,
        summary: result.object.summary,
      },
    });

    return Response.json(response, {
      headers: {
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.warn("[lesson-patches] generate-patch-failed", {
      nodeId: target.nodeId,
      nodeType: target.nodeType,
      message: error instanceof Error ? error.message : "unknown-error",
    });

    return Response.json(
      {
        error: error instanceof Error ? error.message : "局部修改生成失败。",
      },
      { status: 502 },
    );
  }
}
