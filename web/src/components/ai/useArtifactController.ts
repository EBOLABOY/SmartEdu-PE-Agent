"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  applyUiHints,
  createUiHintSignature,
} from "@/components/ai/artifact-ui-hints";
import type {
  ArtifactLifecycle,
  ArtifactSnapshot,
} from "@/components/ai/artifact-model";
import {
  getArtifactDefaultView,
} from "@/components/ai/artifact-view-state";
import type { CompetitionLessonPrintFrameHandle } from "@/components/lesson-print/CompetitionLessonPrintFrame";
import {
  exportHtmlResponseSchema,
  type ArtifactView,
} from "@/lib/lesson-authoring-contract";

type UseArtifactControllerInput = {
  isHtmlGenerationPending: boolean;
  lifecycle: ArtifactLifecycle;
  onGenerateHtml: () => void;
  onRestoreArtifactVersion?: (snapshot: ArtifactSnapshot) => Promise<void> | void;
  projectId?: string | null;
};

function getNativeScreenKey(slides: NonNullable<ArtifactLifecycle["slideData"]>) {
  return slides
    .map((slide, index) => `${index}:${slide.title}:${slide.durationSeconds ?? "auto"}:${slide.pagePrompt ?? ""}`)
    .join("|");
}

export function useArtifactController(input: UseArtifactControllerInput) {
  const {
    isHtmlGenerationPending,
    lifecycle,
    onGenerateHtml,
    onRestoreArtifactVersion,
    projectId,
  } = input;
  const [view, setView] = useState<ArtifactView | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const printFrameRef = useRef<CompetitionLessonPrintFrameHandle>(null);
  const lastAppliedUiHintSignatureRef = useRef<string | undefined>(
    createUiHintSignature(lifecycle.activeTrace),
  );
  const activeView = view ?? getArtifactDefaultView(lifecycle, isHtmlGenerationPending);
  const effectiveSelectedVersionId =
    selectedVersionId && lifecycle.versions.some((snapshot) => snapshot.id === selectedVersionId)
      ? selectedVersionId
      : lifecycle.activeArtifact?.id ?? lifecycle.versions.at(-1)?.id ?? null;
  const selectedVersion =
    lifecycle.versions.find((snapshot) => snapshot.id === effectiveSelectedVersionId) ??
    lifecycle.activeArtifact ??
    lifecycle.versions.at(-1);
  const selectedVersionScreenPlan = useMemo(() => {
    if (!selectedVersion) {
      return undefined;
    }

    if (selectedVersion.screenPlan) {
      return selectedVersion.screenPlan;
    }

    if (selectedVersion.stage !== "html") {
      return undefined;
    }

    const selectedVersionIndex = lifecycle.versions.findIndex((snapshot) => snapshot.id === selectedVersion.id);
    const priorVersions =
      selectedVersionIndex >= 0
        ? lifecycle.versions.slice(0, selectedVersionIndex).reverse()
        : [...lifecycle.versions].reverse();

    return (
      priorVersions.find((snapshot) => snapshot.stage === "lesson" && snapshot.screenPlan)?.screenPlan ??
      lifecycle.screenPlan
    );
  }, [lifecycle.screenPlan, lifecycle.versions, selectedVersion]);
  const selectedVersionSlideData = selectedVersionScreenPlan?.sections ?? [];
  const selectedVersionScreenKey = getNativeScreenKey(selectedVersionSlideData);
  const canRestoreSelectedVersion = Boolean(
    selectedVersion?.persistedVersionId &&
      !selectedVersion.isCurrent &&
      onRestoreArtifactVersion,
  );
  const downloadBlob = useMemo(() => {
    if (!lifecycle.html) {
      return null;
    }

    return new Blob([lifecycle.html], { type: "text/html;charset=utf-8" });
  }, [lifecycle.html]);

  const downloadHtmlLocally = () => {
    if (!downloadBlob) {
      toast.warning("暂无可导出的大屏文件", { description: "请先确认课时计划并生成互动大屏。" });
      return;
    }

    const url = URL.createObjectURL(downloadBlob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "smartedu-pe-screen.html";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadHtml = () => {
    void (async () => {
      if (!downloadBlob) {
        toast.warning("暂无可导出的大屏文件", { description: "请先确认课时计划并生成互动大屏。" });
        return;
      }

      if (!projectId) {
        downloadHtmlLocally();
        toast.success("大屏文件已导出", { description: "当前为临时会话，已保存为本地 HTML 文件。" });
        return;
      }

      setIsExporting(true);

      try {
        const response = await fetch(`/api/projects/${projectId}/exports/html`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            filename: "smartedu-pe-screen.html",
            html: lifecycle.html,
          }),
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
              ? payload.error
              : "云端导出失败。",
          );
        }

        const parsedPayload = exportHtmlResponseSchema.safeParse(payload);

        if (!parsedPayload.success) {
          throw new Error("云端导出响应结构不合法。");
        }

        downloadHtmlLocally();
        toast.success("大屏文件已导出", {
          description: `已写入 S3：${parsedPayload.data.exportFile.objectKey}`,
        });
      } catch (exportError) {
        downloadHtmlLocally();
        toast.warning("云端导出未完成，已改为本地导出", {
          description: exportError instanceof Error ? exportError.message : "请检查 S3 环境配置后重试。",
        });
      } finally {
        setIsExporting(false);
      }
    })();
  };

  const generateHtml = () => {
    setView("canvas");
    onGenerateHtml();
  };

  const printLesson = () => {
    printFrameRef.current?.print();
  };

  const restoreSelectedVersion = () => {
    if (!selectedVersion || !onRestoreArtifactVersion) {
      return;
    }

    void onRestoreArtifactVersion(selectedVersion);
  };

  useEffect(() => {
    const signature = createUiHintSignature(lifecycle.activeTrace);

    if (!signature || signature === lastAppliedUiHintSignatureRef.current) {
      return;
    }

    lastAppliedUiHintSignatureRef.current = signature;
    applyUiHints(lifecycle.activeUiHints, {
      setView,
      showToast: ({ description, level, title }) => {
        switch (level) {
          case "success":
            toast.success(title, { ...(description ? { description } : {}) });
            return;
          case "warning":
            toast.warning(title, { ...(description ? { description } : {}) });
            return;
          case "error":
            toast.error(title, { ...(description ? { description } : {}) });
            return;
          default:
            toast(title, { ...(description ? { description } : {}) });
        }
      },
      triggerPrint: () => {
        printFrameRef.current?.print();
      },
    });
  }, [lifecycle.activeTrace, lifecycle.activeUiHints]);

  return {
    activeView,
    canRestoreSelectedVersion,
    downloadHtml,
    generateHtml,
    isExporting,
    printFrameRef,
    printLesson,
    restoreSelectedVersion,
    selectedVersion,
    selectedVersionScreenKey,
    selectedVersionSlideData,
    setSelectedVersionId,
    setView,
  };
}
