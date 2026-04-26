import { createUIMessageStreamResponse, validateUIMessages } from "ai";

import {
  chatRequestBodySchema,
  smartEduDataSchemas,
  type PeTeacherContext,
  type SmartEduUIMessage,
} from "@/lib/lesson-authoring-contract";
import { createLessonAuthoringPersistence } from "@/lib/persistence/lesson-authoring-store";
import { createProjectChatPersistence } from "@/lib/persistence/project-chat-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LessonAuthoringError, streamLessonAuthoring } from "@/mastra/services/lesson_authoring";

export const runtime = "nodejs";
export const maxDuration = 60;

type ProfileRow = {
  school_name: string | null;
  teacher_name: string | null;
  teaching_grade: string | null;
  teaching_level: string | null;
};

type LooseProfileClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: "profiles") => any;
};

function profileToContext(profile: ProfileRow | null): PeTeacherContext {
  return {
    schoolName: profile?.school_name?.trim() || undefined,
    teacherName: profile?.teacher_name?.trim() || undefined,
    teachingGrade: profile?.teaching_grade?.trim() || undefined,
    teachingLevel: profile?.teaching_level?.trim() || undefined,
  };
}

async function loadUserProfileContext(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string | undefined,
) {
  if (!supabase || !userId) {
    return {};
  }

  try {
    const client = supabase as unknown as LooseProfileClient;
    const { data, error } = await client
      .from("profiles")
      .select("school_name, teacher_name, teaching_grade, teaching_level")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return profileToContext((data ?? null) as ProfileRow | null);
  } catch (error) {
    console.warn("[chat-route] load-profile-context-failed", {
      message: error instanceof Error ? error.message : "unknown-error",
    });
    return {};
  }
}

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
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
    const lessonPersistence = user ? createLessonAuthoringPersistence(supabase) : null;
    const chatPersistence = user ? createProjectChatPersistence(supabase, user.id) : null;
    const profileContext = await loadUserProfileContext(supabase, user?.id);
    const mergedContext = {
      ...profileContext,
      ...parsedBody.data.context,
    };

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
      context: mergedContext,
      lessonPlan: parsedBody.data.lessonPlan,
      screenPlan: parsedBody.data.screenPlan,
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
