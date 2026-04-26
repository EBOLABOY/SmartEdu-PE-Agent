import { generateObject } from "ai";

import {
  competitionLessonPatchRequestBodySchema,
  competitionLessonPatchResponseSchema,
  competitionLessonPatchSchema,
  applyCompetitionLessonPatch,
} from "@/lib/competition-lesson-patch";
import { createModelProvider } from "@/mastra";

export const runtime = "nodejs";
export const maxDuration = 45;

function buildTargetPathHint(targetPaths?: string[]) {
  if (!targetPaths?.length) {
    return "用户未指定路径。你必须选择最小必要字段路径，不要重写整份教案。";
  }

  return `用户允许优先修改这些路径：\n${targetPaths.map((path) => `- ${path}`).join("\n")}\n如确需同步调整其他字段，最多额外增加 2 个直接相关路径。`;
}

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

  const provider = createModelProvider();
  const model = provider(process.env.AI_PATCH_MODEL ?? process.env.AI_MODEL ?? "gpt-4.1-mini");
  const { instruction, lessonPlan, targetPaths } = parsedBody.data;

  try {
    const result = await generateObject({
      model,
      schema: competitionLessonPatchSchema,
      system: `你是体育教案结构化字段局部修改助手。你只能返回 JSON Patch 风格的字段级 operations，不能返回整篇教案、Markdown、HTML 或解释性文字。

核心原则：
1. 只修改用户要求涉及的最小字段，避免重写整份教案。
2. path 必须使用 JSON Pointer，例如 /learningObjectives/sportAbility 或 /periodPlan/rows/1/methods/teacher/0。
3. op 只能使用 replace、append、remove。replace/remove 必须指向已存在字段或数组元素；append 必须指向数组字段。
4. value 必须是目标字段需要的新值，不要包含 Markdown 表格、HTML 标签或代码围栏。
5. reason 必须说明修改位置、理由和同步检查要点。
6. 修改后必须保持广东省比赛体育教案结构完整，尤其不能破坏学习评价三档、课时计划三段、运动负荷和安全保障。
7. 如果修改运动时间、强度、课堂结构或练习密度，必须同步检查 /loadEstimate；必要时同时调整 /loadEstimate/loadLevel、/loadEstimate/targetHeartRateRange、/loadEstimate/averageHeartRate、/loadEstimate/groupDensity、/loadEstimate/individualDensity、/loadEstimate/chartPoints 和 /loadEstimate/rationale，保证文字说明与图表曲线一致。`,
      prompt: `用户局部修改意见：
${instruction}

${buildTargetPathHint(targetPaths)}

当前 CompetitionLessonPlan JSON：
${JSON.stringify(lessonPlan, null, 2)}

请只返回符合 schema 的 operations。`,
    });

    const nextLessonPlan = applyCompetitionLessonPatch(lessonPlan, result.object);
    const response = competitionLessonPatchResponseSchema.parse({
      patch: result.object,
      lessonPlan: nextLessonPlan,
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
