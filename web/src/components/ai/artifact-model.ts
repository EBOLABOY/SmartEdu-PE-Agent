import { useMemo } from "react";

import { extractArtifactFromMessage, getMessageText } from "@/lib/artifact-protocol";
import type {
  PersistedArtifactVersion,
  SmartEduUIMessage,
  WorkflowTraceData,
} from "@/lib/lesson-authoring-contract";

export type ArtifactLifecycleStatus = "idle" | "streaming" | "ready" | "editing" | "error";
export type ArtifactStage = "lesson" | "html";

export type ArtifactSnapshot = {
  id: string;
  stage: ArtifactStage;
  title: string;
  content: string;
  status: ArtifactLifecycleStatus;
  version: number;
  artifactId?: string;
  persistedVersionId?: string;
  isCurrent?: boolean;
  createdAt?: string;
  trace?: WorkflowTraceData;
};

export type ArtifactLifecycle = {
  markdown: string;
  html: string;
  status: ArtifactLifecycleStatus;
  stage: ArtifactStage;
  activeArtifact?: ArtifactSnapshot;
  activeTrace?: WorkflowTraceData;
  versions: ArtifactSnapshot[];
};

function resolveSnapshotStatus(
  explicitStatus: "streaming" | "ready" | "error" | undefined,
  fallbackStatus: ArtifactLifecycleStatus,
) {
  if (explicitStatus === "error") {
    return "error";
  }

  if (explicitStatus === "ready") {
    return "ready";
  }

  if (explicitStatus === "streaming") {
    return "streaming";
  }

  return fallbackStatus;
}

export { extractArtifactFromMessage, getMessageText };

function mapPersistedVersionToSnapshot(version: PersistedArtifactVersion): ArtifactSnapshot {
  return {
    id: `persisted-${version.id}`,
    stage: version.stage,
    title:
      version.title ??
      (version.stage === "html"
        ? `大屏版本 ${version.versionNumber}`
        : `教案版本 ${version.versionNumber}`),
    content: version.content,
    status: version.status,
    version: version.versionNumber,
    artifactId: version.artifactId,
    persistedVersionId: version.id,
    isCurrent: version.isCurrent,
    createdAt: version.createdAt,
    trace: version.trace,
  };
}

function findLatestSnapshotByStage(
  versions: ArtifactSnapshot[],
  stage: ArtifactStage,
) {
  const index = versions.findLastIndex((item) => item.stage === stage);
  return index >= 0 ? versions[index] : undefined;
}

function findCurrentPersistedSnapshotByStage(
  versions: ArtifactSnapshot[],
  stage: ArtifactStage,
) {
  const currentVersion = [...versions]
    .reverse()
    .find((item) => item.stage === stage && item.isCurrent);

  if (currentVersion) {
    return currentVersion;
  }

  if (versions.some((item) => item.isCurrent)) {
    return undefined;
  }

  return findLatestSnapshotByStage(versions, stage);
}

export function buildArtifactLifecycle(
  messages: SmartEduUIMessage[],
  chatStatus: string,
  lessonConfirmed: boolean,
  persistedVersions: PersistedArtifactVersion[] = [],
): ArtifactLifecycle {
  const assistantMessages = messages.filter((message) => message.role === "assistant");
  const isStreaming = chatStatus === "submitted" || chatStatus === "streaming";
  const liveVersions: ArtifactSnapshot[] = [];
  const persistedSnapshots = persistedVersions.map((version) =>
    mapPersistedVersionToSnapshot(version),
  );
  let latestTrace: WorkflowTraceData | undefined;

  assistantMessages.forEach((message, index) => {
    const extracted = extractArtifactFromMessage(message);
    const messageId = "id" in message ? String(message.id) : `assistant-${index}`;

    if (extracted.trace) {
      latestTrace = extracted.trace;
    }

    if (extracted.markdown) {
      const version = liveVersions.filter((item) => item.stage === "lesson").length + 1;
      const fallbackStatus: ArtifactLifecycleStatus =
        isStreaming && index === assistantMessages.length - 1 ? "streaming" : "ready";

      liveVersions.push({
        id: `${messageId}-lesson`,
        stage: "lesson",
        title: extracted.title ?? `教案版本 ${version}`,
        content: extracted.markdown,
        status: resolveSnapshotStatus(extracted.status, fallbackStatus),
        version,
        trace: extracted.trace,
      });
    }

    if (extracted.html) {
      const version = liveVersions.filter((item) => item.stage === "html").length + 1;
      const fallbackStatus: ArtifactLifecycleStatus =
        extracted.htmlComplete && !isStreaming ? "ready" : "streaming";

      liveVersions.push({
        id: `${messageId}-html`,
        stage: "html",
        title: extracted.title ?? `大屏版本 ${version}`,
        content: extracted.html,
        status: resolveSnapshotStatus(extracted.status, fallbackStatus),
        version,
        trace: extracted.trace,
      });
    }
  });

  const versions =
    isStreaming
      ? liveVersions
      : persistedSnapshots.length > 0
        ? persistedSnapshots
        : liveVersions;
  const shouldUsePersistedAsActiveSource = !isStreaming && persistedSnapshots.length > 0;

  if (persistedSnapshots.length > 0 && !latestTrace) {
    latestTrace = [...versions].reverse().find((item) => item.trace)?.trace;
  }

  const liveLesson = findLatestSnapshotByStage(liveVersions, "lesson");
  const liveHtml = findLatestSnapshotByStage(liveVersions, "html");
  const persistedLesson = findCurrentPersistedSnapshotByStage(persistedSnapshots, "lesson");
  const persistedHtml = findCurrentPersistedSnapshotByStage(persistedSnapshots, "html");
  const latestLesson = shouldUsePersistedAsActiveSource ? persistedLesson : liveLesson;
  const latestHtml = shouldUsePersistedAsActiveSource ? persistedHtml : liveHtml;
  const liveLessonIndex = liveVersions.findLastIndex((item) => item.stage === "lesson");
  const liveHtmlIndex = liveVersions.findLastIndex((item) => item.stage === "html");
  const shouldPreferHtml = shouldUsePersistedAsActiveSource
    ? Boolean(latestHtml)
    : Boolean(latestHtml) &&
      (lessonConfirmed || (!isStreaming && liveHtmlIndex > liveLessonIndex));
  const activeArtifact = shouldPreferHtml ? latestHtml : latestLesson;

  return {
    markdown: latestLesson?.content ?? "",
    html: shouldPreferHtml ? latestHtml?.content ?? "" : "",
    status: activeArtifact?.status ?? (isStreaming ? "streaming" : "idle"),
    stage: shouldPreferHtml ? "html" : "lesson",
    activeArtifact,
    activeTrace: activeArtifact?.trace ?? latestTrace,
    versions,
  };
}

export function useArtifactLifecycle(
  messages: SmartEduUIMessage[],
  chatStatus: string,
  lessonConfirmed: boolean,
  persistedVersions: PersistedArtifactVersion[] = [],
): ArtifactLifecycle {
  return useMemo(
    () => buildArtifactLifecycle(messages, chatStatus, lessonConfirmed, persistedVersions),
    [chatStatus, lessonConfirmed, messages, persistedVersions],
  );
}
