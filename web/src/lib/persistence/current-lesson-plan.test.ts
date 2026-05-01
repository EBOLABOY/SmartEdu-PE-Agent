import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveCurrentLessonPlanFromS3Manifest: vi.fn(),
}));

vi.mock("./artifact-version-manifest", () => ({
  resolveCurrentLessonPlanFromS3Manifest: mocks.resolveCurrentLessonPlanFromS3Manifest,
}));

import { resolveRequestedLessonPlan } from "./current-lesson-plan";

describe("current-lesson-plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveCurrentLessonPlanFromS3Manifest.mockResolvedValue(undefined);
  });

  it("优先使用请求体中显式传入的 lessonPlan", async () => {
    await expect(
      resolveRequestedLessonPlan({
        explicitLessonPlan: "{\"title\":\"显式课时计划\"}",
        projectId: "project-1",
        supabase: {} as never,
      }),
    ).resolves.toBe("{\"title\":\"显式课时计划\"}");

    expect(mocks.resolveCurrentLessonPlanFromS3Manifest).not.toHaveBeenCalled();
  });

  it("从 S3 manifest 读取当前课时计划", async () => {
    mocks.resolveCurrentLessonPlanFromS3Manifest.mockResolvedValueOnce("{\"title\":\"S3课时计划\"}");

    await expect(
      resolveRequestedLessonPlan({
        projectId: "project-1",
        supabase: {} as never,
      }),
    ).resolves.toBe("{\"title\":\"S3课时计划\"}");

    expect(mocks.resolveCurrentLessonPlanFromS3Manifest).toHaveBeenCalledWith("project-1");
  });

  it("没有项目 ID 时不读取任何持久化内容", async () => {
    await expect(
      resolveRequestedLessonPlan({
        supabase: {} as never,
      }),
    ).resolves.toBeUndefined();

    expect(mocks.resolveCurrentLessonPlanFromS3Manifest).not.toHaveBeenCalled();
  });
});
