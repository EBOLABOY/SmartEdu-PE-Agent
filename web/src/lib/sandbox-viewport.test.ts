import { describe, expect, it } from "vitest";

import { buildSandboxFrameStyle, calculateSandboxScale } from "@/lib/sandbox-viewport";

describe("sandbox-viewport", () => {
  it("预览模式使用 contain 策略完整显示画布", () => {
    expect(calculateSandboxScale({ width: 1600, height: 1200 }, "contain")).toBeCloseTo(1600 / 1920);
  });

  it("全屏投屏模式使用 cover 策略铺满容器", () => {
    expect(calculateSandboxScale({ width: 1600, height: 1200 }, "cover")).toBeCloseTo(1200 / 1080);
  });

  it("会生成顶部对齐的缩放样式", () => {
    expect(buildSandboxFrameStyle(0.5)).toEqual({
      width: 1920,
      height: 1080,
      transform: "translateX(-50%) scale(0.5)",
      transformOrigin: "top center",
    });
  });
});
