"use client";

import { FolderOpen } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { SelectableSurface, StateLoading, StateNotice } from "@/components/ui/state-surface";
import type { PersistedProjectSummary } from "@/lib/lesson-authoring-contract";

interface ProjectDirectoryPanelProps {
  activeProjectId?: string | null;
  isLoading: boolean;
  projects: PersistedProjectSummary[];
  onSelectProject: (project: PersistedProjectSummary) => void;
}

export default function ProjectDirectoryPanel({
  activeProjectId,
  isLoading,
  projects,
  onSelectProject,
}: ProjectDirectoryPanelProps) {
  if (isLoading) {
    return <StateLoading label="正在读取项目目录..." />;
  }

  if (!projects.length) {
    return (
      <StateNotice
        description="创建项目后，这里会显示可恢复的工作区列表。"
        icon={FolderOpen}
        title="当前账号下还没有可切换的项目"
      />
    );
  }

  return (
    <div className="space-y-3">
      {projects.map((project) => {
        const isActive = project.id === activeProjectId;

        return (
          <SelectableSurface
            active={isActive}
            disabled={isLoading}
            key={project.id}
            onClick={() => onSelectProject(project)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{project.title}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  市场：{project.market}
                </p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  最近更新：{new Date(project.updatedAt).toLocaleString("zh-CN")}
                </p>
              </div>
              {isActive ? <Badge variant="success">当前项目</Badge> : null}
            </div>
          </SelectableSurface>
        );
      })}
    </div>
  );
}
