import { describe, expect, it } from "vitest";

import {
  ArtifactImagePathError,
  buildArtifactImageObjectKey,
  buildArtifactImageProxyUrl,
  isArtifactImageProxyUrl,
  parseArtifactImageProxyUrl,
  parseArtifactImageProxyPath,
} from "./artifact-image-url";

const PROJECT_ID = "33333333-3333-3333-3333-333333333333";

describe("artifact-image-url", () => {
  it("builds stable app-proxied URLs and matching S3 object keys", () => {
    const input = {
      filename: "01-a1b2c3d4e5f6.png",
      kind: "lesson-diagrams" as const,
      projectId: PROJECT_ID,
      requestId: "request-1",
    };

    expect(buildArtifactImageObjectKey(input)).toBe(
      "projects/33333333-3333-3333-3333-333333333333/lesson-diagrams/request-1/01-a1b2c3d4e5f6.png",
    );
    expect(buildArtifactImageProxyUrl(input)).toBe(
      "/api/projects/33333333-3333-3333-3333-333333333333/artifact-images/lesson-diagrams/request-1/01-a1b2c3d4e5f6.png",
    );
  });

  it("parses route path segments back to the constrained object key", () => {
    expect(
      parseArtifactImageProxyPath({
        path: ["lesson-diagrams", "request-1", "01-a1b2c3d4e5f6.png"],
        projectId: PROJECT_ID,
      }),
    ).toEqual({
      filename: "01-a1b2c3d4e5f6.png",
      kind: "lesson-diagrams",
      objectKey:
        "projects/33333333-3333-3333-3333-333333333333/lesson-diagrams/request-1/01-a1b2c3d4e5f6.png",
      requestId: "request-1",
    });
  });

  it("parses constrained artifact proxy URLs back to object-key coordinates", () => {
    expect(
      parseArtifactImageProxyUrl(
        "/api/projects/33333333-3333-3333-3333-333333333333/artifact-images/html-screen-visuals/request-1/01-image.png",
      ),
    ).toEqual({
      filename: "01-image.png",
      kind: "html-screen-visuals",
      objectKey:
        "projects/33333333-3333-3333-3333-333333333333/html-screen-visuals/request-1/01-image.png",
      projectId: PROJECT_ID,
      requestId: "request-1",
    });
    expect(parseArtifactImageProxyUrl("https://example.com/image.png")).toBeNull();
  });

  it("rejects unsafe or unsupported path segments", () => {
    expect(() =>
      parseArtifactImageProxyPath({
        path: ["lesson-diagrams", "..", "01.png"],
        projectId: PROJECT_ID,
      }),
    ).toThrow(ArtifactImagePathError);
    expect(() =>
      parseArtifactImageProxyPath({
        path: ["other", "request-1", "01.png"],
        projectId: PROJECT_ID,
      }),
    ).toThrow("图片类型不受支持。");
  });

  it("recognizes only constrained app-proxied artifact image URLs", () => {
    expect(
      isArtifactImageProxyUrl(
        "/api/projects/33333333-3333-3333-3333-333333333333/artifact-images/html-screen-visuals/request-1/01-image.png",
      ),
    ).toBe(true);
    expect(isArtifactImageProxyUrl("https://s3.example.com/bucket/projects/demo/image.png")).toBe(false);
    expect(isArtifactImageProxyUrl("/api/projects/demo/other/request-1/01-image.png")).toBe(false);
    expect(isArtifactImageProxyUrl("/api/projects/demo/artifact-images/html-screen-visuals/../01-image.png")).toBe(
      false,
    );
  });
});
