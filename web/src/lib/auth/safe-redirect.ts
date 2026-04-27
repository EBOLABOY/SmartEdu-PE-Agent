const APP_REDIRECT_BASE = "https://smartedu.local";
const DEFAULT_REDIRECT_PATH = "/";

export function getSafeAppRedirectPath(value: string | null | undefined) {
  const rawPath = value?.trim();

  if (!rawPath || !rawPath.startsWith("/") || rawPath.startsWith("//") || rawPath.includes("\\")) {
    return DEFAULT_REDIRECT_PATH;
  }

  try {
    const redirectUrl = new URL(rawPath, APP_REDIRECT_BASE);

    if (redirectUrl.origin !== APP_REDIRECT_BASE) {
      return DEFAULT_REDIRECT_PATH;
    }

    return `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`;
  } catch {
    return DEFAULT_REDIRECT_PATH;
  }
}
