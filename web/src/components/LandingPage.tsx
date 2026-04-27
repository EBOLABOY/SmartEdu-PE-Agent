"use client";

import {
  ArrowUp,
  Clock3,
  FolderClock,
  History,
  LibraryBig,
  Loader2,
  MoreHorizontal,
  PencilLine,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { motion } from "motion/react";
import React, { useRef, useState } from "react";

import BrandLogo from "@/components/BrandLogo";
import AuthNavActions from "@/components/layout/AuthNavActions";
import ThemeToggle from "@/components/layout/ThemeToggle";
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
import type { PersistedProjectSummary } from "@/lib/lesson-authoring-contract";

interface LandingPageProps {
  recentProject?: PersistedProjectSummary | null;
  onContinueRecent?: () => void;
  onDeleteRecent?: () => void;
  onOpenHistory: () => void;
  isDeletingRecent?: boolean;
  onStart: (query: string) => void;
}

const WORKFLOW_HINTS = [
  { icon: PencilLine, label: "生成结构化教案" },
  { icon: ShieldCheck, label: "保留安全校验" },
  { icon: Clock3, label: "确认后生成大屏" },
];

function formatProjectTime(project: PersistedProjectSummary) {
  return new Date(project.updatedAt).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SidebarButton({
  icon: Icon,
  isActive = false,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  isActive?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex h-11 w-full items-center gap-3 rounded-2xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
        isActive
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
      }`}
      onClick={onClick}
      type="button"
    >
      <Icon className="size-5" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function RecentProjectMoreMenu({
  disabled,
  isDeleting,
  onDelete,
  onOpen,
  project,
}: {
  disabled?: boolean;
  isDeleting?: boolean;
  onDelete?: () => void;
  onOpen?: () => void;
  project: PersistedProjectSummary;
}) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`打开项目操作菜单：${project.title}`}
            className="size-9 shrink-0 rounded-xl text-muted-foreground hover:text-foreground"
            disabled={disabled || isDeleting}
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
          <DropdownMenuItem onSelect={onOpen}>打开</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setIsDeleteDialogOpen(true);
            }}
            variant="destructive"
          >
            <Trash2 className="size-4" />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog onOpenChange={setIsDeleteDialogOpen} open={isDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除历史教案？</DialogTitle>
            <DialogDescription>
              “{project.title}”会从历史列表中隐藏，已保存的版本记录不会被物理清除。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                取消
              </Button>
            </DialogClose>
            <Button
              disabled={!onDelete || isDeleting}
              onClick={() => {
                onDelete?.();
                setIsDeleteDialogOpen(false);
              }}
              type="button"
              variant="destructive"
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Sidebar({
  focusPrompt,
  onOpenHistory,
  onContinueRecent,
  onDeleteRecent,
  isDeletingRecent = false,
  recentProject,
}: {
  focusPrompt: () => void;
  onContinueRecent?: () => void;
  onDeleteRecent?: () => void;
  onOpenHistory: () => void;
  isDeletingRecent?: boolean;
  recentProject?: PersistedProjectSummary | null;
}) {
  return (
    <aside className="hidden h-full w-[260px] shrink-0 flex-col border-r border-border/70 bg-muted/35 p-3 lg:flex">
      <div className="flex h-12 items-center px-2">
        <div className="flex min-w-0 items-center gap-2">
          <BrandLogo className="size-8" priority />
          <span className="truncate text-base font-semibold tracking-[-0.02em] text-foreground">
            跃课
          </span>
        </div>
      </div>

      <nav className="mt-6 space-y-1">
        <SidebarButton icon={PencilLine} isActive label="新教案" onClick={focusPrompt} />
        <SidebarButton icon={History} label="历史教案" onClick={onOpenHistory} />
        <SidebarButton icon={LibraryBig} label="项目中心" onClick={onOpenHistory} />
      </nav>

      <div className="mt-8 space-y-2 px-2">
        <p className="text-xs font-medium text-muted-foreground">最近</p>
        {recentProject ? (
          <div className="flex items-stretch gap-2 rounded-2xl border border-border/80 bg-card p-1">
            <button
              className="min-w-0 flex-1 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isDeletingRecent}
              onClick={onContinueRecent}
              type="button"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <FolderClock className="size-4 text-brand" />
                <span className="truncate">{recentProject.title}</span>
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {formatProjectTime(recentProject)}
              </span>
            </button>
            {onDeleteRecent ? (
              <RecentProjectMoreMenu
                disabled={isDeletingRecent}
                isDeleting={isDeletingRecent}
                onDelete={onDeleteRecent}
                onOpen={onContinueRecent}
                project={recentProject}
              />
            ) : null}
          </div>
        ) : (
          <p className="rounded-2xl border border-border/70 bg-card/70 px-3 py-3 text-xs leading-5 text-muted-foreground">
            登录并生成教案后，这里会显示最近项目。
          </p>
        )}
      </div>

    </aside>
  );
}

function LandingPrompt({
  inputRef,
  isLaunching,
  onLaunch,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  isLaunching: boolean;
  onLaunch: (query: string) => void;
}) {
  const [value, setValue] = useState("");
  const normalizedValue = value.trim();

  return (
    <form
      className="group flex min-h-16 w-full items-center gap-2 rounded-[2rem] border border-border/80 bg-card px-4 py-2 shadow-[0_18px_55px_-42px_rgba(35,35,35,0.38)] transition-colors focus-within:border-brand/45 focus-within:ring-4 focus-within:ring-brand/10"
      onSubmit={(event) => {
        event.preventDefault();
        onLaunch(normalizedValue);
      }}
    >
      <Button
        aria-label="补充课程条件"
        className="shrink-0 rounded-full"
        disabled={isLaunching}
        onClick={() => inputRef.current?.focus()}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Plus className="size-5 text-muted-foreground" />
      </Button>
      <input
        ref={inputRef}
        aria-label="课程主题"
        className="h-12 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isLaunching}
        onChange={(event) => setValue(event.target.value)}
        placeholder="描述你的体育课，例如：三年级篮球运球接力，40人，半场，40分钟"
        type="text"
        value={value}
      />
      <Button
        aria-label="生成教案"
        className="size-10 shrink-0 rounded-full"
        disabled={!normalizedValue || isLaunching}
        size="icon"
        type="submit"
        variant="brand"
      >
        <ArrowUp className="size-5" />
      </Button>
    </form>
  );
}

export default function LandingPage({
  isDeletingRecent,
  recentProject,
  onContinueRecent,
  onDeleteRecent,
  onOpenHistory,
  onStart,
}: LandingPageProps) {
  const [isLaunching, setIsLaunching] = useState(false);
  const promptInputRef = useRef<HTMLInputElement>(null);

  const launchWorkspace = (query: string) => {
    const normalizedQuery = query.trim();

    if (normalizedQuery && !isLaunching) {
      setIsLaunching(true);
      window.setTimeout(() => onStart(normalizedQuery), 180);
    }
  };

  const focusPrompt = () => {
    promptInputRef.current?.focus();
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground antialiased">
      <Sidebar
        focusPrompt={focusPrompt}
        isDeletingRecent={isDeletingRecent}
        onContinueRecent={onContinueRecent}
        onDeleteRecent={onDeleteRecent}
        onOpenHistory={onOpenHistory}
        recentProject={recentProject}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between px-4 md:px-6 lg:justify-end">
          <div className="flex min-w-0 items-center gap-2 lg:hidden">
            <BrandLogo className="size-8 lg:hidden" priority />
            <button
              className="rounded-xl px-2 py-1 text-lg font-semibold tracking-[-0.02em] text-foreground transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              onClick={focusPrompt}
              type="button"
            >
              跃课
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              className="rounded-full"
              onClick={onOpenHistory}
              size="sm"
              type="button"
              variant="outline"
            >
              <History className="size-4" />
              <span className="hidden sm:inline">历史教案</span>
            </Button>
            <ThemeToggle />
            <AuthNavActions accountLabel="账号" accountMode="icon" />
          </div>
        </header>

        <motion.main
          animate={isLaunching ? { opacity: 0, y: -10, scale: 0.99 } : { opacity: 1, y: 0, scale: 1 }}
          className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-12 pt-4"
          transition={{ duration: 0.22, ease: [0.2, 0.85, 0.2, 1] }}
        >
          <section className="w-full max-w-3xl space-y-8 text-center">
            <div className="space-y-3">
              <div className="mx-auto flex size-11 items-center justify-center rounded-2xl border border-border/80 bg-card shadow-xs">
                <BrandLogo className="size-8" priority />
              </div>
              <h1 className="text-3xl font-semibold tracking-[-0.03em] text-foreground md:text-5xl">
                今天准备哪节体育课？
              </h1>
              <p className="mx-auto max-w-xl text-sm leading-6 text-muted-foreground">
                直接描述课程条件，系统会先生成可审阅教案。需要找旧教案时，从历史入口恢复项目和版本。
              </p>
            </div>

            <LandingPrompt
              inputRef={promptInputRef}
              isLaunching={isLaunching}
              onLaunch={launchWorkspace}
            />

            <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
              {WORKFLOW_HINTS.map((item) => {
                const Icon = item.icon;

                return (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full bg-muted/65 px-3 py-1.5"
                    key={item.label}
                  >
                    <Icon className="size-3.5" />
                    {item.label}
                  </span>
                );
              })}
            </div>
          </section>
        </motion.main>
      </div>
    </div>
  );
}
