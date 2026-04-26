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
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import AuthPanel from "@/components/auth/AuthPanel";
import BrandLogo from "@/components/BrandLogo";
import LandingPage from "@/components/LandingPage";
import {
  artifactVersionsResponseSchema,
  STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
  type ArtifactVersionsResponse,
  projectDirectoryResponseSchema,
  projectIdSchema,
  projectWorkspaceResponseSchema,
  smartEduDataSchemas,
  type PersistedArtifactVersion,
  type PersistedProjectSummary,
  type SmartEduUIMessage,
} from "@/lib/lesson-authoring-contract";
import type { CompetitionLessonPlan } from "@/lib/competition-lesson-contract";
import { competitionLessonPlanToMarkdown, markdownToCompetitionLessonPlan } from "@/lib/competition-lesson-markdown";
import { competitionLessonPatchResponseSchema } from "@/lib/competition-lesson-patch";
import { getCompetitionLessonEditableField } from "@/lib/competition-lesson-fields";
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

async function requestCompetitionLessonPatch(input: {
  instruction: string;
  lessonPlan: CompetitionLessonPlan;
}) {
  const response = await fetch("/api/competition-lesson-patches", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "结构化教案局部修改失败。",
    );
  }

  const parsedPayload = competitionLessonPatchResponseSchema.safeParse(payload);

  if (!parsedPayload.success) {
    throw new Error("结构化教案局部修改响应结构不合法。");
  }

  return parsedPayload.data;
}

