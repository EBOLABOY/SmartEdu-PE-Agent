import {
  projectIdSchema,
  updateWorkspaceRequestBodySchema,
} from "@/lib/lesson-authoring-contract";
import {
  SMALL_JSON_REQUEST_MAX_BYTES,
  jsonRequestErrorResponse,
  readJsonRequest,
} from "@/lib/api/request";
import {
  createSupabaseServerClient,
  hasSupabasePublicEnv,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  const { organizationId } = await context.params;
  const parsedOrganizationId = projectIdSchema.safeParse(organizationId);

  if (!parsedOrganizationId.success) {
    return Response.json({ error: "工作区 ID 不合法。" }, { status: 400 });
  }

  if (!hasSupabasePublicEnv()) {
    return Response.json({ error: "当前环境未启用 Supabase。" }, { status: 503 });
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return Response.json({ error: "Supabase 客户端不可用。" }, { status: 503 });
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return Response.json({ error: "当前会话未登录，无法更新工作区。" }, { status: 401 });
  }

  let rawBody: unknown;

  try {
    rawBody = await readJsonRequest(request, { maxBytes: SMALL_JSON_REQUEST_MAX_BYTES });
  } catch (error) {
    return jsonRequestErrorResponse(error, "请求体必须是 JSON。");
  }

  const parsedBody = updateWorkspaceRequestBodySchema.safeParse(rawBody);

  if (!parsedBody.success) {
    return Response.json(
      {
        error: "工作区更新参数不合法。",
        details: parsedBody.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const { error } = await supabase
      .from("organizations")
      .update({ name: parsedBody.data.name })
      .eq("id", parsedOrganizationId.data);

    if (error) {
      throw error;
    }

    return Response.json(
      { ok: true },
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "更新工作区失败。",
      },
      { status: 500 },
    );
  }
}
