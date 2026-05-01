import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  isAiGatewayRateLimitedPath,
  takeAiGatewayRateLimitToken,
} from "@/lib/api/ai-gateway";
import { proxy as supabaseSessionProxy } from "@/lib/supabase/session-proxy";

export async function middleware(request: NextRequest) {
  if (request.method === "POST" && isAiGatewayRateLimitedPath(request.nextUrl.pathname)) {
    const rateLimit = await takeAiGatewayRateLimitToken(request);

    if (!rateLimit.ok) {
      return NextResponse.json(
        { error: "AI 请求过于频繁，请稍后再试。" },
        {
          status: 429,
          headers: {
            "retry-after": String(rateLimit.retryAfterSeconds),
            "x-smartedu-rate-limit-layer": "gateway",
          },
        },
      );
    }
  }

  return supabaseSessionProxy(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
