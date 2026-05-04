/**
 * @module artifact-version-manifest
 * 产物版本清单的 S3 存取。管理 S3 上的版本清单文件，
 * 支持保存、列出、恢复和解析当前教案版本。
 */
import { randomUUID } from "node:crypto";

import {
  type HtmlStructuredArtifactData,
  persistedArtifactVersionSchema,
  type PersistedArtifactVersion,
  type StructuredArtifactData,
  type WorkflowTraceData,
} from "@/lib/lesson/authoring-contract";
import { getS3ObjectStorageConfig } from "@/lib/s3/object-storage-config";
import {
  getS3ObjectText,
  putS3Object,
  S3ObjectNotFoundError,
} from "@/lib/s3/s3-rest-client";

import { uploadArtifactContent } from "./artifact-content-store";

const ARTIFACT_VERSION_MANIFEST_VERSION = 1;

type ArtifactVersionManifestEntry = {
  artifactId: string;
  contentObjectKey: string;
  contentStorageBucket: string;
  contentStorageProvider: "s3-compatible";
  contentType: StructuredArtifactData["contentType"];
  createdAt: string;
  htmlPages?: HtmlStructuredArtifactData["htmlPages"];
  id: string;
  isCurrent: boolean;
  protocolVersion: string;
  stage: StructuredArtifactData["stage"];
  status: StructuredArtifactData["status"];
  title?: string;
  trace?: WorkflowTraceData;
  versionNumber: number;
  warningText?: string;
};

type ArtifactVersionManifest = {
  currentByStage: Partial<Record<StructuredArtifactData["stage"], string>>;
  projectId: string;
  schemaVersion: typeof ARTIFACT_VERSION_MANIFEST_VERSION;
  updatedAt: string;
  versions: ArtifactVersionManifestEntry[];
};

const artifactManifestWriteLocks = new Map<string, Promise<void>>();

async function withArtifactManifestProjectWriteLock<T>(
  projectId: string,
  operation: () => Promise<T>,
) {
  const previousLock = artifactManifestWriteLocks.get(projectId)?.catch(() => undefined) ?? Promise.resolve();
  let releaseCurrentLock: () => void = () => {};
  const currentLock = new Promise<void>((resolve) => {
    releaseCurrentLock = resolve;
  });
  const chainedLock = previousLock.then(() => currentLock);

  artifactManifestWriteLocks.set(projectId, chainedLock);

  try {
    await previousLock;
    return await operation();
  } finally {
    releaseCurrentLock();

    if (artifactManifestWriteLocks.get(projectId) === chainedLock) {
      artifactManifestWriteLocks.delete(projectId);
    }
  }
}

function getArtifactManifestConfig() {
  return getS3ObjectStorageConfig("artifact");
}

function buildArtifactVersionManifestKey(projectId: string) {
  return `projects/${projectId}/versions/manifest.json`;
}

function emptyManifest(projectId: string): ArtifactVersionManifest {
  return {
    currentByStage: {},
    projectId,
    schemaVersion: ARTIFACT_VERSION_MANIFEST_VERSION,
    updatedAt: new Date().toISOString(),
    versions: [],
  };
}

async function readArtifactVersionManifest(projectId: string) {
  const config = getArtifactManifestConfig();

  if (!config) {
    return null;
  }

  try {
    const text = await getS3ObjectText({
      config,
      key: buildArtifactVersionManifestKey(projectId),
    });
    const parsed = JSON.parse(text) as ArtifactVersionManifest;

    if (
      parsed.schemaVersion !== ARTIFACT_VERSION_MANIFEST_VERSION ||
      parsed.projectId !== projectId ||
      !Array.isArray(parsed.versions)
    ) {
      return emptyManifest(projectId);
    }

    return parsed;
  } catch (error) {
    if (error instanceof S3ObjectNotFoundError) {
      return emptyManifest(projectId);
    }

    throw error;
  }
}

async function writeArtifactVersionManifest(manifest: ArtifactVersionManifest) {
  const config = getArtifactManifestConfig();

  if (!config) {
    throw new Error("S3 artifact storage is not configured.");
  }

  await putS3Object({
    body: JSON.stringify(manifest),
    config,
    contentType: "application/json;charset=utf-8",
    key: buildArtifactVersionManifestKey(manifest.projectId),
  });
}

function toArtifactId(projectId: string, stage: StructuredArtifactData["stage"]) {
  const prefix = stage === "lesson" ? "11111111" : "22222222";

  return `${prefix}-${projectId.slice(9)}`;
}

async function hydrateManifestEntry(entry: ArtifactVersionManifestEntry): Promise<PersistedArtifactVersion> {
  const config = getArtifactManifestConfig();

  if (!config) {
    throw new Error("S3 artifact storage is not configured.");
  }

  const content = await getS3ObjectText({
    config: {
      ...config,
      bucket: entry.contentStorageBucket,
    },
    key: entry.contentObjectKey,
  });

  return persistedArtifactVersionSchema.parse({
    artifactId: entry.artifactId,
    content,
    contentType: entry.contentType,
    createdAt: entry.createdAt,
    id: entry.id,
    isCurrent: entry.isCurrent,
    protocolVersion: entry.protocolVersion,
    stage: entry.stage,
    status: entry.status,
    title: entry.title,
    trace: entry.trace,
    versionNumber: entry.versionNumber,
    warningText: entry.warningText,
    ...(entry.stage === "html" ? { htmlPages: entry.htmlPages } : {}),
  });
}

