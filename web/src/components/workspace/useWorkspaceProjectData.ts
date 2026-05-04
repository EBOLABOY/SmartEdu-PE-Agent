"use client";

import { useState, type Dispatch, type SetStateAction } from "react";

import type {
  PersistedArtifactVersion,
  PersistedProjectSummary,
} from "@/lib/lesson/authoring-contract";

interface UseWorkspaceProjectDataInput {
  initialCurrentProject: PersistedProjectSummary | null;
  initialPersistedVersions: PersistedArtifactVersion[];
  initialProjects: PersistedProjectSummary[];
  projectId: string | null;
}

type ProjectListState = {
  sourceProjects: PersistedProjectSummary[];
  projects: PersistedProjectSummary[];
};

type ProjectArtifactState = {
  currentProject: PersistedProjectSummary | null;
  isArtifactHistoryLoading: boolean;
  persistedVersions: PersistedArtifactVersion[];
  sourceCurrentProject: PersistedProjectSummary | null;
  sourcePersistedVersions: PersistedArtifactVersion[];
  sourceProjectId: string | null;
};

export function useWorkspaceProjectData({
  initialCurrentProject,
  initialPersistedVersions,
  initialProjects,
  projectId,
}: UseWorkspaceProjectDataInput) {
  const [projectListState, setProjectListState] = useState<ProjectListState>(() => ({
    projects: initialProjects,
    sourceProjects: initialProjects,
  }));
  const [projectArtifactState, setProjectArtifactState] = useState<ProjectArtifactState>(() => ({
    currentProject: initialCurrentProject,
    isArtifactHistoryLoading: false,
    persistedVersions: initialPersistedVersions,
    sourceCurrentProject: initialCurrentProject,
    sourcePersistedVersions: initialPersistedVersions,
    sourceProjectId: projectId,
  }));

  const hasProjectListChanged = projectListState.sourceProjects !== initialProjects;
  const hasProjectArtifactSourceChanged =
    projectArtifactState.sourceProjectId !== projectId ||
    projectArtifactState.sourceCurrentProject !== initialCurrentProject ||
    projectArtifactState.sourcePersistedVersions !== initialPersistedVersions;

  if (hasProjectListChanged) {
    setProjectListState({
      projects: initialProjects,
      sourceProjects: initialProjects,
    });
  }

  if (hasProjectArtifactSourceChanged) {
    setProjectArtifactState({
      currentProject: initialCurrentProject,
      isArtifactHistoryLoading: false,
      persistedVersions: initialPersistedVersions,
      sourceCurrentProject: initialCurrentProject,
      sourcePersistedVersions: initialPersistedVersions,
      sourceProjectId: projectId,
    });
  }

  const projects = hasProjectListChanged ? initialProjects : projectListState.projects;
  const currentProject = hasProjectArtifactSourceChanged
    ? initialCurrentProject
    : projectArtifactState.currentProject;
  const persistedVersions = hasProjectArtifactSourceChanged
    ? initialPersistedVersions
    : projectArtifactState.persistedVersions;
  const isArtifactHistoryLoading = hasProjectArtifactSourceChanged
    ? false
    : projectArtifactState.isArtifactHistoryLoading;

  const setProjects: Dispatch<SetStateAction<PersistedProjectSummary[]>> = (value) => {
    setProjectListState((previous) => {
      const currentProjects =
        previous.sourceProjects === initialProjects ? previous.projects : initialProjects;
      const nextProjects =
        typeof value === "function" ? value(currentProjects) : value;

      return {
        projects: nextProjects,
        sourceProjects: initialProjects,
      };
    });
  };

  const setCurrentProject: Dispatch<SetStateAction<PersistedProjectSummary | null>> = (value) => {
    setProjectArtifactState((previous) => {
      const currentValue =
        previous.sourceProjectId === projectId &&
        previous.sourceCurrentProject === initialCurrentProject &&
        previous.sourcePersistedVersions === initialPersistedVersions
          ? previous.currentProject
          : initialCurrentProject;
      const nextCurrentProject =
        typeof value === "function" ? value(currentValue) : value;

      return {
        ...previous,
        currentProject: nextCurrentProject,
        sourceCurrentProject: initialCurrentProject,
        sourcePersistedVersions: initialPersistedVersions,
        sourceProjectId: projectId,
      };
    });
  };

  const setPersistedVersions: Dispatch<SetStateAction<PersistedArtifactVersion[]>> = (value) => {
    setProjectArtifactState((previous) => {
      const currentValue =
        previous.sourceProjectId === projectId &&
        previous.sourceCurrentProject === initialCurrentProject &&
        previous.sourcePersistedVersions === initialPersistedVersions
          ? previous.persistedVersions
          : initialPersistedVersions;
      const nextPersistedVersions =
        typeof value === "function" ? value(currentValue) : value;

      return {
        ...previous,
        persistedVersions: nextPersistedVersions,
        sourceCurrentProject: initialCurrentProject,
        sourcePersistedVersions: initialPersistedVersions,
        sourceProjectId: projectId,
      };
    });
  };

  const setArtifactHistoryLoading: Dispatch<SetStateAction<boolean>> = (value) => {
    setProjectArtifactState((previous) => ({
      ...previous,
      isArtifactHistoryLoading:
        typeof value === "function" ? value(previous.isArtifactHistoryLoading) : value,
      sourceCurrentProject: initialCurrentProject,
      sourcePersistedVersions: initialPersistedVersions,
      sourceProjectId: projectId,
    }));
  };

  return {
    currentProject,
    isArtifactHistoryLoading,
    persistedVersions,
    projects,
    setArtifactHistoryLoading,
    setCurrentProject,
    setPersistedVersions,
    setProjects,
  };
}
