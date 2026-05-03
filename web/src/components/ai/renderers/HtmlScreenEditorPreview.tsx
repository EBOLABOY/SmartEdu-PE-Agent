"use client";

import React, { useEffect, useMemo } from "react";

import {
  buildHtmlScreenEditorPreviewDocument,
  type HtmlScreenPageSelection,
} from "@/lib/html-screen-editor";
import type { HtmlArtifactPage } from "@/lib/lesson-authoring-contract";

interface HtmlScreenEditorPreviewProps {
  htmlContent: string;
  htmlPages?: HtmlArtifactPage[];
  onSelectPage?: (page: HtmlScreenPageSelection) => void;
  selectedPageIndex?: number | null;
}

export default function HtmlScreenEditorPreview({
  htmlContent,
  htmlPages,
  onSelectPage,
  selectedPageIndex,
}: HtmlScreenEditorPreviewProps) {
  const pages = useMemo(
    () =>
      [...(htmlPages ?? [])]
        .sort((left, right) => left.pageIndex - right.pageIndex)
        .map((page) => ({
          ...page,
          previewHtml: buildHtmlScreenEditorPreviewDocument({
            htmlContent,
            pageIndex: page.pageIndex,
            sectionHtml: page.sectionHtml,
          }),
        })),
    [htmlContent, htmlPages],
  );
  const activePage =
    pages.find((page) => page.pageIndex === selectedPageIndex) ??
    pages.find((page) => page.pageIndex === pages[0]?.pageIndex) ??
    pages[0];

  useEffect(() => {
    if (!activePage || !onSelectPage) {
      return;
    }

    onSelectPage({
      pageIndex: activePage.pageIndex,
      pageRole: activePage.pageRole,
      pageTitle: activePage.pageTitle,
    });
  }, [activePage, onSelectPage]);

  if (pages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 text-sm text-white/70">
        当前大屏缺少可预览内容，无法进入单页编辑视图。
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center bg-muted/25 px-4 py-6 sm:p-8">
      <div className="relative w-full max-w-[1320px] aspect-video overflow-hidden rounded-[24px] border border-border/70 bg-background shadow-[0_24px_64px_-50px_rgba(15,23,42,0.7)]">
        <iframe
          className="absolute inset-0 h-full w-full border-none bg-white"
          loading="lazy"
          sandbox="allow-same-origin allow-scripts"
          srcDoc={activePage.previewHtml}
          title="互动大屏单页预览"
        />
      </div>
    </div>
  );
}
