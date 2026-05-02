import { describe, expect, it } from "vitest";

import {
  buildSandboxFrameStyle,
  calculateSandboxScale,
  resolveSandboxViewportPreset,
} from "@/lib/sandbox-viewport";

describe("sandbox-viewport", () => {
  it("预览模式使用 contain 策略完整显示画布", () => {
    expect(calculateSandboxScale({ width: 1600, height: 1200 }, "contain")).toBeCloseTo(1600 / 1920);
  });

  it("缩放工具仍支持 cover 策略用于需要铺满的特殊场景", () => {
    expect(calculateSandboxScale({ width: 1600, height: 1200 }, "cover")).toBeCloseTo(1200 / 1080);
  });

  it("全屏预览优先完整显示并采用垂直居中策略", () => {
    expect(resolveSandboxViewportPreset(true)).toEqual({
      fitMode: "contain",
      verticalAlign: "center",
    });
  });

  it("常规面板预览保持顶部对齐", () => {
    expect(resolveSandboxViewportPreset(false)).toEqual({
      fitMode: "contain",
      verticalAlign: "top",
    });
  });

  it("会生成顶部对齐的缩放样式", () => {
    expect(buildSandboxFrameStyle(0.5)).toEqual({
      width: 1920,
      height: 1080,
      left: "50%",
      top: 0,
      transform: "translateX(-50%) scale(0.5)",
      transformOrigin: "top center",
    });
  });

  it("会生成垂直居中的缩放样式", () => {
    expect(buildSandboxFrameStyle(0.5, undefined, { verticalAlign: "center" })).toEqual({
      width: 1920,
      height: 1080,
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%) scale(0.5)",
      transformOrigin: "center center",
    });
  });
});
