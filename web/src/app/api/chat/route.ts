import { createUIMessageStreamResponse, type UIMessage } from "ai";

import {
  type GenerationMode,
  type PeTeacherContext,
} from "@/mastra/agents/pe_teacher";
import { LessonAuthoringError, streamLessonAuthoring } from "@/mastra/services/lesson_authoring";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatRequestBody = {
  messages?: UIMessage[];
  context?: PeTeacherContext;
  mode?: GenerationMode;
  lessonPlan?: string;
};

export async function POST(request: Request) {
  let body: ChatRequestBody;

  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return Response.json({ error: "请求体必须是 JSON。" }, { status: 400 });
  }

  if (!Array.isArray(body.messages)) {
    return Response.json({ error: "缺少 messages 数组。" }, { status: 400 });
  }

  let authoringResult: Awaited<ReturnType<typeof streamLessonAuthoring>>;

  try {
    authoringResult = await streamLessonAuthoring({
      messages: body.messages,
      mode: body.mode,
      context: body.context,
      lessonPlan: body.lessonPlan,
    });
  } catch (error) {
    const status = error instanceof LessonAuthoringError ? error.status : 500;

    return Response.json(
      { error: error instanceof Error ? error.message : "体育教案生成服务异常。" },
      { status },
    );
  }

  return createUIMessageStreamResponse({
    stream: authoringResult.stream,
  });
}
