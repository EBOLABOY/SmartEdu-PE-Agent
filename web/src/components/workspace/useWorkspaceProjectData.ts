"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

import type {
  PersistedArtifactVersion,
  PersistedProjectSummary,
} from "@/lib/lesson-authoring-contract";

interface UseWorkspaceProjectDataInput {
  initialCurrentProject: PersistedProjectSummary | null;
  initialPersistedVersions: PersistedArtifactVersion[];
  initialProjects: PersistedProjectSummary[];
  projectId: string | null;
}

export function useWorkspaceProjectData({
  initialCurrentProject,
  initialPersistedVersions,
  initialProjects,
  projectId,
}: UseWorkspaceProjectDataInput) {
  const [currentProject, setCurrentProject] = useState(initialCurrentProject);
  const [isArtifactHistoryLoading, setArtifactHistoryLoading] = useState(false);
  const [persistedVersions, setPersistedVersions] = useState(initialPersistedVersions);
  const [projects, setProjects] = useState(initialProjects);

  useEffect(() => {
    setProjects(initialProjects);
  }, [initialProjects]);

  useEffect(() => {
    setCurrentProject(initialCurrentProject);
    setPersistedVersions(initialPersistedVersions);
    setArtifactHistoryLoading(false);
  }, [initialCurrentProject, initialPersistedVersions, projectId]);

  return {
    currentProject,
    isArtifactHistoryLoading,
    persistedVersions,
    projects,
    setArtifactHistoryLoading,
    setCurrentProject: setCurrentProject as Dispatch<SetStateAction<PersistedProjectSummary | null>>,
    setPersistedVersions: setPersistedVersions as Dispatch<SetStateAction<PersistedArtifactVersion[]>>,
    setProjects: setProjects as Dispatch<SetStateAction<PersistedProjectSummary[]>>,
  };
}
