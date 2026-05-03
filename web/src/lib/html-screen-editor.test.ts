import { describe, expect, it } from "vitest";

import {
  composeHtmlScreenDocument,
  createHtmlArtifactPages,
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

  it("只替换目标页，不改动其他页", () => {
    const updated = replaceHtmlScreenPageInnerHtml({
      htmlContent: SAMPLE_HTML,
      nextInnerHtml: `
        <header class="slide-header">
          <div>
            <h2>修改后的学练页</h2>
          </div>
        </header>
        <main class="slide-content">
          <div class="brief-block"><p>新内容</p></div>
        </main>
      `,
      pageIndex: 1,
    });

    expect(updated).toContain("修改后的学练页");
    expect(updated).toContain("新内容");
    expect(updated).toContain("篮球三步上篮");
    expect(updated).not.toContain("原始内容");
  });

  it("能把独立页面重新组合成完整 HTML 文档", () => {
    const pages = createHtmlArtifactPages(SAMPLE_HTML);
    const remixed = composeHtmlScreenDocument({
      htmlContent: SAMPLE_HTML,
      pages: pages.map((page) =>
        page.pageIndex === 1
          ? {
              ...page,
              sectionHtml: page.sectionHtml.replace("原始内容", "组合后的内容"),
            }
          : page,
      ),
    });

    expect(remixed).toContain("<title>测试大屏</title>");
    expect(remixed).toContain("学练页");
    expect(remixed).toContain("篮球三步上篮");
    expect(remixed).toContain("组合后的内容");
    expect(remixed).not.toContain("原始内容");
    expect(remixed).toContain('<nav class="controls">控件</nav>');
  });
});
