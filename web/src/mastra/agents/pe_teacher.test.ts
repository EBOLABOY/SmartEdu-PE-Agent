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
      "agenticToolUseSkill",
      "baseTeacherPersonaSkill",
      "competitionLessonFormatSkill",
      "htmlScreenSkill",
      "lessonAuthoringSkill",
      "lessonInputDefaultsSkill",
    ]);
  });

  it("课时计划 Agent 只暴露检索和需求诊断工具，不暴露产物搬运工具", async () => {
    const agentTools = await mastra.getAgent("peTeacherAgent").listTools();
    const globalTools = mastra.listTools();

    expect(Object.keys(agentTools ?? {})).toEqual(
      expect.arrayContaining([
        "analyze_requirements",
        "searchStandards",
      ]),
    );
    expect(Object.keys(agentTools ?? {})).not.toEqual(
      expect.arrayContaining([
        "apply_lesson_patch",
        "design_html_screen",
        "generate_structured_lesson",
        "submit_html_screen",
        "submit_lesson_plan",
        "write_lesson_plan",
      ]),
    );
    expect(globalTools).toHaveProperty("analyze_requirements");
    expect(globalTools).toHaveProperty("apply_lesson_patch");
    expect(globalTools).toHaveProperty("design_html_screen");
    expect(globalTools).toHaveProperty("generate_structured_lesson");
    expect(globalTools).toHaveProperty("searchStandards");
    expect(globalTools).toHaveProperty("submit_lesson_plan");
    expect(globalTools).toHaveProperty("submit_html_screen");
    expect(globalTools).toHaveProperty("write_lesson_plan");
  });

  it("lesson 阶段按需检索或诊断，正式课时计划由服务端管线提交", () => {
    const prompt = buildPeTeacherSystemPrompt(undefined, { mode: "lesson" });

    expect(prompt).toContain("普通聊天");
    expect(prompt).toContain("直接回复，不调用工具");
    expect(prompt).toContain("按需");
    expect(prompt).toContain("CompetitionLessonPlan");
    expect(prompt).toContain("服务端");
    expect(prompt).toContain("不要输出 lessonPlan JSON");
    expect(prompt).toContain("优先自然追问");
    expect(prompt).toContain("request");
    expect(prompt).toContain("保留教师本轮原始需求");
    expect(prompt).toContain("用户资料只能放入");
    expect(prompt).toContain("对象");
    expect(prompt).toContain("durationMinutes");
    expect(prompt).toContain("studentCount");
    expect(prompt).not.toContain("submit_lesson_plan");
    expect(prompt).not.toContain("AgentLessonGeneration JSON");
    expect(prompt).not.toContain("信息模糊时先调用 `analyze_requirements`");
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
    expect(prompt).toContain("这不是教师本轮原话");
    expect(prompt).toContain("不要拼接到 request 字段里");
  });

  it("html 阶段要求服务端生成课堂学习辅助大屏，不暴露提交工具", () => {
    const prompt = buildPeTeacherSystemPrompt(undefined, {
      mode: "html",
      lessonPlan: "## 十、课时计划\n| 课堂常规 | 1 分钟 |\n| 战术学习 | 8 分钟 |",
    });

    expect(prompt).toContain("服务端");
    expect(prompt).toContain("不要调用提交工具");
    expect(prompt).not.toContain("submit_html_screen");
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
