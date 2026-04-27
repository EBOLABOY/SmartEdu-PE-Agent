"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Folder, MessageSquareText, Plus, Settings } from "lucide-react";
import { motion } from "motion/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import SmartEduArtifact from "@/components/ai/SmartEduArtifact";
import { useArtifactLifecycle } from "@/components/ai/artifact-model";
import AuthPanel from "@/components/auth/AuthPanel";
import BrandLogo from "@/components/BrandLogo";
import ThemeToggle from "@/components/layout/ThemeToggle";
import LandingPage from "@/components/LandingPage";
import ChatPanel from "@/components/workspace/ChatPanel";
import {
  isSnapshotAcknowledgedByPersistedVersions,
  mergeArtifactLifecycleHistory,
  shouldUsePersistedArtifactState,
} from "@/components/workspace/artifact-source-policy";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import ProjectDirectoryPanel from "@/components/workspace/ProjectDirectoryPanel";
import RailButton from "@/components/workspace/RailButton";
import { useWorkspaceProjectData } from "@/components/workspace/useWorkspaceProjectData";
import {
  STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
  projectIdSchema,
  smartEduDataSchemas,
  type PersistedArtifactVersion,
  type PersistedProjectSummary,
  type SmartEduUIMessage,
} from "@/lib/lesson-authoring-contract";
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
  const [hasLiveArtifactAuthority, setHasLiveArtifactAuthority] = useState(false);
  const [isProjectSheetOpen, setIsProjectSheetOpen] = useState(false);
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
  const [authRevision, setAuthRevision] = useState(0);
  const chatTransport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ body, messages }) => ({
          body: {
            ...body,
            messages,
          },
        }),
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
          });
          const changedPaths = patchResult.patch.operations.map((operation) => operation.path);
          const summary = `结构化字段修改：${summarizeCompetitionLessonPatch(changedPaths)}`;

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
    setArtifactHistoryLoading(true);

    try {
      const payload = await requestArtifactVersionRestore(projectId, snapshot.persistedVersionId);
      setPersistedVersions(payload.versions);
      setLessonConfirmed(false);
      setHasLiveArtifactAuthority(false);
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
      setArtifactHistoryLoading(false);
      setIsRestoringArtifactVersionState(false);
    }
  };

  return (
    <Sheet onOpenChange={setIsProjectSheetOpen} open={isProjectSheetOpen}>
      <motion.div
        animate={{ clipPath: "inset(0% 0% round 0px)", opacity: 1, scale: 1 }}
        className="grid h-screen min-h-0 w-screen min-w-0 grid-cols-[56px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-hidden bg-background text-foreground font-sans [background-image:radial-gradient(circle_at_16%_0%,rgba(0,217,146,0.14),transparent_28%),linear-gradient(135deg,rgba(61,58,57,0.22),transparent_42%)] lg:grid-cols-[56px_360px_minmax(0,1fr)] 2xl:grid-cols-[56px_400px_minmax(0,1fr)]"
        initial={{ clipPath: "inset(18% 20% round 32px)", opacity: 0, scale: 0.94 }}
        transition={{ duration: 0.52, ease: [0.18, 0.9, 0.2, 1] }}
      >
        <nav className="z-50 flex min-h-0 w-14 shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar/95 py-4 shadow-[10px_0_40px_-34px_rgba(0,217,146,0.55)]">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                aria-label="返回跃课首页"
                className="mb-8 flex size-10 cursor-pointer items-center justify-center rounded-2xl border border-brand/25 bg-card text-brand shadow-[0_0_22px_rgba(0,217,146,0.18)] transition-colors hover:border-brand/55"
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
              setHasLiveArtifactAuthority(false);
              setPersistedVersions([]);
            }}
          />
          <RailButton
            icon={Folder}
            isActive={isProjectSheetOpen}
            label="项目切换"
            onClick={() => setIsProjectSheetOpen(true)}
          />
          <ThemeToggle className="mt-2" compact />
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
              isLoading={isProjectDirectoryLoading}
              onSelectProject={handleSelectProject}
              projects={projects}
            />
          </div>
        </SheetContent>

        <Sheet>
          <SheetTrigger asChild>
            <Button
              className="fixed bottom-4 left-4 z-50 rounded-full shadow-[0_0_28px_rgba(0,217,146,0.28)] lg:hidden"
              size="icon"
              type="button"
              variant="brand"
            >
              <MessageSquareText className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[92vw] overflow-hidden p-0 sm:max-w-md lg:hidden" side="left">
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

        <div className="hidden h-full min-h-0 min-w-0 overflow-hidden lg:block">
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
            isHtmlGenerationPending={lessonConfirmed && isLoading}
            isLoading={isLoading}
            isRestoringVersion={isRestoringArtifactVersionState}
            lifecycle={effectiveArtifactLifecycle}
            projectId={projectId}
            onGenerateHtml={() => {
              void generateHtmlFromLesson();
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

export default function SmartEduWorkspace() {
  return <AppContent />;
}
