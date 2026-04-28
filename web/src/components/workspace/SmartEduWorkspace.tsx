"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { MessageSquareText, PanelLeftClose, PanelLeftOpen, Plus, UserCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import SmartEduArtifact from "@/components/ai/SmartEduArtifact";
import { useArtifactLifecycle } from "@/components/ai/artifact-model";
import { applyUiHints } from "@/components/ai/artifact-ui-hints";
import AuthPanel from "@/components/auth/AuthPanel";
import BrandLogo from "@/components/BrandLogo";
import ChatPanel from "@/components/workspace/ChatPanel";
import {
  isSnapshotAcknowledgedByPersistedVersions,
  mergeArtifactLifecycleHistory,
  shouldUsePersistedArtifactState,
} from "@/components/workspace/artifact-source-policy";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import ProjectDirectoryPanel from "@/components/workspace/ProjectDirectoryPanel";
import { useWorkspaceProjectData } from "@/components/workspace/useWorkspaceProjectData";
import {
  DEFAULT_STANDARDS_MARKET,
  STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
  projectIdSchema,
  smartEduDataSchemas,
  type PersistedArtifactVersion,
  type PersistedProjectSummary,
  type SmartEduUIMessage,
} from "@/lib/lesson-authoring-contract";
import { withSmartEduProjectHeader } from "@/lib/api/smartedu-request-headers";
import type { CompetitionLessonPlan } from "@/lib/competition-lesson-contract";
import { getCompetitionLessonEditableField } from "@/lib/competition-lesson-fields";
import { buildLessonScreenPlanFromLessonPlan } from "@/lib/lesson-screen-plan";
import {
  requestArtifactVersionRestore,
  requestCompetitionLessonPatch,
  requestSaveLessonArtifactVersion,
} from "@/lib/workspace/client-api";
import { isLikelyLessonPatchInstruction } from "@/lib/workspace/prompt-intent";
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

const EMPTY_MESSAGES: SmartEduUIMessage[] = [];
const EMPTY_PERSISTED_VERSIONS: PersistedArtifactVersion[] = [];

type PromptSubmission = string | PromptInputMessage;

