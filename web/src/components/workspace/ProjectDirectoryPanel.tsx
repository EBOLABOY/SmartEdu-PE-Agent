"use client";

import { FolderOpen, Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SelectableSurface, StateLoading, StateNotice } from "@/components/ui/state-surface";
import type { PersistedProjectSummary } from "@/lib/lesson-authoring-contract";

interface ProjectDirectoryPanelProps {
  activeProjectId?: string | null;
  deletingProjectId?: string | null;
  isLoading: boolean;
  projects: PersistedProjectSummary[];
  onDeleteProject?: (project: PersistedProjectSummary) => void;
  onSelectProject: (project: PersistedProjectSummary) => void;
}

export default function ProjectDirectoryPanel({
  activeProjectId,
  deletingProjectId,
  isLoading,
  projects,
  onDeleteProject,
  onSelectProject,
}: ProjectDirectoryPanelProps) {
  const [pendingDeleteProject, setPendingDeleteProject] =
    useState<PersistedProjectSummary | null>(null);

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

  const closeDeleteDialog = () => setPendingDeleteProject(null);

  return (
    <div className="space-y-3">
      {projects.map((project) => {
        const isActive = project.id === activeProjectId;
        const isDeleting = project.id === deletingProjectId;

        return (
          <div className="group relative" key={project.id}>
            <SelectableSurface
              active={isActive}
              className="min-w-0 flex-1"
              disabled={isLoading || isDeleting}
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

            {onDeleteProject ? (
              <div className="absolute right-2 top-2 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      aria-label={`打开项目操作菜单：${project.title}`}
                      className="size-8 rounded-full bg-card/95 text-muted-foreground shadow-xs hover:text-foreground"
                      disabled={isLoading || isDeleting}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      {isDeleting ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <MoreHorizontal className="size-4" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44 rounded-2xl p-2">
                    <DropdownMenuItem onSelect={() => onSelectProject(project)}>
                      打开
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault();
                        setPendingDeleteProject(project);
                      }}
                      variant="destructive"
                    >
                      <Trash2 className="size-4" />
                      删除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : null}
          </div>
        );
      })}

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            closeDeleteDialog();
          }
        }}
        open={Boolean(pendingDeleteProject)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除历史教案？</DialogTitle>
            <DialogDescription>
              {pendingDeleteProject
                ? `“${pendingDeleteProject.title}”会从历史列表中隐藏，已保存的版本记录不会被物理清除。`
                : "该项目会从历史列表中隐藏。"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                取消
              </Button>
            </DialogClose>
            <Button
              disabled={!pendingDeleteProject || pendingDeleteProject.id === deletingProjectId}
              onClick={() => {
                if (!pendingDeleteProject || !onDeleteProject) {
                  return;
                }

                onDeleteProject(pendingDeleteProject);
                closeDeleteDialog();
              }}
              type="button"
              variant="destructive"
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
