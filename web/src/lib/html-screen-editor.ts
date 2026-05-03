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

const SECTION_REGEX = /<section\b(?=[^>]*\bclass\s*=\s*(?:"[^"]*\bslide\b[^"]*"|'[^']*\bslide\b[^']*'))[^>]*>[\s\S]*?<\/section>/gi;
const HEAD_REGEX = /<head\b[^>]*>([\s\S]*?)<\/head>/i;
const HTML_LANG_REGEX = /<html\b[^>]*lang\s*=\s*(?:"([^"]+)"|'([^']+)')/i;
const H1_REGEX = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i;
const H2_REGEX = /<h2\b[^>]*>([\s\S]*?)<\/h2>/i;
const ROLE_REGEX = /\bdata-slide-kind\s*=\s*(?:"([^"]+)"|'([^']+)')/i;
const TITLE_REGEX = /<title\b[^>]*>([\s\S]*?)<\/title>/i;
const SINGLE_PAGE_MAIN_REGEX = /<main\b[^>]*data-html-screen-document=(?:"single-page"|'single-page')[^>]*>[\s\S]*?<\/main>/i;

const EDITOR_PREVIEW_STYLE = `
<style data-editor-preview>
  html, body {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden !important;
  }
  body {
    background: transparent;
  }
  [data-editor-preview-page] {
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  .slide {
    position: relative !important;
    inset: auto !important;
    width: 100%;
    height: 100%;
    display: block !important;
    margin: 0;
    overflow: hidden;
  }
</style>`.trim();

const SCREEN_ENGINE_SCRIPT = `
<script data-screen-engine>
(function() {
  if (window.__screenEngineInitialized) return;
  window.__screenEngineInitialized = true;

  document.addEventListener("DOMContentLoaded", () => {
    const slides = Array.from(document.querySelectorAll('.slide'));
    if (slides.length === 0) return;

    let currentIndex = 0;
    let timerInterval = null;
    let timeRemaining = 0;

    // 初始化样式：只显示第一页，其他隐藏
    slides.forEach((slide, index) => {
      slide.style.display = index === 0 ? 'block' : 'none';
      slide.style.position = 'absolute';
      slide.style.top = '0';
      slide.style.left = '0';
      slide.style.width = '100%';
      slide.style.height = '100%';
    });

    function formatTime(seconds) {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function updateTimerDisplay(slide, seconds) {
      const displays = slide.querySelectorAll('.duration-display, .timer-display');
      displays.forEach(el => {
        el.textContent = formatTime(seconds);
      });
    }

    function goToSlide(index) {
      if (index < 0 || index >= slides.length) return;
      
      slides[currentIndex].style.display = 'none';
      currentIndex = index;
      const currentSlide = slides[currentIndex];
      currentSlide.style.display = 'block';

      if (timerInterval) clearInterval(timerInterval);

      const durationRaw = currentSlide.getAttribute('data-duration');
      if (durationRaw) {
        timeRemaining = parseInt(durationRaw, 10);
        if (isNaN(timeRemaining)) timeRemaining = 0;
      } else {
        timeRemaining = 0;
      }

      updateTimerDisplay(currentSlide, timeRemaining);

      if (timeRemaining > 0) {
        timerInterval = setInterval(() => {
          timeRemaining--;
          updateTimerDisplay(currentSlide, timeRemaining);
          if (timeRemaining <= 0) {
            clearInterval(timerInterval);
            if (currentIndex < slides.length - 1) {
               goToSlide(currentIndex + 1);
            }
          }
        }, 1000);
      }
    }

    function goNext() {
      goToSlide(Math.min(currentIndex + 1, slides.length - 1));
    }

    function goPrevious() {
      goToSlide(Math.max(currentIndex - 1, 0));
    }

    function ensureFallbackControls() {
      if (slides.length <= 1 || document.querySelector('[data-screen-engine-controls]')) return;

      const controls = document.createElement('div');
      controls.setAttribute('data-screen-engine-controls', 'true');
      controls.style.position = 'fixed';
      controls.style.right = '24px';
      controls.style.bottom = '24px';
      controls.style.zIndex = '2147483647';
      controls.style.display = 'flex';
      controls.style.gap = '10px';
      controls.style.fontFamily = 'system-ui, sans-serif';

      const previous = document.createElement('button');
      previous.type = 'button';
      previous.textContent = '上一页';
      previous.setAttribute('aria-label', '上一页');
      previous.setAttribute('data-screen-prev', 'true');

      const next = document.createElement('button');
      next.type = 'button';
      next.textContent = '下一页';
      next.setAttribute('aria-label', '下一页');
      next.setAttribute('data-screen-next', 'true');

      [previous, next].forEach((button) => {
        button.style.border = '1px solid rgba(255,255,255,0.55)';
        button.style.borderRadius = '999px';
        button.style.background = 'rgba(15,23,42,0.78)';
        button.style.color = 'rgb(248,250,252)';
        button.style.fontSize = '16px';
        button.style.fontWeight = '700';
        button.style.padding = '10px 16px';
        button.style.cursor = 'pointer';
      });

      controls.append(previous, next);
      document.body.appendChild(controls);

      previous.addEventListener('click', goPrevious);
      next.addEventListener('click', goNext);
    }

    // 绑定开始按钮
    const startButtons = document.querySelectorAll('.start-button');
    startButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        if (currentIndex === 0) {
          if (slides.length > 1) {
            goToSlide(1);
          } else {
            btn.style.transition = 'opacity 0.3s';
            btn.style.opacity = '0';
            btn.style.pointerEvents = 'none';
            goToSlide(0);
          }
        }
      });
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault();
        goNext();
      }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        goPrevious();
      }
    });
    ensureFallbackControls();
    document.querySelectorAll('[data-screen-next]').forEach(btn => {
      btn.addEventListener('click', goNext);
    });
    document.querySelectorAll('[data-screen-prev]').forEach(btn => {
      btn.addEventListener('click', goPrevious);
    });
    goToSlide(0);
  });
})();
</script>
`.trim();

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
  const langMatch = HTML_LANG_REGEX.exec(htmlContent);
  return langMatch?.[1]?.trim() || langMatch?.[2]?.trim() || "zh-CN";
}

