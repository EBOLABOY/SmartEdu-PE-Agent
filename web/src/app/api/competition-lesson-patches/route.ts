import { randomUUID } from "node:crypto";

import type { FullOutput } from "@mastra/core/stream";

import {
  ARTIFACT_JSON_REQUEST_MAX_BYTES,
  jsonRequestErrorResponse,
  readJsonRequest,
} from "@/lib/api/request";
import {
  allowsAnonymousAiRequests,
  getAiRequestAuth,
  takeAiRateLimitToken,
} from "@/lib/api/ai-guard";
import {
  competitionLessonPatchRequestBodySchema,
} from "@/lib/competition-lesson-patch";
import { mastra } from "@/mastra";
import {
  runCompetitionLessonPatchSkill,
  type LessonPatchAgentRunner,
} from "@/mastra/skills";

export const runtime = "nodejs";
export const maxDuration = 45;

const PATCH_RATE_LIMIT = 30;
const PATCH_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  let rawBody: unknown;

  try {
    rawBody = await readJsonRequest(request, { maxBytes: ARTIFACT_JSON_REQUEST_MAX_BYTES });
  } catch (error) {
    return jsonRequestErrorResponse(error, "请求体必须是 JSON。");
  }

  const parsedBody = competitionLessonPatchRequestBodySchema.safeParse(rawBody);

  if (!parsedBody.success) {
    return Response.json(
      {
        error: "结构化教案局部修改请求体不合法。",
        details: parsedBody.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const { user } = await getAiRequestAuth();

    if (!user && !allowsAnonymousAiRequests()) {
      return Response.json(
        { error: "Please sign in before using AI patch generation." },
        { status: 401 },
      );
    }

    const rateLimit = await takeAiRateLimitToken({
      limit: PATCH_RATE_LIMIT,
      request,
      userId: user?.id,
      windowMs: PATCH_RATE_LIMIT_WINDOW_MS,
    });

    if (!rateLimit.ok) {
      return Response.json(
        { error: "AI patch requests are too frequent. Please retry later." },
        {
          headers: {
            "retry-after": String(rateLimit.retryAfterSeconds),
          },
          status: 429,
        },
      );
    }

    const patchAgent = mastra.getAgent("lessonPatchAgent");
    const agentGenerate: LessonPatchAgentRunner = async (messages, options) =>
      (await patchAgent.generate(messages, options)) as FullOutput<unknown>;
    const response = await runCompetitionLessonPatchSkill(parsedBody.data, {
      agentGenerate,
      maxSteps: 2,
      requestId: randomUUID(),
    });

    return Response.json(response, {
      headers: {
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.warn("[competition-lesson-patches] generate-or-apply-failed", {
      message: error instanceof Error ? error.message : "unknown-error",
    });

    return Response.json(
      {
        error: error instanceof Error ? error.message : "结构化教案局部修改失败。",
      },
      { status: 502 },
    );
  }
}
