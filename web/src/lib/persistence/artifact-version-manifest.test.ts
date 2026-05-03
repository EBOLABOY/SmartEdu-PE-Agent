import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_COMPETITION_LESSON_PLAN } from "@/lib/competition-lesson-contract";
import type { StructuredArtifactData } from "@/lib/lesson-authoring-contract";

import {
  listArtifactVersionsFromS3Manifest,
  restoreArtifactVersionInS3Manifest,
  saveArtifactVersionToS3Manifest,
} from "./artifact-version-manifest";

const {
  getS3ObjectStorageConfigMock,
  getS3ObjectTextMock,
  putS3ObjectMock,
  uploadArtifactContentMock,
} = vi.hoisted(() => ({
  getS3ObjectStorageConfigMock: vi.fn(),
  getS3ObjectTextMock: vi.fn(),
  putS3ObjectMock: vi.fn(),
  uploadArtifactContentMock: vi.fn(),
}));

vi.mock("@/lib/s3/object-storage-config", () => ({
  getS3ObjectStorageConfig: getS3ObjectStorageConfigMock,
}));

vi.mock("@/lib/s3/s3-rest-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/s3/s3-rest-client")>(
    "@/lib/s3/s3-rest-client",
  );

  return {
    ...actual,
    getS3ObjectText: getS3ObjectTextMock,
    putS3Object: putS3ObjectMock,
  };
});

vi.mock("./artifact-content-store", () => ({
  uploadArtifactContent: uploadArtifactContentMock,
}));

const CONFIG = {
  accessKeyId: "access-key",
  bucket: "artifact-bucket",
  endpoint: "https://s3.example.com",
  region: "us-east-1",
  secretAccessKey: "secret-key",
};
const PROJECT_ID = "33333333-3333-3333-3333-333333333333";
const LESSON_CONTENT = JSON.stringify({
  ...DEFAULT_COMPETITION_LESSON_PLAN,
  title: "篮球运球接力",
});
const HTML_ARTIFACT: StructuredArtifactData = {
  content: `<!DOCTYPE html>
<html lang="zh-CN">
  <head><title>篮球运球接力</title></head>
  <body>
    <div class="screen">
      <section class="slide cover-slide active" data-slide-kind="cover">
        <main class="cover-shell"><h1>篮球运球接力</h1></main>
      </section>
    </div>
  </body>
</html>`,
  contentType: "html",
  htmlPages: [
    {
      pageIndex: 0,
      pageRole: "cover",
      pageTitle: "篮球运球接力",
      sectionHtml:
        '<section class="slide cover-slide active" data-slide-kind="cover"><main class="cover-shell"><h1>篮球运球接力</h1></main></section>',
    },
  ],
  isComplete: true,
  protocolVersion: "structured-v1",
  source: "data-part",
  stage: "html",
  status: "ready",
  title: "篮球运球接力大屏",
  updatedAt: "2026-05-01T00:00:00.000Z",
};
const ARTIFACT: StructuredArtifactData = {
  content: LESSON_CONTENT,
  contentType: "lesson-json",
  isComplete: true,
  protocolVersion: "structured-v1",
  source: "data-part",
  stage: "lesson",
  status: "ready",
  title: "篮球运球接力",
  updatedAt: "2026-05-01T00:00:00.000Z",
};

