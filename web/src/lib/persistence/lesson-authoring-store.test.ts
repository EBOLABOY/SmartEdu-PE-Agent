import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_COMPETITION_LESSON_PLAN } from "@/lib/lesson/contract";
import type { StructuredArtifactData } from "@/lib/lesson/authoring-contract";
import { saveArtifactVersionToS3 } from "@/lib/persistence/lesson-authoring-store";

const {
  refreshProjectDirectoryManifestMock,
  saveArtifactVersionToS3ManifestMock,
} = vi.hoisted(() => ({
  refreshProjectDirectoryManifestMock: vi.fn(),
  saveArtifactVersionToS3ManifestMock: vi.fn(),
}));

vi.mock("@/lib/persistence/artifact-version-manifest", () => ({
  saveArtifactVersionToS3Manifest: saveArtifactVersionToS3ManifestMock,
}));

vi.mock("@/lib/persistence/project-workspace-history", () => ({
  refreshProjectDirectoryManifest: refreshProjectDirectoryManifestMock,
}));

const BASE_ARTIFACT: StructuredArtifactData = {
  protocolVersion: "structured-v1",
  stage: "lesson",
  contentType: "lesson-json",
  content: JSON.stringify({
    ...DEFAULT_COMPETITION_LESSON_PLAN,
    title: "篮球运球接力",
  }),
  isComplete: true,
  status: "ready",
  source: "data-part",
  updatedAt: "2026-04-29T00:00:00.000Z",
};

function createSupabaseMock() {
  return {
    rpc: vi.fn(),
  };
}

describe("lesson-authoring-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("只写入 S3 artifact manifest，不访问 Supabase 旧 Artifact 表", async () => {
    saveArtifactVersionToS3ManifestMock.mockResolvedValueOnce("version-id");
    const supabase = createSupabaseMock();

    await saveArtifactVersionToS3(supabase as never, {
      artifact: BASE_ARTIFACT,
      projectId: "11111111-1111-1111-1111-111111111111",
      requestId: "request-id",
      userId: "22222222-2222-2222-2222-222222222222",
    });

    expect(saveArtifactVersionToS3ManifestMock).toHaveBeenCalledWith({
      artifact: BASE_ARTIFACT,
      projectId: "11111111-1111-1111-1111-111111111111",
      trace: undefined,
    });
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(refreshProjectDirectoryManifestMock).toHaveBeenCalledWith(
      supabase,
      "22222222-2222-2222-2222-222222222222",
    );
  });

  it("S3 manifest 写入失败时直接失败，不回退写 Supabase", async () => {
    saveArtifactVersionToS3ManifestMock.mockRejectedValueOnce(new Error("S3 unavailable"));
    const supabase = createSupabaseMock();

    await expect(
      saveArtifactVersionToS3(supabase as never, {
        artifact: BASE_ARTIFACT,
        projectId: "11111111-1111-1111-1111-111111111111",
        requestId: "request-id",
      }),
    ).rejects.toThrow("Artifact 版本只允许写入 S3");

    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(refreshProjectDirectoryManifestMock).not.toHaveBeenCalled();
  });
});
