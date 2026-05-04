/**
 * @module api
 * API 工具层 - 封装请求处理、速率限制与 AI 认证守卫。
 */

// ---- ai-gateway ----
export {
  AI_GATEWAY_RATE_LIMIT,
  AI_GATEWAY_RATE_LIMIT_WINDOW_MS,
  isAiGatewayRateLimitedPath,
  buildAiGatewayRateLimitKey,
  takeAiGatewayRateLimitToken,
} from "./ai-gateway";

// ---- ai-guard ----
export type { AiRequestAuth } from "./ai-guard";
export {
  allowsAnonymousAiRequests,
  getAiRequestAuth,
  takeAiRateLimitToken,
} from "./ai-guard";

// ---- rate-limit ----
export {
  takeRateLimitToken,
  getRequestActorKey,
  getRateLimitBucketKeysForTest,
  resetRateLimitBucketsForTest,
} from "./rate-limit";

// ---- request ----
export { JsonRequestError } from "./request";
export {
  PROJECT_CREATE_REQUEST_MAX_BYTES,
  SMALL_JSON_REQUEST_MAX_BYTES,
  ARTIFACT_JSON_REQUEST_MAX_BYTES,
  CHAT_REQUEST_MAX_BYTES,
  EXPORT_HTML_REQUEST_MAX_BYTES,
  readJsonRequest,
  jsonRequestErrorResponse,
} from "./request";

// ---- smartedu-request-headers ----
export { SMARTEDU_PROJECT_HEADER } from "./smartedu-request-headers";
export {
  getOptionalSmartEduProjectId,
  readSmartEduProjectIdFromHeaders,
  withSmartEduProjectHeader,
} from "./smartedu-request-headers";