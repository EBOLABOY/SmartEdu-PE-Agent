"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, validateUIMessages } from "ai";
import { Folder, MessageSquareText, Plus, Settings } from "lucide-react";
import { motion } from "motion/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { Suspense, useEffect, useEffectEvent, useMemo, useState } from "react";
import { toast } from "sonner";

import SmartEduArtifact from "@/components/ai/SmartEduArtifact";
import {
  extractArtifactFromMessage,
  getMessageText,
  useArtifactLifecycle,
} from "@/components/ai/artifact-model";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import AuthPanel from "@/components/auth/AuthPanel";
import LandingPage from "@/components/LandingPage";
import {
  artifactVersionsResponseSchema,
  type ArtifactVersionsResponse,
  projectDirectoryResponseSchema,
  projectIdSchema,
  projectWorkspaceResponseSchema,
  smartEduDataSchemas,
  type PersistedArtifactVersion,
  type PersistedProjectSummary,
  type SmartEduUIMessage,
} from "@/lib/lesson-authoring-contract";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type ChatStatus = "submitted" | "streaming" | "ready" | "error";

const EMPTY_PERSISTED_VERSIONS: PersistedArtifactVersion[] = [];
const EMPTY_PROJECTS: PersistedProjectSummary[] = [];
const EMPTY_MESSAGES: SmartEduUIMessage[] = [];

async function requestArtifactVersions(
  projectId: string,
  signal?: AbortSignal,
): Promise<ArtifactVersionsResponse> {
  const response = await fetch(`/api/projects/${projectId}/artifact-versions`, {
    cache: "no-store",
    signal,
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "读取 Artifact 历史失败。",
    );
  }

  const parsedPayload = artifactVersionsResponseSchema.safeParse(payload);

  if (!parsedPayload.success) {
    throw new Error("Artifact 历史响应结构不合法。");
  }

  return parsedPayload.data;
}

async function requestArtifactVersionRestore(
  projectId: string,
  versionId: string,
): Promise<ArtifactVersionsResponse> {
  const response = await fetch(
    `/api/projects/${projectId}/artifact-versions/${versionId}/restore`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
    },
  );
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "恢复 Artifact 版本失败。",
    );
  }

  const parsedPayload = artifactVersionsResponseSchema.safeParse(payload);

  if (!parsedPayload.success) {
    throw new Error("Artifact 恢复响应结构不合法。");
  }

  return parsedPayload.data;
}

function getAssistantConversationText(message: SmartEduUIMessage) {
  const extracted = extractArtifactFromMessage(message);
  const rawText = getMessageText(message).trim();

  if (extracted.source === "structured" && extracted.stage === "lesson") {
    return extracted.status === "ready"
      ? "教案已生成，完整内容已放在右侧教案预览中。你可以继续提出修改意见，或确认后生成互动大屏。"
      : "正在生成教案，完整内容会实时同步到右侧教案预览。";
  }

  if (extracted.source === "structured" && extracted.stage === "html") {
    return extracted.status === "ready"
      ? "互动大屏已生成，请在右侧工作台查看预览与源码。"
      : "正在生成互动大屏，预览会实时同步到右侧工作台。";
  }

  return rawText || "正在生成...";
}

function ChatMessage({ message }: { message: SmartEduUIMessage }) {
  const isUser = message.role === "user";
  const text = isUser ? getMessageText(message) : getAssistantConversationText(message);

  return (
    <Message from={message.role}>
      <MessageContent
        className={
          isUser
            ? "rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-primary-foreground shadow-sm"
            : "rounded-2xl rounded-tl-sm bg-muted px-4 py-3 text-foreground shadow-sm"
        }
      >
        {isUser ? (
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{text}</div>
        ) : (
          <MessageResponse>{text}</MessageResponse>
        )}
      </MessageContent>
    </Message>
  );
}

