import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

const PROJECT_ID = "33333333-3333-3333-3333-333333333333";
const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getS3Object: vi.fn(),
  getS3ObjectStorageConfig: vi.fn(),
  hasSupabasePublicEnv: vi.fn(),
  requireProjectWriteAccess: vi.fn(),
}));

vi.mock("@/lib/s3/s3-rest-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/s3/s3-rest-client")>(
    "@/lib/s3/s3-rest-client",
  );

  return {
    ...actual,
    getS3Object: mocks.getS3Object,
  };
});

vi.mock("@/lib/s3/object-storage-config", () => ({
  getS3ObjectStorageConfig: mocks.getS3ObjectStorageConfig,
}));

vi.mock("@/lib/persistence/project-authorization", async () => {
  const actual = await vi.importActual<typeof import("@/lib/persistence/project-authorization")>(
    "@/lib/persistence/project-authorization",
  );

  return {
    ...actual,
    requireProjectWriteAccess: mocks.requireProjectWriteAccess,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
  hasSupabasePublicEnv: mocks.hasSupabasePublicEnv,
}));

function createContext(path: string[] = ["lesson-diagrams", "request-1", "01-image.png"]) {
  return {
    params: Promise.resolve({
      path,
      projectId: PROJECT_ID,
    }),
  };
}

function createSupabase() {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "user-1" } },
        error: null,
      })),
    },
  };
}

describe("artifact image route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasSupabasePublicEnv.mockReturnValue(true);
    mocks.createSupabaseServerClient.mockResolvedValue(createSupabase());
    mocks.requireProjectWriteAccess.mockResolvedValue("organization-1");
    mocks.getS3ObjectStorageConfig.mockReturnValue({
      accessKeyId: "access-key",
      bucket: "artifact-bucket",
      endpoint: "https://s3.example.com",
      region: "us-east-1",
      secretAccessKey: "secret-key",
    });
    mocks.getS3Object.mockResolvedValue({
      body: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      contentLength: "4",
      contentType: "image/png",
    });
  });

  it("serves a constrained S3 artifact image through the app origin", async () => {
    const response = await GET(new Request("https://example.test/image"), createContext());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(response.headers.get("content-length")).toBe("4");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(mocks.requireProjectWriteAccess).toHaveBeenCalledWith(expect.anything(), PROJECT_ID);
    expect(mocks.getS3Object).toHaveBeenCalledWith({
      config: expect.objectContaining({ bucket: "artifact-bucket" }),
      key: "projects/33333333-3333-3333-3333-333333333333/lesson-diagrams/request-1/01-image.png",
    });
  });

  it("rejects invalid image path before reading S3", async () => {
    const response = await GET(
      new Request("https://example.test/image"),
      createContext(["lesson-diagrams", "..", "01-image.png"]),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain("图片请求 ID 不合法");
    expect(mocks.getS3Object).not.toHaveBeenCalled();
  });
});
