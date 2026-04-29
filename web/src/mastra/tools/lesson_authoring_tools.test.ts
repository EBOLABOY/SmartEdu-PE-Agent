import { describe, expect, it } from "vitest";

import { lessonGenerationToolInputSchema } from "./lesson_authoring_tools";

describe("lesson authoring tools", () => {
  it("会把中文自然语言式课时计划工具入参规范化为 schema 类型", () => {
    const parsed = lessonGenerationToolInputSchema.parse({
      request: "帮我生成一个关于武术长拳的课时计划",
      topic: "武术长拳",
      durationMinutes: "40分钟",
      studentCount: "40人",
      equipment: "武术垫40块、长拳教学挂图1套、音响设备1套、标志桶20个",
      constraints: "安全方面注意动作幅度和间距控制",
      context: {
        duration: "40分钟",
        equipment: "武术垫40块、标志桶20个",
        schoolName: "深圳市福田区福新小学",
        teacherName: "张麟鑫",
        teachingGrade: "六年级",
        teachingLevel: "水平三",
      },
    });

    expect(parsed).toMatchObject({
      context: {
        duration: 40,
        equipment: ["武术垫40块", "标志桶20个"],
        schoolName: "深圳市福田区福新小学",
        teacherName: "张麟鑫",
      },
      durationMinutes: 40,
      equipment: ["武术垫40块", "长拳教学挂图1套", "音响设备1套", "标志桶20个"],
      studentCount: 40,
    });
    expect(parsed.constraints).toEqual(["安全方面注意动作幅度和间距控制"]);
  });

  it("误把 context 写成自然语言字符串时会忽略该字段而不是阻断工具调用", () => {
    const parsed = lessonGenerationToolInputSchema.parse({
      context: "深圳市福田区福新小学张麟鑫老师，六年级水平三。",
      request: "帮我生成一个关于武术长拳的课时计划",
      topic: "武术长拳",
    });

    expect(parsed.context).toBeUndefined();
  });
});
