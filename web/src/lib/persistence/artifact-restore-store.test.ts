import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ArtifactRestoreError,
  restoreArtifactVersionByProject,
} from "@/lib/persistence/artifact-restore-store";

const { listArtifactVersionsByProjectMock, restoreArtifactVersionInS3ManifestMock } = vi.hoisted(() => ({
  listArtifactVersionsByProjectMock: vi.fn(),
  restoreArtifactVersionInS3ManifestMock: vi.fn(),
}));

vi.mock("@/lib/persistence/artifact-version-history", () => ({
  listArtifactVersionsByProject: listArtifactVersionsByProjectMock,
}));

vi.mock("@/lib/persistence/artifact-version-manifest", () => ({
  restoreArtifactVersionInS3Manifest: restoreArtifactVersionInS3ManifestMock,
}));

describe("artifact-restore-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("只通过 S3 manifest 恢复当前版本指针", async () => {
    const expectedVersions = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        artifactId: "22222222-2222-4222-8222-222222222222",
        stage: "lesson",
        contentType: "lesson-json",
        content: "{}",
        status: "ready",
        protocolVersion: "structured-v1",
        versionNumber: 2,
        createdAt: "2026-05-01T00:00:00.000Z",
        isCurrent: true,
      },
    ];
    const supabase = {
      rpc: vi.fn(() => {
        throw new Error("Supabase artifact RPC should not be called");
      }),
    };
    restoreArtifactVersionInS3ManifestMock.mockResolvedValueOnce(expectedVersions);
    listArtifactVersionsByProjectMock.mockResolvedValueOnce(expectedVersions);

    await expect(
      restoreArtifactVersionByProject(supabase as never, {
        projectId: "project-1",
        versionId: "version-1",
      }),
    ).resolves.toEqual(expectedVersions);

    expect(restoreArtifactVersionInS3ManifestMock).toHaveBeenCalledWith({
      projectId: "project-1",
      versionId: "version-1",
    });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("S3 manifest 不存在时返回中文业务错误", async () => {
    restoreArtifactVersionInS3ManifestMock.mockResolvedValueOnce(null);

    await expect(
      restoreArtifactVersionByProject({} as never, {
        projectId: "project-1",
        versionId: "missing-version",
      }),
    ).rejects.toMatchObject({
      message: "目标 Artifact 版本不存在或 S3 版本清单不可用。",
      status: 404,
    } satisfies Partial<ArtifactRestoreError>);
  });
});
