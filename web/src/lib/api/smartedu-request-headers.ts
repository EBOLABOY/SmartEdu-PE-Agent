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
