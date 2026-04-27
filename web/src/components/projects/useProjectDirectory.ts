"use client";

import { useCallback, useEffect, useState } from "react";

import {
  type PersistenceState,
  type PersistedProjectSummary,
} from "@/lib/lesson-authoring-contract";
import {
  requestDeleteProject,
  requestProjectDirectory,
} from "@/lib/workspace/client-api";

const EMPTY_PROJECTS: PersistedProjectSummary[] = [];
const INITIAL_PERSISTENCE: PersistenceState = {
  enabled: true,
  authenticated: false,
  reason: "loading",
};

export function useProjectDirectory() {
  const [projects, setProjects] = useState<PersistedProjectSummary[]>(EMPTY_PROJECTS);
  const [persistence, setPersistence] = useState<PersistenceState>(INITIAL_PERSISTENCE);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);

    try {
      const payload = await requestProjectDirectory(signal);
      setProjects(payload.projects);
      setPersistence(payload.persistence);
    } catch (directoryError) {
      if (signal?.aborted) {
        return;
      }

      setProjects(EMPTY_PROJECTS);
      setError(
        directoryError instanceof Error
          ? directoryError
          : new Error("读取项目目录失败。"),
      );
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void Promise.resolve().then(() => refresh(controller.signal));

    return () => {
      controller.abort();
    };
  }, [refresh]);

  const deleteProject = useCallback(async (projectId: string) => {
    const payload = await requestDeleteProject(projectId);
    setProjects(payload.projects);
    setPersistence(payload.persistence);
    setError(null);
    return payload.projects;
  }, []);

  return {
    deleteProject,
    error,
    isLoading,
    persistence,
    projects,
    refresh,
  };
}
