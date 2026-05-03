"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

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
    () => [...(htmlPages ?? [])].sort((left, right) => left.pageIndex - right.pageIndex),
    [htmlPages],
  );
  const activePage =
    pages.find((page) => page.pageIndex === selectedPageIndex) ??
    pages.find((page) => page.pageIndex === pages[0]?.pageIndex) ??
    pages[0];
  const previewHtml = activePage
    ? buildHtmlScreenEditorPreviewDocument({
      htmlContent,
      pageIndex: activePage.pageIndex,
      sectionHtml: activePage.sectionHtml,
    })
    : htmlContent;

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

  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!activePage) return;
    
    const updateScale = () => {
      if (!containerRef.current) return;
      const { width, height } = containerRef.current.getBoundingClientRect();
      // 按照标准 1920x1080 分辨率进行安全自适应等比缩放
      const scaleX = width / 1920;
      const scaleY = height / 1080;
      setScale(Math.min(scaleX, scaleY));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, [activePage]);

  if (pages.length === 0 && !htmlContent) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 text-sm text-white/70">
        当前大屏缺少可预览内容，无法进入展示视图。
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex h-full w-full flex-col items-center justify-center overflow-hidden bg-transparent">
      <div 
        style={{ 
          width: 1920, 
          height: 1080, 
          transform: `scale(${scale})`, 
          transformOrigin: "center" 
        }} 
        className="shrink-0 overflow-hidden bg-white shadow-xl ring-1 ring-border/20 sm:rounded-[24px]"
      >
        <iframe
          className="h-full w-full border-none"
          loading="lazy"
          sandbox="allow-same-origin allow-scripts"
          srcDoc={previewHtml}
          title={activePage?.pageTitle ? `互动大屏预览：${activePage.pageTitle}` : "互动大屏预览"}
        />
      </div>
    </div>
  );
}
