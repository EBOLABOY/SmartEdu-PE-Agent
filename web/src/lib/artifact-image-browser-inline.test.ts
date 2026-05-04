import { afterEach, describe, expect, it, vi } from "vitest";

import {
  blobToDataUrl,
  inlineArtifactImagesForBrowserHtml,
} from "./artifact/image-browser-inline";

const ARTIFACT_IMAGE_URL =
  "/api/projects/33333333-3333-3333-3333-333333333333/artifact-images/html-screen-visuals/request-1/01-image.png";

describe("artifact-image-browser-inline", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("encodes a blob as a data URL", async () => {
    await expect(
      blobToDataUrl({
        blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
      }),
    ).resolves.toBe("data:image/png;base64,AQID");
  });

  it("inlines artifact images through the same browser path used by preview and download", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        headers: {
          "content-type": "image/png",
        },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await inlineArtifactImagesForBrowserHtml({
      htmlContent: `<!DOCTYPE html><html><body><img src="${ARTIFACT_IMAGE_URL}" alt="示意图"></body></html>`,
    });

    expect(fetchMock).toHaveBeenCalledWith(ARTIFACT_IMAGE_URL, {
      credentials: "include",
      signal: undefined,
    });
    expect(result.rewrittenCount).toBe(1);
    expect(result.warnings).toEqual([]);
    expect(result.html).toContain('src="data:image/png;base64,AQID"');
  });

  it("reports a warning when the artifact response is not an image", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("not image", {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        }),
      ),
    );

    const result = await inlineArtifactImagesForBrowserHtml({
      htmlContent: `<!DOCTYPE html><html><body><img src="${ARTIFACT_IMAGE_URL}" alt="示意图"></body></html>`,
    });

    expect(result.rewrittenCount).toBe(0);
    expect(result.warnings).toEqual([
      `受控图片资源改写失败：${ARTIFACT_IMAGE_URL}（unexpected content-type: application/json）`,
    ]);
    expect(result.html).toContain(ARTIFACT_IMAGE_URL);
  });
});
