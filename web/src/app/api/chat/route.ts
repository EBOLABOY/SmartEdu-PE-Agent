import { createUIMessageStreamResponse, validateUIMessages } from "ai";

import {
  chatRequestBodySchema,
  smartEduDataSchemas,
  type SmartEduUIMessage,
} from "@/lib/lesson-authoring-contract";
import { createLessonAuthoringPersistence } from "@/lib/persistence/lesson-authoring-store";
import { createProjectChatPersistence } from "@/lib/persistence/project-chat-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LessonAuthoringError, streamLessonAuthoring } from "@/mastra/services/lesson_authoring";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "请求体必须是 JSON。" }, { status: 400 });
  }

  const parsedBody = chatRequestBodySchema.safeParse(rawBody);

  if (!parsedBody.success) {
    return Response.json(
      {
        error: "请求体结构不合法。",
        details: parsedBody.error.flatten(),
      },
      { status: 400 },
    );
  }

  let messages: SmartEduUIMessage[];

  try {
    messages = await validateUIMessages<SmartEduUIMessage>({
      messages: parsedBody.data.messages,
      dataSchemas: smartEduDataSchemas,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "消息结构校验失败。",
      },
      { status: 400 },
    );
  }

  let authoringResult: Awaited<ReturnType<typeof streamLessonAuthoring>>;

  try {
    const supabase = parsedBody.data.projectId ? await createSupabaseServerClient() : null;
    const {
      data: { user },
    } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    const lessonPersistence = user ? createLessonAuthoringPersistence(supabase) : null;
    const chatPersistence = user ? createProjectChatPersistence(supabase, user.id) : null;

    if (chatPersistence && parsedBody.data.projectId) {
      try {
        await chatPersistence.saveMessages({
          projectId: parsedBody.data.projectId,
          messages,
        });
      } catch (error) {
        console.warn("[chat-route] persist-request-messages-failed", {
          projectId: parsedBody.data.projectId,
          message: error instanceof Error ? error.message : "unknown-error",
        });
      }
    }

    authoringResult = await streamLessonAuthoring({
      messages,
      persistence: lessonPersistence,
      chatPersistence,
      projectId: parsedBody.data.projectId,
      mode: parsedBody.data.mode,
      context: parsedBody.data.context,
      lessonPlan: parsedBody.data.lessonPlan,
      market: parsedBody.data.market,
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
    headers: {
      "x-smartedu-artifact-protocol": authoringResult.workflow.generationPlan.protocolVersion,
      "x-smartedu-request-id": authoringResult.requestId,
      "x-smartedu-response-transport": authoringResult.workflow.generationPlan.responseTransport,
    },
  });
}
