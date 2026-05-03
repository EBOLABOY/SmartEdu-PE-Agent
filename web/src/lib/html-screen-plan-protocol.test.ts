import { describe, expect, it } from "vitest";

import {
  HtmlScreenPlanProtocolError,
  parseHtmlScreenPlanProtocolText,
  parseHtmlScreenPlanProtocolToHtmlScreenPlan,
} from "@/lib/html-screen-plan-protocol";

const completeProtocol = `
@visual_system
统一清爽的体育课堂投屏系统，首页和教学页共享同一套色彩、按钮、倒计时和图形语言。

@section
title=篮球三步上篮
page_role=cover
visual_mode=html
page_prompt=生成首页封面，采用深色沉浸背景，超大标题偏向左侧排版。
reason=首页作为课堂启动页。

@section
title=三步上篮学练
page_role=learnPractice
duration_seconds=420
source_row_index=1
objective=让学生看屏后明确三步上篮的跨步节奏和起跳方向。
student_actions=看清节奏；分组练习；听口令轮换
safety_cue=篮下等待区与上篮路线分离，完成后从侧面返回。
evaluation_cue=观察一大二小三高跳节奏是否稳定。
visual_intent=用路线箭头和节奏数字帮助学生理解动作衔接。
visual_mode=html
page_prompt=生成三步上篮学练页面片段，突出节奏路线、安全等待区和评价观察点。
reason=覆盖基本部分课堂行。
`;

describe("html-screen-plan-protocol", () => {
  it("parses the HTML screen line protocol into HtmlScreenPlan", () => {
    const plan = parseHtmlScreenPlanProtocolToHtmlScreenPlan(completeProtocol);

    expect(plan.visualSystem).toContain("统一清爽");
    expect(plan.sections).toHaveLength(2);
    expect(plan.sections[0]).toMatchObject({
      pageRole: "cover",
      title: "篮球三步上篮",
      visualMode: "html",
    });
    expect(plan.sections[1]).toMatchObject({
      durationSeconds: 420,
      pageRole: "learnPractice",
      sourceRowIndex: 1,
      studentActions: ["看清节奏", "分组练习", "听口令轮换"],
      title: "三步上篮学练",
      visualMode: "html",
    });
  });

  it("accepts Chinese key aliases and records unknown block warnings", () => {
    const draft = parseHtmlScreenPlanProtocolText(`
@visual_system
沉浸式体育课堂大屏系统。
@unknown
ignored
@section
标题：课堂首页
角色：首页
媒介：网页
页面提示词：生成首页。
@section
标题：热身任务
角色：热身
媒介：网页
来源行：0
学生行动：慢跑；动态拉伸
安全提醒：保持两臂距离。
评价观察：能否按路线移动。
视觉意图：用路线图提示队形。
页面提示词：生成热身页面。
`);
    const plan = parseHtmlScreenPlanProtocolToHtmlScreenPlan(`
@visual_system
沉浸式体育课堂大屏系统。
@section
标题：课堂首页
角色：首页
媒介：网页
页面提示词：生成首页。
@section
标题：热身任务
角色：热身
媒介：网页
来源行：0
学生行动：慢跑；动态拉伸
安全提醒：保持两臂距离。
评价观察：能否按路线移动。
视觉意图：用路线图提示队形。
页面提示词：生成热身页面。
`);

    expect(draft.warnings).toEqual(expect.arrayContaining([expect.stringContaining("未知块")]));
    expect(plan.sections[0]?.pageRole).toBe("cover");
    expect(plan.sections[1]).toMatchObject({
      pageRole: "warmup",
      sourceRowIndex: 0,
      studentActions: ["慢跑", "动态拉伸"],
      visualMode: "html",
    });
  });

  it("reports diagnostics when required protocol fields are missing", () => {
    expect(() =>
      parseHtmlScreenPlanProtocolToHtmlScreenPlan(`
@visual_system
统一视觉系统。
@section
title=不是首页
page_role=warmup
`),
    ).toThrow(HtmlScreenPlanProtocolError);

    try {
      parseHtmlScreenPlanProtocolToHtmlScreenPlan(`
@visual_system
统一视觉系统。
@section
title=不是首页
page_role=warmup
`);
    } catch (error) {
      expect(error).toBeInstanceOf(HtmlScreenPlanProtocolError);
      expect(String((error as Error).message)).toContain("缺少 page_prompt");
      expect(String((error as Error).message)).toContain("第 1 个 @section 必须是 page_role=cover");
    }
  });
});
