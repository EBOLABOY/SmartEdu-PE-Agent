"use client";

import React, { useEffect, useMemo } from "react";

import {
  buildHtmlScreenEditorPreviewDocument,
  composeHtmlScreenDocument,
  type HtmlScreenPageSelection,
} from "@/lib/html-screen-editor";
import type { HtmlArtifactPage } from "@/lib/lesson-authoring-contract";

interface HtmlScreenEditorPreviewProps {
  htmlContent: string;
  htmlPages?: HtmlArtifactPage[];
  onSelectPage?: (page: HtmlScreenPageSelection) => void;
  selectedPageIndex?: number | null;
}

function formatPageRole(pageRole?: string) {
  switch (pageRole) {
    case "cover":
      return "首页";
    case "warmup":
      return "热身";
    case "learnPractice":
      return "学练";
    case "competition":
      return "比赛";
    case "fitness":
      return "体能";
    case "cooldown":
      return "放松";
    case "summary":
      return "总结";
    default:
      return pageRole ? pageRole : "页面";
  }
}

export default function HtmlScreenEditorPreview({
  htmlContent,
  htmlPages,
  onSelectPage,
  selectedPageIndex,
}: HtmlScreenEditorPreviewProps) {
  const composedHtmlContent = useMemo(
    () => {
      if (!htmlPages?.length) {
        return "";
      }

      return composeHtmlScreenDocument({
        htmlContent,
        pages: htmlPages,
      });
    },
    [htmlContent, htmlPages],
  );
  const pages = useMemo(
    () =>
      [...(htmlPages ?? [])]
        .sort((left, right) => left.pageIndex - right.pageIndex)
        .map((page) => ({
          ...page,
          previewHtml: buildHtmlScreenEditorPreviewDocument({
            htmlContent: composedHtmlContent,
            pageIndex: page.pageIndex,
            sectionHtml: page.sectionHtml,
          }),
        })),
    [composedHtmlContent, htmlPages],
  );
  const activePageIndex =
    selectedPageIndex !== undefined &&
      selectedPageIndex !== null &&
      selectedPageIndex >= 0 &&
      selectedPageIndex < pages.length
      ? selectedPageIndex
      : pages[0]?.pageIndex ?? 0;

  useEffect(() => {
    const activePage = pages[activePageIndex];

    if (!activePage || !onSelectPage) {
      return;
    }

    onSelectPage({
      pageIndex: activePage.pageIndex,
      pageRole: activePage.pageRole,
      pageTitle: activePage.pageTitle,
    });
  }, [activePageIndex, onSelectPage, pages]);

  if (pages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 text-sm text-white/70">
        当前大屏缺少分页数据，无法进入分页编辑视图。
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/25">
      <div className="shrink-0 border-b border-border/70 bg-card/90 px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">分页编辑视图</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          像 PPT 一样纵向查看页面，点击任意页面后，左侧对话默认只修改当前页。
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
          {pages.map((page) => {
            const isSelected = page.pageIndex === activePageIndex;

            return (
              <article
                className={`rounded-[28px] border bg-card/95 p-4 shadow-sm transition-colors ${
                  isSelected
                    ? "border-brand/50 shadow-[0_20px_60px_-46px_rgba(0,217,146,0.55)]"
                    : "border-border/80"
                }`}
                key={`${page.pageIndex}-${page.pageTitle}`}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                        第 {page.pageIndex + 1} 页
                      </span>
                      <span className="inline-flex rounded-full border border-brand/15 bg-brand/10 px-2.5 py-1 text-[11px] font-medium text-brand">
                        {formatPageRole(page.pageRole)}
                      </span>
                      {isSelected ? (
                        <span className="inline-flex rounded-full border border-brand/20 bg-brand/10 px-2.5 py-1 text-[11px] font-medium text-brand">
                          当前锁定
                        </span>
                      ) : null}
                    </div>
                    <h4 className="mt-2 truncate text-sm font-semibold text-foreground">
                      {page.pageTitle}
                    </h4>
                  </div>
                </div>

                <div className="relative aspect-video overflow-hidden rounded-[24px] border border-border/70 bg-background shadow-[0_24px_64px_-50px_rgba(15,23,42,0.7)]">
                  <iframe
                    className="absolute inset-0 h-full w-full border-none bg-white"
                    loading="lazy"
                    sandbox="allow-same-origin"
                    srcDoc={page.previewHtml}
                    title={`互动大屏第 ${page.pageIndex + 1} 页预览`}
                  />
                  <button
                    aria-label={`选中第 ${page.pageIndex + 1} 页`}
                    className="absolute inset-0"
                    onClick={() => {
                      onSelectPage?.({
                        pageIndex: page.pageIndex,
                        pageRole: page.pageRole,
                        pageTitle: page.pageTitle,
                      });
                    }}
                    type="button"
                  />
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
