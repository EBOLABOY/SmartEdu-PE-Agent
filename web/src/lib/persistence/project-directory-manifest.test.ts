import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildProjectDirectoryManifestKey,
  readProjectDirectoryManifest,
  writeProjectDirectoryManifest,
} from "./project-directory-manifest";

const {
  getS3ObjectStorageConfigMock,
  getS3ObjectTextMock,
  putS3ObjectMock,
} = vi.hoisted(() => ({
  getS3ObjectStorageConfigMock: vi.fn(),
  getS3ObjectTextMock: vi.fn(),
  putS3ObjectMock: vi.fn(),
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

const CONFIG = {
  accessKeyId: "access-key",
  bucket: "workspace-bucket",
  endpoint: "https://s3.example.com",
  region: "us-east-1",
  secretAccessKey: "secret-key",
};

const PROJECT = {
  createdAt: "2026-04-30T00:00:00.000Z",
  id: "11111111-1111-1111-1111-111111111111",
  market: "cn-compulsory-2022",
  title: "篮球运球接力",
  updatedAt: "2026-04-30T00:00:00.000Z",
};

describe("project-directory-manifest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getS3ObjectStorageConfigMock.mockReturnValue(CONFIG);
  });

  it("builds per-user manifest keys", () => {
    expect(
      buildProjectDirectoryManifestKey("22222222-2222-2222-2222-222222222222"),
    ).toBe("users/22222222-2222-2222-2222-222222222222/workspace/projects.json");
  });

  it("reads and validates a project directory manifest from S3", async () => {
    getS3ObjectTextMock.mockResolvedValueOnce(
      JSON.stringify({
        generatedAt: "2026-04-30T00:00:00.000Z",
        projects: [PROJECT],
        schemaVersion: 1,
        userId: "22222222-2222-2222-2222-222222222222",
      }),
    );

    const manifest = await readProjectDirectoryManifest(
      "22222222-2222-2222-2222-222222222222",
    );

    expect(manifest?.projects[0]?.title).toBe("篮球运球接力");
    expect(getS3ObjectTextMock).toHaveBeenCalledWith({
      config: CONFIG,
      key: "users/22222222-2222-2222-2222-222222222222/workspace/projects.json",
    });
  });

  it("writes project directory manifests to S3", async () => {
    await writeProjectDirectoryManifest({
      projects: [PROJECT],
      userId: "22222222-2222-2222-2222-222222222222",
    });

    expect(putS3ObjectMock).toHaveBeenCalledWith({
      body: expect.stringContaining("篮球运球接力"),
      config: CONFIG,
      contentType: "application/json;charset=utf-8",
      key: "users/22222222-2222-2222-2222-222222222222/workspace/projects.json",
    });
  });
});
