import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveArtifactVersionContent: vi.fn(),
}));

vi.mock("./artifact-content-store", () => ({
  resolveArtifactVersionContent: mocks.resolveArtifactVersionContent,
}));

import { resolveRequestedLessonPlan } from "./current-lesson-plan";

function createQuery(result: unknown) {
  return {
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    select: vi.fn().mockReturnThis(),
  };
}

function createSupabaseMock(input: {
  artifactResult?: unknown;
  versionResult?: unknown;
}) {
  const artifactQuery = createQuery(
    input.artifactResult ?? { data: null, error: null },
  );
  const versionQuery = createQuery(
    input.versionResult ?? { data: null, error: null },
  );
  const from = vi.fn((table: string) => {
    if (table === "artifacts") {
      return artifactQuery;
    }

    if (table === "artifact_versions") {
      return versionQuery;
    }

    throw new Error(`unexpected table: ${table}`);
  });

  return {
    artifactQuery,
    from,
    supabase: {
      from,
    },
    versionQuery,
  };
}

describe("current-lesson-plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prefers the explicit lessonPlan from the request body", async () => {
    const { from, supabase } = createSupabaseMock({});

    await expect(
      resolveRequestedLessonPlan({
        explicitLessonPlan: "{\"title\":\"显式课时计划\"}",
        projectId: "project-1",
        supabase: supabase as never,
      }),
    ).resolves.toBe("{\"title\":\"显式课时计划\"}");

    expect(from).not.toHaveBeenCalled();
  });

  it("falls back to the current lesson artifact version when the request omits lessonPlan", async () => {
    const versionRow = {
      content: "",
      content_storage_bucket: "bucket",
      content_storage_object_key: "projects/project-1/versions/version-1/lesson.json",
      content_storage_provider: "cloudflare-r2",
    };
    const { artifactQuery, supabase, versionQuery } = createSupabaseMock({
      artifactResult: {
        data: {
          current_version_id: "version-1",
        },
        error: null,
      },
      versionResult: {
        data: versionRow,
        error: null,
      },
    });
    mocks.resolveArtifactVersionContent.mockResolvedValue("{\"title\":\"持久化课时计划\"}");

    await expect(
      resolveRequestedLessonPlan({
        projectId: "project-1",
        supabase: supabase as never,
      }),
    ).resolves.toBe("{\"title\":\"持久化课时计划\"}");

    expect(artifactQuery.order).toHaveBeenCalledWith("updated_at", { ascending: false });
    expect(versionQuery.eq).toHaveBeenCalledWith("id", "version-1");
    expect(mocks.resolveArtifactVersionContent).toHaveBeenCalledWith(versionRow);
  });

  it("falls back to the latest lesson version when the artifact has no current_version_id", async () => {
    const versionRow = {
      content: "{\"title\":\"最新课时计划\"}",
      content_storage_bucket: null,
      content_storage_object_key: null,
      content_storage_provider: "inline",
    };
    const { versionQuery, supabase } = createSupabaseMock({
      artifactResult: {
        data: {
          current_version_id: null,
        },
        error: null,
      },
      versionResult: {
        data: versionRow,
        error: null,
      },
    });
    mocks.resolveArtifactVersionContent.mockResolvedValue("{\"title\":\"最新课时计划\"}");

    await expect(
      resolveRequestedLessonPlan({
        projectId: "project-1",
        supabase: supabase as never,
      }),
    ).resolves.toBe("{\"title\":\"最新课时计划\"}");

    expect(versionQuery.eq).toHaveBeenCalledWith("project_id", "project-1");
    expect(versionQuery.eq).toHaveBeenCalledWith("stage", "lesson");
    expect(versionQuery.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });
});