async function requestSaveLessonArtifactVersion(
  projectId: string,
  input: {
    lessonPlan?: CompetitionLessonPlan;
    markdown: string;
    summary?: string;
  },
): Promise<ArtifactVersionsResponse> {
  const response = await fetch(`/api/projects/${projectId}/artifact-versions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      markdown: input.markdown,
      lessonPlan: input.lessonPlan,
      title: "教案 Artifact",
      summary: input.summary,
    }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "保存教案版本失败。",
    );
  }

  const parsedPayload = artifactVersionsResponseSchema.safeParse(payload);

  if (!parsedPayload.success) {
    throw new Error("保存教案版本响应结构不合法。");
  }

  return parsedPayload.data;
}

function isLikelyLessonPatchInstruction(query: string) {
  const normalized = query.trim();

  if (!normalized) {
    return false;
  }

  if (/生成.*大屏|互动大屏|确认.*生成|重新生成|再生成一份|新教案|换一份/.test(normalized)) {
    return false;
  }

  return /修改|改成|改为|调整|优化|完善|替换|删掉|删除|增加|新增|补充|强化|弱化|精简|更具体|更安全|更符合/.test(
    normalized,
  );
}

function summarizeCompetitionLessonPatch(paths: string[]) {
  const labels = paths.map((path) => getCompetitionLessonEditableField(path)?.label ?? path);

  return Array.from(new Set(labels)).join("、");
}

function createLocalPatchMessages(input: {
  instruction: string;
  lessonPlan: CompetitionLessonPlan;
  summary: string;
}): SmartEduUIMessage[] {
  const now = new Date().toISOString();
  const userMessageId = `local-user-${crypto.randomUUID()}`;
  const assistantMessageId = `local-lesson-patch-${crypto.randomUUID()}`;

  return [
    {
      id: userMessageId,
      role: "user",
      parts: [{ type: "text", text: input.instruction }],
    } as SmartEduUIMessage,
    {
      id: assistantMessageId,
      role: "assistant",
      parts: [
        {
          type: "text",
          text: `已完成局部修改：${input.summary}。`,
        },
        {
          type: "data-artifact",
          id: "artifact",
          data: {
            protocolVersion: STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
            stage: "lesson",
            contentType: "lesson-json",
            content: JSON.stringify(input.lessonPlan),
            isComplete: true,
            status: "ready",
            source: "data-part",
            title: "教案 Artifact",
            updatedAt: now,
          },
        },
      ],
    } as SmartEduUIMessage,
  ];
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

      <div className="border-t border-border bg-linear-to-b from-card/80 to-muted/40 p-3">
        <PromptInput
          className="relative rounded-2xl bg-background shadow-[0_12px_32px_rgba(15,23,42,0.12)] transition-all focus-within:shadow-[0_16px_40px_rgba(15,23,42,0.16)]"
          onSubmit={(message) => {
            onSubmitPrompt(message.text);
          }}
        >
          <PromptInputBody>
            <PromptInputTextarea
              className="min-h-24 px-4 pt-4 pb-1 text-sm leading-6 text-foreground placeholder:text-muted-foreground/70"
              disabled={isLoading}
              placeholder="继续补充修改要求，例如：把倒计时改成 8 分钟，并增加分组积分。"
            />
          </PromptInputBody>
          <PromptInputFooter className="px-3 pb-3 pt-1">
            <PromptInputTools className="overflow-hidden">
              <span className="shrink-0 rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-medium text-brand">
                修改教案或大屏
              </span>
              <span className="truncate text-[11px] text-muted-foreground">
                Enter 发送，Shift + Enter 换行
              </span>
            </PromptInputTools>
            <PromptInputSubmit
              className="size-9 shrink-0 rounded-xl bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
              onStop={stop}
              size="icon-sm"
              status={status}
            />
          </PromptInputFooter>
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
  const accountMode = searchParams.get("account");
  const inviteToken = searchParams.get("invite");
  const accountInitialTab =
    accountMode === "recovery" ? "security" : inviteToken ? "workspace" : "profile";
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
  const hasLocalLessonEdit =
    editedLessonMarkdown?.sourceId === latestLessonSourceId &&
    editedLessonMarkdown.markdown.trim() !== artifactLifecycle.markdown.trim();
  const effectiveArtifactLifecycle = useMemo(
    () => ({
      ...artifactLifecycle,
      markdown: latestLessonMarkdown,
      ...(hasLocalLessonEdit
        ? {
            html: "",
            streamingHtml: "",
            isHtmlStreaming: false,
            htmlPreviewVersionId: undefined,
            lessonPlan: undefined,
            stage: "lesson" as const,
          }
        : {}),
    }),
    [artifactLifecycle, hasLocalLessonEdit, latestLessonMarkdown],
  );
  const canGenerateHtml =
    Boolean(latestLessonMarkdown.trim()) &&
    !effectiveArtifactLifecycle.html &&
    !isLoading &&
    !isHistoryLoading;

  useEffect(() => {
    if (error) {
      toast.error("请求失败", { description: error.message });
    }
  }, [error]);

  useEffect(() => {
    if (accountMode === "recovery" || accountMode === "profile" || inviteToken) {
      queueMicrotask(() => {
        setIsAuthDialogOpen(true);
      });
    }
  }, [accountMode, inviteToken]);

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

    const shouldPatchCurrentLesson =
      Boolean(latestLessonMarkdown.trim()) && isLikelyLessonPatchInstruction(normalizedQuery);

    if (shouldPatchCurrentLesson) {
      void (async () => {
        try {
          const currentLessonPlan =
            effectiveArtifactLifecycle.lessonPlan ?? markdownToCompetitionLessonPlan(latestLessonMarkdown);
          const patchResult = await requestCompetitionLessonPatch({
            instruction: normalizedQuery,
            lessonPlan: currentLessonPlan,
          });
          const markdown = competitionLessonPlanToMarkdown(patchResult.lessonPlan);
          const changedPaths = patchResult.patch.operations.map((operation) => operation.path);
          const summary = `结构化字段修改：${summarizeCompetitionLessonPatch(changedPaths)}`;

          setLessonConfirmed(false);
          setEditedLessonMarkdown(null);
          setMessages((currentMessages) => [
            ...currentMessages,
            ...createLocalPatchMessages({
              instruction: normalizedQuery,
              lessonPlan: patchResult.lessonPlan,
              summary,
            }),
          ]);

          if (explicitProjectId) {
            const payload = await requestSaveLessonArtifactVersion(explicitProjectId, {
              lessonPlan: patchResult.lessonPlan,
              markdown,
              summary,
            });
            setPersistedVersionsState(payload.versions);
          }

          toast.success("已按对话修改教案", {
            description: `${summary}。右侧正式打印版已更新。`,
          });
        } catch (patchError) {
          toast.error("教案局部修改失败", {
            description: patchError instanceof Error ? patchError.message : "请稍后重试。",
          });
        }
      })();
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

  const authDialog = (
    <Dialog onOpenChange={setIsAuthDialogOpen} open={isAuthDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>账号与持久化</DialogTitle>
          <DialogDescription>
            登录后启用 Supabase 项目保存、历史恢复和版本追踪；退出后仍可使用临时会话。
          </DialogDescription>
        </DialogHeader>
        <AuthPanel
          initialTab={accountInitialTab}
          inviteToken={inviteToken}
          key={`${accountInitialTab}-${inviteToken ?? "no-invite"}`}
          onAuthChanged={() => {
            setAuthRevision((revision) => revision + 1);
          }}
        />
      </DialogContent>
    </Dialog>
  );

  if (!hasWorkspaceStarted) {
    return (
      <>
        <LandingPage onStart={handleStart} />
        {authDialog}
      </>
    );
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
                aria-label="返回跃课首页"
                className="mb-8 flex size-10 cursor-pointer items-center justify-center rounded-xl text-primary-foreground shadow-sm transition-transform hover:scale-105"
                onClick={handleResetWorkspace}
                type="button"
              >
                <BrandLogo className="size-10" />
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
            onClick={() => router.push("/account")}
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
            lifecycle={effectiveArtifactLifecycle}
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

      {authDialog}
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
