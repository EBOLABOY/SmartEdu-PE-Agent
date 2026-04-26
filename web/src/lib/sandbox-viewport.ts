export const SANDBOX_DESIGN_WIDTH = 1920;
export const SANDBOX_DESIGN_HEIGHT = 1080;

export type SandboxFitMode = "contain" | "cover";

export type SandboxViewportSize = {
  width: number;
  height: number;
};

export type SandboxDesignSize = {
  width: number;
  height: number;
};

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

export function buildSandboxFrameStyle(scale: number, design: SandboxDesignSize = {
  width: SANDBOX_DESIGN_WIDTH,
  height: SANDBOX_DESIGN_HEIGHT,
}) {
  return {
    width: design.width,
    height: design.height,
    transform: `translateX(-50%) scale(${scale})`,
    transformOrigin: "top center",
  };
}
