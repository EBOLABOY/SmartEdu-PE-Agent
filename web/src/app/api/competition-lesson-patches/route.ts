import { competitionLessonPatchRequestBodySchema } from "@/lib/competition-lesson-patch";
import { runCompetitionLessonPatchSkill } from "@/mastra/skills";

export const runtime = "nodejs";
export const maxDuration = 45;

export async function POST(request: Request) {
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "请求体必须是 JSON。" }, { status: 400 });
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
    const response = await runCompetitionLessonPatchSkill(parsedBody.data, {
      modelId: process.env.AI_PATCH_MODEL ?? process.env.AI_MODEL ?? "gpt-4.1-mini",
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
