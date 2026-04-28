"use client";

import { validateUIMessages } from "ai";
import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import useSWR from "swr";
import { toast } from "sonner";

import {
  type ArtifactVersionsResponse,
  type PersistenceState,
  type PersistedArtifactVersion,
  type PersistedProjectSummary,
  type ProjectWorkspaceResponse,
  type SmartEduUIMessage,
  smartEduDataSchemas,
} from "@/lib/lesson-authoring-contract";
import {
  requestArtifactVersions,
  requestCreateProject,
  requestDeleteProject,
  requestProjectDirectory,
  requestProjectWorkspace,
} from "@/lib/workspace/client-api";

const EMPTY_PERSISTED_VERSIONS: PersistedArtifactVersion[] = [];
const EMPTY_PROJECTS: PersistedProjectSummary[] = [];
const UNKNOWN_PERSISTENCE_STATE: PersistenceState = {
  enabled: true,
  authenticated: false,
  reason: "unknown",
};

interface UseWorkspaceProjectDataInput {
  authRevision: number;
  messagesLength: number;
  projectId: string | null;
  setLessonConfirmed: Dispatch<SetStateAction<boolean>>;
  setMessages: Dispatch<SetStateAction<SmartEduUIMessage[]>>;
}

type RestoredProjectWorkspace = ProjectWorkspaceResponse & {
  restoredMessages: SmartEduUIMessage[];
};

function resolveSetState<T>(nextValue: SetStateAction<T>, currentValue: T) {
  return typeof nextValue === "function"
    ? (nextValue as (value: T) => T)(currentValue)
    : nextValue;
}

async function requestRestoredProjectWorkspace(projectId: string): Promise<RestoredProjectWorkspace> {
  const payload = await requestProjectWorkspace(projectId);
  const restoredMessages = payload.messages.length
    ? await validateUIMessages<SmartEduUIMessage>({
        messages: payload.messages.map((message) => message.uiMessage),
        dataSchemas: smartEduDataSchemas,
      })
    : [];

  return {
    ...payload,
    restoredMessages,
  };
}

function buildArtifactVersionsResponse(
  versions: PersistedArtifactVersion[],
  projectId: string,
  current?: ArtifactVersionsResponse,
): ArtifactVersionsResponse {
  return {
    projectId: current?.projectId ?? projectId,
    versions,
    persistence: current?.persistence ?? UNKNOWN_PERSISTENCE_STATE,
    uiHints: [],
  };
}

