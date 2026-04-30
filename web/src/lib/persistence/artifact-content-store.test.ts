import { beforeEach, describe, expect, it, vi } from "vitest";

import type { S3RestConfig } from "@/lib/s3/s3-rest-client";

const mocks = vi.hoisted(() => ({
  getS3ObjectStorageConfig: vi.fn(),
  getS3ObjectText: vi.fn(),
}));

vi.mock("@/lib/s3/object-storage-config", () => ({
  getS3ObjectStorageConfig: mocks.getS3ObjectStorageConfig,
}));

vi.mock("@/lib/s3/s3-rest-client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/s3/s3-rest-client")>();

  return {
    ...actual,
    getS3ObjectText: mocks.getS3ObjectText,
  };
});

import {
  resolveArtifactVersionContent,
  tryResolveArtifactVersionContent,
} from "./artifact-content-store";
import { S3ObjectNotFoundError } from "@/lib/s3/s3-rest-client";

const CONFIG: S3RestConfig = {
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

  it("keeps strict external content reads strict", async () => {
    const error = new S3ObjectNotFoundError("missing", {
      bucket: "artifact-bucket",
      code: "NoSuchKey",
      key: "projects/p1/versions/v1/lesson.json",
      method: "GET",
      responseText: "<Error><Code>NoSuchKey</Code></Error>",
      status: 404,
      statusText: "Not Found",
    });
    mocks.getS3ObjectText.mockRejectedValueOnce(error);

    await expect(
      resolveArtifactVersionContent({
        content: "",
        content_storage_bucket: "artifact-bucket",
        content_storage_object_key: "projects/p1/versions/v1/lesson.json",
        content_storage_provider: "s3-compatible",
      }),
    ).rejects.toBe(error);
  });

  it("returns inline fallback for optional reads when external content is missing", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.getS3ObjectText.mockRejectedValueOnce(
      new S3ObjectNotFoundError("missing", {
        bucket: "artifact-bucket",
        code: "NoSuchKey",
        key: "projects/p1/versions/v1/lesson.json",
        method: "GET",
        responseText: "<Error><Code>NoSuchKey</Code></Error>",
        status: 404,
        statusText: "Not Found",
      }),
    );

    await expect(
      tryResolveArtifactVersionContent({
        content: "{\"title\":\"inline fallback\"}",
        content_storage_bucket: "artifact-bucket",
        content_storage_object_key: "projects/p1/versions/v1/lesson.json",
        content_storage_provider: "s3-compatible",
      }),
    ).resolves.toBe("{\"title\":\"inline fallback\"}");

    expect(warnSpy).toHaveBeenCalledWith(
      "[artifact-content-store] external-content-missing",
      expect.objectContaining({
        bucket: "artifact-bucket",
        key: "projects/p1/versions/v1/lesson.json",
      }),
    );
    warnSpy.mockRestore();
  });
});
