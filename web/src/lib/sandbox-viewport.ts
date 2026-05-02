export const SANDBOX_DESIGN_WIDTH = 1920;
export const SANDBOX_DESIGN_HEIGHT = 1080;

export type SandboxFitMode = "contain" | "cover";
export type SandboxFrameVerticalAlign = "top" | "center";

export type SandboxViewportSize = {
  width: number;
  height: number;
};

export type SandboxDesignSize = {
  width: number;
  height: number;
};

export type SandboxViewportPreset = {
  fitMode: SandboxFitMode;
  verticalAlign: SandboxFrameVerticalAlign;
};

export function resolveSandboxViewportPreset(fullscreen: boolean): SandboxViewportPreset {
  return {
    fitMode: "contain",
    verticalAlign: fullscreen ? "center" : "top",
  };
}

export function calculateSandboxScale(
  viewport: SandboxViewportSize,
  fitMode: SandboxFitMode,
  design: SandboxDesignSize = {
    width: SANDBOX_DESIGN_WIDTH,
    height: SANDBOX_DESIGN_HEIGHT,
  },
) {
  const widthRatio = viewport.width / design.width;
  const heightRatio = viewport.height / design.height;
  const scale = fitMode === "cover" ? Math.max(widthRatio, heightRatio) : Math.min(widthRatio, heightRatio);

  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

export function buildSandboxFrameStyle(
  scale: number,
  design: SandboxDesignSize = {
    width: SANDBOX_DESIGN_WIDTH,
    height: SANDBOX_DESIGN_HEIGHT,
  },
  options: {
    verticalAlign?: SandboxFrameVerticalAlign;
  } = {},
) {
  const verticalAlign = options.verticalAlign ?? "top";
  const centered = verticalAlign === "center";

  return {
    width: design.width,
    height: design.height,
    left: "50%",
    top: centered ? "50%" : 0,
    transform: centered
      ? `translate(-50%, -50%) scale(${scale})`
      : `translateX(-50%) scale(${scale})`,
    transformOrigin: centered ? "center center" : "top center",
  };
}