function ChatPanel({
  error,
  isLoading,
  messages,
  onSubmitPrompt,
  projectTitle,
  status,
  stop,
}: {
  error: Error | undefined;
  isLoading: boolean;
  messages: SmartEduUIMessage[];
  onSubmitPrompt: (query: string) => void;
  projectTitle?: string;
  status: ChatStatus;
  stop: () => void;
}) {
  return (
    <aside className="z-40 flex h-full min-w-0 flex-col border-r border-border bg-card">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/95 px-4 backdrop-blur-sm">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">
            {projectTitle ?? "创作对话"}
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            {projectTitle
              ? "项目历史已恢复，可继续对当前教案和大屏提出修改意见。"
              : "输入课程需求，继续提出修改意见。"}
          </p>
        </div>
        {isLoading ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-brand">
            <span className="size-1.5 animate-pulse rounded-full bg-brand" />
            AI 生成中
          </span>
        ) : null}
      </div>

      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="gap-4 p-4">
          {messages.length === 0 ? (
            <ConversationEmptyState
              className="min-h-[320px] rounded-2xl bg-muted px-4 py-3 text-muted-foreground"
              description="AI 会先生成教案；确认后，右侧工作台会生成互动大屏。"
              title={projectTitle ? "当前项目暂无会话消息" : "输入一节体育课主题"}
            />
          ) : (
            messages.map((message) => <ChatMessage key={message.id} message={message} />)
          )}
          {error ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              请求失败：{error.message}
            </div>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t border-border bg-card p-4">
        <PromptInput
          className="relative rounded-xl border border-input bg-background shadow-xs transition-all focus-within:border-brand/50 focus-within:ring-1 focus-within:ring-brand/25"
          onSubmit={(message) => {
            onSubmitPrompt(message.text);
          }}
        >
          <PromptInputBody>
            <PromptInputTextarea
              className="min-h-20 border-none bg-transparent p-4 text-sm text-foreground outline-none placeholder-muted-foreground focus-visible:ring-0"
              disabled={isLoading}
              placeholder="继续补充指令，例如：把倒计时改成 8 分钟，并增加分组积分。"
            />
          </PromptInputBody>
          <div className="flex items-center justify-end gap-2 px-2 pb-2">
            <PromptInputSubmit
              className="rounded-lg bg-primary text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
              onStop={stop}
              status={status}
            />
          </div>
        </PromptInput>
      </div>
    </aside>
  );
}

