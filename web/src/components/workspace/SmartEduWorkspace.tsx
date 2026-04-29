"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { MessageSquareText, PanelLeftClose, PanelLeftOpen, Plus, UserCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  createProjectAction,
  deleteProjectAction,
  generateCompetitionLessonPatchAction,
  restoreArtifactVersionAction,
  saveLessonArtifactVersionAction,
  type WorkspaceActionResult,
} from "@/app/actions/workspace";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import SmartEduArtifact from "@/components/ai/SmartEduArtifact";
import { useArtifactLifecycle } from "@/components/ai/artifact-model";
import { applyUiHints } from "@/components/ai/artifact-ui-hints";
import AuthPanel from "@/components/auth/AuthPanel";
import BrandLogo from "@/components/BrandLogo";
import ChatPanel from "@/components/workspace/ChatPanel";
import ProjectDirectoryPanel from "@/components/workspace/ProjectDirectoryPanel";
import {
  isSnapshotAcknowledgedByPersistedVersions,
  mergeArtifactLifecycleHistory,
  shouldUsePersistedArtifactState,
} from "@/components/workspace/artifact-source-policy";
import { useWorkspaceProjectData } from "@/components/workspace/useWorkspaceProjectData";
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
import type { CompetitionLessonPlan } from "@/lib/competition-lesson-contract";
import { getCompetitionLessonEditableField } from "@/lib/competition-lesson-fields";
import { withSmartEduProjectHeader } from "@/lib/api/smartedu-request-headers";
import { buildLessonScreenPlanFromLessonPlan } from "@/lib/lesson-screen-plan";
import {
  DEFAULT_STANDARDS_MARKET,
  STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
  smartEduDataSchemas,
  type PersistedArtifactVersion,
  type PersistedProjectSummary,
  type SmartEduUIMessage,
} from "@/lib/lesson-authoring-contract";
import { isLikelyLessonPatchInstruction } from "@/lib/workspace/prompt-intent";
const EMPTY_MESSAGES: SmartEduUIMessage[] = [];
const EMPTY_PERSISTED_VERSIONS: PersistedArtifactVersion[] = [];

type PromptSubmission = string | PromptInputMessage;

interface SmartEduWorkspaceProps {
  accountMode: string | null;
  currentProject: PersistedProjectSummary | null;
  initialMessages: SmartEduUIMessage[];
  inviteToken: string | null;
  persistedVersions: PersistedArtifactVersion[];
  projectId: string | null;
  projects: PersistedProjectSummary[];
}

function unwrapWorkspaceActionResult<T>(result: WorkspaceActionResult<T>) {
  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.data;
}

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
  return Array.from(new Set(labels)).join(", ");
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
          text: `已完成修改：${input.summary}。`,
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
            title: "课时计划",
            updatedAt: now,
          },
        },
      ],
    } as SmartEduUIMessage,
  ];
}

