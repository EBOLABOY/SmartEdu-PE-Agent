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
const SINGLE_PAGE_MAIN_REGEX = /<main\b[^>]*data-html-screen-document=(?:"single-page"|'single-page')[^>]*>[\s\S]*?<\/main>/i;

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

function stripCodeFence(value: string) {
  const trimmed = value.trim();
  const fenceMatch = /^```(?:html)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);

  return fenceMatch?.[1]?.trim() ?? trimmed;
}

export function ensureCompleteHtmlDocument(value: string) {
  const html = stripCodeFence(value);

  if (/<html\b/i.test(html) && /<body\b/i.test(html)) {
    return html.startsWith("<!DOCTYPE html>") ? html : `<!DOCTYPE html>\n${html}`;
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>互动大屏</title>
</head>
<body>
  <main data-html-screen-document="single-page">
${html}
  </main>
</body>
</html>`;
}

function buildHtmlArtifactPage(sectionHtml: string, pageIndex: number): HtmlArtifactPage {
  return {
    pageIndex,
    pageRole: extractPageRole(sectionHtml),
    pageTitle: extractPageTitle(sectionHtml, pageIndex),
    sectionHtml,
  };
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

  if (sections.length > 0) {
    return sections.map((section, pageIndex) => buildHtmlArtifactPage(section.sectionHtml, pageIndex));
  }

  const singlePageMain = SINGLE_PAGE_MAIN_REGEX.exec(htmlContent)?.[0]?.trim();
  const fallbackTitle = extractDocumentTitle(htmlContent) || "互动大屏";
  const sectionHtml =
    singlePageMain ??
    `<main data-html-screen-document="single-page"><h1>${fallbackTitle}</h1></main>`;

  return [
    {
      pageIndex: 0,
      pageRole: "singlePage",
      pageTitle: fallbackTitle,
      sectionHtml,
    },
  ];
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

export function replaceHtmlScreenPageInnerHtml(input: {
  htmlContent: string;
  nextInnerHtml: string;
  pageIndex: number;
}) {
  const sections = findSectionMatches(input.htmlContent);
  const selected = sections[input.pageIndex];

  if (!selected && input.pageIndex === 0) {
    const mainMatch = SINGLE_PAGE_MAIN_REGEX.exec(input.htmlContent);

    if (mainMatch) {
      const startTag = mainMatch[0].match(/^<main\b[^>]*>/i)?.[0];

      if (!startTag) {
        throw new Error("单页大屏缺少 main 起始标签，无法替换。");
      }

      const rebuiltMain = `${startTag}\n${input.nextInnerHtml.trim()}\n</main>`;

      return `${input.htmlContent.slice(0, mainMatch.index)}${rebuiltMain}${input.htmlContent.slice(mainMatch.index + mainMatch[0].length)}`;
    }
  }

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
