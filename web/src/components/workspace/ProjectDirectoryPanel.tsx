"use client";

import { Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

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
import { StateLoading } from "@/components/ui/state-surface";
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
      <div className="px-3 py-4 text-[13px] text-muted-foreground leading-relaxed">
        <p className="font-medium text-foreground/70">当前账号下还没有可切换的项目</p>
        <p className="mt-1">创建项目后，这里会显示可恢复的工作区列表。</p>
      </div>
    );
  }

  const closeDeleteDialog = () => setPendingDeleteProject(null);

  return (
    <motion.div className="space-y-3" layout>
      <AnimatePresence initial={false}>
        {projects.map((project) => {
          const isActive = project.id === activeProjectId;
          const isDeleting = project.id === deletingProjectId;

          return (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="group relative"
              exit={{ opacity: 0, scale: 0.98, y: -6 }}
              initial={{ opacity: 0, y: 6 }}
              key={project.id}
              layout
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <button
                className={`w-full text-left px-3 py-2.5 rounded-lg text-[13px] leading-snug truncate transition-colors ${
                  isActive
                    ? "bg-muted font-medium text-foreground"
                    : "text-foreground/80 hover:bg-muted/60"
                } ${isDeleting ? "opacity-50 pointer-events-none" : ""}`}
                disabled={isLoading || isDeleting}
                onClick={() => onSelectProject(project)}
                type="button"
              >
                {project.title}
              </button>

              {onDeleteProject ? (
                <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        aria-label={`项目菜单：${project.title}`}
                        className="size-7 rounded-md text-muted-foreground hover:text-foreground"
                        disabled={isLoading || isDeleting}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        {isDeleting ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <MoreHorizontal className="size-3.5" />
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36 rounded-xl p-1.5">
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
                        <Trash2 className="size-3.5" />
                        删除
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ) : null}
            </motion.div>
          );
        })}
      </AnimatePresence>

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
            <DialogTitle>删除历史课时计划？</DialogTitle>
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
    </motion.div>
  );
}
