import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ArtifactRestoreError,
  restoreArtifactVersionByProject,
} from "@/lib/persistence/artifact-restore-store";
import type { Database } from "@/lib/supabase/database.types";

const { listArtifactVersionsByProjectMock } = vi.hoisted(() => ({
  listArtifactVersionsByProjectMock: vi.fn(),
}));

vi.mock("@/lib/persistence/artifact-version-history", () => ({
  listArtifactVersionsByProject: listArtifactVersionsByProjectMock,
}));

function createSupabaseMock(response: {
  data: string | null;
  error: { message: string } | null;
}) {
  return {
    rpc: vi.fn().mockResolvedValue(response),
  } as unknown as {
    rpc: (
      functionName: "restore_artifact_version",
      args: Database["public"]["Functions"]["restore_artifact_version"]["Args"],
    ) => Promise<{ data: string | null; error: { message: string } | null }>;
  };
}

describe("artifact-restore-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("会通过 RPC 恢复版本并回读最新版本列表", async () => {
    const supabase = createSupabaseMock({
      data: "11111111-1111-1111-1111-111111111111",
      error: null,
    });
    const expectedVersions = [
      {
        id: "11111111-1111-1111-1111-111111111111",
        artifactId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        stage: "lesson",
        contentType: "lesson-json",
        content: "{}",
        status: "ready",
        protocolVersion: "structured-v1",
        versionNumber: 2,
        createdAt: "2026-04-25T12:00:00.000Z",
        isCurrent: true,
      },
    ];
    listArtifactVersionsByProjectMock.mockResolvedValueOnce(expectedVersions);

    const versions = await restoreArtifactVersionByProject(supabase as never, {
      projectId: "22222222-2222-2222-2222-222222222222",
      versionId: "11111111-1111-1111-1111-111111111111",
      requestId: "restore-request-id",
    });

    expect(supabase.rpc).toHaveBeenCalledWith("restore_artifact_version", {
      target_project_id: "22222222-2222-2222-2222-222222222222",
      target_version_id: "11111111-1111-1111-1111-111111111111",
      restore_request_id: "restore-request-id",
    });
    expect(listArtifactVersionsByProjectMock).toHaveBeenCalledWith(
      supabase,
      "22222222-2222-2222-2222-222222222222",
    );
    expect(versions).toEqual(expectedVersions);
  });

  it("会把已知 RPC 错误映射为业务错误", async () => {
    const supabase = createSupabaseMock({
      data: null,
      error: { message: "artifact version not found" },
    });

    try {
      await restoreArtifactVersionByProject(supabase as never, {
        projectId: "22222222-2222-2222-2222-222222222222",
        versionId: "11111111-1111-1111-1111-111111111111",
      });
      throw new Error("expected restoreArtifactVersionByProject to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(ArtifactRestoreError);
      expect(error).toMatchObject({
        message: "目标 Artifact 版本不存在或不属于当前项目。",
        status: 404,
      });
    }
  });
});
