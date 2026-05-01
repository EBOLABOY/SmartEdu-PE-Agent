import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteS3Object: vi.fn(),
  getS3ObjectStorageConfig: vi.fn(),
  putS3Object: vi.fn(),
}));

vi.mock("@/lib/s3/object-storage-config", () => ({
  getS3ObjectStorageConfig: mocks.getS3ObjectStorageConfig,
}));

vi.mock("@/lib/s3/s3-rest-client", () => ({
  deleteS3Object: mocks.deleteS3Object,
  putS3Object: mocks.putS3Object,
}));

import {
  deleteOffloadedArtifactContent,
  uploadArtifactContent,
} from "./artifact-content-store";

const CONFIG = {
  accessKeyId: "access-key",
  bucket: "artifact-bucket",
  endpoint: "https://s3.example.com",
  region: "us-east-1",
  secretAccessKey: "secret-key",
};

describe("artifact-content-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getS3ObjectStorageConfig.mockReturnValue(CONFIG);
  });

  it("把 Artifact 内容写入 S3-compatible 对象存储", async () => {
    const content = "{\"title\":\"篮球运球\"}";

    const result = await uploadArtifactContent({
      content,
      contentType: "lesson-json",
      projectId: "project-1",
      stage: "lesson",
      versionId: "version-1",
    });

    expect(mocks.putS3Object).toHaveBeenCalledWith(
      expect.objectContaining({
        body: Buffer.from(content, "utf8"),
        config: CONFIG,
        contentType: "application/json;charset=utf-8",
        key: "projects/project-1/versions/version-1/lesson.json",
      }),
    );
    expect(result).toMatchObject({
      bucket: "artifact-bucket",
      objectKey: "projects/project-1/versions/version-1/lesson.json",
      provider: "s3-compatible",
    });
  });

  it("缺少 S3 artifact 配置时返回 null", async () => {
    mocks.getS3ObjectStorageConfig.mockReturnValueOnce(null);

    await expect(
      uploadArtifactContent({
        content: "{}",
        contentType: "lesson-json",
        projectId: "project-1",
        stage: "lesson",
        versionId: "version-1",
      }),
    ).resolves.toBeNull();
  });

  it("删除已写入的 S3 内容", async () => {
    await deleteOffloadedArtifactContent({
      bucket: "artifact-bucket",
      byteSize: 2,
      checksum: "checksum",
      objectKey: "projects/project-1/versions/version-1/html.html",
      provider: "s3-compatible",
    });

    expect(mocks.deleteS3Object).toHaveBeenCalledWith({
      config: CONFIG,
      key: "projects/project-1/versions/version-1/html.html",
    });
  });
});
