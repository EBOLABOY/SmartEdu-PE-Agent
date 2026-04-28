import {
  getElementText,
  getHtmlAttribute,
  getHtmlElements,
  hasJavascriptUrl,
  injectHeadMeta,
  isExternalHttpUrl,
  parseHtmlDocument,
} from "@/lib/html-inspection";

export type SandboxSecurityReport = {
  blockedReasons: string[];
  warnings: string[];
};

const EXTERNAL_RESOURCE_RULES: Array<{ attr: string; reason: string; tags: string[] }> = [
  { tags: ["script"], attr: "src", reason: "检测到外部运行资源，已拒绝加载。" },
  { tags: ["link"], attr: "href", reason: "检测到外部样式资源，已拒绝加载。" },
  {
    tags: ["img", "audio", "video", "iframe", "source", "track", "embed"],
    attr: "src",
    reason: "检测到外部媒体资源，已阻止预览。",
  },
  { tags: ["object"], attr: "data", reason: "检测到外部媒体资源，已阻止预览。" },
  { tags: ["video"], attr: "poster", reason: "检测到外部媒体资源，已阻止预览。" },
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

type ParsedSandboxDocument = ReturnType<typeof parseHtmlDocument>;

function collectExternalResourceReasons(document: ParsedSandboxDocument) {
  const reasons: string[] = [];

  for (const rule of EXTERNAL_RESOURCE_RULES) {
    for (const tag of rule.tags) {
      const hasExternalResource = getHtmlElements(document, tag).some((element) =>
        isExternalHttpUrl(getHtmlAttribute(element, rule.attr)),
      );

      if (hasExternalResource) {
        reasons.push(rule.reason);
      }
    }
  }

  return reasons;
}

function collectActiveCapabilitySources(document: ParsedSandboxDocument) {
  const sources: string[] = [];

  for (const scriptElement of getHtmlElements(document, "script")) {
    sources.push(getElementText(scriptElement));
  }

  for (const element of getHtmlElements(document)) {
    for (const attr of element.attrs) {
      const attrName = attr.name.toLowerCase();

      if (attrName.startsWith("on") || hasJavascriptUrl(attr.value)) {
        sources.push(attr.value);
      }
    }
  }

  return sources;
}

function collectActiveCapabilityReasons(document: ParsedSandboxDocument) {
  const sources = collectActiveCapabilitySources(document);

  return ACTIVE_CAPABILITY_PATTERNS.filter(({ pattern }) =>
    sources.some((source) => pattern.test(source)),
  ).map(({ reason }) => reason);
}

function containsInteractiveCapability(document: ParsedSandboxDocument) {
  if (getHtmlElements(document, "script").length > 0) {
    return true;
  }

  return getHtmlElements(document).some((element) =>
    element.attrs.some((attr) => attr.name.toLowerCase().startsWith("on")),
  );
}

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

  return injectHeadMeta(htmlContent, [
    { name: "http-equiv", value: "Content-Security-Policy" },
    { name: "content", value: csp },
  ]);
}

export function analyzeSandboxHtml(htmlContent: string): SandboxSecurityReport {
  const document = parseHtmlDocument(htmlContent);
  const blockedReasons = [
    ...collectExternalResourceReasons(document),
    ...collectActiveCapabilityReasons(document),
  ];

  const warnings = containsInteractiveCapability(document) ? ["当前大屏包含互动能力，将在受限环境下预览。"] : [];

  return {
    blockedReasons: Array.from(new Set(blockedReasons)),
    warnings,
  };
}