describe("artifact-version-manifest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getS3ObjectStorageConfigMock.mockReturnValue(CONFIG);
  });

  it("saves artifact content and version metadata only to S3", async () => {
    getS3ObjectTextMock.mockRejectedValueOnce(
      new (await import("@/lib/s3/s3-rest-client")).S3ObjectNotFoundError("not found", {
        bucket: "artifact-bucket",
        key: `projects/${PROJECT_ID}/versions/manifest.json`,
        method: "GET",
        responseText: "",
        status: 404,
        statusText: "Not Found",
      }),
    );
    uploadArtifactContentMock.mockResolvedValueOnce({
      bucket: "artifact-bucket",
      byteSize: 128,
      checksum: "abc123",
      objectKey: `projects/${PROJECT_ID}/versions/version-1/lesson.json`,
      provider: "s3-compatible",
    });

    await saveArtifactVersionToS3Manifest({
      artifact: ARTIFACT,
      projectId: PROJECT_ID,
    });

    expect(uploadArtifactContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: LESSON_CONTENT,
        projectId: PROJECT_ID,
        stage: "lesson",
      }),
    );
    expect(putS3ObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("篮球运球接力"),
        key: `projects/${PROJECT_ID}/versions/manifest.json`,
      }),
    );
  });

  it("serializes concurrent saves per project before reading and writing the manifest", async () => {
    let firstUploadCanFinish: (() => void) | undefined;
    const firstUploadStarted = new Promise<void>((resolve) => {
      uploadArtifactContentMock.mockImplementationOnce(
        () =>
          new Promise((uploadResolve) => {
            resolve();
            firstUploadCanFinish = () => {
              uploadResolve({
                bucket: "artifact-bucket",
                byteSize: 128,
                checksum: "first",
                objectKey: `projects/${PROJECT_ID}/versions/version-1/lesson.json`,
                provider: "s3-compatible",
              });
            };
          }),
      );
    });

    getS3ObjectTextMock
      .mockRejectedValueOnce(
        new (await import("@/lib/s3/s3-rest-client")).S3ObjectNotFoundError("not found", {
          bucket: "artifact-bucket",
          key: `projects/${PROJECT_ID}/versions/manifest.json`,
          method: "GET",
          responseText: "",
          status: 404,
          statusText: "Not Found",
        }),
      )
      .mockImplementationOnce(async () => {
        const firstWrittenManifest = JSON.parse(putS3ObjectMock.mock.calls[0][0].body);
        return JSON.stringify(firstWrittenManifest);
      });
    uploadArtifactContentMock.mockResolvedValueOnce({
      bucket: "artifact-bucket",
      byteSize: 128,
      checksum: "second",
      objectKey: `projects/${PROJECT_ID}/versions/version-2/lesson.json`,
      provider: "s3-compatible",
    });

    const firstSave = saveArtifactVersionToS3Manifest({
      artifact: ARTIFACT,
      projectId: PROJECT_ID,
    });
    await firstUploadStarted;

    const secondSave = saveArtifactVersionToS3Manifest({
      artifact: {
        ...ARTIFACT,
        title: "篮球运球接力二",
      },
      projectId: PROJECT_ID,
    });

    expect(getS3ObjectTextMock).toHaveBeenCalledTimes(1);
    firstUploadCanFinish?.();

    await Promise.all([firstSave, secondSave]);

    const finalManifest = JSON.parse(putS3ObjectMock.mock.calls[1][0].body);
    expect(getS3ObjectTextMock).toHaveBeenCalledTimes(2);
    expect(finalManifest.versions).toHaveLength(2);
    expect(finalManifest.versions.map((version: { versionNumber: number }) => version.versionNumber)).toEqual([
      1,
      2,
    ]);
  });

  it("lists hydrated versions from the S3 manifest", async () => {
    getS3ObjectTextMock
      .mockResolvedValueOnce(
        JSON.stringify({
          currentByStage: { lesson: "11111111-1111-1111-1111-111111111111" },
          projectId: PROJECT_ID,
          schemaVersion: 1,
          updatedAt: "2026-05-01T00:00:00.000Z",
          versions: [
            {
              artifactId: "11111111-3333-3333-3333-333333333333",
              contentObjectKey: `projects/${PROJECT_ID}/versions/version-1/lesson.json`,
              contentStorageBucket: "artifact-bucket",
              contentStorageProvider: "s3-compatible",
              contentType: "lesson-json",
              createdAt: "2026-05-01T00:00:00.000Z",
              id: "11111111-1111-1111-1111-111111111111",
              isCurrent: true,
              protocolVersion: "structured-v1",
              stage: "lesson",
              status: "ready",
              title: "篮球运球接力",
              versionNumber: 1,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(LESSON_CONTENT);

    const versions = await listArtifactVersionsFromS3Manifest(PROJECT_ID);

    expect(versions?.[0]).toMatchObject({
      content: LESSON_CONTENT,
      isCurrent: true,
      title: "篮球运球接力",
    });
  });

  it("会跳过缺少 htmlPages 的旧版 html version，而不是让整个列表失败", async () => {
    getS3ObjectTextMock
      .mockResolvedValueOnce(
        JSON.stringify({
          currentByStage: { html: "22222222-2222-2222-2222-222222222222" },
          projectId: PROJECT_ID,
          schemaVersion: 1,
          updatedAt: "2026-05-01T00:00:00.000Z",
          versions: [
            {
              artifactId: "11111111-3333-3333-3333-333333333333",
              contentObjectKey: `projects/${PROJECT_ID}/versions/version-1/lesson.json`,
              contentStorageBucket: "artifact-bucket",
              contentStorageProvider: "s3-compatible",
              contentType: "lesson-json",
              createdAt: "2026-05-01T00:00:00.000Z",
              id: "11111111-1111-1111-1111-111111111111",
              isCurrent: true,
              protocolVersion: "structured-v1",
              stage: "lesson",
              status: "ready",
              title: "篮球运球接力",
              versionNumber: 1,
            },
            {
              artifactId: "22222222-3333-3333-3333-333333333333",
              contentObjectKey: `projects/${PROJECT_ID}/versions/version-2/screen.html`,
              contentStorageBucket: "artifact-bucket",
              contentStorageProvider: "s3-compatible",
              contentType: "html",
              createdAt: "2026-05-01T00:01:00.000Z",
              id: "22222222-2222-2222-2222-222222222222",
              isCurrent: true,
              protocolVersion: "structured-v1",
              stage: "html",
              status: "ready",
              title: "旧版大屏",
              versionNumber: 1,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(LESSON_CONTENT)
      .mockResolvedValueOnce("<!DOCTYPE html><html lang=\"zh-CN\"><body>legacy</body></html>");

    const versions = await listArtifactVersionsFromS3Manifest(PROJECT_ID);

    expect(versions).toHaveLength(1);
    expect(versions?.[0]?.stage).toBe("lesson");
  });

  it("会在 manifest 中保留 htmlPages 元数据", async () => {
    getS3ObjectTextMock.mockRejectedValueOnce(
      new (await import("@/lib/s3/s3-rest-client")).S3ObjectNotFoundError("not found", {
        bucket: "artifact-bucket",
        key: `projects/${PROJECT_ID}/versions/manifest.json`,
        method: "GET",
        responseText: "",
        status: 404,
        statusText: "Not Found",
      }),
    );
    uploadArtifactContentMock.mockResolvedValueOnce({
      bucket: "artifact-bucket",
      byteSize: 256,
      checksum: "html-artifact",
      objectKey: `projects/${PROJECT_ID}/versions/version-1/screen.html`,
      provider: "s3-compatible",
    });

    await saveArtifactVersionToS3Manifest({
      artifact: HTML_ARTIFACT,
      projectId: PROJECT_ID,
    });

    const manifest = JSON.parse(putS3ObjectMock.mock.calls.at(-1)?.[0]?.body ?? "{}");

    expect(manifest.versions[0]?.htmlPages).toEqual(HTML_ARTIFACT.htmlPages);
  });

  it("restores current pointers in the S3 manifest", async () => {
    const manifest = {
      currentByStage: { lesson: "11111111-1111-1111-1111-111111111111" },
      projectId: PROJECT_ID,
      schemaVersion: 1,
      updatedAt: "2026-05-01T00:00:00.000Z",
      versions: [
        {
          artifactId: "11111111-3333-3333-3333-333333333333",
          contentObjectKey: "old.json",
          contentStorageBucket: "artifact-bucket",
          contentStorageProvider: "s3-compatible",
          contentType: "lesson-json",
          createdAt: "2026-05-01T00:00:00.000Z",
          id: "11111111-1111-1111-1111-111111111111",
          isCurrent: true,
          protocolVersion: "structured-v1",
          stage: "lesson",
          status: "ready",
          versionNumber: 1,
        },
        {
          artifactId: "11111111-3333-3333-3333-333333333333",
          contentObjectKey: "new.json",
          contentStorageBucket: "artifact-bucket",
          contentStorageProvider: "s3-compatible",
          contentType: "lesson-json",
          createdAt: "2026-05-01T00:01:00.000Z",
          id: "22222222-2222-2222-2222-222222222222",
          isCurrent: false,
          protocolVersion: "structured-v1",
          stage: "lesson",
          status: "ready",
          versionNumber: 2,
        },
      ],
    };
    getS3ObjectTextMock.mockResolvedValueOnce(JSON.stringify(manifest)).mockResolvedValue(LESSON_CONTENT);

    const versions = await restoreArtifactVersionInS3Manifest({
      projectId: PROJECT_ID,
      versionId: "22222222-2222-2222-2222-222222222222",
    });

    const writtenManifest = JSON.parse(putS3ObjectMock.mock.calls[0][0].body);
    expect(writtenManifest.currentByStage.lesson).toBe("22222222-2222-2222-2222-222222222222");
    expect(versions?.find((version) => version.id === "22222222-2222-2222-2222-222222222222")?.isCurrent).toBe(
      true,
    );
  });
});