function normalizePromptSubmission(submission: PromptSubmission): PromptInputMessage {
  if (typeof submission === "string") {
    return {
      files: [],
      text: submission,
    };
  }

  return submission;
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
  const requestId = `local-patch-${crypto.randomUUID()}`;
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
          type: "data-trace",
          id: "trace",
          data: {
            protocolVersion: STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
            requestId,
            mode: "lesson",
            phase: "completed",
            responseTransport: "structured-data-part",
            requestedMarket: DEFAULT_STANDARDS_MARKET,
            resolvedMarket: DEFAULT_STANDARDS_MARKET,
            warnings: [],
            uiHints: [
              {
                action: "switch_tab",
                params: {
                  tab: "lesson",
                },
              },
            ],
            trace: [
              {
                step: "lesson-patch-finished",
                status: "success",
                detail: input.summary,
                timestamp: now,
              },
            ],
            updatedAt: now,
          },
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
  const [isArtifactSyncPendingState, setIsArtifactSyncPendingState] = useState(false);
  const [isRestoringArtifactVersionState, setIsRestoringArtifactVersionState] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [hasLiveArtifactAuthority, setHasLiveArtifactAuthority] = useState(false);
  const [isProjectSheetOpen, setIsProjectSheetOpen] = useState(false);
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
  const [authRevision, setAuthRevision] = useState(0);
  const chatTransport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ body, headers, messages }) => {
          // Phase 7: 记忆激活 - 废弃全量传递，只传递增量（最后一条）消息。
          // 历史上下文将由后端的 Mastra Storage Adapter 自动接管并组装。
          const incrementalMessages = messages.length > 0 ? [messages[messages.length - 1]] : [];

          return {
            body: {
              ...body,
              messages: incrementalMessages,
            },
            headers: withSmartEduProjectHeader(headers, body?.projectId),
          };
        },
      }),
    [],
  );
  const { messages, sendMessage, setMessages, status, error, stop } = useChat<SmartEduUIMessage>({
    dataPartSchemas: smartEduDataSchemas,
    transport: chatTransport,
    experimental_throttle: 50,
  });
  const {
    createPersistentProject,
    currentProject,
    deletePersistentProject,
    isArtifactHistoryLoading,
    isProjectDirectoryLoading,
    isWorkspaceLoading,
    persistedVersions,
    projects,
    refreshArtifactVersions,
    setArtifactHistoryLoading,
    setCurrentProject,
    setPersistedVersions,
  } = useWorkspaceProjectData({
    authRevision,
    messagesLength: messages.length,
    projectId,
    setLessonConfirmed,
    setMessages,
  });
  const isLoading = status === "submitted" || status === "streaming";
  const hasWorkspaceStarted = hasStarted || Boolean(projectId);
  const isHistoryLoading = projectId
    ? isArtifactHistoryLoading || isWorkspaceLoading
    : false;
  const liveArtifactLifecycle = useArtifactLifecycle(
    messages,
    status,
    lessonConfirmed,
    EMPTY_PERSISTED_VERSIONS,
  );
  const persistedArtifactLifecycle = useArtifactLifecycle(
    EMPTY_MESSAGES,
    status,
    lessonConfirmed,
    persistedVersions,
  );
  const shouldUsePersistedArtifactSource = shouldUsePersistedArtifactState({
    hasLiveArtifactAuthority,
    isArtifactHistoryLoading,
    isArtifactSyncPending: isArtifactSyncPendingState,
    isLoading,
    isWorkspaceLoading,
    persistedVersionsLength: persistedVersions.length,
    projectId,
  });
  const effectiveArtifactLifecycle = useMemo(
    () =>
      shouldUsePersistedArtifactSource
        ? persistedArtifactLifecycle
        : mergeArtifactLifecycleHistory(liveArtifactLifecycle, persistedArtifactLifecycle),
    [liveArtifactLifecycle, persistedArtifactLifecycle, shouldUsePersistedArtifactSource],
  );
  const canGenerateHtml =
    Boolean(effectiveArtifactLifecycle.lessonPlan) &&
    !effectiveArtifactLifecycle.html &&
    !isLoading &&
    !isHistoryLoading;

  useEffect(() => {
    if (error) {
      toast.error("请求失败", { description: error.message });
    }
  }, [error]);

  useEffect(() => {
    if (!hasLiveArtifactAuthority || isLoading || isArtifactHistoryLoading) {
      return;
    }

    if (
      isSnapshotAcknowledgedByPersistedVersions(
        liveArtifactLifecycle.activeArtifact,
        persistedVersions,
      )
    ) {
      queueMicrotask(() => {
        setHasLiveArtifactAuthority(false);
      });
    }
  }, [
    hasLiveArtifactAuthority,
    isArtifactHistoryLoading,
    isLoading,
    liveArtifactLifecycle.activeArtifact,
    persistedVersions,
  ]);

  useEffect(() => {
    if (accountMode === "recovery" || accountMode === "profile" || inviteToken) {
      queueMicrotask(() => {
        setIsAuthDialogOpen(true);
      });
    }
  }, [accountMode, inviteToken]);

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
          refreshArtifactVersions(projectId, {
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
  }, [isArtifactSyncPendingState, projectId, refreshArtifactVersions, status]);

  const withProjectContext = <T extends Record<string, unknown>>(body: T, targetProjectId = projectId) =>
    targetProjectId ? { ...body, projectId: targetProjectId } : body;

  const submitPrompt = async (submission: PromptSubmission, explicitProjectId = projectId) => {
    const prompt = normalizePromptSubmission(submission);
    const normalizedQuery = prompt.text.trim();

    if (!normalizedQuery || isLoading) {
      return;
    }

    setIsProjectSheetOpen(false);

    const shouldPatchCurrentLesson =
      Boolean(effectiveArtifactLifecycle.lessonPlan) && isLikelyLessonPatchInstruction(normalizedQuery);

    if (shouldPatchCurrentLesson) {
      void (async () => {
        try {
          const currentLessonPlan = effectiveArtifactLifecycle.lessonPlan;

          if (!currentLessonPlan) {
            toast.warning("当前教案尚未完成结构化校验", {
              description: "请等待 JSON 教案生成完成并切换为正式打印版后，再发起局部修改。",
            });
            return;
          }

          const patchResult = await requestCompetitionLessonPatch({
            instruction: normalizedQuery,
            lessonPlan: currentLessonPlan,
            projectId: explicitProjectId ?? undefined,
          });
          const changedPaths = patchResult.patch.operations.map((operation) => operation.path);
          const summary =
            patchResult.patchSummary ?? `结构化字段修改：${summarizeCompetitionLessonPatch(changedPaths)}`;

          setLessonConfirmed(false);
          setHasLiveArtifactAuthority(true);
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
              summary,
            });
            setPersistedVersions(payload.versions);
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
    setHasLiveArtifactAuthority(true);
    if (explicitProjectId) {
      setIsArtifactSyncPendingState(true);
    }
    await sendMessage(
      prompt.files.length
        ? { text: normalizedQuery, files: prompt.files }
        : { text: normalizedQuery },
      { body: withProjectContext({ mode: "lesson" }, explicitProjectId) },
    );
  };

  const generateHtmlFromLesson = async () => {
    const currentLessonPlan = effectiveArtifactLifecycle.lessonPlan;

    if (!currentLessonPlan || isLoading) {
      return;
    }

    setLessonConfirmed(true);
    setHasLiveArtifactAuthority(true);
    if (projectId) {
      setIsArtifactSyncPendingState(true);
    }
    const lessonPlanJson = JSON.stringify(currentLessonPlan);
    const screenPlan = buildLessonScreenPlanFromLessonPlan(currentLessonPlan);

    await sendMessage(
      { text: "我已确认教案无误，请基于该教案生成互动大屏。" },
      { body: withProjectContext({ mode: "html", lessonPlan: lessonPlanJson, screenPlan }) },
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
    setHasLiveArtifactAuthority(false);
    setIsArtifactSyncPendingState(false);
    setCurrentProject(project);
    setPersistedVersions([]);
    setMessages([]);
    setIsProjectSheetOpen(false);
    router.push(`${pathname}?projectId=${project.id}`);
  };

  const handleDeleteProject = (project: PersistedProjectSummary) => {
    if (deletingProjectId) {
      return;
    }

    void (async () => {
      setDeletingProjectId(project.id);

      try {
        await deletePersistentProject(project.id);

        if (project.id === projectId) {
          handleResetWorkspace();
        }

        toast.success("历史教案已删除", {
          description: `“${project.title}”已从历史列表隐藏。`,
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

  const handleResetWorkspace = () => {
    stop();
    setHasStarted(false);
    setLessonConfirmed(false);
    setHasLiveArtifactAuthority(false);
    setIsArtifactSyncPendingState(false);
    setMessages([]);
    setPersistedVersions([]);
    setCurrentProject(null);
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
            登录后启用 AI 生成、Supabase 项目保存、历史恢复和版本追踪；匿名 AI 仅在显式配置后可用。
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

  const handleRestoreArtifactVersion = async (snapshot: { persistedVersionId?: string; stage: "lesson" | "html"; title: string }) => {
    if (!projectId || !snapshot.persistedVersionId || isLoading || isRestoringArtifactVersionState) {
      return;
    }
    setIsRestoringArtifactVersionState(true);
    setArtifactHistoryLoading(true);
    try {
      const payload = await requestArtifactVersionRestore(projectId, snapshot.persistedVersionId);
      setPersistedVersions(payload.versions);
      setLessonConfirmed(false);
      setHasLiveArtifactAuthority(false);

      // 业务状态描述权归后端：从 API 响应的 uiHints 中执行 UI 指令
      if (payload.uiHints.length > 0) {
        applyUiHints(payload.uiHints, {
          setView: () => {},
          showToast: ({ level, title: toastTitle, description }) => {
            const toaster = level === "error" ? toast.error : level === "warning" ? toast.warning : toast.success;
            toaster(toastTitle, description ? { description } : undefined);
          },
        });
      } else {
        toast.success("版本已恢复");
      }
    } catch (restoreError) {
      toast.error("版本恢复失败", {
        description: restoreError instanceof Error ? restoreError.message : "请稍后重试。",
      });
    } finally {
      setArtifactHistoryLoading(false);
      setIsRestoringArtifactVersionState(false);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground font-sans">

      <AnimatePresence>
        {isProjectSheetOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsProjectSheetOpen(false)}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          />
        )}
      </AnimatePresence>
      <motion.aside
        initial={false}
        animate={{ width: isProjectSheetOpen ? 260 : 64 }}
        transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
        className={`z-50 flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar overflow-hidden ${isProjectSheetOpen ? "fixed inset-y-0 left-0 lg:relative" : "hidden lg:flex"}`}
      >
        <div className="flex flex-col px-3 pt-4 pb-2 shrink-0">
          <div className={`flex items-center h-10 ${isProjectSheetOpen ? "justify-between px-1" : "justify-center"}`}>
            <button className={`flex items-center gap-2 hover:opacity-80 transition-opacity ${isProjectSheetOpen ? "" : "justify-center"}`} onClick={handleResetWorkspace}>
              <BrandLogo className={isProjectSheetOpen ? "size-7" : "size-8"} />
              {isProjectSheetOpen && <span className="font-bold text-[15px] text-foreground whitespace-nowrap">跃课</span>}
            </button>
            {isProjectSheetOpen && (
              <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground rounded-lg" onClick={() => setIsProjectSheetOpen(false)}>
                <PanelLeftClose className="size-[18px]" />
              </Button>
            )}
          </div>
          <div className="mt-3 flex flex-col gap-1">
            <Button variant="ghost" className={`text-foreground ${isProjectSheetOpen ? "w-full justify-start gap-3 h-10 px-3 rounded-xl" : "w-10 h-10 mx-auto justify-center px-0 rounded-xl"}`} onClick={() => { handleResetWorkspace(); if (window.innerWidth < 1024) setIsProjectSheetOpen(false); }}>
              <Plus className="size-5 shrink-0" />
              {isProjectSheetOpen && <span className="text-sm font-medium">新对话</span>}
            </Button>
            {!isProjectSheetOpen && (
              <Button variant="ghost" size="icon" className="size-10 mx-auto rounded-xl text-muted-foreground hover:text-foreground" onClick={() => setIsProjectSheetOpen(true)}>
                <PanelLeftOpen className="size-5" />
              </Button>
            )}
          </div>
        </div>
        <div className={`flex-1 overflow-hidden flex flex-col transition-opacity duration-200 ${isProjectSheetOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
          <div className="px-4 py-2 shrink-0">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">最近</h3>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-4" style={{ minWidth: 260 }}>
            <ProjectDirectoryPanel activeProjectId={projectId} deletingProjectId={deletingProjectId} isLoading={isProjectDirectoryLoading} onDeleteProject={handleDeleteProject} onSelectProject={(project) => { handleSelectProject(project); if (window.innerWidth < 1024) setIsProjectSheetOpen(false); }} projects={projects} />
          </div>
        </div>
        <div className="mt-auto p-3 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" className={`${isProjectSheetOpen ? "w-full justify-start gap-3 h-12 px-3 rounded-xl" : "w-10 h-10 mx-auto justify-center px-0 rounded-full"}`} onClick={() => setIsAuthDialogOpen(true)}>
                <UserCircle className={`shrink-0 text-muted-foreground ${isProjectSheetOpen ? "size-6" : "size-5"}`} />
                {isProjectSheetOpen && <span className="text-[13px] font-medium text-foreground">账号设置</span>}
              </Button>
            </TooltipTrigger>
            {!isProjectSheetOpen && <TooltipContent side="right" sideOffset={8}>账号设置</TooltipContent>}
          </Tooltip>

        </div>
      </motion.aside>
      <div className="flex-1 flex flex-col min-w-0 relative">
        <AnimatePresence mode="popLayout">
          {!hasWorkspaceStarted ? (
            <motion.main key="landing-hero" exit={{ opacity: 0, y: -20, filter: "blur(4px)" }} transition={{ duration: 0.3 }} className="flex h-full flex-col items-center justify-center p-6 relative">
              <Button variant="ghost" size="icon" className="absolute top-4 left-4 lg:hidden text-muted-foreground rounded-xl" onClick={() => setIsProjectSheetOpen(true)}>
                <PanelLeftOpen className="size-5" />
              </Button>
              <motion.div animate={{ opacity: 1, y: 0, scale: 1 }} className="w-full max-w-3xl space-y-10 text-center" initial={{ opacity: 0, y: 16, scale: 0.98 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
                <div className="space-y-5">
                  <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-brand/20 bg-brand/5">
                    <BrandLogo className="size-8" priority />
                  </div>
                  <h1 className="text-4xl font-black tracking-tight text-foreground md:text-5xl lg:text-[56px] leading-[1.1]">今天准备哪节<span className="text-brand">体育课</span>？</h1>
                  <p className="mx-auto max-w-lg text-[15px] leading-relaxed text-muted-foreground">直接描述课程条件，系统会先生成可审阅教案。需要找旧教案时，展开左侧栏查看历史记录。</p>
                </div>
                <motion.form layoutId="prompt-input-container" className="group relative flex min-h-[72px] w-full items-center gap-2 rounded-2xl border border-border/80 bg-card/60 px-4 py-2 shadow-lg backdrop-blur-sm transition-colors focus-within:border-brand/50 focus-within:bg-card" onSubmit={(event) => { event.preventDefault(); const input = (event.currentTarget.elements.namedItem("prompt") as HTMLInputElement); if (input.value.trim()) handleStart(input.value.trim()); }}>
                  <Button aria-label="补充课程条件" className="shrink-0 rounded-xl bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground" size="icon" type="button"><Plus className="size-5" /></Button>
                  <input name="prompt" aria-label="课程主题" className="h-14 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/50" placeholder="描述你的体育课，例如：三年级篮球运球接力，40人，半场，40分钟" type="text" />
                  <Button aria-label="生成教案" className="size-11 shrink-0 rounded-xl bg-brand text-brand-foreground shadow-sm hover:bg-brand/90" size="icon" type="submit"><MessageSquareText className="size-[22px]" /></Button>
                </motion.form>
              </motion.div>
            </motion.main>
          ) : (
            <motion.div key="workspace-panels" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.1 }} className="flex h-full w-full min-w-0">
              <div className="hidden h-full w-[320px] shrink-0 2xl:w-[360px] overflow-hidden lg:block border-r border-border/40">
                <ChatPanel error={error} isLoading={isLoading} messages={messages} onSubmitPrompt={(query) => void submitPrompt(query)} projectTitle={currentProject?.title} status={status} stop={stop} />
              </div>
              <Sheet>
                <SheetTrigger asChild>
                  <Button className="fixed bottom-4 left-4 z-50 rounded-full shadow-lg lg:hidden" size="icon" type="button" variant="brand"><MessageSquareText className="size-5" /></Button>
                </SheetTrigger>
                <SheetContent className="w-[92vw] overflow-hidden p-0 sm:max-w-md lg:hidden" side="left">
                  <SheetHeader className="sr-only"><SheetTitle>创作对话</SheetTitle><SheetDescription>移动端对话抽屉</SheetDescription></SheetHeader>
                  <ChatPanel error={error} isLoading={isLoading} messages={messages} onSubmitPrompt={(query) => void submitPrompt(query)} projectTitle={currentProject?.title} status={status} stop={stop} />
                </SheetContent>
              </Sheet>
              <main className="relative flex-1 h-full min-w-0 overflow-hidden">
                <Button variant="ghost" size="icon" className="absolute top-4 left-4 z-30 lg:hidden text-muted-foreground rounded-xl" onClick={() => setIsProjectSheetOpen(true)}><PanelLeftOpen className="size-5" /></Button>
                <SmartEduArtifact canGenerateHtml={canGenerateHtml} isHtmlGenerationPending={lessonConfirmed && isLoading} isLoading={isLoading} isRestoringVersion={isRestoringArtifactVersionState} lifecycle={effectiveArtifactLifecycle} projectId={projectId} onGenerateHtml={() => { void generateHtmlFromLesson(); }} onRestoreArtifactVersion={(snapshot) => { void handleRestoreArtifactVersion(snapshot); }} />
              </main>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {authDialog}
    </div>
  );
}

export default function SmartEduWorkspace() {
  return <AppContent />;
}
