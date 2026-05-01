import { describe, expect, it } from "vitest";

import { injectBrowserSandboxCsp } from "./browser-sandbox-html";

describe("injectBrowserSandboxCsp", () => {
  it("injects CSP without requiring a browser DOMParser", () => {
    const html = "<!DOCTYPE html><html><head><title>大屏</title></head><body><script>alert(1)</script></body></html>";

    const securedHtml = injectBrowserSandboxCsp(html);

    expect(securedHtml).toContain('http-equiv="Content-Security-Policy"');
    expect(securedHtml).toContain("connect-src 'none'");
    expect(securedHtml).toContain("<title>大屏</title>");
  });

  it("replaces existing CSP meta tags in server runtime", () => {
    const html = [
      "<html><head>",
      '<meta http-equiv="Content-Security-Policy" content="default-src *">',
      "</head><body>content</body></html>",
    ].join("");

    const securedHtml = injectBrowserSandboxCsp(html);

    expect(securedHtml).not.toContain("default-src *");
    expect(securedHtml.match(/Content-Security-Policy/g)).toHaveLength(1);
  });
});
