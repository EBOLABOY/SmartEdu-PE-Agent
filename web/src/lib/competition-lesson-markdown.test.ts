import { describe, expect, it } from "vitest";

import { DEFAULT_COMPETITION_LESSON_PLAN, competitionLessonPlanSchema } from "@/lib/competition-lesson-contract";
import {
  competitionLessonPlanToMarkdown,
  markdownToCompetitionLessonPlan,
} from "@/lib/competition-lesson-markdown";

describe("competition-lesson-markdown", () => {
  it("会把参赛格式 Markdown 兜底转换为固定 A4 模板数据", () => {
    const plan = markdownToCompetitionLessonPlan(`# 操控性技能－足球游戏

副标题：—水平一（一年级）
授课教师：深圳市大鹏新区葵涌第二小学 梁紫薇

## 一、指导思想
本课坚持“健康第一”指导思想，落实“立德树人”根本任务。

## 二、教材分析
操控性技能是学生控制、支配与调动足球的基础运动能力。

## 三、学情分析
一年级学生兴趣浓厚，但注意力容易分散。

## 四、学习目标
1.运动能力：体验用脚轻轻推球，学会控制方向。
2.健康行为：遵守规则，运动中与他人保持安全距离。
3.体育品德：展现不怕困难、勇于挑战的精神。

## 五、教学重难点
1.学生学习：体验用脚推拨球的动作。
2.教学内容：提升学生用脚运球与踢球的能力。
3.教学组织：充分利用场地与器材。
4.教学方法：借助故事情景创设激发兴趣。

## 六、教学流程
突破封锁线；—潜入雷区；—情报传递；—合力突围；

    ## 八、运动负荷预计
    负荷等级：中等
    目标心率区间：125-140次/分钟
    平均心率：145-150 次/分钟
    群体运动密度：75%-80%
    个体运动密度：55%-60%
    心率曲线节点：0'=85，7'=115，15'=132，25'=140，35'=128，38'=100
    形成依据：根据课堂热身、主教材练习和放松恢复安排综合估算。

## 九、场地与器材
场地：足球场1块
器材：足球41个；标志碟若干个
`);

    expect(competitionLessonPlanSchema.safeParse(plan).success).toBe(true);
    expect(plan.title).toBe("操控性技能－足球游戏");
    expect(plan.subtitle).toBe("—水平一（一年级）");
    expect(plan.learningObjectives.sportAbility).toContain("体验用脚轻轻推球");
    expect(plan.keyDifficultPoints.teachingMethod).toContain("故事情景");
    expect(plan.loadEstimate.loadLevel).toBe("中等");
    expect(plan.loadEstimate.targetHeartRateRange).toBe("125-140次/分钟");
    expect(plan.loadEstimate.groupDensity).toBe("75%-80%");
    expect(plan.loadEstimate.chartPoints.map((point) => point.heartRate)).toEqual([85, 115, 132, 140, 128, 100]);
    expect(plan.periodPlan.rows.map((row) => row.structure)).toEqual(["准备部分", "基本部分", "结束部分"]);
  });

  it("空 Markdown 会返回满足模板约束的默认结构", () => {
    const plan = markdownToCompetitionLessonPlan("");

    expect(competitionLessonPlanSchema.safeParse(plan).success).toBe(true);
    expect(plan.evaluation).toHaveLength(3);
    expect(plan.periodPlan.rows.length).toBeGreaterThanOrEqual(3);
  });

  it("会从流式 Markdown 表格中提取学习评价和课时计划", () => {
    const plan = markdownToCompetitionLessonPlan(`# 羽毛球正手发高远球

学校：深圳市测试小学
授课教师：陈老师
副标题：—水平二·四年级

## 七、学习评价

| 星级 | 评价方面 |
| --- | --- |
| 三颗星 | 能安全规范完成正手发高远球，主动帮助同伴。 |
| 二颗星 | 能基本完成正手发高远球，能遵守轮换要求。 |
| 一颗星 | 能说出动作要点，需要继续加强挥拍方向。 |

## 十、课时计划（教案）

| 主题 | 羽毛球正手发高远球 | 课次 | 第1次课 | 学生人数 | 40人 |
| --- | --- | --- | --- | --- | --- |
| 主要学习内容 | 正手发高远球 |  |  |  |  |
| 安全保障 | 保持挥拍距离<br>听哨停止练习 | 场地器材 | 羽毛球场<br>羽毛球拍 |  |  |

| 课的结构 | 具体教学内容 | 教与学的方法 | 组织形式 | 运动时间 | 强度 |
| --- | --- | --- | --- | --- | --- |
| 准备部分 | 课堂常规<br>专项热身 | 教师：<br>组织热身<br>学生：<br>按口令练习 | 四列横队 | 6分钟 | 中 |
| 基本部分 | 发球动作学习<br>分组练习 | 教师：<br>示范动作<br>学生：<br>互评练习 | 分组轮换 | 28分钟 | 中高 |
| 结束部分 | 放松拉伸<br>课堂评价 | 教师：<br>总结评价<br>学生：<br>分享收获 | 集中队形 | 6分钟 | 低 |

| 项目 | 内容 |
| --- | --- |
| 课后作业 | 对墙挥拍20次<br>和家长分享安全要点 |
| 教学反思 | 关注个体差异 |
`);

    expect(plan.teacher.school).toBe("深圳市测试小学");
    expect(plan.teacher.name).toBe("陈老师");
    expect(plan.meta.topic).toBe("羽毛球正手发高远球");
    expect(plan.evaluation[0]?.description).toContain("主动帮助同伴");
    expect(plan.periodPlan.mainContent).toBe("正手发高远球");
    expect(plan.periodPlan.safety).toEqual(["保持挥拍距离", "听哨停止练习"]);
    expect(plan.periodPlan.rows[1]?.methods.teacher).toContain("示范动作");
    expect(plan.periodPlan.rows[1]?.methods.students).toContain("互评练习");
    expect(plan.periodPlan.homework).toContain("对墙挥拍20次");
  });

  it("会压缩安全保障和场地器材，避免正式打印表格被长清单撑开", () => {
    const plan = markdownToCompetitionLessonPlan(`# 羽毛球课

## 九、场地与器材

场地：学校室内体育馆或平整防滑羽毛球场地
场地：4片羽毛球半场或用标志线划分的8个练习区域
场地：每组设置击球区、等待区、捡球区和教师观察通道
器材：羽毛球拍40把
器材：羽毛球80个
器材：羽毛球网或移动简易网4副
器材：标志桶32个
器材：分层任务卡8张
器材：记分板4块
器材：秒表1个
器材：急救包1个

## 十、课时计划（教案）

| 主题 | 羽毛球课 | 课次 | 第1次课 | 学生人数 | 40人 |
| --- | --- | --- | --- | --- | --- |
| 安全保障 | 课前检查场地是否干燥防滑，球网、标志桶、球拍是否完好，清除场内杂物。<br>学生进入练习区前检查鞋带、服装和身体状态，身体不适者及时报告并调整为低强度任务。<br>挥拍时保持前后左右至少一臂加一拍距离，禁止追逐打闹、反向挥拍和跨区击球。<br>捡球必须听到教师口令或本组练习暂停后进行，严禁他人击球时突然进入击球区。<br>教师重点巡视击球区边线、等待区秩序和学生发力动作，发现安全隐患立即暂停调整。 | 场地器材 | 学校室内体育馆或平整防滑羽毛球场地<br>羽毛球拍40把<br>羽毛球80个 |  |  |
`);

    expect(plan.periodPlan.safety).toHaveLength(3);
    expect(plan.periodPlan.safety.every((item) => item.length <= 35)).toBe(true);
    expect(plan.venueEquipment.venue).toHaveLength(1);
    expect(plan.venueEquipment.equipment).toHaveLength(4);
    expect(plan.venueEquipment.equipment).not.toContain("急救包1个");
  });

  it("会把结构化教案序列化为兼容旧链路的 Markdown", () => {
    const markdown = competitionLessonPlanToMarkdown(DEFAULT_COMPETITION_LESSON_PLAN);

    expect(markdown).toContain("# 操控性技能－足球游戏");
    expect(markdown).toContain("## 十、课时计划（教案）");
    expect(markdown).toContain("| 课的结构 | 具体教学内容 | 教与学的方法 | 组织形式 | 运动时间 | 强度 |");
    expect(markdown).toContain("目标心率区间：140-155次/分钟");
    expect(markdown).toContain("平均心率：145-150次/分钟");
    expect(markdown).toContain("心率曲线节点：0'=90，7'=120，15'=145，25'=155，35'=145，38'=100");
  });

  it("会兼容旧版只包含三项运动负荷的结构化教案", () => {
    const legacyPlan = {
      ...DEFAULT_COMPETITION_LESSON_PLAN,
      loadEstimate: {
        averageHeartRate: "125-140次/分钟",
        groupDensity: "约75%",
        individualDensity: "约45%",
      },
    };
    const parsed = competitionLessonPlanSchema.parse(legacyPlan);

    expect(parsed.loadEstimate.loadLevel).toBe("中等偏上");
    expect(parsed.loadEstimate.targetHeartRateRange).toBe("140-155次/分钟");
    expect(parsed.loadEstimate.chartPoints).toHaveLength(6);
    expect(parsed.loadEstimate.averageHeartRate).toBe("125-140次/分钟");
  });
});
