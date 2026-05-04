import { describe, expect, it } from "vitest";

import { buildPeTeacherSystemPrompt, PE_TEACHER_SYSTEM_PROMPT } from "@/mastra/agents/pe_teacher";
import { mastra } from "@/mastra";
import { peTeacherPromptSkills } from "@/mastra/skills";

describe("pe_teacher", () => {
  it("默认注入比赛体育课时计划参考格式", () => {
    expect(PE_TEACHER_SYSTEM_PROMPT).toContain("课时计划标准规范");
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

  it("课时计划 Agent 只暴露检索和需求诊断工具", async () => {
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
        "generateHtmlScreenDocument",
        "submitHtmlScreenSection",
      ]),
    );
    expect(globalTools).toHaveProperty("analyze_requirements");
    expect(globalTools).toHaveProperty("searchStandards");
    expect(globalTools).not.toHaveProperty("generateHtmlScreenDocument");
    expect(globalTools).not.toHaveProperty("submitHtmlScreenSection");
  });

  it("lesson 阶段按需检索或诊断，正式课时计划由服务端管线提交", () => {
    const prompt = buildPeTeacherSystemPrompt(undefined, { mode: "lesson" });

    expect(prompt).toContain("普通聊天");
    expect(prompt).toContain("使用聊天口袋直接自然回复");
    expect(prompt).toContain("按需");
    expect(prompt).toContain("CompetitionLessonPlan");
    expect(prompt).toContain("服务端");
    expect(prompt).toContain("聊天侧只保留必要说明");
    expect(prompt).toContain("优先自然追问");
    expect(prompt).toContain("request");
    expect(prompt).toContain("保留教师本轮原始需求");
    expect(prompt).toContain("用户资料放入");
    expect(prompt).toContain("对象");
    expect(prompt).toContain("durationMinutes");
    expect(prompt).toContain("studentCount");
    expect(prompt).not.toContain("信息模糊时先调用 `analyze_requirements`");
    expect(prompt).not.toContain("<artifact>");
  });

  it("lesson 正式生成阶段使用结构化 JSON 子块约束", () => {
    const prompt = buildPeTeacherSystemPrompt(undefined, {
      mode: "lesson",
      responseStage: "generation",
    });

    expect(prompt).toContain("正式生成（Generation）阶段输出约束");
    expect(prompt).toContain("当前服务端结构化子块要求的合法 JSON 对象");
    expect(prompt).toContain("loadEstimate");
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
    expect(prompt).toContain("与教师本轮原话保持来源边界");
    expect(prompt).toContain("request 字段保留教师本轮原始需求");
  });

  it("html 阶段要求服务端生成课堂学习辅助大屏，不暴露提交工具", () => {
    const prompt = buildPeTeacherSystemPrompt(undefined, {
      mode: "html",
      lessonPlan: "## 十、课时计划\n| 课堂常规 | 1 分钟 |\n| 战术学习 | 8 分钟 |",
    });

    expect(prompt).toContain("服务端");
    expect(prompt).toContain("聊天回复给出简短状态说明");
    expect(prompt).not.toContain("submitHtmlScreenSection");
    expect(prompt).toContain("完整 HTML 文件");
    expect(prompt).toContain("iframe srcDoc");
    expect(prompt).toContain("1920×1080");
    expect(prompt).toContain("16:9 投屏画布");
    expect(prompt).toContain("单个 iframe 投屏画布");
    expect(prompt).toContain("课堂当前任务");
    expect(prompt).toContain("统一 visualSystem");
    expect(prompt).toContain("基于教学情境的动态视觉推导");
    expect(prompt).toContain("Tailwind CSS 技术偏好");
    expect(prompt).toContain("本课专属视觉母题");
    expect(prompt).toContain("一次性生成完整文档");
    expect(prompt).toContain("居中巨型倒计时");
    expect(prompt).toContain("契合当前阶段的视觉特效");
    expect(prompt).toContain("真实可运行的计时器");
    expect(prompt).toContain("数字必须随时间变化");
    expect(prompt).toContain("学习内容和练习任务原则上合并呈现");
    expect(prompt).toContain("学练区域使用图片、SVG 或明确的图形区域");
    expect(prompt).toContain("使用文档内自定义的少量语义类名");
    expect(prompt).toContain("关键交互随完整 HTML 文件一起生成");
    expect(prompt).not.toContain("多页幻灯片序列");
    expect(prompt).not.toContain("iOS 18");
  });

  it("html 阶段注入完整 HTML 文档契约", () => {
    const prompt = buildPeTeacherSystemPrompt(undefined, {
      mode: "html",
      lessonPlan: "## 十、课时计划\n| 比赛展示 | 6 分钟 |",
    });

    expect(prompt).toContain("课时计划");
    expect(prompt).toContain("比赛展示");
    expect(prompt).toContain("输出内容专注完整 HTML 文档本体");
    expect(prompt).not.toContain("课堂大屏分镜计划");
    expect(prompt).not.toContain("pageRole=cover");
  });
});
