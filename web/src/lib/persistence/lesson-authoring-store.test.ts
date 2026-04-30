import { beforeEach, describe, expect, it, vi } from "vitest";

import { saveArtifactVersionWithSupabase } from "@/lib/persistence/lesson-authoring-store";
import { DEFAULT_COMPETITION_LESSON_PLAN } from "@/lib/competition-lesson-contract";
import type { StructuredArtifactData } from "@/lib/lesson-authoring-contract";
import type { Database } from "@/lib/supabase/database.types";

const {
  deleteOffloadedArtifactContentMock,
  uploadArtifactContentMock,
} = vi.hoisted(() => ({
  deleteOffloadedArtifactContentMock: vi.fn(),
  uploadArtifactContentMock: vi.fn(),
}));

vi.mock("@/lib/persistence/artifact-content-store", () => ({
  deleteOffloadedArtifactContent: deleteOffloadedArtifactContentMock,
  uploadArtifactContent: uploadArtifactContentMock,
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

function createSupabaseMock(response: {
  data: string | null;
  error: { message: string } | null;
}) {
  return {
    rpc: vi.fn().mockResolvedValue(response),
  } as unknown as {
    rpc: (
      functionName: "create_artifact_version",
      args: Database["public"]["Functions"]["create_artifact_version"]["Args"],
    ) => Promise<{ data: string | null; error: { message: string } | null }>;
  };
}

describe("lesson-authoring-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("在 S3 可用时只向数据库写入元数据指针", async () => {
    uploadArtifactContentMock.mockResolvedValueOnce({
      provider: "s3-compatible",
      bucket: "artifact-bucket",
      objectKey: "projects/p1/versions/v1/lesson.json",
      byteSize: 128,
      checksum: "abc123",
    });
    const supabase = createSupabaseMock({ data: "version-id", error: null });

    await saveArtifactVersionWithSupabase(supabase as never, {
      artifact: BASE_ARTIFACT,
      projectId: "11111111-1111-1111-1111-111111111111",
      requestId: "request-id",
    });

    expect(uploadArtifactContentMock).toHaveBeenCalled();
    expect(supabase.rpc).toHaveBeenCalledWith("create_artifact_version", {
      target_project_id: "11111111-1111-1111-1111-111111111111",
      artifact_stage: "lesson",
      artifact_title: "篮球运球接力",
      artifact_content_type: "lesson-json",
      artifact_content: "",
      artifact_status: "ready",
      artifact_protocol_version: "structured-v1",
      artifact_workflow_trace: {},
      artifact_request_id: "request-id",
      artifact_version_id: expect.any(String),
      artifact_content_storage_provider: "s3-compatible",
      artifact_content_storage_bucket: "artifact-bucket",
      artifact_content_storage_object_key: "projects/p1/versions/v1/lesson.json",
      artifact_content_byte_size: 128,
      artifact_content_checksum: "abc123",
    });
  });

  it("在 S3 不可用时回退为 inline content", async () => {
    uploadArtifactContentMock.mockResolvedValueOnce(null);
    const supabase = createSupabaseMock({ data: "version-id", error: null });

    await saveArtifactVersionWithSupabase(supabase as never, {
      artifact: {
        ...BASE_ARTIFACT,
        stage: "html",
        contentType: "html",
        content: "<!DOCTYPE html><html><body>OK</body></html>",
      },
      projectId: "11111111-1111-1111-1111-111111111111",
      requestId: "request-id",
    });

    expect(supabase.rpc).toHaveBeenCalledWith("create_artifact_version", {
      target_project_id: "11111111-1111-1111-1111-111111111111",
      artifact_stage: "html",
      artifact_title: "互动大屏 Artifact",
      artifact_content_type: "html",
      artifact_content: "<!DOCTYPE html><html><body>OK</body></html>",
      artifact_status: "ready",
      artifact_protocol_version: "structured-v1",
      artifact_workflow_trace: {},
      artifact_request_id: "request-id",
      artifact_version_id: expect.any(String),
      artifact_content_storage_provider: "inline",
    });
  });

  it("优先使用显式 artifact title", async () => {
    uploadArtifactContentMock.mockResolvedValueOnce(null);
    const supabase = createSupabaseMock({ data: "version-id", error: null });

    await saveArtifactVersionWithSupabase(supabase as never, {
      artifact: {
        ...BASE_ARTIFACT,
        title: "教师修订标题",
      },
      projectId: "11111111-1111-1111-1111-111111111111",
      requestId: "request-id",
    });

    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_artifact_version",
      expect.objectContaining({
        artifact_title: "教师修订标题",
      }),
    );
  });

  it("数据库写入失败时会清理已经上传的对象", async () => {
    uploadArtifactContentMock.mockResolvedValueOnce({
      provider: "s3-compatible",
      bucket: "artifact-bucket",
      objectKey: "projects/p1/versions/v1/lesson.json",
      byteSize: 128,
      checksum: "abc123",
    });
    const supabase = createSupabaseMock({
      data: null,
      error: { message: "rpc failed" },
    });

    await expect(
      saveArtifactVersionWithSupabase(supabase as never, {
        artifact: BASE_ARTIFACT,
        projectId: "11111111-1111-1111-1111-111111111111",
        requestId: "request-id",
      }),
    ).rejects.toThrow("rpc failed");

    expect(deleteOffloadedArtifactContentMock).toHaveBeenCalledWith({
      provider: "s3-compatible",
      bucket: "artifact-bucket",
      objectKey: "projects/p1/versions/v1/lesson.json",
      byteSize: 128,
      checksum: "abc123",
    });
  });
});
