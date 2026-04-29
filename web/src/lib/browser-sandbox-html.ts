export type SandboxSecurityReport = {
  blockedReasons: string[];
  warnings: string[];
};

const EXTERNAL_RESOURCE_RULES: Array<{ selector: string; attr: string; reason: string }> = [
  { selector: "script[src]", attr: "src", reason: "检测到外部运行资源，已拒绝加载。" },
  { selector: "link[href]", attr: "href", reason: "检测到外部样式资源，已拒绝加载。" },
  {
    selector: "img[src], audio[src], video[src], iframe[src], source[src], track[src], embed[src]",
    attr: "src",
    reason: "检测到外部媒体资源，已阻止预览。",
  },
  { selector: "object[data]", attr: "data", reason: "检测到外部媒体资源，已阻止预览。" },
  { selector: "video[poster]", attr: "poster", reason: "检测到外部媒体资源，已阻止预览。" },
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

const CSP_CONTENT = [
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

function parseBrowserHtmlDocument(htmlContent: string) {
  return new DOMParser().parseFromString(htmlContent, "text/html");
}

function normalizeUrlLikeValue(value: string | null) {
  return (value ?? "").replace(/[\u0000-\u001F\u007F\s]+/g, "").trim();
}

function isExternalHttpUrl(value: string | null) {
  return /^(?:https?:)?\/\//i.test(normalizeUrlLikeValue(value));
}

function hasJavascriptUrl(value: string | null) {
  return /^javascript:/i.test(normalizeUrlLikeValue(value));
}

function scanCapabilitySource(source: string, blockedReasons: Set<string>) {
  for (const { pattern, reason } of ACTIVE_CAPABILITY_PATTERNS) {
    if (pattern.test(source)) {
      blockedReasons.add(reason);
    }
  }
}

export function analyzeBrowserSandboxHtml(htmlContent: string): SandboxSecurityReport {
  const document = parseBrowserHtmlDocument(htmlContent);
  const blockedReasons = new Set<string>();
  const warnings = new Set<string>();
  let hasInteractiveCapability = document.querySelector("script") !== null;

  for (const { selector, attr, reason } of EXTERNAL_RESOURCE_RULES) {
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      if (isExternalHttpUrl(element.getAttribute(attr))) {
        blockedReasons.add(reason);
      }
    }
  }

  for (const scriptElement of document.querySelectorAll("script")) {
    scanCapabilitySource(scriptElement.textContent ?? "", blockedReasons);
  }

  for (const element of document.querySelectorAll<HTMLElement>("*")) {
    for (const attr of Array.from(element.attributes)) {
      const attrName = attr.name.toLowerCase();
      const attrValue = attr.value;

      if (attrName.startsWith("on")) {
        hasInteractiveCapability = true;
        scanCapabilitySource(attrValue, blockedReasons);
      }

      if (hasJavascriptUrl(attrValue)) {
        hasInteractiveCapability = true;
        blockedReasons.add("检测到脚本协议链接，已阻止预览。");
        scanCapabilitySource(attrValue, blockedReasons);
      }
    }
  }

  if (hasInteractiveCapability) {
    warnings.add("当前大屏包含互动能力，将在受限环境下预览。");
  }

  return {
    blockedReasons: Array.from(blockedReasons),
    warnings: Array.from(warnings),
  };
}

export function injectBrowserSandboxCsp(htmlContent: string) {
  const document = parseBrowserHtmlDocument(htmlContent);
  const metaElement = document.createElement("meta");

  metaElement.httpEquiv = "Content-Security-Policy";
  metaElement.content = CSP_CONTENT;
  document.head.prepend(metaElement);

  return `<!DOCTYPE html>\n${document.documentElement.outerHTML}`;
}
