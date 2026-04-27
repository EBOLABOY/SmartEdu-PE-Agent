import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  createWorkspaceInvitationRequestBodySchema,
  createWorkspaceInvitationResponseSchema,
  projectIdSchema,
} from "@/lib/lesson-authoring-contract";
import {
  SMALL_JSON_REQUEST_MAX_BYTES,
  jsonRequestErrorResponse,
  readJsonRequest,
} from "@/lib/api/request";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
  hasSupabasePublicEnv,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

function buildInviteUrls(request: Request, token: string) {
  const requestUrl = new URL(request.url);
  const appOrigin = process.env.NEXT_PUBLIC_APP_URL ?? requestUrl.origin;
  const appInviteUrl = new URL("/", appOrigin);
  appInviteUrl.searchParams.set("invite", token);

  const callbackUrl = new URL("/auth/callback", appOrigin);
  callbackUrl.searchParams.set("next", `${appInviteUrl.pathname}${appInviteUrl.search}`);

  return {
    appInviteUrl: appInviteUrl.toString(),
    callbackUrl: callbackUrl.toString(),
  };
}

export async function POST(
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
    return Response.json({ error: "当前会话未登录，无法邀请成员。" }, { status: 401 });
  }

  let rawBody: unknown;

  try {
    rawBody = await readJsonRequest(request, { maxBytes: SMALL_JSON_REQUEST_MAX_BYTES });
  } catch (error) {
    return jsonRequestErrorResponse(error, "请求体必须是 JSON。");
  }

  const parsedBody = createWorkspaceInvitationRequestBodySchema.safeParse(rawBody);

  if (!parsedBody.success) {
    return Response.json(
      {
        error: "邀请参数不合法。",
        details: parsedBody.error.flatten(),
      },
      { status: 400 },
    );
  }

  const email = parsedBody.data.email.toLowerCase();
  const token = `${randomBytes(32).toString("hex")}${randomUUID().replaceAll("-", "")}`;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { appInviteUrl, callbackUrl } = buildInviteUrls(request, token);

  try {
    const { error: createError } = await supabase.rpc("create_organization_invitation", {
      invitation_email: email,
      invitation_role: parsedBody.data.role,
      invitation_token_hash: tokenHash,
      target_organization_id: parsedOrganizationId.data,
    });

    if (createError) {
      throw createError;
    }

    let emailSent = false;
    const adminClient = createSupabaseAdminClient();

    if (adminClient) {
      const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: {
          organization_id: parsedOrganizationId.data,
          role: parsedBody.data.role,
        },
        redirectTo: callbackUrl,
      });

      if (inviteError) {
        throw inviteError;
      }

      emailSent = true;
    }

    return Response.json(
      createWorkspaceInvitationResponseSchema.parse({
        emailSent,
        invitationUrl: appInviteUrl,
      }),
      {
        status: 201,
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "创建邀请失败。",
      },
      { status: 500 },
    );
  }
}
