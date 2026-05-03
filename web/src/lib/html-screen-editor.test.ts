import { describe, expect, it } from "vitest";

import {
  createHtmlArtifactPages,
  ensureCompleteHtmlDocument,
  extractHtmlScreenPages,
  replaceHtmlScreenPageInnerHtml,
} from "@/lib/html-screen-editor";

const SAMPLE_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>测试大屏</title>
</head>
<body>
  <div class="screen">
    <section class="slide cover-slide active" data-slide-kind="cover" data-duration="0">
      <main class="cover-shell">
        <div class="cover-content">
          <h1>篮球三步上篮</h1>
        </div>
      </main>
    </section>
    <section class="slide lesson-slide" data-slide-kind="learnPractice" data-duration="360">
      <header class="slide-header">
        <div>
          <h2>学练页</h2>
        </div>
      </header>
      <main class="slide-content">
        <div class="brief-block"><p>原始内容</p></div>
      </main>
    </section>
    <nav class="controls">控件</nav>
  </div>
</body>
</html>`;

describe("html-screen-editor", () => {
  it("能从完整 HTML 中提取分页信息", () => {
    const pages = extractHtmlScreenPages(SAMPLE_HTML);

    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({
      pageIndex: 0,
      pageRole: "cover",
      pageTitle: "篮球三步上篮",
    });
    expect(pages[1]).toMatchObject({
      pageIndex: 1,
      pageRole: "learnPractice",
      pageTitle: "学练页",
    });
    expect(pages[0]?.previewHtml).toContain("data-editor-preview");
  });

  it("将无 slide 的单页 HTML 作为一个可预览页面", () => {
    const singlePageHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>单页大屏</title>
</head>
<body>
  <main data-html-screen-document="single-page">
    <h1>篮球三步上篮单页总览</h1>
  </main>
</body>
</html>`;

    const pages = extractHtmlScreenPages(singlePageHtml);

    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({
      pageIndex: 0,
      pageRole: "singlePage",
      pageTitle: "单页大屏",
    });
    expect(pages[0]?.sectionHtml).toContain('data-html-screen-document="single-page"');
    expect(pages[0]?.previewHtml).toContain("篮球三步上篮单页总览");
  });

  it("严格模式不会把无 slide 的单页 HTML 当作新生成分页结果", () => {
    const pages = createHtmlArtifactPages(
      `<!DOCTYPE html><html lang="zh-CN"><head><title>单页</title></head><body><main data-html-screen-document="single-page"><h1>单页</h1></main></body></html>`,
      { allowSinglePageFallback: false },
    );

    expect(pages).toHaveLength(0);
  });

  it("能识别单引号 class 和 data-slide-kind 的分页", () => {
    const pages = createHtmlArtifactPages(`<!DOCTYPE html>
<html lang='zh-CN'>
<head><title>单引号大屏</title></head>
<body>
  <section class='slide cover-slide' data-slide-kind='cover'><h1>首页</h1></section>
  <section data-slide-kind='learnPractice' class='lesson-slide slide'><h2>学练</h2></section>
</body>
</html>`);

    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({
      pageRole: "cover",
      pageTitle: "首页",
    });
    expect(pages[1]).toMatchObject({
      pageRole: "learnPractice",
      pageTitle: "学练",
    });
  });

  it("完整 HTML 会注入通用大屏翻页引擎", () => {
    const html = ensureCompleteHtmlDocument(`<section class="slide"><h1>首页</h1></section>`);

    expect(html).toContain("data-screen-engine");
    expect(html).toContain("data-screen-engine-controls");
    expect(html).toContain("ArrowRight");
  });

  it("能替换单页 HTML 的 main 内部内容", () => {
    const singlePageHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head><title>单页大屏</title></head>
<body><main data-html-screen-document="single-page"><h1>旧内容</h1></main></body>
</html>`;

    const updated = replaceHtmlScreenPageInnerHtml({
      htmlContent: singlePageHtml,
      nextInnerHtml: "<h1>新内容</h1>",
      pageIndex: 0,
    });

    expect(updated).toContain('<main data-html-screen-document="single-page">');
    expect(updated).toContain("新内容");
    expect(updated).not.toContain("旧内容");
  });
});