export function useWorkspaceProjectData({
  authRevision,
  messagesLength,
  projectId,
  setLessonConfirmed,
  setMessages,
}: UseWorkspaceProjectDataInput) {
  const [currentProjectState, setCurrentProjectState] = useState<PersistedProjectSummary | null>(null);
  const [isArtifactHistoryLoadingState, setIsArtifactHistoryLoadingState] = useState(false);
  const projectDirectoryKey = ["project-directory", authRevision] as const;
  const artifactVersionsKey = projectId ? (["artifact-versions", projectId] as const) : null;
  const projectWorkspaceKey =
    projectId && messagesLength === 0 ? (["project-workspace", projectId] as const) : null;

  const {
    data: projectDirectoryPayload,
    isLoading: isProjectDirectoryLoadingState,
    mutate: mutateProjectDirectory,
  } = useSWR(projectDirectoryKey, () => requestProjectDirectory(), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const {
    data: artifactVersionsPayload,
    isLoading: isArtifactVersionsLoading,
    isValidating: isArtifactVersionsValidating,
    mutate: mutateArtifactVersions,
  } = useSWR(
    artifactVersionsKey,
    ([, targetProjectId]) => requestArtifactVersions(targetProjectId),
    {
      onError: (historyError) => {
        toast.error("历史版本加载失败", {
          description: historyError instanceof Error ? historyError.message : "请稍后重试。",
        });
      },
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );

  const {
    data: projectWorkspacePayload,
    isLoading: isWorkspaceLoadingState,
  } = useSWR(
    projectWorkspaceKey,
    ([, targetProjectId]) => requestRestoredProjectWorkspace(targetProjectId),
    {
      onError: (projectWorkspaceError) => {
        setMessages([]);
        setCurrentProjectState(null);
        toast.error("项目恢复失败", {
          description: projectWorkspaceError instanceof Error ? projectWorkspaceError.message : "请稍后重试。",
        });
      },
      onSuccess: (payload) => {
        setCurrentProjectState(payload.project);
        setMessages(payload.restoredMessages);
        setLessonConfirmed(false);
      },
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );

  const refreshArtifactVersions = useCallback(
    async (
      targetProjectId: string,
      options?: {
        preserveOnError?: boolean;
        silent?: boolean;
        signal?: AbortSignal;
      },
    ) => {
      setIsArtifactHistoryLoadingState(true);

      try {
        const payload = await requestArtifactVersions(targetProjectId, options?.signal);

        if (targetProjectId === projectId) {
          await mutateArtifactVersions(payload, { revalidate: false });
        }

        return payload.versions;
      } catch (historyError) {
        if (options?.signal?.aborted) {
          return null;
        }

        if (!options?.preserveOnError && targetProjectId === projectId) {
          await mutateArtifactVersions(
            (current) => buildArtifactVersionsResponse([], targetProjectId, current),
            { revalidate: false },
          );
        }

        if (!options?.silent) {
          toast.error("历史版本加载失败", {
            description: historyError instanceof Error ? historyError.message : "请稍后重试。",
          });
        }

        return null;
      } finally {
        if (!options?.signal?.aborted) {
          setIsArtifactHistoryLoadingState(false);
        }
      }
    },
    [mutateArtifactVersions, projectId],
  );

  const setPersistedVersions = useCallback(
    (nextValue: SetStateAction<PersistedArtifactVersion[]>) => {
      void mutateArtifactVersions(
        (current) => {
          const nextVersions = resolveSetState(nextValue, current?.versions ?? EMPTY_PERSISTED_VERSIONS);
          return buildArtifactVersionsResponse(nextVersions, projectId ?? "", current);
        },
        { revalidate: false },
      );
    },
    [mutateArtifactVersions, projectId],
  );

  const createPersistentProject = async (title: string) => {
    try {
      const payload = await requestCreateProject(title);
      const nextProject = payload.project;

      setCurrentProjectState(nextProject);
      void mutateProjectDirectory(
        (current) => {
          const restProjects = (current?.projects ?? EMPTY_PROJECTS).filter(
            (project) => project.id !== nextProject.id,
          );

          return {
            projects: [nextProject, ...restProjects],
            persistence: payload.persistence,
          };
        },
        { revalidate: false },
      );

      return nextProject.id;
    } catch (createProjectError) {
      toast.error("项目初始化失败", {
        description:
          createProjectError instanceof Error ? createProjectError.message : "将继续以临时会话模式工作。",
      });
      return null;
    }
  };

  const deletePersistentProject = async (targetProjectId: string) => {
    const payload = await requestDeleteProject(targetProjectId);

    void mutateProjectDirectory(payload, { revalidate: false });
    setCurrentProjectState((project) => (project?.id === targetProjectId ? null : project));

    return payload.projects;
  };

  const projects = projectDirectoryPayload?.projects ?? EMPTY_PROJECTS;
  const projectDirectoryPersistence =
    projectDirectoryPayload?.persistence ?? UNKNOWN_PERSISTENCE_STATE;

  return {
    createPersistentProject,
    deletePersistentProject,
    currentProject:
      currentProjectState ??
      projectWorkspacePayload?.project ??
      (projectId ? projects.find((project) => project.id === projectId) ?? null : null),
    isArtifactHistoryLoading: projectId
      ? isArtifactHistoryLoadingState || isArtifactVersionsLoading || isArtifactVersionsValidating
      : false,
    isProjectDirectoryLoading: isProjectDirectoryLoadingState,
    isWorkspaceLoading: projectId && messagesLength === 0 ? isWorkspaceLoadingState : false,
    persistedVersions: projectId ? artifactVersionsPayload?.versions ?? EMPTY_PERSISTED_VERSIONS : EMPTY_PERSISTED_VERSIONS,
    projectDirectoryPersistence,
    projects,
    refreshArtifactVersions,
    setArtifactHistoryLoading: setIsArtifactHistoryLoadingState,
    setCurrentProject: setCurrentProjectState,
    setPersistedVersions,
  };
}
