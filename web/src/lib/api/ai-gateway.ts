/**
 * @module ai-gateway
 * AI 网关速率限制。针对 /api/chat 等 AI 路由实施
 * 项目级速率限制，防止单一项目过度消耗 AI 资源。
 */
import {
  readSmartEduProjectIdFromHeaders,
} from "@/lib/api/smartedu-request-headers";

import { getRequestActorKey, takeRateLimitToken } from "./rate-limit";

export const AI_GATEWAY_RATE_LIMIT = 90;
export const AI_GATEWAY_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

const AI_GATEWAY_PATHS = new Set([
  "/api/chat",
]);

export function isAiGatewayRateLimitedPath(pathname: string) {
  return AI_GATEWAY_PATHS.has(pathname);
}

export function buildAiGatewayRateLimitKey(request: Request, pathname = new URL(request.url).pathname) {
  const actorKey = getRequestActorKey(request, undefined);
  const projectId = readSmartEduProjectIdFromHeaders(request.headers) ?? "anonymous";

  return `ai-gateway:${pathname}:project:${projectId}:actor:${actorKey}`;
}

export async function takeAiGatewayRateLimitToken(request: Request) {
  return takeRateLimitToken({
    key: buildAiGatewayRateLimitKey(request),
    limit: AI_GATEWAY_RATE_LIMIT,
    windowMs: AI_GATEWAY_RATE_LIMIT_WINDOW_MS,
  });
}
