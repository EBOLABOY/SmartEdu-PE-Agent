import { describe, expect, it } from "vitest";

import { buildPeTeacherSystemPrompt, PE_TEACHER_SYSTEM_PROMPT } from "@/mastra/agents/pe_teacher";

describe("pe_teacher", () => {
  it("默认注入广东省比赛体育教案参考格式", () => {
    expect(PE_TEACHER_SYSTEM_PROMPT).toContain("广东省比赛体育教案参考格式硬约束");
    expect(PE_TEACHER_SYSTEM_PROMPT).toContain("九、课时计划(教案)");
    expect(PE_TEACHER_SYSTEM_PROMPT).toContain("一张 8 列综合表格");
    expect(PE_TEACHER_SYSTEM_PROMPT).toContain("课的结构、具体教学内容、教与学的方法、组织形式、运动时间、强度");
  });

  it("lesson 阶段要求流式输出 Markdown 草稿", () => {
    const prompt = buildPeTeacherSystemPrompt(undefined, { mode: "lesson" });

    expect(prompt).toContain("必须严格采用广东省比赛体育教案参考格式");
    expect(prompt).toContain("Markdown 教案草稿");
    expect(prompt).toContain("只输出 Markdown 正文");
    expect(prompt).toContain("| 星级 | 评价方面 |");
    expect(prompt).toContain("| 课的结构 | 具体教学内容 | 教与学的方法 | 组织形式 | 运动时间 | 强度 |");
    expect(prompt).not.toContain("请确认教案是否无误，确认后我再生成互动大屏");
  });

  it("会把用户资料注入教案教师和学段字段", () => {
    const prompt = buildPeTeacherSystemPrompt(
      {
        schoolName: "深圳市南山实验学校",
        teacherName: "王明",
        teachingGrade: "四年级",
        teachingLevel: "水平二",
      },
      { mode: "lesson" },
    );

    expect(prompt).toContain("学校名称：深圳市南山实验学校");
    expect(prompt).toContain("教师姓名：王明");
    expect(prompt).toContain("任教年级：四年级");
    expect(prompt).toContain("水平：水平二");
    expect(prompt).toContain("“学校：”和“授课教师：”必须同步填写");
    expect(prompt).toContain("副标题必须采用“—水平X·X年级”格式");
    expect(prompt).toContain("基础信息表中的年级与水平必须同步填写");
  });

  it("html 阶段要求生成课堂学习辅助大屏和分环节倒计时", () => {
    const prompt = buildPeTeacherSystemPrompt(undefined, {
      mode: "html",
      lessonPlan: "## 十、课时计划（教案）\n| 课堂常规 | 1 分钟 |\n| 战术学习 | 8 分钟 |",
    });

    expect(prompt).toContain("课堂学习辅助大屏");
    expect(prompt).toContain("课堂运行总览");
    expect(prompt).toContain("开始上课");
    expect(prompt).toContain("教案有几个主要环节或教学内容，就至少生成几个对应内容页");
    expect(prompt).toContain("倒计时结束后自动进入下一页");
    expect(prompt).toContain("战术板");
    expect(prompt).toContain('section class="slide" data-duration="秒数"');
    expect(prompt).toContain("1 分钟 = 60 秒");
  });
});
