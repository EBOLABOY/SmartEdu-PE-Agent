import type { HtmlArtifactPage } from "@/lib/lesson-authoring-contract";

export type HtmlScreenPageSelection = Pick<HtmlArtifactPage, "pageIndex" | "pageRole" | "pageTitle">;

export type HtmlScreenPageDescriptor = HtmlArtifactPage & {
  previewHtml: string;
};

type HtmlScreenPageMatch = {
  end: number;
  sectionHtml: string;
  start: number;
};

const SECTION_REGEX = /<section\b[^>]*class="[^"]*\bslide\b[^"]*"[^>]*>[\s\S]*?<\/section>/gi;
const HEAD_REGEX = /<head\b[^>]*>([\s\S]*?)<\/head>/i;
const HTML_LANG_REGEX = /<html\b[^>]*lang="([^"]+)"/i;
const H1_REGEX = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i;
const H2_REGEX = /<h2\b[^>]*>([\s\S]*?)<\/h2>/i;
const ROLE_REGEX = /data-slide-kind="([^"]+)"/i;
const TITLE_REGEX = /<title\b[^>]*>([\s\S]*?)<\/title>/i;

const EDITOR_PREVIEW_STYLE = `
<style data-editor-preview>
  html, body {
    width: 100%;
    min-height: 100%;
    height: auto !important;
    margin: 0;
    overflow: auto !important;
  }
  body {
    background: #e5e7eb;
  }
  [data-editor-preview-page] {
    min-height: 100vh;
    padding: 16px;
    box-sizing: border-box;
  }
  .slide {
    position: relative !important;
    inset: auto !important;
    min-height: 100vh;
    display: block !important;
    margin: 0;
  }
  .controls,
  script {
    display: none !important;
  }
  [data-start],
  .start-button,
  .start-button-visual,
  .control-btn {
    pointer-events: none !important;
  }
</style>`.trim();

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function stripTags(value: string) {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function extractHeadHtml(htmlContent: string) {
  return HEAD_REGEX.exec(htmlContent)?.[1]?.trim() ?? "";
}

function extractDocumentLang(htmlContent: string) {
  return HTML_LANG_REGEX.exec(htmlContent)?.[1]?.trim() || "zh-CN";
}

function addActiveClass(sectionHtml: string) {
  return sectionHtml.replace(/class="([^"]*)"/i, (_match, className: string) => {
    const classes = className.split(/\s+/).filter(Boolean);

    if (!classes.includes("active")) {
      classes.push("active");
    }

    return `class="${classes.join(" ")}"`;
  });
}

function extractPageTitle(sectionHtml: string, pageIndex: number) {
  const titleMatch = H1_REGEX.exec(sectionHtml) ?? H2_REGEX.exec(sectionHtml);
  const title = titleMatch ? stripTags(titleMatch[1] ?? "") : "";

  return title || `第 ${pageIndex + 1} 页`;
}

function extractPageRole(sectionHtml: string) {
  return ROLE_REGEX.exec(sectionHtml)?.[1]?.trim() || undefined;
}

function extractDocumentTitle(htmlContent: string) {
  const titleMatch = TITLE_REGEX.exec(htmlContent);
  return titleMatch ? stripTags(titleMatch[1] ?? "") : "";
}

function buildHtmlArtifactPage(sectionHtml: string, pageIndex: number): HtmlArtifactPage {
  return {
    pageIndex,
    pageRole: extractPageRole(sectionHtml),
    pageTitle: extractPageTitle(sectionHtml, pageIndex),
    sectionHtml,
  };
}

