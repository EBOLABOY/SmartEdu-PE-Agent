import { describe, expect, it } from "vitest";

import { buildLessonScreenDesignSpec, resolveLessonScreenTheme } from "./lesson-screen-design";

describe("lesson-screen-design", () => {
  it("会根据运动项目选择视觉主题", () => {
    expect(resolveLessonScreenTheme("篮球传切配合").name).toBe("basketball-energy");
    expect(resolveLessonScreenTheme("足球控球射门").name).toBe("football-field");
    expect(resolveLessonScreenTheme("排球垫球练习").name).toBe("volleyball-court");
  });

  it("会为战术页和总结页生成页面节奏标记", () => {
    const spec = buildLessonScreenDesignSpec("篮球传切配合", [
      { title: "课堂常规", boardRequired: false },
      { title: "战术学习", boardRequired: true },
      { title: "放松总结", boardRequired: false },
    ]);

    expect(spec.theme.name).toBe("basketball-energy");
    expect(spec.rhythm.P01).toBe("dense");
    expect(spec.rhythm.P02).toBe("activity");
    expect(spec.rhythm.P03).toBe("breathing");
  });
});
