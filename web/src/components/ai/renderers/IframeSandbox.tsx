"use client";

import { Info, Maximize2, Minimize2, ShieldAlert } from "lucide-react";
import React, { useEffect, useState, type CSSProperties } from "react";

import {
  analyzeBrowserSandboxHtml,
  injectBrowserSandboxCsp,
  type SandboxSecurityReport,
} from "@/lib/browser-sandbox-html";
import {
  buildSandboxFrameStyle,
  calculateSandboxScale,
  resolveSandboxViewportPreset,
  SANDBOX_DESIGN_HEIGHT,
  SANDBOX_DESIGN_WIDTH,
} from "@/lib/sandbox-viewport";
import { isArtifactImageProxyUrl } from "@/lib/s3/artifact-image-url";

interface IframeSandboxProps {
  htmlContent: string;
}

type SandboxRenderState = SandboxSecurityReport & {
  sandboxedHtml: string;
};

type ResolvedSandboxHtml = {
  html: string;
  objectUrls: string[];
  warnings: string[];
};

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
      const viewportPreset = resolveSandboxViewportPreset(fullscreen);

      setIsFullscreen(fullscreen);
      setScale(calculateSandboxScale({ width, height }, viewportPreset.fitMode));
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
    buildSandboxFrameStyle(scale, undefined, {
      verticalAlign: resolveSandboxViewportPreset(isFullscreen).verticalAlign,
    }),
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
      className="absolute border-none bg-white"
      sandbox="allow-scripts"
      srcDoc={htmlContent}
      style={frameStyle}
      title="互动大屏预览"
    />
  );
}

async function resolveArtifactImagesForSandboxPreview(
  htmlContent: string,
  signal: AbortSignal,
): Promise<ResolvedSandboxHtml> {
  const document = new DOMParser().parseFromString(htmlContent, "text/html");
  const objectUrls: string[] = [];
  const warnings: string[] = [];
  const imageElements = Array.from(document.querySelectorAll<HTMLImageElement>("img[src]"));

  await Promise.all(
    imageElements.map(async (imageElement) => {
      const source = imageElement.getAttribute("src");

      if (!source || !isArtifactImageProxyUrl(source)) {
        return;
      }

      try {
        const response = await fetch(source, {
          credentials: "include",
          signal,
        });

        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }

        const contentType = response.headers.get("content-type") ?? "";

        if (!contentType.startsWith("image/")) {
          throw new Error(`unexpected content-type: ${contentType || "unknown"}`);
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);

        objectUrls.push(objectUrl);
        imageElement.setAttribute("src", objectUrl);
      } catch (error) {
        if (signal.aborted) {
          return;
        }

        warnings.push(
          `受控图片资源加载失败：${source}（${error instanceof Error ? error.message : "unknown-error"}）`,
        );
      }
    }),
  );

  return {
    html: `<!DOCTYPE html>\n${document.documentElement.outerHTML}`,
    objectUrls,
    warnings,
  };
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
    <div className="pointer-events-none absolute z-10" style={frameStyle}>
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

function useSandboxSecurity(htmlContent: string) {
  const [report, setReport] = useState<SandboxRenderState | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || typeof DOMParser === "undefined") {
      return;
    }

    let cancelled = false;
    const abortController = new AbortController();
    let objectUrls: string[] = [];
    const securityReport = analyzeBrowserSandboxHtml(htmlContent);

    const prepareSandboxHtml = async () => {
      if (securityReport.blockedReasons.length > 0) {
        return {
          ...securityReport,
          sandboxedHtml: "",
        };
      }

      const resolved = await resolveArtifactImagesForSandboxPreview(
        htmlContent,
        abortController.signal,
      );
      objectUrls = resolved.objectUrls;

      return {
        ...securityReport,
        warnings: [...securityReport.warnings, ...resolved.warnings],
        sandboxedHtml: injectBrowserSandboxCsp(resolved.html),
      };
    };

    void prepareSandboxHtml().then((nextReport) => {
      if (cancelled) {
        objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
        return;
      }

      if (!cancelled) {
        setReport(nextReport);
      }
    });

    return () => {
      cancelled = true;
      abortController.abort();
      objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
    };
  }, [htmlContent]);

  return report;
}

export default function IframeSandbox({ htmlContent }: IframeSandboxProps) {
  const [setViewportElement, frameStyle, isFullscreen, toggleFullscreen] = useSandboxViewport();
  const securityReport = useSandboxSecurity(htmlContent);

  if (!securityReport) {
    return <div className="h-full w-full animate-pulse bg-slate-950" />;
  }

  if (securityReport.blockedReasons.length > 0) {
    return <BlockedSandboxState blockedReasons={securityReport.blockedReasons} />;
  }

  return (
    <div ref={setViewportElement} className="relative h-full w-full overflow-hidden bg-slate-950">
      <SandboxFrame frameStyle={frameStyle} htmlContent={securityReport.sandboxedHtml} />
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
