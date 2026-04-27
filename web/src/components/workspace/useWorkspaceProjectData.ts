"use client";

import { validateUIMessages } from "ai";
import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

import {
  type PersistenceState,
  type PersistedArtifactVersion,
  type PersistedProjectSummary,
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

export function useWorkspaceProjectData({
  authRevision,
  messagesLength,
  projectId,
  setLessonConfirmed,
  setMessages,
}: UseWorkspaceProjectDataInput) {
  const [persistedVersionsState, setPersistedVersionsState] = useState<PersistedArtifactVersion[]>([]);
  const [projectsState, setProjectsState] = useState<PersistedProjectSummary[]>(EMPTY_PROJECTS);
  const [projectDirectoryPersistenceState, setProjectDirectoryPersistenceState] =
    useState<PersistenceState>(UNKNOWN_PERSISTENCE_STATE);
  const [currentProjectState, setCurrentProjectState] = useState<PersistedProjectSummary | null>(null);
  const [isArtifactHistoryLoadingState, setIsArtifactHistoryLoadingState] = useState(
    () => Boolean(projectId),
  );
  const [isWorkspaceLoadingState, setIsWorkspaceLoadingState] = useState(() => Boolean(projectId));
  const [isProjectDirectoryLoadingState, setIsProjectDirectoryLoadingState] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const loadProjectDirectory = async () => {
      setIsProjectDirectoryLoadingState(true);

      try {
        const payload = await requestProjectDirectory(controller.signal);
        setProjectsState(payload.projects);
        setProjectDirectoryPersistenceState(payload.persistence);
      } catch {
        if (controller.signal.aborted) {
          return;
        }

        setProjectsState(EMPTY_PROJECTS);
        setProjectDirectoryPersistenceState(UNKNOWN_PERSISTENCE_STATE);
      } finally {
        if (!controller.signal.aborted) {
          setIsProjectDirectoryLoadingState(false);
        }
      }
    };

    void loadProjectDirectory();

    return () => {
      controller.abort();
    };
  }, [authRevision]);

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
        setPersistedVersionsState(payload.versions);
        return payload.versions;
      } catch (historyError) {
        if (options?.signal?.aborted) {
          return null;
        }

        if (!options?.preserveOnError) {
          setPersistedVersionsState([]);
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
    [],
  );

  useEffect(() => {
    if (!projectId) {
      return;
    }

    const controller = new AbortController();

    void Promise.resolve().then(() =>
      refreshArtifactVersions(projectId, { signal: controller.signal }),
    );

    return () => {
      controller.abort();
    };
  }, [projectId, refreshArtifactVersions]);

  useEffect(() => {
    if (!projectId || messagesLength > 0) {
      return;
    }

    const controller = new AbortController();

    const loadWorkspaceHistory = async () => {
      setIsWorkspaceLoadingState(true);

      try {
        const payload = await requestProjectWorkspace(projectId, controller.signal);
        const restoredMessages = payload.messages.length
          ? await validateUIMessages<SmartEduUIMessage>({
              messages: payload.messages.map((message) => message.uiMessage),
              dataSchemas: smartEduDataSchemas,
            })
          : [];

        setCurrentProjectState(payload.project);
        setMessages(restoredMessages);
        setLessonConfirmed(false);
      } catch (workspaceError) {
        if (controller.signal.aborted) {
          return;
        }

        setMessages([]);
        setCurrentProjectState(null);
        toast.error("项目恢复失败", {
          description: workspaceError instanceof Error ? workspaceError.message : "请稍后重试。",
        });
      } finally {
        if (!controller.signal.aborted) {
          setIsWorkspaceLoadingState(false);
        }
      }
    };

    void loadWorkspaceHistory();

    return () => {
      controller.abort();
    };
  }, [messagesLength, projectId, setLessonConfirmed, setMessages]);

  const createPersistentProject = async (title: string) => {
    try {
      const payload = await requestCreateProject(title);
      const nextProject = payload.project;

      setCurrentProjectState(nextProject);
      setProjectsState((projects) => {
        const restProjects = projects.filter((project) => project.id !== nextProject.id);
        return [nextProject, ...restProjects];
      });

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

    setProjectsState(payload.projects);
    setProjectDirectoryPersistenceState(payload.persistence);
    setCurrentProjectState((project) => (project?.id === targetProjectId ? null : project));

    return payload.projects;
  };

  return {
    createPersistentProject,
    deletePersistentProject,
    currentProject:
      currentProjectState ??
      (projectId ? projectsState.find((project) => project.id === projectId) ?? null : null),
    isArtifactHistoryLoading: projectId ? isArtifactHistoryLoadingState : false,
    isProjectDirectoryLoading: isProjectDirectoryLoadingState,
    isWorkspaceLoading: projectId && messagesLength === 0 ? isWorkspaceLoadingState : false,
    persistedVersions: projectId ? persistedVersionsState : EMPTY_PERSISTED_VERSIONS,
    projectDirectoryPersistence: projectDirectoryPersistenceState,
    projects: projectsState,
    refreshArtifactVersions,
    setArtifactHistoryLoading: setIsArtifactHistoryLoadingState,
    setCurrentProject: setCurrentProjectState,
    setPersistedVersions: setPersistedVersionsState,
  };
}
