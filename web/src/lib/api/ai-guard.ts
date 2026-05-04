/**
 * @module ai-guard
 * AI 请求的认证与限流守卫。检查用户认证状态，
 * 分配速率限制令牌，为 AI 路由提供统一的鉴权和限流入口。
 */
import type { User } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { getRequestActorKey, takeRateLimitToken } from "./rate-limit";

export type AiRequestAuth = {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  user: User | null;
};

export function allowsAnonymousAiRequests() {
  return process.env.SMARTEDU_ALLOW_ANONYMOUS_AI === "true";
}

export async function getAiRequestAuth(): Promise<AiRequestAuth> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  return { supabase, user };
}

export async function takeAiRateLimitToken({
  limit,
  request,
  userId,
  windowMs,
}: {
  limit: number;
  request: Request;
  userId?: string;
  windowMs: number;
}) {
  return await takeRateLimitToken({
    key: getRequestActorKey(request, userId),
    limit,
    windowMs,
  });
}