function addActiveClass(sectionHtml: string) {
  return sectionHtml.replace(/\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i, (match, doubleQuoted: string, singleQuoted: string) => {
    const className = doubleQuoted ?? singleQuoted ?? "";
    const classes = className.split(/\s+/).filter(Boolean);
    const quote = match.includes("'") ? "'" : "\"";

    if (!classes.includes("active")) {
      classes.push("active");
    }

    return `class=${quote}${classes.join(" ")}${quote}`;
  });
}

function extractPageTitle(sectionHtml: string, pageIndex: number) {
  const titleMatch = H1_REGEX.exec(sectionHtml) ?? H2_REGEX.exec(sectionHtml);
  const title = titleMatch ? stripTags(titleMatch[1] ?? "") : "";

  return title || `第 ${pageIndex + 1} 页`;
}

function extractPageRole(sectionHtml: string) {
  const roleMatch = ROLE_REGEX.exec(sectionHtml);
  return roleMatch?.[1]?.trim() || roleMatch?.[2]?.trim() || undefined;
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
  let finalHtml = html;

  if (/<html\b/i.test(html) && /<body\b/i.test(html)) {
    finalHtml = html.startsWith("<!DOCTYPE html>") ? html : `<!DOCTYPE html>\n${html}`;
  } else {
    finalHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>互动大屏</title>
</head>
<body>
${html}
</body>
</html>`;
  }

  if (!finalHtml.includes("data-screen-engine")) {
    finalHtml = finalHtml.replace(/<\/body>/i, `\n${SCREEN_ENGINE_SCRIPT}\n</body>`);
  }

  return finalHtml;
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

export function createHtmlArtifactPages(
  htmlContent: string,
  options: { allowSinglePageFallback?: boolean } = {},
): HtmlArtifactPage[] {
  const sections = findSectionMatches(htmlContent);

  if (sections.length > 0) {
    return sections.map((section, pageIndex) => buildHtmlArtifactPage(section.sectionHtml, pageIndex));
  }

  if (options.allowSinglePageFallback === false) {
    return [];
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
