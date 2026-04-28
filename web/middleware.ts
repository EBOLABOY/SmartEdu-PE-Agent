import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  isAiGatewayRateLimitedPath,
  takeAiGatewayRateLimitToken,
} from "@/lib/api/ai-gateway";

export async function middleware(request: NextRequest) {
  if (request.method !== "POST" || !isAiGatewayRateLimitedPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const rateLimit = await takeAiGatewayRateLimitToken(request);

  if (rateLimit.ok) {
    return NextResponse.next();
  }

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

export const config = {
  matcher: ["/api/chat", "/api/competition-lesson-patches"],
};