function RailButton({
  icon: Icon,
  label,
  onClick,
  isActive,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  isActive?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={`flex size-10 items-center justify-center rounded-lg transition-colors ${
            isActive
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          }`}
          onClick={onClick}
          type="button"
        >
          <Icon className="size-[18px]" />
          <span className="sr-only">{label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function ProjectDirectoryPanel({
  activeProjectId,
  isLoading,
  projects,
  onSelectProject,
}: {
  activeProjectId?: string | null;
  isLoading: boolean;
  projects: PersistedProjectSummary[];
  onSelectProject: (project: PersistedProjectSummary) => void;
}) {
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
        正在读取项目目录...
      </div>
    );
  }

  if (!projects.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
        当前账号下还没有可切换的项目。创建项目后，这里会显示可恢复的工作区列表。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {projects.map((project) => {
        const isActive = project.id === activeProjectId;

        return (
          <button
            key={project.id}
            className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
              isActive
                ? "border-brand/40 bg-brand/8"
                : "border-border bg-card hover:border-brand/25 hover:bg-accent/40"
            }`}
            disabled={isLoading}
            onClick={() => onSelectProject(project)}
            type="button"
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
          </button>
        );
      })}
    </div>
  );
}

function AppContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const projectId = useMemo(() => {
    const rawProjectId = searchParams.get("projectId");

    if (!rawProjectId) {
      return null;
    }

    const parsedProjectId = projectIdSchema.safeParse(rawProjectId);
    return parsedProjectId.success ? parsedProjectId.data : null;
  }, [searchParams]);
  const [hasStarted, setHasStarted] = useState(() => Boolean(projectId));
  const [lessonConfirmed, setLessonConfirmed] = useState(false);
  const [persistedVersionsState, setPersistedVersionsState] = useState<PersistedArtifactVersion[]>([]);
  const [projectsState, setProjectsState] = useState<PersistedProjectSummary[]>(EMPTY_PROJECTS);
  const [currentProjectState, setCurrentProjectState] = useState<PersistedProjectSummary | null>(null);
  const [isArtifactHistoryLoadingState, setIsArtifactHistoryLoadingState] = useState(
    () => Boolean(projectId),
  );
  const [isWorkspaceLoadingState, setIsWorkspaceLoadingState] = useState(() => Boolean(projectId));
  const [isProjectDirectoryLoadingState, setIsProjectDirectoryLoadingState] = useState(false);
  const [isArtifactSyncPendingState, setIsArtifactSyncPendingState] = useState(false);
  const [isRestoringArtifactVersionState, setIsRestoringArtifactVersionState] = useState(false);
  const [isProjectSheetOpen, setIsProjectSheetOpen] = useState(false);
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
  const [authRevision, setAuthRevision] = useState(0);
  const [editedLessonMarkdown, setEditedLessonMarkdown] = useState<{
    sourceId: string;
    markdown: string;
  } | null>(null);
  const { messages, sendMessage, setMessages, status, error, stop } = useChat<SmartEduUIMessage>({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ body, messages }) => ({
        body: {
          messages,
          ...body,
        },
      }),
    }),
    experimental_throttle: 50,
  });
  const isLoading = status === "submitted" || status === "streaming";
  const hasWorkspaceStarted = hasStarted || Boolean(projectId);
  const persistedVersions = projectId ? persistedVersionsState : EMPTY_PERSISTED_VERSIONS;
  const currentProject =
    currentProjectState ??
    (projectId ? projectsState.find((project) => project.id === projectId) ?? null : null);
  const isArtifactHistoryLoading = projectId ? isArtifactHistoryLoadingState : false;
  const isWorkspaceLoading =
    projectId && messages.length === 0 ? isWorkspaceLoadingState : false;
  const isHistoryLoading = projectId
    ? isArtifactHistoryLoading || isWorkspaceLoading
    : false;
  const shouldUsePersistedArtifactState =
    Boolean(projectId) &&
    persistedVersions.length > 0 &&
    !isLoading &&
    !isArtifactHistoryLoading &&
    !isArtifactSyncPendingState;
  const artifactLifecycle = useArtifactLifecycle(
    shouldUsePersistedArtifactState ? EMPTY_MESSAGES : messages,
    status,
    lessonConfirmed,
    persistedVersions,
  );
  const latestLessonSourceId =
    [...artifactLifecycle.versions].reverse().find((snapshot) => snapshot.stage === "lesson")?.id ?? "lesson-draft";
  const latestLessonMarkdown =
    editedLessonMarkdown?.sourceId === latestLessonSourceId
      ? editedLessonMarkdown.markdown
      : artifactLifecycle.markdown;
  const canGenerateHtml =
    Boolean(latestLessonMarkdown.trim()) &&
    !artifactLifecycle.html &&
    !isLoading &&
    !isHistoryLoading;

  useEffect(() => {
    if (error) {
      toast.error("请求失败", { description: error.message });
    }
  }, [error]);

  useEffect(() => {
    const controller = new AbortController();

    const loadProjectDirectory = async () => {
      setIsProjectDirectoryLoadingState(true);

      try {
        const response = await fetch("/api/projects", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
              ? payload.error
              : "读取项目目录失败。",
          );
        }

        const parsedPayload = projectDirectoryResponseSchema.safeParse(payload);

        if (!parsedPayload.success) {
          throw new Error("项目目录响应结构不合法。");
        }

        setProjectsState(parsedPayload.data.projects);
      } catch {
        if (controller.signal.aborted) {
          return;
        }

        setProjectsState(EMPTY_PROJECTS);
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

  const loadArtifactVersions = useEffectEvent(
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
  );

  useEffect(() => {
    if (!projectId) {
      return;
    }

    const controller = new AbortController();

    void Promise.resolve().then(() =>
      loadArtifactVersions(projectId, { signal: controller.signal }),
    );

    return () => {
      controller.abort();
    };
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      return;
    }

    if (messages.length > 0) {
      return;
    }

    const controller = new AbortController();

    const loadWorkspaceHistory = async () => {
      setIsWorkspaceLoadingState(true);

      try {
        const response = await fetch(`/api/projects/${projectId}/workspace`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
              ? payload.error
              : "读取项目工作区失败。",
          );
        }

        const parsedPayload = projectWorkspaceResponseSchema.safeParse(payload);

        if (!parsedPayload.success) {
          throw new Error("项目工作区响应结构不合法。");
        }

        const restoredMessages = parsedPayload.data.messages.length
          ? await validateUIMessages<SmartEduUIMessage>({
              messages: parsedPayload.data.messages.map((message) => message.uiMessage),
              dataSchemas: smartEduDataSchemas,
            })
          : [];

        setCurrentProjectState(parsedPayload.data.project);
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
  }, [messages.length, projectId, setMessages]);

  useEffect(() => {
    if (!projectId) {
      queueMicrotask(() => {
        setIsArtifactSyncPendingState(false);
      });
      return;
    }

    if (!isArtifactSyncPendingState) {
      return;
    }

    if (status === "submitted" || status === "streaming") {
      return;
    }

    if (status === "ready") {
      void Promise.resolve()
        .then(() =>
          loadArtifactVersions(projectId, {
            preserveOnError: true,
            silent: true,
          }),
        )
        .finally(() => {
          setIsArtifactSyncPendingState(false);
        });
      return;
    }

    queueMicrotask(() => {
      setIsArtifactSyncPendingState(false);
    });
  }, [isArtifactSyncPendingState, projectId, status]);

  const withProjectContext = <T extends Record<string, unknown>>(body: T, targetProjectId = projectId) =>
    targetProjectId ? { ...body, projectId: targetProjectId } : body;

  const createPersistentProject = async (title: string) => {
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ title }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "创建项目失败。",
        );
      }

      const parsedPayload = projectWorkspaceResponseSchema.safeParse(payload);

      if (!parsedPayload.success) {
        throw new Error("新建项目响应结构不合法。");
      }

      const nextProject = parsedPayload.data.project;
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

  const submitPrompt = async (query: string, explicitProjectId = projectId) => {
    const normalizedQuery = query.trim();

    if (!normalizedQuery || isLoading) {
      return;
    }

    setHasStarted(true);
    setLessonConfirmed(false);
    if (explicitProjectId) {
      setIsArtifactSyncPendingState(true);
    }
    await sendMessage(
      { text: normalizedQuery },
      { body: withProjectContext({ mode: "lesson" }, explicitProjectId) },
    );
  };

  const generateHtmlFromLesson = async () => {
    if (!latestLessonMarkdown.trim() || isLoading) {
      return;
    }

    setLessonConfirmed(true);
    if (projectId) {
      setIsArtifactSyncPendingState(true);
    }
    await sendMessage(
      { text: "我已确认教案无误，请基于该教案生成互动大屏。" },
      { body: withProjectContext({ mode: "html", lessonPlan: latestLessonMarkdown }) },
    );
  };

  const handleStart = (query: string) => {
    void (async () => {
      const normalizedQuery = query.trim();

      if (!normalizedQuery) {
        return;
      }

      const nextProjectId = projectId ?? (await createPersistentProject(normalizedQuery));
      await submitPrompt(normalizedQuery, nextProjectId);
      if (!projectId && nextProjectId) {
        router.replace(`${pathname}?projectId=${nextProjectId}`);
      }
    })();
  };

  const handleSelectProject = (project: PersistedProjectSummary) => {
    if (project.id === projectId || isLoading) {
      setIsProjectSheetOpen(false);
      return;
    }

    stop();
    setHasStarted(true);
    setLessonConfirmed(false);
    setIsArtifactSyncPendingState(false);
    setCurrentProjectState(project);
    setPersistedVersionsState([]);
    setMessages([]);
    setIsProjectSheetOpen(false);
    router.push(`${pathname}?projectId=${project.id}`);
  };

  const handleResetWorkspace = () => {
    stop();
    setHasStarted(false);
    setLessonConfirmed(false);
    setIsArtifactSyncPendingState(false);
    setMessages([]);
    setPersistedVersionsState([]);
    setCurrentProjectState(null);
    if (projectId) {
      router.replace(pathname);
    }
  };

  if (!hasWorkspaceStarted) {
    return <LandingPage onStart={handleStart} />;
  }

  const handleRestoreArtifactVersion = async (snapshot: { persistedVersionId?: string; stage: "lesson" | "html"; title: string }) => {
    if (!projectId || !snapshot.persistedVersionId || isLoading || isRestoringArtifactVersionState) {
      return;
    }

    setIsRestoringArtifactVersionState(true);
    setIsArtifactHistoryLoadingState(true);

    try {
      const payload = await requestArtifactVersionRestore(projectId, snapshot.persistedVersionId);
      setPersistedVersionsState(payload.versions);
      setLessonConfirmed(false);
      toast.success("版本已恢复", {
        description:
          snapshot.stage === "lesson"
            ? `已将“${snapshot.title}”恢复为当前教案版本，原互动大屏已失效，请重新生成。`
            : `已将“${snapshot.title}”恢复为当前互动大屏版本。`,
      });
    } catch (restoreError) {
      toast.error("版本恢复失败", {
        description: restoreError instanceof Error ? restoreError.message : "请稍后重试。",
      });
    } finally {
      setIsArtifactHistoryLoadingState(false);
      setIsRestoringArtifactVersionState(false);
    }
  };

  return (
    <Sheet onOpenChange={setIsProjectSheetOpen} open={isProjectSheetOpen}>
      <motion.div
        animate={{ clipPath: "inset(0% 0% round 0px)", opacity: 1, scale: 1 }}
        className="grid h-screen w-screen min-w-0 grid-cols-[56px_minmax(0,1fr)] overflow-hidden bg-background text-foreground font-sans lg:grid-cols-[56px_380px_minmax(0,1fr)] xl:grid-cols-[56px_400px_minmax(0,1fr)]"
        initial={{ clipPath: "inset(18% 20% round 32px)", opacity: 0, scale: 0.94 }}
        transition={{ duration: 0.52, ease: [0.18, 0.9, 0.2, 1] }}
      >
        <nav className="z-50 flex w-14 shrink-0 flex-col items-center border-r border-border bg-sidebar py-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="mb-8 flex size-10 cursor-pointer items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-sm transition-transform hover:scale-105"
                onClick={handleResetWorkspace}
                type="button"
              >
                动
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              返回首页
            </TooltipContent>
          </Tooltip>
          <RailButton
            icon={Plus}
            label="新建对话"
            onClick={() => {
              setMessages([]);
              setLessonConfirmed(false);
              setPersistedVersionsState([]);
            }}
          />
          <RailButton
            icon={Folder}
            isActive={isProjectSheetOpen}
            label="项目切换"
            onClick={() => setIsProjectSheetOpen(true)}
          />
        <div className="mt-auto">
          <RailButton
            icon={Settings}
            isActive={isAuthDialogOpen}
            label="账号设置"
            onClick={() => setIsAuthDialogOpen(true)}
          />
        </div>
      </nav>

        <SheetContent className="w-[92vw] p-0 sm:max-w-md" side="left">
          <SheetHeader className="border-b border-border px-5 py-4 text-left">
            <SheetTitle>项目目录</SheetTitle>
            <SheetDescription>
              选择任一项目，系统会恢复最近一次会话消息与 Artifact 工作区。
            </SheetDescription>
          </SheetHeader>
          <div className="h-full overflow-y-auto p-5">
            <ProjectDirectoryPanel
              activeProjectId={projectId}
              isLoading={isProjectDirectoryLoadingState}
              onSelectProject={handleSelectProject}
              projects={projectsState}
            />
          </div>
        </SheetContent>

        <Sheet>
          <SheetTrigger asChild>
            <Button
              className="fixed bottom-4 left-4 z-50 rounded-full shadow-xl lg:hidden"
              size="icon"
              type="button"
              variant="brand"
            >
              <MessageSquareText className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[92vw] p-0 sm:max-w-md lg:hidden" side="left">
            <SheetHeader className="sr-only">
              <SheetTitle>创作对话</SheetTitle>
              <SheetDescription>移动端对话抽屉</SheetDescription>
            </SheetHeader>
            <ChatPanel
              error={error}
              isLoading={isLoading}
              messages={messages}
              onSubmitPrompt={(query) => void submitPrompt(query)}
              projectTitle={currentProject?.title}
              status={status}
              stop={stop}
            />
          </SheetContent>
        </Sheet>

        <div className="hidden min-w-0 lg:block">
          <ChatPanel
            error={error}
            isLoading={isLoading}
            messages={messages}
            onSubmitPrompt={(query) => void submitPrompt(query)}
            projectTitle={currentProject?.title}
            status={status}
            stop={stop}
          />
        </div>

        <main className="relative col-start-2 flex h-full min-w-0 overflow-hidden lg:col-start-3">
          <SmartEduArtifact
            canGenerateHtml={canGenerateHtml}
            isLoading={isLoading}
            isRestoringVersion={isRestoringArtifactVersionState}
            lifecycle={artifactLifecycle}
            projectId={projectId}
            onGenerateHtml={() => {
              void generateHtmlFromLesson();
            }}
            onLessonMarkdownChange={(markdown) => {
              setEditedLessonMarkdown({ sourceId: latestLessonSourceId, markdown });
            }}
            onRestoreArtifactVersion={(snapshot) => {
              void handleRestoreArtifactVersion(snapshot);
            }}
          />
        </main>
      </motion.div>

      <Dialog onOpenChange={setIsAuthDialogOpen} open={isAuthDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>账号与持久化</DialogTitle>
            <DialogDescription>
              登录后启用 Supabase 项目保存、历史恢复和版本追踪；退出后仍可使用临时会话。
            </DialogDescription>
          </DialogHeader>
          <AuthPanel
            onAuthChanged={() => {
              setAuthRevision((revision) => revision + 1);
            }}
          />
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}

export default function App() {
  return (
    <Suspense fallback={<div className="h-screen w-screen bg-background" />}>
      <AppContent />
    </Suspense>
  );
}
