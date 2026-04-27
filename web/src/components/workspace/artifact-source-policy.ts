import type { ArtifactLifecycle, ArtifactSnapshot } from "@/components/ai/artifact-model";
import type { PersistedArtifactVersion } from "@/lib/lesson-authoring-contract";

export type ArtifactSourcePolicyInput = {
  hasLiveArtifactAuthority: boolean;
  isArtifactHistoryLoading: boolean;
  isArtifactSyncPending: boolean;
  isLoading: boolean;
  isWorkspaceLoading: boolean;
  persistedVersionsLength: number;
  projectId: string | null;
};

export function shouldUsePersistedArtifactState({
  hasLiveArtifactAuthority,
  isArtifactHistoryLoading,
  isArtifactSyncPending,
  isLoading,
  isWorkspaceLoading,
  persistedVersionsLength,
  projectId,
}: ArtifactSourcePolicyInput) {
  return Boolean(projectId) &&
    persistedVersionsLength > 0 &&
    !hasLiveArtifactAuthority &&
    !isLoading &&
    !isArtifactHistoryLoading &&
    !isWorkspaceLoading &&
    !isArtifactSyncPending;
}

export function isSnapshotAcknowledgedByPersistedVersions(
  snapshot: ArtifactSnapshot | undefined,
  persistedVersions: PersistedArtifactVersion[],
) {
  if (!snapshot || snapshot.status !== "ready") {
    return false;
  }

  const hasCurrentMarkers = persistedVersions.some((version) => version.isCurrent);

  return persistedVersions.some((version) => {
    const isEligibleCurrentVersion = !hasCurrentMarkers || version.isCurrent;

    return isEligibleCurrentVersion &&
      version.stage === snapshot.stage &&
      version.status === "ready" &&
      version.contentType === snapshot.contentType &&
      version.content === snapshot.content;
  });
}

function getSnapshotContentKey(snapshot: ArtifactSnapshot) {
  return [
    "content",
    snapshot.stage,
    snapshot.contentType ?? "unknown",
    snapshot.status,
    snapshot.content,
  ].join("\u0000");
}

function getSnapshotHistoryKeys(snapshot: ArtifactSnapshot) {
  return [
    ...(snapshot.persistedVersionId ? [`persisted:${snapshot.persistedVersionId}`] : []),
    getSnapshotContentKey(snapshot),
  ];
}

export function mergeArtifactLifecycleHistory(
  primary: ArtifactLifecycle,
  history: ArtifactLifecycle,
): ArtifactLifecycle {
  if (history.versions.length === 0) {
    return primary;
  }

  const primaryVersionKeys = new Set(primary.versions.flatMap(getSnapshotHistoryKeys));
  const historyVersions = history.versions.filter(
    (snapshot) => getSnapshotHistoryKeys(snapshot).every((key) => !primaryVersionKeys.has(key)),
  );

  return {
    ...primary,
    versions: [...historyVersions, ...primary.versions],
  };
}
