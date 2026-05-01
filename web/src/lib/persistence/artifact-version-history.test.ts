import { beforeEach, describe, expect, it, vi } from "vitest";

import { listArtifactVersionsByProject } from "@/lib/persistence/artifact-version-history";

const { listArtifactVersionsFromS3ManifestMock } = vi.hoisted(() => ({
  listArtifactVersionsFromS3ManifestMock: vi.fn(),
}));

vi.mock("@/lib/persistence/artifact-version-manifest", () => ({
  listArtifactVersionsFromS3Manifest: listArtifactVersionsFromS3ManifestMock,
}));

describe("artifact-version-history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("只从 S3 manifest 读取版本列表", async () => {
    const versions = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        artifactId: "22222222-2222-4222-8222-222222222222",
        stage: "lesson",
        contentType: "lesson-json",
        content: "{}",
        status: "ready",
        protocolVersion: "structured-v1",
        versionNumber: 1,
        createdAt: "2026-05-01T00:00:00.000Z",
        isCurrent: true,
      },
    ];
    listArtifactVersionsFromS3ManifestMock.mockResolvedValueOnce(versions);
    const supabase = {
      from: vi.fn(() => {
        throw new Error("Supabase artifact tables should not be read");
      }),
    };

    await expect(
      listArtifactVersionsByProject(supabase as never, "project-1"),
    ).resolves.toEqual(versions);
    expect(listArtifactVersionsFromS3ManifestMock).toHaveBeenCalledWith("project-1");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("S3 manifest 不存在时返回空版本列表", async () => {
    listArtifactVersionsFromS3ManifestMock.mockResolvedValueOnce(null);

    await expect(
      listArtifactVersionsByProject({} as never, "project-1"),
    ).resolves.toEqual([]);
  });
});