function buildFallbackHtmlDocument(input: {
  htmlContent?: string;
  pages: HtmlArtifactPage[];
}) {
  const lang = input.htmlContent ? extractDocumentLang(input.htmlContent) : "zh-CN";
  const headHtml = input.htmlContent ? extractHeadHtml(input.htmlContent) : "";
  const title =
    (input.htmlContent ? extractDocumentTitle(input.htmlContent) : "") ||
    input.pages[0]?.pageTitle ||
    "互动大屏";
  const sectionsHtml = input.pages
    .slice()
    .sort((left, right) => left.pageIndex - right.pageIndex)
    .map((page) => page.sectionHtml.trim())
    .join("\n");
  const shouldInjectFallbackHead = !headHtml;
  const shouldInjectTitle = shouldInjectFallbackHead || !TITLE_REGEX.test(headHtml);

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
${headHtml}
${shouldInjectFallbackHead ? '  <meta charset="utf-8">' : ""}
${shouldInjectFallbackHead ? '  <meta name="viewport" content="width=device-width, initial-scale=1">' : ""}
${shouldInjectTitle ? `  <title>${title}</title>` : ""}
</head>
<body>
  <main data-html-screen-document="assembled">
    ${sectionsHtml}
  </main>
</body>
</html>`;
}

function findSectionMatches(htmlContent: string): HtmlScreenPageMatch[] {
  const matches: HtmlScreenPageMatch[] = [];
  let match: RegExpExecArray | null;

  SECTION_REGEX.lastIndex = 0;

  while ((match = SECTION_REGEX.exec(htmlContent)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      sectionHtml: match[0],
    });
  }

  return matches;
}

export function buildHtmlScreenEditorPreviewDocument(input: {
  htmlContent: string;
  pageIndex: number;
  sectionHtml: string;
}) {
  const headHtml = extractHeadHtml(input.htmlContent);
  const lang = extractDocumentLang(input.htmlContent);
  const previewSectionHtml = addActiveClass(input.sectionHtml);

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
${headHtml}
${EDITOR_PREVIEW_STYLE}
</head>
<body>
  <div data-editor-preview-page="${input.pageIndex + 1}">
    ${previewSectionHtml}
  </div>
</body>
</html>`;
}

export function createHtmlArtifactPages(htmlContent: string): HtmlArtifactPage[] {
  const sections = findSectionMatches(htmlContent);

  return sections.map((section, pageIndex) => buildHtmlArtifactPage(section.sectionHtml, pageIndex));
}

export function extractHtmlScreenPages(htmlContent: string): HtmlScreenPageDescriptor[] {
  return createHtmlArtifactPages(htmlContent).map((page) => ({
    ...page,
    previewHtml: buildHtmlScreenEditorPreviewDocument({
      htmlContent,
      pageIndex: page.pageIndex,
      sectionHtml: page.sectionHtml,
    }),
  }));
}

export function composeHtmlScreenDocument(input: {
  htmlContent?: string;
  pages: HtmlArtifactPage[];
}) {
  const pages = input.pages
    .slice()
    .sort((left, right) => left.pageIndex - right.pageIndex);

  if (pages.length === 0) {
    return input.htmlContent?.trim() ?? "";
  }

  const sectionsHtml = pages.map((page) => page.sectionHtml.trim()).join("\n");
  const currentHtml = input.htmlContent?.trim() ?? "";

  if (!currentHtml) {
    return buildFallbackHtmlDocument({
      pages,
    });
  }

  const sections = findSectionMatches(currentHtml);

  if (sections.length > 0) {
    const firstSection = sections[0]!;
    const lastSection = sections[sections.length - 1]!;

    return `${currentHtml.slice(0, firstSection.start)}${sectionsHtml}${currentHtml.slice(lastSection.end)}`;
  }

  const bodyCloseMatch = /<\/body>/i.exec(currentHtml);

  if (bodyCloseMatch) {
    const bodyCloseIndex = bodyCloseMatch.index;
    return `${currentHtml.slice(0, bodyCloseIndex)}\n<main data-html-screen-document="assembled">\n${sectionsHtml}\n</main>\n${currentHtml.slice(bodyCloseIndex)}`;
  }

  return buildFallbackHtmlDocument({
    htmlContent: currentHtml,
    pages,
  });
}

export function replaceHtmlScreenPageInnerHtml(input: {
  htmlContent: string;
  nextInnerHtml: string;
  pageIndex: number;
}) {
  const sections = findSectionMatches(input.htmlContent);
  const selected = sections[input.pageIndex];

  if (!selected) {
    throw new Error(`未找到第 ${input.pageIndex + 1} 页，无法完成当前页替换。`);
  }

  const startTag = selected.sectionHtml.match(/^<section\b[^>]*>/i)?.[0];

  if (!startTag) {
    throw new Error(`第 ${input.pageIndex + 1} 页缺少 section 起始标签，无法替换。`);
  }

  const rebuiltSection = `${startTag}\n${input.nextInnerHtml.trim()}\n</section>`;

  return `${input.htmlContent.slice(0, selected.start)}${rebuiltSection}${input.htmlContent.slice(selected.end)}`;
}
