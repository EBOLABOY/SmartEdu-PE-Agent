import { describe, expect, it } from "vitest";

import { buildPeTeacherSystemPrompt, PE_TEACHER_SYSTEM_PROMPT } from "@/mastra/agents/pe_teacher";
import { mastra } from "@/mastra";
import { peTeacherPromptSkills } from "@/mastra/skills";

describe("pe_teacher", () => {
  it("默认注入广东省比赛体育课时计划参考格式", () => {
    expect(PE_TEACHER_SYSTEM_PROMPT).toContain("广东省");
    expect(PE_TEACHER_SYSTEM_PROMPT).toContain("课时计划");
    expect(PE_TEACHER_SYSTEM_PROMPT).toContain("periodPlan");
    expect(PE_TEACHER_SYSTEM_PROMPT).toContain("evaluation");
  });

  it("暴露可枚举的 prompt skills，便于后续 runtime skill 组合", () => {
    expect(Object.keys(peTeacherPromptSkills).sort()).toEqual([
      "baseTeacherPersonaSkill",
      "competitionLessonFormatSkill",
      "htmlScreenSkill",
      "lessonAuthoringSkill",
      "lessonInputDefaultsSkill",
    ]);
  });

  it("课时计划生成 Agent 直接暴露课标检索和输出工具", async () => {
    const agentTools = await mastra.getAgent("peTeacherAgent").listTools();
    const globalTools = mastra.listTools();

    expect(Object.keys(agentTools ?? {})).toEqual(
      expect.arrayContaining(["searchStandards", "submit_lesson_plan", "submit_html_screen"]),
    );
    expect(globalTools).toHaveProperty("searchStandards");
    expect(globalTools).toHaveProperty("submit_lesson_plan");
    expect(globalTools).toHaveProperty("submit_html_screen");
  });

  it("lesson 阶段要求最终通过 submit_lesson_plan 提交课时计划", () => {
    const prompt = buildPeTeacherSystemPrompt(undefined, { mode: "lesson" });

    expect(prompt).toContain("submit_lesson_plan");
    expect(prompt).toContain("CompetitionLessonPlan");
    expect(prompt).toContain("summary");
    expect(prompt).toContain("AgentLessonGeneration JSON");
    expect(prompt).not.toContain("<artifact>");
  });

  it("会把用户资料注入课时计划教师和学段字段", () => {
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
    expect(prompt).toContain("teacher.school");
    expect(prompt).toContain("teacher.name");
  });

  it("html 阶段要求生成课堂学习辅助大屏并通过 submit_html_screen 提交", () => {
    const prompt = buildPeTeacherSystemPrompt(undefined, {
      mode: "html",
      lessonPlan: "## 十、课时计划\n| 课堂常规 | 1 分钟 |\n| 战术学习 | 8 分钟 |",
    });

    expect(prompt).toContain("submit_html_screen");
    expect(prompt).toContain("课堂运行总览");
    expect(prompt).toContain("开始上课");
    expect(prompt).toContain("data-support-module");
    expect(prompt).toContain("战术板");
    expect(prompt).toContain("上一页");
    expect(prompt).toContain("下一页");
  });

  it("html 阶段会注入结构化大屏模块计划", () => {
    const prompt = buildPeTeacherSystemPrompt(undefined, {
      mode: "html",
      lessonPlan: "## 十、课时计划\n| 比赛展示 | 6 分钟 |",
      screenPlan: {
        sections: [
          {
            title: "比赛展示",
            durationSeconds: 360,
            supportModule: "scoreboard",
            reason: "比赛挑战页需要即时计分反馈。",
          },
        ],
      },
    });

    expect(prompt).toContain("结构化大屏模块计划");
    expect(prompt).toContain("比赛展示");
    expect(prompt).toContain("durationSeconds=360");
    expect(prompt).toContain("supportModule=scoreboard");
  });
});
