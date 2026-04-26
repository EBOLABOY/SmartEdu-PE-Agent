import { describe, expect, it } from "vitest";

import { DEFAULT_COMPETITION_LESSON_PLAN } from "@/lib/competition-lesson-contract";
import {
  COMPETITION_LESSON_EDITABLE_FIELDS,
  getCompetitionLessonEditableField,
} from "@/lib/competition-lesson-fields";

describe("competition-lesson-fields", () => {
  it("只暴露 JSON Pointer 格式的结构化教案字段路径", () => {
    expect(COMPETITION_LESSON_EDITABLE_FIELDS.length).toBeGreaterThan(8);

    COMPETITION_LESSON_EDITABLE_FIELDS.forEach((field) => {
      expect(field.path).toMatch(/^\//);
      expect(field.path).not.toContain("__proto__");
      expect(field.label).toBeTruthy();
      expect(field.group).toBeTruthy();
      expect(field.read(DEFAULT_COMPETITION_LESSON_PLAN)).toEqual(expect.any(String));
    });
  });

  it("可以按 path 获取字段元数据", () => {
    const field = getCompetitionLessonEditableField("/evaluation/1/description");

    expect(field?.label).toBe("二颗星评价");
    expect(field?.read(DEFAULT_COMPETITION_LESSON_PLAN)).toContain("运动兴趣较高");
  });
});
