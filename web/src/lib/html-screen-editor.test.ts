import { describe, expect, it } from "vitest";

import { ensureCompleteHtmlDocument } from "@/lib/html-screen-editor";

describe("html-screen-editor", () => {
  it("完整 HTML 会注入通用大屏翻页引擎", () => {
    const html = ensureCompleteHtmlDocument(`<!DOCTYPE html>
<html lang="zh-CN">
<head><title>测试大屏</title></head>
<body><section class="slide"><h1>首页</h1></section></body>
</html>`);

    expect(html).toContain("data-screen-engine");
    expect(html).toContain("data-screen-engine-controls");
    expect(html).toContain("ArrowRight");
  });

  it("HTML 片段会被包装成完整 UTF-8 文档", () => {
    const html = ensureCompleteHtmlDocument(`<main><h1>互动大屏</h1></main>`);

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain("<main><h1>互动大屏</h1></main>");
  });
});
