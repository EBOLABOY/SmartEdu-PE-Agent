import { describe, expect, it, vi } from "vitest";

import { rewriteArtifactImageUrlsInHtml } from "./artifact/image-html-rewriter";

const ARTIFACT_IMAGE_URL =
  "/api/projects/33333333-3333-3333-3333-333333333333/artifact-images/html-screen-visuals/request-1/01-image.png";

describe("rewriteArtifactImageUrlsInHtml", () => {
  it("rewrites constrained artifact image URLs into replacement URLs", async () => {
    const result = await rewriteArtifactImageUrlsInHtml({
      htmlContent: `<!DOCTYPE html><html><body><img src="${ARTIFACT_IMAGE_URL}" alt="示意图"></body></html>`,
      resolveReplacementUrl: async (source) => `data:image/png;base64,${Buffer.from(source).toString("base64")}`,
    });

    expect(result.rewrittenCount).toBe(1);
    expect(result.warnings).toEqual([]);
    expect(result.html).toContain("data:image/png;base64,");
    expect(result.html).not.toContain(ARTIFACT_IMAGE_URL);
    expect(result.html).toContain('alt="示意图"');
  });

  it("deduplicates repeated artifact fetches by source URL", async () => {
    const resolver = vi.fn(async () => "blob:https://app.example.test/image-1");

    const result = await rewriteArtifactImageUrlsInHtml({
      htmlContent: [
        "<!DOCTYPE html><html><body>",
        `<img src="${ARTIFACT_IMAGE_URL}" alt="图一">`,
        `<img src="${ARTIFACT_IMAGE_URL}" alt="图二">`,
        "</body></html>",
      ].join(""),
      resolveReplacementUrl: resolver,
    });

    expect(resolver).toHaveBeenCalledTimes(1);
    expect(result.rewrittenCount).toBe(2);
    expect(result.warnings).toEqual([]);
  });

  it("keeps original URL and reports a warning when replacement fails", async () => {
    const result = await rewriteArtifactImageUrlsInHtml({
      htmlContent: `<!DOCTYPE html><html><body><img src="${ARTIFACT_IMAGE_URL}" alt="示意图"></body></html>`,
      resolveReplacementUrl: async () => {
        throw new Error("403 Forbidden");
      },
    });

    expect(result.rewrittenCount).toBe(0);
    expect(result.warnings).toEqual([
      `受控图片资源改写失败：${ARTIFACT_IMAGE_URL}（403 Forbidden）`,
    ]);
    expect(result.html).toContain(ARTIFACT_IMAGE_URL);
  });

  it("ignores non-artifact image sources", async () => {
    const resolver = vi.fn(async () => "data:image/png;base64,AA==");

    const result = await rewriteArtifactImageUrlsInHtml({
      htmlContent: '<!DOCTYPE html><html><body><img src="https://example.com/demo.png" alt="外链"></body></html>',
      resolveReplacementUrl: resolver,
    });

    expect(resolver).not.toHaveBeenCalled();
    expect(result.rewrittenCount).toBe(0);
    expect(result.warnings).toEqual([]);
    expect(result.html).toContain("https://example.com/demo.png");
  });
});
