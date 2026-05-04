"use client";

import React, { useEffect, useRef, useState } from "react";

interface HtmlScreenEditorPreviewProps {
  htmlContent: string;
}

export default function HtmlScreenEditorPreview({
  htmlContent,
}: HtmlScreenEditorPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
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
  }, []);

  if (!htmlContent.trim()) {
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
          srcDoc={htmlContent}
          title="互动大屏预览"
        />
      </div>
    </div>
  );
}
