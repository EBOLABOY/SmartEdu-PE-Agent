/**
 * @module smartedu-request-headers
 * SmartEdu 自定义请求头处理。定义项目 ID 请求头，
 * 提供请求头的读取、写入和校验工具函数。
 */
export const SMARTEDU_PROJECT_HEADER = "x-smartedu-project-id";

export function getOptionalSmartEduProjectId(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : undefined;
}

export function readSmartEduProjectIdFromHeaders(headers: Headers) {
  return getOptionalSmartEduProjectId(headers.get(SMARTEDU_PROJECT_HEADER));
}

export function withSmartEduProjectHeader(
  headers: HeadersInit | undefined,
  projectId: unknown,
) {
  const nextHeaders = new Headers(headers);
  const normalizedProjectId = getOptionalSmartEduProjectId(projectId);

  if (normalizedProjectId) {
    nextHeaders.set(SMARTEDU_PROJECT_HEADER, normalizedProjectId);
  }

  return Object.fromEntries(nextHeaders.entries());
}
