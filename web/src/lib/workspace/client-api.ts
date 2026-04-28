import type { CompetitionLessonPlan } from "@/lib/competition-lesson-contract";
import { competitionLessonPatchResponseSchema } from "@/lib/competition-lesson-patch";
import {
  artifactVersionsResponseSchema,
  type ArtifactVersionsResponse,
  projectDirectoryResponseSchema,
  projectWorkspaceResponseSchema,
  type ProjectDirectoryResponse,
  type ProjectWorkspaceResponse,
} from "@/lib/lesson-authoring-contract";
import { withSmartEduProjectHeader } from "@/lib/api/smartedu-request-headers";

function getResponseError(payload: unknown, fallback: string) {
  return payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
    ? payload.error
    : fallback;
}

export async function requestArtifactVersions(
  projectId: string,
  signal?: AbortSignal,
): Promise<ArtifactVersionsResponse> {
  const response = await fetch(`/api/projects/${projectId}/artifact-versions`, {
    cache: "no-store",
    signal,
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getResponseError(payload, "读取 Artifact 历史失败。"));
  }

  const parsedPayload = artifactVersionsResponseSchema.safeParse(payload);

  if (!parsedPayload.success) {
    throw new Error("Artifact 历史响应结构不合法。");
  }

  return parsedPayload.data;
}

export async function requestProjectDirectory(
  signal?: AbortSignal,
): Promise<ProjectDirectoryResponse> {
  const response = await fetch("/api/projects", {
    cache: "no-store",
    signal,
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getResponseError(payload, "读取项目目录失败。"));
  }

  const parsedPayload = projectDirectoryResponseSchema.safeParse(payload);

  if (!parsedPayload.success) {
    throw new Error("项目目录响应结构不合法。");
  }

  return parsedPayload.data;
}

export async function requestProjectWorkspace(
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectWorkspaceResponse> {
  const response = await fetch(`/api/projects/${projectId}/workspace`, {
    cache: "no-store",
    signal,
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getResponseError(payload, "读取项目工作区失败。"));
  }

  const parsedPayload = projectWorkspaceResponseSchema.safeParse(payload);

  if (!parsedPayload.success) {
    throw new Error("项目工作区响应结构不合法。");
  }

  return parsedPayload.data;
}

export async function requestCreateProject(title: string): Promise<ProjectWorkspaceResponse> {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ title }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getResponseError(payload, "创建项目失败。"));
  }

  const parsedPayload = projectWorkspaceResponseSchema.safeParse(payload);

  if (!parsedPayload.success) {
    throw new Error("新建项目响应结构不合法。");
  }

  return parsedPayload.data;
}

export async function requestDeleteProject(projectId: string): Promise<ProjectDirectoryResponse> {
  const response = await fetch(`/api/projects/${projectId}`, {
    cache: "no-store",
    method: "DELETE",
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getResponseError(payload, "删除历史教案失败。"));
  }

  const parsedPayload = projectDirectoryResponseSchema.safeParse(payload);

  if (!parsedPayload.success) {
    throw new Error("删除历史教案响应结构不合法。");
  }

  return parsedPayload.data;
}

export async function requestArtifactVersionRestore(
  projectId: string,
  versionId: string,
): Promise<ArtifactVersionsResponse> {
  const response = await fetch(
    `/api/projects/${projectId}/artifact-versions/${versionId}/restore`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
    },
  );
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getResponseError(payload, "恢复 Artifact 版本失败。"));
  }

  const parsedPayload = artifactVersionsResponseSchema.safeParse(payload);

  if (!parsedPayload.success) {
    throw new Error("Artifact 恢复响应结构不合法。");
  }

  return parsedPayload.data;
}

export async function requestCompetitionLessonPatch(input: {
  instruction: string;
  lessonPlan: CompetitionLessonPlan;
  projectId?: string;
}) {
  const response = await fetch("/api/competition-lesson-patches", {
    method: "POST",
    headers: withSmartEduProjectHeader({
      "content-type": "application/json",
    }, input.projectId),
    body: JSON.stringify({
      instruction: input.instruction,
      lessonPlan: input.lessonPlan,
    }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getResponseError(payload, "结构化教案局部修改失败。"));
  }

  const parsedPayload = competitionLessonPatchResponseSchema.safeParse(payload);

  if (!parsedPayload.success) {
    throw new Error("结构化教案局部修改响应结果不合法。");
  }

  return parsedPayload.data;
}

export async function requestSaveLessonArtifactVersion(
  projectId: string,
  input: {
    lessonPlan?: CompetitionLessonPlan;
    summary?: string;
  },
): Promise<ArtifactVersionsResponse> {
  const response = await fetch(`/api/projects/${projectId}/artifact-versions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      lessonPlan: input.lessonPlan,
      summary: input.summary,
    }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getResponseError(payload, "保存教案版本失败。"));
  }

  const parsedPayload = artifactVersionsResponseSchema.safeParse(payload);

  if (!parsedPayload.success) {
    throw new Error("保存教案版本响应结构不合法。");
  }

  return parsedPayload.data;
}
