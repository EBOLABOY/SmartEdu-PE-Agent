"use client";

import { ShieldAlert } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { analyzeSandboxHtml, injectSandboxCsp } from "@/lib/sandbox-html";

interface IframeSandboxProps {
  htmlContent: string;
}

const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;

export default function IframeSandbox({ htmlContent }: IframeSandboxProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const securityReport = useMemo(() => analyzeSandboxHtml(htmlContent), [htmlContent]);
  const sandboxedHtml = useMemo(
    () => (securityReport.blockedReasons.length === 0 ? injectSandboxCsp(htmlContent) : ""),
    [htmlContent, securityReport.blockedReasons.length],
  );

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const updateScale = () => {
      const { width, height } = container.getBoundingClientRect();
      setScale(Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  if (securityReport.blockedReasons.length > 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black p-6">
        <div className="max-w-xl rounded-2xl border border-destructive/40 bg-background/95 p-6 text-left shadow-xl">
          <div className="flex items-center gap-3">
            <ShieldAlert className="size-5 text-destructive" />
            <h3 className="text-sm font-semibold text-foreground">已阻断高风险大屏预览</h3>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            当前大屏包含外部资源或高风险操作。为保证系统稳定，本次预览已被拒绝。
          </p>
          <div className="mt-4 space-y-2 text-sm text-foreground">
            {securityReport.blockedReasons.map((reason) => (
              <p key={reason}>- {reason}</p>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-black">
      <iframe
        className="absolute left-1/2 top-1/2 border-none bg-white"
        sandbox="allow-scripts"
        srcDoc={sandboxedHtml}
        style={{
          width: DESIGN_WIDTH,
          height: DESIGN_HEIGHT,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
        title="互动大屏预览"
      />

      {securityReport.warnings.length > 0 ? (
        <div className="absolute left-4 top-4 max-w-md rounded-xl border border-border/60 bg-background/90 px-3 py-2 text-xs text-foreground shadow-md backdrop-blur">
          {securityReport.warnings[0]}
        </div>
      ) : null}
    </div>
  );
}