function AppContent({
  accountMode,
  currentProject: initialCurrentProject,
  initialMessages,
  inviteToken,
  persistedVersions: initialPersistedVersions,
  projectId,
  projects: initialProjects,
}: SmartEduWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const accountInitialTab =
    accountMode === "recovery" ? "security" : inviteToken ? "workspace" : "profile";
  const [hasStarted, setHasStarted] = useState(
    () => Boolean(projectId || initialMessages.length),
  );
  const [lessonConfirmed, setLessonConfirmed] = useState(false);
  const [isArtifactSyncPendingState, setIsArtifactSyncPendingState] = useState(false);
  const [isProjectDirectoryLoading, setIsProjectDirectoryLoading] = useState(false);
  const [isRestoringArtifactVersionState, setIsRestoringArtifactVersionState] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [hasLiveArtifactAuthority, setHasLiveArtifactAuthority] = useState(false);
  const [isProjectSheetOpen, setIsProjectSheetOpen] = useState(false);
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);

  const chatTransport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ body, headers, messages }) => {
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
    id: projectId ?? "transient-workspace",
    messages: initialMessages,
    transport: chatTransport,
    experimental_throttle: 50,
  });

  const {
    currentProject,
    isArtifactHistoryLoading,
    persistedVersions,
    projects,
    setArtifactHistoryLoading,
    setCurrentProject,
    setPersistedVersions,
    setProjects,
  } = useWorkspaceProjectData({
    initialCurrentProject,
    initialPersistedVersions,
    initialProjects,
    projectId,
  });

  const isLoading = status === "submitted" || status === "streaming";
  const hasWorkspaceStarted = hasStarted || Boolean(projectId);
  const isHistoryLoading = projectId ? isArtifactHistoryLoading : false;
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
    isWorkspaceLoading: false,
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
    if (projectId) {
      queueMicrotask(() => {
        setHasStarted(true);
        setLessonConfirmed(false);
        setHasLiveArtifactAuthority(false);
        setIsArtifactSyncPendingState(false);
      });
      return;
    }

    if (initialMessages.length === 0) {
      queueMicrotask(() => {
        setHasStarted(false);
        setLessonConfirmed(false);
        setHasLiveArtifactAuthority(false);
        setIsArtifactSyncPendingState(false);
      });
    }
  }, [initialMessages.length, projectId]);

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
      router.refresh();
      queueMicrotask(() => {
        setIsArtifactSyncPendingState(false);
      });
      return;
    }

    queueMicrotask(() => {
      setIsArtifactSyncPendingState(false);
    });
  }, [isArtifactSyncPendingState, projectId, router, status]);

  const withProjectContext = <T extends Record<string, unknown>>(
    body: T,
    targetProjectId = projectId,
  ) => (targetProjectId ? { ...body, projectId: targetProjectId } : body);

  const createPersistentProject = async (title: string) => {
    setIsProjectDirectoryLoading(true);

    try {
      const payload = unwrapWorkspaceActionResult(await createProjectAction(title));
      setProjects(payload.projects);
      setCurrentProject(payload.project);
      return payload.project.id;
    } finally {
      setIsProjectDirectoryLoading(false);
    }
  };

  const deletePersistentProject = async (targetProjectId: string) => {
    const payload = unwrapWorkspaceActionResult(await deleteProjectAction(targetProjectId));
    setProjects(payload.projects);
  };

  const submitPrompt = async (submission: PromptSubmission, explicitProjectId = projectId) => {
    const prompt = normalizePromptSubmission(submission);
    const normalizedQuery = prompt.text.trim();

    if (!normalizedQuery || isLoading) {
      return;
    }

    setIsProjectSheetOpen(false);

    const shouldPatchCurrentLesson =
      Boolean(effectiveArtifactLifecycle.lessonPlan) &&
      isLikelyLessonPatchInstruction(normalizedQuery);

    if (shouldPatchCurrentLesson) {
      void (async () => {
        try {
          const currentLessonPlan = effectiveArtifactLifecycle.lessonPlan;

          if (!currentLessonPlan) {
            toast.warning("课时计划尚未就绪", {
              description: "请等结构化课时计划生成完成后，再执行局部修改。",
            });
            return;
          }

          const patchResult = unwrapWorkspaceActionResult(
            await generateCompetitionLessonPatchAction({
              instruction: normalizedQuery,
              lessonPlan: currentLessonPlan,
            }),
          );
          const changedPaths = patchResult.patch.operations.map((operation) => operation.path);
          const summary =
            patchResult.patchSummary ??
            `Structured fields updated: ${summarizeCompetitionLessonPatch(changedPaths)}`;

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
            const saveResult = unwrapWorkspaceActionResult(
              await saveLessonArtifactVersionAction({
                lessonPlan: patchResult.lessonPlan,
                projectId: explicitProjectId,
                summary,
              }),
            );
            setPersistedVersions(saveResult.versions);
          }

          toast.success("课时计划已更新", {
            description: `${summary}。打印视图已同步更新。`,
          });
        } catch (patchError) {
          toast.error("课时计划修改失败", {
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
      { text: "课时计划已确认，请生成互动大屏。" },
      { body: withProjectContext({ mode: "html", lessonPlan: lessonPlanJson, screenPlan }) },
    );
  };

  const handleStart = (query: string) => {
    void (async () => {
      const normalizedQuery = query.trim();

      if (!normalizedQuery || isProjectDirectoryLoading) {
        return;
      }

      let nextProjectId = projectId;

      if (!nextProjectId) {
        try {
          nextProjectId = await createPersistentProject(normalizedQuery);
        } catch (createProjectError) {
          toast.error("项目初始化失败", {
            description:
              createProjectError instanceof Error
                ? `${createProjectError.message}。将继续使用临时会话模式。`
                : "将继续使用临时会话模式。",
          });
          nextProjectId = null;
        }
      }

      await submitPrompt(normalizedQuery, nextProjectId);

      if (!projectId && nextProjectId) {
        router.replace(`${pathname}?projectId=${nextProjectId}`);
      }
    })();
  };

  const handleSelectProject = (project: PersistedProjectSummary) => {
    if (project.id === projectId || isLoading || isProjectDirectoryLoading) {
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
    if (deletingProjectId || isProjectDirectoryLoading) {
      return;
    }

    void (async () => {
      setDeletingProjectId(project.id);
      setIsProjectDirectoryLoading(true);

      try {
        await deletePersistentProject(project.id);

        if (project.id === projectId) {
          handleResetWorkspace();
        }

        toast.success("项目已移除", {
          description: `“${project.title}”已从历史列表中隐藏。`,
        });
      } catch (deleteError) {
        toast.error("项目删除失败", {
          description: deleteError instanceof Error ? deleteError.message : "请稍后重试。",
        });
      } finally {
        setIsProjectDirectoryLoading(false);
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
            登录后即可启用项目持久化、历史恢复与版本追踪。
          </DialogDescription>
        </DialogHeader>
        <AuthPanel
          initialTab={accountInitialTab}
          inviteToken={inviteToken}
          key={`${accountInitialTab}-${inviteToken ?? "no-invite"}`}
          onAuthChanged={() => {
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );

  const handleRestoreArtifactVersion = async (snapshot: {
    persistedVersionId?: string;
    stage: "lesson" | "html";
    title: string;
  }) => {
    if (
      !projectId ||
      !snapshot.persistedVersionId ||
      isLoading ||
      isRestoringArtifactVersionState ||
      isProjectDirectoryLoading
    ) {
      return;
    }

    setIsRestoringArtifactVersionState(true);
    setArtifactHistoryLoading(true);

    try {
      const restoreResult = unwrapWorkspaceActionResult(
        await restoreArtifactVersionAction({
          projectId,
          versionId: snapshot.persistedVersionId,
        }),
      );
      setPersistedVersions(restoreResult.versions);
      setLessonConfirmed(false);
      setHasLiveArtifactAuthority(false);

      if (restoreResult.uiHints.length > 0) {
        applyUiHints(restoreResult.uiHints, {
          setView: () => {},
          showToast: ({ level, title, description }) => {
            const show =
              level === "error"
                ? toast.error
                : level === "warning"
                  ? toast.warning
                  : toast.success;
            show(title, description ? { description } : undefined);
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
    <div className="flex h-screen w-screen overflow-hidden bg-background font-sans text-foreground">
      <AnimatePresence>
        {isProjectSheetOpen && (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={() => setIsProjectSheetOpen(false)}
          />
        )}
      </AnimatePresence>

      <motion.aside
        animate={{ width: isProjectSheetOpen ? 260 : 64 }}
        className={`z-50 flex h-full shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar ${
          isProjectSheetOpen ? "fixed inset-y-0 left-0 lg:relative" : "hidden lg:flex"
        }`}
        initial={false}
        transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
      >
        <div className="shrink-0 px-3 pb-2 pt-4">
          <div
            className={`flex h-10 items-center ${
              isProjectSheetOpen ? "justify-between px-1" : "justify-center"
            }`}
          >
            <button
              className={`flex items-center gap-2 transition-opacity hover:opacity-80 ${
                isProjectSheetOpen ? "" : "justify-center"
              }`}
              onClick={handleResetWorkspace}
            >
              <BrandLogo className={isProjectSheetOpen ? "size-7" : "size-8"} />
              {isProjectSheetOpen && (
                <span className="whitespace-nowrap text-[15px] font-bold text-foreground">
                  工作区
                </span>
              )}
            </button>
            {isProjectSheetOpen && (
              <Button
                className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
                onClick={() => setIsProjectSheetOpen(false)}
                size="icon"
                variant="ghost"
              >
                <PanelLeftClose className="size-[18px]" />
              </Button>
            )}
          </div>
          <div className="mt-3 flex flex-col gap-1">
            <Button
              className={`text-foreground ${
                isProjectSheetOpen
                  ? "h-10 w-full justify-start gap-3 rounded-xl px-3"
                  : "mx-auto h-10 w-10 justify-center rounded-xl px-0"
              }`}
              onClick={() => {
                handleResetWorkspace();
                if (window.innerWidth < 1024) {
                  setIsProjectSheetOpen(false);
                }
              }}
              variant="ghost"
            >
              <Plus className="size-5 shrink-0" />
              {isProjectSheetOpen && <span className="text-sm font-medium">新建对话</span>}
            </Button>
            {!isProjectSheetOpen && (
              <Button
                className="mx-auto size-10 rounded-xl text-muted-foreground hover:text-foreground"
                onClick={() => setIsProjectSheetOpen(true)}
                size="icon"
                variant="ghost"
              >
                <PanelLeftOpen className="size-5" />
              </Button>
            )}
          </div>
        </div>

        <div
          className={`flex flex-1 flex-col overflow-hidden transition-opacity duration-200 ${
            isProjectSheetOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <div className="shrink-0 px-4 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              最近项目
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-4" style={{ minWidth: 260 }}>
            <ProjectDirectoryPanel
              activeProjectId={projectId}
              deletingProjectId={deletingProjectId}
              isLoading={isProjectDirectoryLoading}
              onDeleteProject={handleDeleteProject}
              onSelectProject={(project) => {
                handleSelectProject(project);
                if (window.innerWidth < 1024) {
                  setIsProjectSheetOpen(false);
                }
              }}
              projects={projects}
            />
          </div>
        </div>

        <div className="mt-auto shrink-0 p-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className={`${
                  isProjectSheetOpen
                    ? "h-12 w-full justify-start gap-3 rounded-xl px-3"
                    : "mx-auto h-10 w-10 justify-center rounded-full px-0"
                }`}
                onClick={() => setIsAuthDialogOpen(true)}
                variant="ghost"
              >
                <UserCircle
                  className={`shrink-0 text-muted-foreground ${
                    isProjectSheetOpen ? "size-6" : "size-5"
                  }`}
                />
                {isProjectSheetOpen && (
                  <span className="text-[13px] font-medium text-foreground">账号</span>
                )}
              </Button>
            </TooltipTrigger>
            {!isProjectSheetOpen && (
              <TooltipContent side="right" sideOffset={8}>
                账号
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      </motion.aside>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <AnimatePresence mode="popLayout">
          {!hasWorkspaceStarted ? (
            <motion.main
              className="relative flex h-full flex-col items-center justify-center p-6"
              exit={{ opacity: 0, y: -20, filter: "blur(4px)" }}
              key="landing-hero"
              transition={{ duration: 0.3 }}
            >
              <Button
                className="absolute left-4 top-4 rounded-xl text-muted-foreground lg:hidden"
                onClick={() => setIsProjectSheetOpen(true)}
                size="icon"
                variant="ghost"
              >
                <PanelLeftOpen className="size-5" />
              </Button>
              <motion.div
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="w-full max-w-3xl space-y-10 text-center"
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="space-y-5">
                  <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-brand/20 bg-brand/5">
                    <BrandLogo className="size-8" priority />
                  </div>
                  <h1 className="text-4xl font-black leading-[1.1] tracking-tight text-foreground md:text-5xl lg:text-[56px]">
                    今天准备哪节<span className="text-brand">体育课</span>？
                  </h1>
                  <p className="mx-auto max-w-lg text-[15px] leading-relaxed text-muted-foreground">
                    直接描述课程条件，系统会先生成可审阅课时计划。需要找旧课时计划时，展开左侧栏查看历史记录。
                  </p>
                </div>
                <motion.form
                  className="group relative flex min-h-[72px] w-full items-center gap-2 rounded-2xl border border-border/80 bg-card/60 px-4 py-2 shadow-lg backdrop-blur-sm transition-colors focus-within:border-brand/50 focus-within:bg-card"
                  layoutId="prompt-input-container"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const input = event.currentTarget.elements.namedItem("prompt") as HTMLInputElement;
                    if (input.value.trim()) {
                      handleStart(input.value.trim());
                    }
                  }}
                >
                  <Button
                    aria-label="添加课时要求"
                    className="shrink-0 rounded-xl bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    size="icon"
                    type="button"
                  >
                    <Plus className="size-5" />
                  </Button>
                  <input
                    aria-label="课时主题"
                    className="h-14 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/50"
                    name="prompt"
                    placeholder="例如：三年级篮球接力，40 人，半个篮球场，40 分钟"
                    type="text"
                  />
                  <Button
                    aria-label="生成课时计划"
                    className="size-11 shrink-0 rounded-xl bg-brand text-brand-foreground shadow-sm hover:bg-brand/90"
                    size="icon"
                    type="submit"
                  >
                    <MessageSquareText className="size-[22px]" />
                  </Button>
                </motion.form>
              </motion.div>
            </motion.main>
          ) : (
            <motion.div
              animate={{ opacity: 1 }}
              className="flex h-full w-full min-w-0"
              initial={{ opacity: 0 }}
              key="workspace-panels"
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              <div className="hidden h-full w-[320px] shrink-0 overflow-hidden border-r border-border/40 lg:block 2xl:w-[360px]">
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
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    className="fixed bottom-4 left-4 z-50 rounded-full shadow-lg lg:hidden"
                    size="icon"
                    type="button"
                    variant="brand"
                  >
                    <MessageSquareText className="size-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-[92vw] overflow-hidden p-0 sm:max-w-md lg:hidden" side="left">
                  <SheetHeader className="sr-only">
                    <SheetTitle>对话</SheetTitle>
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
              <main className="relative h-full min-w-0 flex-1 overflow-hidden">
                <Button
                  className="absolute left-4 top-4 z-30 rounded-xl text-muted-foreground lg:hidden"
                  onClick={() => setIsProjectSheetOpen(true)}
                  size="icon"
                  variant="ghost"
                >
                  <PanelLeftOpen className="size-5" />
                </Button>
                <SmartEduArtifact
                  canGenerateHtml={canGenerateHtml}
                  isHtmlGenerationPending={lessonConfirmed && isLoading}
                  isLoading={isLoading}
                  isRestoringVersion={isRestoringArtifactVersionState}
                  lifecycle={effectiveArtifactLifecycle}
                  onGenerateHtml={() => {
                    void generateHtmlFromLesson();
                  }}
                  onRestoreArtifactVersion={(snapshot) => {
                    void handleRestoreArtifactVersion(snapshot);
                  }}
                  projectId={projectId}
                />
              </main>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {authDialog}
    </div>
  );
}

export default function SmartEduWorkspace(props: SmartEduWorkspaceProps) {
  return <AppContent {...props} />;
}
