export type SandboxSecurityReport = {
  blockedReasons: string[];
  warnings: string[];
};

const EXTERNAL_RESOURCE_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /<script[^>]+src\s*=\s*["']https?:\/\//i, reason: "检测到外部运行资源，已拒绝加载。" },
  { pattern: /<link[^>]+href\s*=\s*["']https?:\/\//i, reason: "检测到外部样式资源，已拒绝加载。" },
  { pattern: /<(img|audio|video|iframe)[^>]+src\s*=\s*["']https?:\/\//i, reason: "检测到外部媒体资源，已阻止预览。" },
];

const ACTIVE_CAPABILITY_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bfetch\s*\(/i, reason: "检测到主动网络请求，已阻止预览。" },
  { pattern: /\bXMLHttpRequest\b/i, reason: "检测到主动网络请求，已阻止预览。" },
  { pattern: /\bWebSocket\b/i, reason: "检测到实时网络连接，已阻止预览。" },
  { pattern: /\bEventSource\b/i, reason: "检测到实时网络连接，已阻止预览。" },
  { pattern: /\bdocument\.cookie\b/i, reason: "检测到浏览器信息读取行为，已阻止预览。" },
  { pattern: /\b(localStorage|sessionStorage)\b/i, reason: "检测到浏览器本地信息访问行为，已阻止预览。" },
  { pattern: /\bwindow\.open\s*\(/i, reason: "检测到新窗口打开行为，已阻止预览。" },
];

export function injectSandboxCsp(htmlContent: string) {
  const csp = [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    "img-src data: blob:",
    "font-src data:",
    "connect-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
  const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;

  if (/<head[\s>]/i.test(htmlContent)) {
    return htmlContent.replace(/<head([^>]*)>/i, `<head$1>${meta}`);
  }

  return `<!DOCTYPE html><html lang="zh-CN"><head>${meta}<meta charset="utf-8"></head><body>${htmlContent}</body></html>`;
}

export function analyzeSandboxHtml(htmlContent: string): SandboxSecurityReport {
  const blockedReasons = [
    ...EXTERNAL_RESOURCE_PATTERNS.filter(({ pattern }) => pattern.test(htmlContent)).map(({ reason }) => reason),
    ...ACTIVE_CAPABILITY_PATTERNS.filter(({ pattern }) => pattern.test(htmlContent)).map(({ reason }) => reason),
  ];

  const warnings = /<script/i.test(htmlContent) ? ["当前大屏包含互动能力，将在受限环境下预览。"] : [];

  return {
    blockedReasons: Array.from(new Set(blockedReasons)),
    warnings,
  };
}
