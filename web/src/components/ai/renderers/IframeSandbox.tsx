"use client";

import { Info, Maximize2, Minimize2, ShieldAlert } from "lucide-react";
import React, { useEffect, useMemo, useState, type CSSProperties } from "react";

import { analyzeSandboxHtml, injectSandboxCsp } from "@/lib/sandbox-html";
import {
  buildSandboxFrameStyle,
  calculateSandboxScale,
  SANDBOX_DESIGN_HEIGHT,
  SANDBOX_DESIGN_WIDTH,
} from "@/lib/sandbox-viewport";

interface IframeSandboxProps {
  htmlContent: string;
}

function useSandboxViewport() {
  const [containerElement, setContainerElement] = useState<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!containerElement) {
      return;
    }

    const updateViewport = () => {
      const { width, height } = containerElement.getBoundingClientRect();
      const fullscreen = document.fullscreenElement === containerElement;

      setIsFullscreen(fullscreen);
      setScale(calculateSandboxScale({ width, height }, fullscreen ? "cover" : "contain"));
    };

    updateViewport();
    const observer = new ResizeObserver(updateViewport);
    observer.observe(containerElement);
    document.addEventListener("fullscreenchange", updateViewport);

    return () => {
      observer.disconnect();
      document.removeEventListener("fullscreenchange", updateViewport);
    };
  }, [containerElement]);

  const toggleFullscreen = async () => {
    if (!containerElement) {
      return;
    }

    if (document.fullscreenElement === containerElement) {
      await document.exitFullscreen();
      return;
    }

    await containerElement.requestFullscreen();
  };

  return [
    setContainerElement,
    buildSandboxFrameStyle(scale),
    isFullscreen,
    toggleFullscreen,
  ] as const;
}

function BlockedSandboxState({ blockedReasons }: { blockedReasons: string[] }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-950 p-6">
      <div className="max-w-xl rounded-2xl border border-destructive/40 bg-background/95 p-6 text-left shadow-xl">
        <div className="flex items-center gap-3">
          <ShieldAlert className="size-5 text-destructive" />
          <h3 className="text-sm font-semibold text-foreground">已阻断高风险大屏预览</h3>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          当前大屏包含外部资源或高风险操作。为保证系统稳定，本次预览已被拒绝。
        </p>
        <div className="mt-4 space-y-2 text-sm text-foreground">
          {blockedReasons.map((reason) => (
            <p key={reason}>- {reason}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

function SandboxFrame({ frameStyle, htmlContent }: { frameStyle: CSSProperties; htmlContent: string }) {
  return (
    <iframe
      className="absolute left-1/2 top-0 border-none bg-white"
      sandbox="allow-scripts"
      srcDoc={htmlContent}
      style={frameStyle}
      title="互动大屏预览"
    />
  );
}

function FullscreenButton({
  isFullscreen,
  onToggleFullscreen,
}: {
  isFullscreen: boolean;
  onToggleFullscreen: () => Promise<void>;
}) {
  return (
    <button
      aria-label={isFullscreen ? "退出全屏预览" : "全屏预览互动大屏"}
      className="pointer-events-auto inline-flex size-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/75 shadow-md backdrop-blur transition hover:border-white/40 hover:bg-white/18 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/60"
      onClick={() => {
        void onToggleFullscreen();
      }}
      title={isFullscreen ? "退出全屏预览" : "全屏预览互动大屏"}
      type="button"
    >
      {isFullscreen ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}
    </button>
  );
}

function SandboxChrome({
  frameStyle,
  isFullscreen,
  onToggleFullscreen,
  warnings,
}: {
  frameStyle: CSSProperties;
  isFullscreen: boolean;
  onToggleFullscreen: () => Promise<void>;
  warnings: string[];
}) {
  if (isFullscreen) {
    return (
      <div className="absolute right-4 top-4 z-10">
        <FullscreenButton isFullscreen={isFullscreen} onToggleFullscreen={onToggleFullscreen} />
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute left-1/2 top-0 z-10" style={frameStyle}>
      <div className="absolute right-4 top-4">
        <FullscreenButton isFullscreen={isFullscreen} onToggleFullscreen={onToggleFullscreen} />
      </div>

      {warnings[0] ? (
        <div
          className="absolute bottom-4 left-4 inline-flex size-7 items-center justify-center rounded-full border border-white/15 bg-slate-950/40 text-white/55 shadow-md backdrop-blur"
          title={warnings[0]}
        >
          <Info className="size-3.5" />
        </div>
      ) : null}
    </div>
  );
}

export default function IframeSandbox({ htmlContent }: IframeSandboxProps) {
  const [setViewportElement, frameStyle, isFullscreen, toggleFullscreen] = useSandboxViewport();
  const securityReport = useMemo(() => analyzeSandboxHtml(htmlContent), [htmlContent]);
  const sandboxedHtml = useMemo(
    () => (securityReport.blockedReasons.length === 0 ? injectSandboxCsp(htmlContent) : ""),
    [htmlContent, securityReport.blockedReasons.length],
  );

  if (securityReport.blockedReasons.length > 0) {
    return <BlockedSandboxState blockedReasons={securityReport.blockedReasons} />;
  }

  return (
    <div ref={setViewportElement} className="relative h-full w-full overflow-hidden bg-slate-950">
      <SandboxFrame frameStyle={frameStyle} htmlContent={sandboxedHtml} />
      <SandboxChrome
        frameStyle={frameStyle}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        warnings={securityReport.warnings}
      />
      <span className="sr-only">
        当前预览按 {SANDBOX_DESIGN_WIDTH}×{SANDBOX_DESIGN_HEIGHT} 课堂投屏画布渲染。
      </span>
    </div>
  );
}
