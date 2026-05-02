export const ARTIFACT_IMAGE_KINDS = ["lesson-diagrams", "html-screen-visuals"] as const;

export type ArtifactImageKind = (typeof ARTIFACT_IMAGE_KINDS)[number];

type ArtifactImagePathInput = {
  filename: string;
  kind: ArtifactImageKind;
  projectId: string;
  requestId: string;
};

export class ArtifactImagePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactImagePathError";
  }
}

function encodePathSegment(value: string) {
  return encodeURIComponent(value);
}

function isSafeSegment(value: string) {
  return /^[A-Za-z0-9._-]+$/.test(value) && value !== "." && value !== "..";
}

function assertSafeSegment(value: string, label: string) {
  if (!isSafeSegment(value)) {
    throw new ArtifactImagePathError(`${label} 不合法。`);
  }
}

export function buildArtifactImageObjectKey(input: ArtifactImagePathInput) {
  assertSafeSegment(input.requestId, "图片请求 ID");
  assertSafeSegment(input.filename, "图片文件名");

  return ["projects", input.projectId, input.kind, input.requestId, input.filename].join("/");
}

export function buildArtifactImageProxyUrl(input: ArtifactImagePathInput) {
  assertSafeSegment(input.requestId, "图片请求 ID");
  assertSafeSegment(input.filename, "图片文件名");

  return [
    "",
    "api",
    "projects",
    encodePathSegment(input.projectId),
    "artifact-images",
    input.kind,
    encodePathSegment(input.requestId),
    encodePathSegment(input.filename),
  ].join("/");
}

export function isArtifactImageProxyUrl(value: string | null | undefined) {
  const normalized = (value ?? "").replace(/[\u0000-\u001F\u007F\s]+/g, "").trim();
  const match =
    /^\/api\/projects\/([^/]+)\/artifact-images\/(lesson-diagrams|html-screen-visuals)\/([^/]+)\/([^/]+)$/i.exec(
      normalized,
    );

  if (!match) {
    return false;
  }

  const [, projectId, , requestId, filename] = match;

  return Boolean(projectId) && isSafeSegment(requestId ?? "") && isSafeSegment(filename ?? "");
}

export function parseArtifactImageProxyPath(input: {
  path: string[];
  projectId: string;
}) {
  const [kind, requestId, filename, ...rest] = input.path;

  if (rest.length || !kind || !requestId || !filename) {
    throw new ArtifactImagePathError("图片路径必须包含类型、请求 ID 和文件名。");
  }

  if (!ARTIFACT_IMAGE_KINDS.includes(kind as ArtifactImageKind)) {
    throw new ArtifactImagePathError("图片类型不受支持。");
  }

  return {
    filename,
    kind: kind as ArtifactImageKind,
    objectKey: buildArtifactImageObjectKey({
      filename,
      kind: kind as ArtifactImageKind,
      projectId: input.projectId,
      requestId,
    }),
    requestId,
  };
}
