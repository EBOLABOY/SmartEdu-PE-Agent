import process from "node:process";

import { loadEnvConfig } from "@next/env";
import {
  generateObject,
  generateText,
  Output,
} from "ai";
import { z } from "zod";

import { createChatModel } from "../src/mastra/models";

loadEnvConfig(process.cwd());

const probeSchema = z
  .object({
    lessonNo: z.string().trim().min(1),
    studentCount: z.string().trim().min(1),
    title: z.string().trim().min(1),
    topic: z.string().trim().min(1),
  })
  .strict();

type ProbeResult = {
  durationMs: number;
  error?: string;
  mode: string;
  ok: boolean;
  status?: number;
};

function resolveEnvReference(value?: string) {
  return value?.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => process.env[name] ?? "");
}

function getConfig() {
  const baseURL = resolveEnvReference(process.env.AI_BASE_URL)?.replace(/\/+$/, "");
  const apiKey = resolveEnvReference(process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY);
  const model = process.env.AI_LESSON_MODEL ?? process.env.AI_MODEL ?? "gpt-4.1-mini";

  if (!baseURL) {
    throw new Error("缺少 AI_BASE_URL，无法探测第三方 OpenAI-compatible response_format 能力。");
  }

  if (!apiKey) {
    throw new Error("缺少 AI_API_KEY 或 OPENAI_API_KEY，无法探测第三方 OpenAI-compatible response_format 能力。");
  }

  return { apiKey, baseURL, model };
}

function buildMessages() {
  return [
    {
      role: "system",
      content: "你只返回合法 JSON，不要 Markdown，不要解释。",
    },
    {
      role: "user",
      content:
        "返回一个 JSON 对象，字段为 title、topic、lessonNo、studentCount。内容是篮球三步上篮课程，lessonNo 写第1课时，studentCount 写40人。",
    },
  ];
}

async function postChatCompletions(input: {
  body: Record<string, unknown>;
  mode: string;
}): Promise<ProbeResult> {
  const config = getConfig();
  const startedAt = Date.now();

  try {
    const response = await fetch(`${config.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(input.body),
    });
    const raw = await response.text();
    const envelope = JSON.parse(raw) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
      error?: unknown;
    };

    if (envelope.error) {
      throw new Error(JSON.stringify(envelope.error));
    }

    const content = envelope.choices?.[0]?.message?.content;
    const parsed = probeSchema.parse(JSON.parse(content ?? ""));

    return {
      durationMs: Date.now() - startedAt,
      mode: input.mode,
      ok: Boolean(parsed.title),
      status: response.status,
    };
  } catch (error) {
    return {
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      mode: input.mode,
      ok: false,
    };
  }
}

async function probeRawJsonObject() {
  const config = getConfig();

  return postChatCompletions({
    mode: "raw-response-format-json-object",
    body: {
      max_tokens: 500,
      messages: buildMessages(),
      model: config.model,
      response_format: { type: "json_object" },
      temperature: 0,
    },
  });
}

async function probeRawJsonSchema() {
  const config = getConfig();

  return postChatCompletions({
    mode: "raw-response-format-json-schema",
    body: {
      max_tokens: 500,
      messages: buildMessages(),
      model: config.model,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "LessonResponseFormatProbe",
          schema: {
            additionalProperties: false,
            properties: {
              lessonNo: { type: "string" },
              studentCount: { type: "string" },
              title: { type: "string" },
              topic: { type: "string" },
            },
            required: ["lessonNo", "studentCount", "title", "topic"],
            type: "object",
          },
          strict: true,
        },
      },
      temperature: 0,
    },
  });
}

async function probeOutputJson() {
  const config = getConfig();
  const startedAt = Date.now();

  try {
    const result = await generateText({
      model: createChatModel(config.model),
      messages: buildMessages().map((message) => ({
        content: message.content,
        role: message.role as "system" | "user",
      })),
      output: Output.json(),
      temperature: 0,
    });
    probeSchema.parse(result.output);

    return {
      durationMs: Date.now() - startedAt,
      mode: "ai-sdk-output-json",
      ok: true,
    };
  } catch (error) {
    return {
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      mode: "ai-sdk-output-json",
      ok: false,
    };
  }
}

async function probeGenerateObject() {
  const config = getConfig();
  const startedAt = Date.now();

  try {
    const result = await generateObject({
      model: createChatModel(config.model),
      schema: probeSchema,
      system: buildMessages()[0]!.content,
      prompt: buildMessages()[1]!.content,
      temperature: 0,
    });
    probeSchema.parse(result.object);

    return {
      durationMs: Date.now() - startedAt,
      mode: "ai-sdk-generate-object",
      ok: true,
    };
  } catch (error) {
    return {
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      mode: "ai-sdk-generate-object",
      ok: false,
    };
  }
}

async function main() {
  const results = [
    await probeRawJsonObject(),
    await probeRawJsonSchema(),
    await probeOutputJson(),
    await probeGenerateObject(),
  ];

  results.forEach((result) => {
    console.log(JSON.stringify(result));
  });

  if (results.some((result) => !result.ok)) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
