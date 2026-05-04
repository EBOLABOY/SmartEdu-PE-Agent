import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  projectIdSchema,
  workspaceInvitationActionResponseSchema,
} from "@/lib/lesson/authoring-contract";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
  hasSupabasePublicEnv,
} from "@/lib/supabase/server";
import type { SmartEduSupabaseClient } from "@/lib/supabase/typed-client";

export const runtime = "nodejs";

type InvitationRow = {
  email: string;
  organization_id: string;
  role: "admin" | "teacher" | "viewer";
};

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
    return { error: Response.json({ error: "当前会话未登录，无法管理邀请。" }, { status: 401 }) };
  }

  return { supabase };
}

function parseInvitationParams(params: { organizationId: string; invitationId: string }) {
  const parsedOrganizationId = projectIdSchema.safeParse(params.organizationId);
  const parsedInvitationId = projectIdSchema.safeParse(params.invitationId);

  if (!parsedOrganizationId.success || !parsedInvitationId.success) {
    return null;
  }

  return {
    invitationId: parsedInvitationId.data,
    organizationId: parsedOrganizationId.data,
  };
}

async function loadInvitation(
  supabase: SmartEduSupabaseClient,
  organizationId: string,
  invitationId: string,
) {
  const { data, error } = await supabase
    .from("organization_invitations")
    .select("organization_id, email, role")
    .eq("organization_id", organizationId)
    .eq("id", invitationId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("邀请不存在。");
  }

  return data as InvitationRow;
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ organizationId: string; invitationId: string }> },
) {
  const parsedParams = parseInvitationParams(await context.params);

  if (!parsedParams) {
    return Response.json({ error: "工作区 ID 或邀请 ID 不合法。" }, { status: 400 });
  }

  const auth = await requireSupabaseUser();

  if (auth.error) {
    return auth.error;
  }

  try {
    const { error } = await auth.supabase.rpc("revoke_organization_invitation", {
      target_invitation_id: parsedParams.invitationId,
    });

    if (error) {
      throw error;
    }

    return Response.json(
      workspaceInvitationActionResponseSchema.parse({ ok: true }),
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "撤销邀请失败。",
      },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string; invitationId: string }> },
) {
  const parsedParams = parseInvitationParams(await context.params);

  if (!parsedParams) {
    return Response.json({ error: "工作区 ID 或邀请 ID 不合法。" }, { status: 400 });
  }

  const auth = await requireSupabaseUser();

  if (auth.error) {
    return auth.error;
  }

  const token = `${randomBytes(32).toString("hex")}${randomUUID().replaceAll("-", "")}`;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { appInviteUrl, callbackUrl } = buildInviteUrls(request, token);

  try {
    const invitation = await loadInvitation(
      auth.supabase,
      parsedParams.organizationId,
      parsedParams.invitationId,
    );
    const { error } = await auth.supabase.rpc("resend_organization_invitation", {
      next_token_hash: tokenHash,
      target_invitation_id: parsedParams.invitationId,
    });

    if (error) {
      throw error;
    }

    let emailSent = false;
    const adminClient = createSupabaseAdminClient();

    if (adminClient) {
      const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
        invitation.email,
        {
          data: {
            organization_id: invitation.organization_id,
            role: invitation.role,
          },
          redirectTo: callbackUrl,
        },
      );

      if (inviteError) {
        throw inviteError;
      }

      emailSent = true;
    }

    return Response.json(
      workspaceInvitationActionResponseSchema.parse({
        emailSent,
        invitationUrl: appInviteUrl,
        ok: true,
      }),
      {
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "重发邀请失败。",
      },
      { status: 500 },
    );
  }
}
