import { describe, expect, it } from "vitest";

import {
  injectBrowserSandboxCsp,
  isSandboxAllowedMediaResourceUrl,
} from "./browser-sandbox-html";

describe("injectBrowserSandboxCsp", () => {
  it("injects CSP without requiring a browser DOMParser", () => {
    const html = "<!DOCTYPE html><html><head><title>大屏</title></head><body><script>alert(1)</script></body></html>";

    const securedHtml = injectBrowserSandboxCsp(html);

    expect(securedHtml).toContain('http-equiv="Content-Security-Policy"');
    expect(securedHtml).toContain("connect-src 'none'");
    expect(securedHtml).toContain("img-src data: blob:");
    expect(securedHtml).toContain("<title>大屏</title>");
  });

  it("can authorize app-proxied artifact image paths in CSP", () => {
    const securedHtml = injectBrowserSandboxCsp("<html><head></head><body></body></html>", {
      imageSourceOrigin: "https://app.example.test",
    });

    expect(securedHtml).toContain("img-src data: blob: https://app.example.test/api/projects/");
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

describe("isSandboxAllowedMediaResourceUrl", () => {
  it("allows only inline images and constrained artifact image proxy paths", () => {
    const artifactPath =
      "/api/projects/33333333-3333-3333-3333-333333333333/artifact-images/html-screen-visuals/request-1/01-image.png";

    expect(isSandboxAllowedMediaResourceUrl(artifactPath)).toBe(true);
    expect(isSandboxAllowedMediaResourceUrl("data:image/png;base64,AA==")).toBe(true);
    expect(isSandboxAllowedMediaResourceUrl("blob:https://app.example.test/blob-id")).toBe(true);
    expect(isSandboxAllowedMediaResourceUrl("https://s3.example.com/image.png")).toBe(false);
    expect(isSandboxAllowedMediaResourceUrl("/api/other/image.png")).toBe(false);
  });
});
