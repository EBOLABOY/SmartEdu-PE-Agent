"use client";

import { ArrowLeft, FolderOpen, Plus, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import BrandLogo from "@/components/BrandLogo";
import AuthNavActions from "@/components/layout/AuthNavActions";
import ThemeToggle from "@/components/layout/ThemeToggle";
import ProjectDirectoryPanel from "@/components/workspace/ProjectDirectoryPanel";
import { Button, buttonVariants } from "@/components/ui/button";
import { StateLoading, StateNotice, StateSurface } from "@/components/ui/state-surface";
import { cn } from "@/lib/utils";

import { useProjectDirectory } from "./useProjectDirectory";

function DirectoryStateNotice({
  action,
  description,
  title,
  tone = "neutral",
}: {
  action: ReactNode;
  description: string;
  title: string;
  tone?: "brand" | "danger" | "neutral" | "plain";
}) {
  return (
    <StateNotice
      action={action}
      className="max-w-xl"
      description={description}
      icon={tone === "danger" ? ShieldAlert : FolderOpen}
      layout="center"
      title={title}
      tone={tone}
    />
  );
}

export default function ProjectCenter() {
  const router = useRouter();
  const { deleteProject, error, isLoading, persistence, projects, refresh } = useProjectDirectory();
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);

  const openProject = (projectId: string) => {
    router.push(`/?projectId=${projectId}`);
  };

  const handleDeleteProject = (project: { id: string; title: string }) => {
    if (deletingProjectId) {
      return;
    }

    void (async () => {
      setDeletingProjectId(project.id);

      try {
        await deleteProject(project.id);
        toast.success("历史教案已删除", {
          description: `“${project.title}”已从项目中心隐藏。`,
        });
      } catch (deleteError) {
        toast.error("删除历史教案失败", {
          description: deleteError instanceof Error ? deleteError.message : "请稍后重试。",
        });
      } finally {
        setDeletingProjectId(null);
      }
    })();
  };

  const content = (() => {
    if (isLoading) {
      return <StateLoading label="正在读取历史教案..." />;
    }

    if (error) {
      return (
        <DirectoryStateNotice
          action={
            <Button onClick={() => void refresh()} size="sm" type="button" variant="outline">
              重新加载
            </Button>
          }
          description={error.message}
          title="历史教案加载失败"
          tone="danger"
        />
      );
    }

    if (!persistence.enabled) {
      return (
        <DirectoryStateNotice
          action={
            <Link className={buttonVariants({ size: "sm", variant: "outline" })} href="/">
              返回首页
            </Link>
          }
          description="当前环境未启用 Supabase，系统无法读取云端项目与历史版本。"
          title="当前环境未启用历史持久化"
          tone="danger"
        />
      );
    }

    if (!persistence.authenticated) {
      return (
        <DirectoryStateNotice
          action={
            <Link className={buttonVariants({ size: "sm", variant: "brand" })} href="/account">
              登录账号
            </Link>
          }
          description="登录后可查看已保存的教案项目、最近会话和 Artifact 版本记录。"
          title="登录后查看历史教案"
          tone="brand"
        />
      );
    }

    if (!projects.length) {
      return (
        <DirectoryStateNotice
          action={
            <Link className={buttonVariants({ size: "sm", variant: "brand" })} href="/">
              新建第一份教案
            </Link>
          }
          description="输入课程主题并生成教案后，系统会把项目保存到这里，便于后续继续修改、打印和恢复版本。"
          title="暂无历史教案"
          tone="brand"
        />
      );
    }

    return (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-3xl border border-border/80 bg-card/90 p-4 shadow-xs md:p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-border/70 pb-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">全部历史项目</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                选择一个项目，恢复最近一次对话、教案和版本记录。
              </p>
            </div>
            <span className="rounded-full border border-border/70 bg-muted/45 px-3 py-1 text-xs text-muted-foreground">
              {projects.length} 个项目
            </span>
          </div>
          <ProjectDirectoryPanel
            activeProjectId={null}
            deletingProjectId={deletingProjectId}
            isLoading={false}
            onDeleteProject={handleDeleteProject}
            onSelectProject={(project) => openProject(project.id)}
            projects={projects}
          />
        </section>

        <aside className="space-y-3">
          <StateSurface density="relaxed" tone="brand">
            <h2 className="text-sm font-semibold text-foreground">项目中心 v1</h2>
            <p className="mt-2 text-xs leading-5">
              这里先按项目组织历史教案。打开项目后，可在工作台的“版本”页签查看和恢复具体快照。
            </p>
          </StateSurface>
          <StateSurface density="relaxed" tone="neutral">
            <h2 className="text-sm font-semibold text-foreground">后续能力</h2>
            <p className="mt-2 text-xs leading-5">
              搜索、筛选、归档和最近访问会在项目中心继续扩展，不影响现有工作台恢复链路。
            </p>
          </StateSurface>
        </aside>
      </div>
    );
  })();

  return (
    <div className="relative h-screen w-screen overflow-y-auto bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(0,217,146,0.14),transparent_28%),linear-gradient(135deg,rgba(61,58,57,0.18),transparent_42%)]"
      />
      <header className="sticky top-0 z-10 border-b border-border/70 bg-background/95 px-5 py-4 backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Link
            aria-label="返回跃课首页"
            className="flex min-w-0 items-center gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            href="/"
          >
            <div className="rounded-2xl border border-brand/25 bg-card/80 p-1">
              <BrandLogo className="h-10 w-auto" priority variant="horizontal" />
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              className={cn(buttonVariants({ size: "sm", variant: "outline" }), "hidden sm:inline-flex")}
              href="/"
            >
              <ArrowLeft className="size-4" />
              返回首页
            </Link>
            <Link className={buttonVariants({ size: "sm", variant: "brand" })} href="/">
              <Plus className="size-4" />
              新建教案
            </Link>
            <ThemeToggle />
            <AuthNavActions accountLabel="账号" accountMode="icon" />
          </div>
        </div>
      </header>

      <main className="relative z-0 mx-auto flex min-h-[calc(100vh-73px)] w-full max-w-6xl flex-col gap-6 px-5 py-8 md:px-8">
        <section className="max-w-3xl">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-brand">
            Lesson Project Center
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.035em] text-foreground md:text-5xl">
            历史教案
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
            按项目管理过去生成的教案和互动大屏。先找到项目，再进入工作台查看版本、恢复快照或继续修改。
          </p>
        </section>

        {content}
      </main>
    </div>
  );
}