async function hydrateManifestEntries(entries: ArtifactVersionManifestEntry[]) {
  const settled = await Promise.allSettled(entries.map((entry) => hydrateManifestEntry(entry)));

  return settled.flatMap((result, index) => {
    if (result.status === "fulfilled") {
      return [result.value];
    }

    const entry = entries[index];
    console.warn("[artifact-version-manifest] skip-invalid-version", {
      message: result.reason instanceof Error ? result.reason.message : "unknown-error",
      stage: entry?.stage,
      versionId: entry?.id,
    });
    return [];
  });
}

export async function saveArtifactVersionToS3Manifest(input: {
  artifact: StructuredArtifactData;
  projectId: string;
  trace?: WorkflowTraceData;
}) {
  return withArtifactManifestProjectWriteLock(input.projectId, () =>
    saveArtifactVersionToS3ManifestLocked(input),
  );
}

async function saveArtifactVersionToS3ManifestLocked(input: {
  artifact: StructuredArtifactData;
  projectId: string;
  trace?: WorkflowTraceData;
}) {
  const manifest = await readArtifactVersionManifest(input.projectId);

  if (!manifest) {
    throw new Error("S3 artifact storage is not configured.");
  }

  const versionId = randomUUID();
  const offloadedContent = await uploadArtifactContent({
    content: input.artifact.content,
    contentType: input.artifact.contentType,
    projectId: input.projectId,
    stage: input.artifact.stage,
    versionId,
  });

  if (!offloadedContent) {
    throw new Error("S3 artifact storage is not configured.");
  }

  const versionNumber =
    Math.max(
      0,
      ...manifest.versions
        .filter((version) => version.stage === input.artifact.stage)
        .map((version) => version.versionNumber),
    ) + 1;
  const entry: ArtifactVersionManifestEntry = {
    artifactId: toArtifactId(input.projectId, input.artifact.stage),
    contentObjectKey: offloadedContent.objectKey,
    contentStorageBucket: offloadedContent.bucket,
    contentStorageProvider: offloadedContent.provider,
    contentType: input.artifact.contentType,
    createdAt: new Date().toISOString(),
    id: versionId,
    isCurrent: true,
    protocolVersion: input.artifact.protocolVersion,
    stage: input.artifact.stage,
    status: input.artifact.status,
    ...(input.artifact.title ? { title: input.artifact.title } : {}),
    ...(input.trace ? { trace: input.trace } : {}),
    versionNumber,
    ...(input.artifact.warningText ? { warningText: input.artifact.warningText } : {}),
    ...(input.artifact.stage === "html" ? { htmlPages: input.artifact.htmlPages } : {}),
  };

  const versions = manifest.versions.map((version) =>
    version.stage === input.artifact.stage
      ? {
          ...version,
          isCurrent: false,
        }
      : version,
  );

  if (input.artifact.stage === "lesson") {
    versions.forEach((version) => {
      if (version.stage === "html") {
        version.isCurrent = false;
      }
    });
    delete manifest.currentByStage.html;
  }

  versions.push(entry);
  manifest.versions = versions;
  manifest.currentByStage[input.artifact.stage] = versionId;
  manifest.updatedAt = new Date().toISOString();
  await writeArtifactVersionManifest(manifest);

  return entry.id;
}

export async function listArtifactVersionsFromS3Manifest(projectId: string) {
  const manifest = await readArtifactVersionManifest(projectId);

  if (!manifest) {
    return null;
  }

  return hydrateManifestEntries(manifest.versions);
}

export async function restoreArtifactVersionInS3Manifest(input: {
  projectId: string;
  versionId: string;
}) {
  return withArtifactManifestProjectWriteLock(input.projectId, () =>
    restoreArtifactVersionInS3ManifestLocked(input),
  );
}

async function restoreArtifactVersionInS3ManifestLocked(input: {
  projectId: string;
  versionId: string;
}) {
  const manifest = await readArtifactVersionManifest(input.projectId);

  if (!manifest) {
    return null;
  }

  const target = manifest.versions.find((version) => version.id === input.versionId);

  if (!target) {
    return null;
  }

  manifest.versions = manifest.versions.map((version) => ({
    ...version,
    isCurrent: version.stage === target.stage ? version.id === target.id : version.isCurrent,
  }));
  manifest.currentByStage[target.stage] = target.id;

  if (target.stage === "lesson") {
    manifest.versions = manifest.versions.map((version) => ({
      ...version,
      isCurrent: version.stage === "html" ? false : version.isCurrent,
    }));
    delete manifest.currentByStage.html;
  }

  manifest.updatedAt = new Date().toISOString();
  await writeArtifactVersionManifest(manifest);

  return hydrateManifestEntries(manifest.versions);
}

export async function resolveCurrentLessonPlanFromS3Manifest(projectId: string) {
  const manifest = await readArtifactVersionManifest(projectId);

  if (!manifest) {
    return undefined;
  }

  const currentLessonId = manifest.currentByStage.lesson;
  const currentLesson =
    manifest.versions.find((version) => version.id === currentLessonId) ??
    manifest.versions
      .filter((version) => version.stage === "lesson")
      .sort((left, right) => right.versionNumber - left.versionNumber)[0];

  if (!currentLesson) {
    return undefined;
  }

  const version = await hydrateManifestEntry(currentLesson);

  return version.content.trim() ? version.content : undefined;
}
