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
import { inlineArtifactImagesForBrowserHtml } from "@/lib/artifact-image-browser-inline";

type UseArtifactControllerInput = {
  isHtmlGenerationPending: boolean;
  lifecycle: ArtifactLifecycle;
  onGenerateHtml: () => void;
  onRestoreArtifactVersion?: (snapshot: ArtifactSnapshot) => Promise<void> | void;
  projectId?: string | null;
};

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
  const currentHtmlDocument = useMemo(() => {
    if (lifecycle.html.trim()) {
      return lifecycle.html;
    }

    return "";
  }, [lifecycle.html]);
  const canRestoreSelectedVersion = Boolean(
    selectedVersion?.persistedVersionId &&
      !selectedVersion.isCurrent &&
      onRestoreArtifactVersion,
  );
  const triggerLocalHtmlDownload = (htmlContent: string) => {
    const url = URL.createObjectURL(new Blob([htmlContent], { type: "text/html;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "smartedu-pe-screen.html";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const buildOfflineHtmlForLocalDownload = async () => {
    if (!currentHtmlDocument.trim()) {
      throw new Error("暂无可导出的大屏文件，请先确认课时计划并生成互动大屏。");
    }

    const rewritten = await inlineArtifactImagesForBrowserHtml({
      htmlContent: currentHtmlDocument,
    });

    if (rewritten.warnings.length > 0) {
      throw new Error(rewritten.warnings.join("；"));
    }

    return rewritten.html;
  };

  const downloadHtml = () => {
    void (async () => {
      setIsExporting(true);

      try {
        const offlineHtml = await buildOfflineHtmlForLocalDownload();
        triggerLocalHtmlDownload(offlineHtml);

        if (!projectId) {
          toast.success("离线大屏已导出", {
            description: "图片资源已写入 HTML 文件，断网环境下也可直接打开。",
          });
          return;
        }

        try {
          const response = await fetch(`/api/projects/${projectId}/exports/html`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              filename: "smartedu-pe-screen.html",
              html: currentHtmlDocument,
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

          toast.success("离线大屏已导出", {
            description: `图片资源已内联到 HTML，并已同步云端：${parsedPayload.data.exportFile.objectKey}`,
          });
        } catch (exportError) {
          toast.warning("离线大屏已下载，云端同步未完成", {
            description: exportError instanceof Error ? exportError.message : "请检查 S3 环境配置后重试。",
          });
        }
      } catch (downloadError) {
        toast.error("离线大屏导出失败", {
          description:
            downloadError instanceof Error
              ? downloadError.message
              : "受控图片资源未能写入 HTML，当前文件无法保证离线显示。",
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
    setSelectedVersionId,
    setView,
  };
}
