import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_S3_USER_AGENT,
  getS3ObjectStorageConfig,
} from "./object-storage-config";

const BASE_ENV = {
  S3_ACCESS_KEY_ID: "access-key",
  S3_BUCKET: "default-bucket",
  S3_ENDPOINT: "https://s3.example.com",
  S3_REGION: "us-east-1",
  S3_SECRET_ACCESS_KEY: "secret-key",
};

function setBaseS3Env(overrides: Partial<NodeJS.ProcessEnv> = {}) {
  vi.stubEnv("S3_ACCESS_KEY_ID", BASE_ENV.S3_ACCESS_KEY_ID);
  vi.stubEnv("S3_BUCKET", BASE_ENV.S3_BUCKET);
  vi.stubEnv("S3_ENDPOINT", BASE_ENV.S3_ENDPOINT);
  vi.stubEnv("S3_REGION", BASE_ENV.S3_REGION);
  vi.stubEnv("S3_SECRET_ACCESS_KEY", BASE_ENV.S3_SECRET_ACCESS_KEY);

  for (const [key, value] of Object.entries(overrides)) {
    vi.stubEnv(key, value);
  }
}

describe("getS3ObjectStorageConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses S3 Browser as the default User-Agent when S3_USER_AGENT is unset", () => {
    setBaseS3Env();

    expect(getS3ObjectStorageConfig("workspace")).toMatchObject({
      bucket: "default-bucket",
      userAgent: DEFAULT_S3_USER_AGENT,
    });
  });

  it("falls back to the default User-Agent when S3_USER_AGENT is blank", () => {
    setBaseS3Env({ S3_USER_AGENT: "   " });

    expect(getS3ObjectStorageConfig("artifact")).toMatchObject({
      userAgent: DEFAULT_S3_USER_AGENT,
    });
  });

  it("allows S3_USER_AGENT to override the default User-Agent", () => {
    setBaseS3Env({ S3_USER_AGENT: "CustomAgent/1.0" });

    expect(getS3ObjectStorageConfig("export")).toMatchObject({
      userAgent: "CustomAgent/1.0",
    });
  });

  it("uses purpose-specific buckets when they are configured", () => {
    setBaseS3Env({
      S3_ARTIFACT_BUCKET: "artifact-bucket",
      S3_EXPORT_BUCKET: "export-bucket",
      S3_WORKSPACE_BUCKET: "workspace-bucket",
    });

    expect(getS3ObjectStorageConfig("artifact")?.bucket).toBe("artifact-bucket");
    expect(getS3ObjectStorageConfig("export")?.bucket).toBe("export-bucket");
    expect(getS3ObjectStorageConfig("workspace")?.bucket).toBe("workspace-bucket");
  });

  it("returns null when required S3 credentials are missing", () => {
    setBaseS3Env({ S3_SECRET_ACCESS_KEY: "" });

    expect(getS3ObjectStorageConfig("workspace")).toBeNull();
  });
});
