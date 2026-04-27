import {
  projectIdSchema,
  updateWorkspaceMemberRequestBodySchema,
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

async function requireSupabaseUser() {
  if (!hasSupabasePublicEnv()) {
    return { error: Response.json({ error: "当前环境未启用 Supabase。" }, { status: 503 }) };
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return { error: Response.json({ error: "Supabase 客户端不可用。" }, { status: 503 }) };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: Response.json({ error: "当前会话未登录，无法管理成员。" }, { status: 401 }) };
  }

  return { supabase };
}

function parseMemberParams(params: { organizationId: string; userId: string }) {
  const parsedOrganizationId = projectIdSchema.safeParse(params.organizationId);
  const parsedUserId = projectIdSchema.safeParse(params.userId);

  if (!parsedOrganizationId.success || !parsedUserId.success) {
    return null;
  }

  return {
    organizationId: parsedOrganizationId.data,
    userId: parsedUserId.data,
  };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ organizationId: string; userId: string }> },
) {
  const rawParams = await context.params;
  const parsedParams = parseMemberParams(rawParams);

  if (!parsedParams) {
    return Response.json({ error: "工作区 ID 或成员 ID 不合法。" }, { status: 400 });
  }

  const auth = await requireSupabaseUser();

  if (auth.error) {
    return auth.error;
  }

  let rawBody: unknown;

  try {
    rawBody = await readJsonRequest(request, { maxBytes: SMALL_JSON_REQUEST_MAX_BYTES });
  } catch (error) {
    return jsonRequestErrorResponse(error, "请求体必须是 JSON。");
  }

  const parsedBody = updateWorkspaceMemberRequestBodySchema.safeParse(rawBody);

  if (!parsedBody.success) {
    return Response.json(
      {
        error: "成员角色更新参数不合法。",
        details: parsedBody.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const { error } = await auth.supabase.rpc("update_organization_member_role", {
      next_role: parsedBody.data.role,
      target_organization_id: parsedParams.organizationId,
      target_user_id: parsedParams.userId,
    });

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
        error: error instanceof Error ? error.message : "更新成员角色失败。",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ organizationId: string; userId: string }> },
) {
  const rawParams = await context.params;
  const parsedParams = parseMemberParams(rawParams);

  if (!parsedParams) {
    return Response.json({ error: "工作区 ID 或成员 ID 不合法。" }, { status: 400 });
  }

  const auth = await requireSupabaseUser();

  if (auth.error) {
    return auth.error;
  }

  try {
    const { error } = await auth.supabase.rpc("remove_organization_member", {
      target_organization_id: parsedParams.organizationId,
      target_user_id: parsedParams.userId,
    });

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
        error: error instanceof Error ? error.message : "移除成员失败。",
      },
      { status: 500 },
    );
  }
}
