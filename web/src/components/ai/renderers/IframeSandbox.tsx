"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

interface IframeSandboxProps {
  htmlContent: string;
}

const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;

function injectSandboxCsp(htmlContent: string) {
  const csp = [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    "img-src data: blob:",
    "font-src data:",
    "connect-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
  const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;

  if (/<head[\s>]/i.test(htmlContent)) {
    return htmlContent.replace(/<head([^>]*)>/i, `<head$1>${meta}`);
  }

  return `<!DOCTYPE html><html lang="zh-CN"><head>${meta}<meta charset="utf-8"></head><body>${htmlContent}</body></html>`;
}

export default function IframeSandbox({ htmlContent }: IframeSandboxProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const sandboxedHtml = useMemo(() => injectSandboxCsp(htmlContent), [htmlContent]);

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
        title="Artifact Preview Sandbox"
      />
    </div>
  );
}
