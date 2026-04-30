import { describe, expect, it } from "vitest";

import type { ArtifactLifecycle, ArtifactSnapshot } from "@/components/ai/artifact-model";
import {
  isSnapshotAcknowledgedByPersistedVersions,
  mergeArtifactLifecycleHistory,
  shouldUsePersistedArtifactState,
} from "@/components/workspace/artifact-source-policy";
import { DEFAULT_COMPETITION_LESSON_PLAN } from "@/lib/competition-lesson-contract";
import type { PersistedArtifactVersion } from "@/lib/lesson-authoring-contract";

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const LESSON_JSON = JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN);
const LIVE_HTML = "<!DOCTYPE html><html lang=\"zh-CN\"><body><h1>Live Screen</h1></body></html>";

function createSnapshot(overrides: Partial<ArtifactSnapshot> = {}): ArtifactSnapshot {
  return {
    id: "live-html",
    stage: "html",
    title: "Live HTML",
    content: LIVE_HTML,
    contentType: "html",
    status: "ready",
    version: 1,
    ...overrides,
  };
}

function createLifecycle(snapshot: ArtifactSnapshot): ArtifactLifecycle {
  return {
    lessonContent: snapshot.stage === "lesson" ? snapshot.content : "",
    html: snapshot.stage === "html" ? snapshot.content : "",
    streamingHtml: "",
    isHtmlStreaming: false,
    htmlPreviewVersionId: snapshot.id,
    lessonPlan: snapshot.lessonPlan,
    status: snapshot.status,
    stage: snapshot.stage,
    activeArtifact: snapshot,
    activeUiHints: [],
    versions: [snapshot],
  };
}

const PERSISTED_LESSON_VERSION: PersistedArtifactVersion = {
  id: "22222222-2222-2222-2222-222222222222",
  artifactId: "33333333-3333-3333-3333-333333333333",
  stage: "lesson",
  title: "Persisted Lesson",
  contentType: "lesson-json",
  content: LESSON_JSON,
  status: "ready",
  protocolVersion: "structured-v1",
  versionNumber: 1,
  createdAt: "2026-04-27T10:00:00.000Z",
  isCurrent: true,
};

const PERSISTED_HTML_VERSION: PersistedArtifactVersion = {
  id: "44444444-4444-4444-4444-444444444444",
  artifactId: "55555555-5555-5555-5555-555555555555",
  stage: "html",
  title: "Persisted HTML",
  contentType: "html",
  content: LIVE_HTML,
  status: "ready",
  protocolVersion: "structured-v1",
  versionNumber: 1,
  createdAt: "2026-04-27T10:01:00.000Z",
  isCurrent: true,
};

describe("artifact-source-policy", () => {
  it("keeps live artifact authoritative until persistence acknowledges it", () => {
    expect(
      shouldUsePersistedArtifactState({
        hasLiveArtifactAuthority: true,
        hasUnacknowledgedLiveArtifact: true,
        isArtifactHistoryLoading: false,
        isArtifactSyncPending: false,
        isLoading: false,
        isWorkspaceLoading: false,
        persistedVersionsLength: 1,
        projectId: PROJECT_ID,
      }),
    ).toBe(false);

    expect(
      isSnapshotAcknowledgedByPersistedVersions(
        createSnapshot(),
        [PERSISTED_LESSON_VERSION],
      ),
    ).toBe(false);
  });

  it("does not let stale persisted lesson hide a completed live html artifact", () => {
    expect(
      shouldUsePersistedArtifactState({
        hasLiveArtifactAuthority: false,
        hasUnacknowledgedLiveArtifact: true,
        isArtifactHistoryLoading: false,
        isArtifactSyncPending: false,
        isLoading: false,
        isWorkspaceLoading: false,
        persistedVersionsLength: 1,
        projectId: PROJECT_ID,
      }),
    ).toBe(false);
  });

  it("allows persisted state after the current live artifact is durable", () => {
    expect(
      isSnapshotAcknowledgedByPersistedVersions(
        createSnapshot(),
        [PERSISTED_LESSON_VERSION, PERSISTED_HTML_VERSION],
      ),
    ).toBe(true);

    expect(
      shouldUsePersistedArtifactState({
        hasLiveArtifactAuthority: false,
        isArtifactHistoryLoading: false,
        isArtifactSyncPending: false,
        isLoading: false,
        isWorkspaceLoading: false,
        persistedVersionsLength: 2,
        projectId: PROJECT_ID,
      }),
    ).toBe(true);
  });

  it("keeps the live active artifact while retaining persisted history rows", () => {
    const liveSnapshot = createSnapshot();
    const persistedSnapshot = createSnapshot({
      id: "persisted-lesson",
      persistedVersionId: PERSISTED_LESSON_VERSION.id,
      stage: "lesson",
      title: "Persisted Lesson",
      content: LESSON_JSON,
      contentType: "lesson-json",
      version: 1,
      isCurrent: true,
    });

    const lifecycle = mergeArtifactLifecycleHistory(
      createLifecycle(liveSnapshot),
      createLifecycle(persistedSnapshot),
    );

    expect(lifecycle.activeArtifact?.id).toBe("live-html");
    expect(lifecycle.html).toBe(LIVE_HTML);
    expect(lifecycle.versions.map((version) => version.id)).toEqual([
      "persisted-lesson",
      "live-html",
    ]);
  });
});
