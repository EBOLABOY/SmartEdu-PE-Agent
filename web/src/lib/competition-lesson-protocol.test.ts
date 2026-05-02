import { describe, expect, it } from "vitest";

import { competitionLessonPlanSchema } from "@/lib/competition-lesson-contract";
import {
  LessonPlanProtocolError,
  normalizeLessonProtocolDraftToCompetitionLessonPlan,
  parseLessonPlanProtocolText,
  parseLessonPlanProtocolToCompetitionLessonPlan,
} from "@/lib/competition-lesson-protocol";

const completeProtocol = `
@lesson
title=篮球行进间运球
topic=篮球行进间运球
grade=三年级
student_count=40人
lesson_no=第1课时
level=水平二

@section narrative.guiding_thought
坚持健康第一，以学生发展为中心，通过游戏化练习提升篮球行进间运球能力。

@section narrative.textbook_analysis
行进间运球是篮球基础技能的重要内容，是学生从静态控球走向动态控球的关键学习内容。

@section narrative.student_analysis
三年级学生已有原地运球经验，但移动中控球稳定性和安全间距保持能力仍需提升。

@section objectives.sport_ability
能在慢跑中完成连续行进间运球。
能绕过标志桶完成基本变向运球。

@section objectives.health_behavior
能根据练习强度调整呼吸和节奏。
能在练习中保持安全距离。

@section objectives.sport_morality
能遵守接力规则。
能主动鼓励同伴并公平竞争。

@flow
part=准备部分
time=8分钟
intensity=中
content=课堂常规、热身跑、球性练习
teacher=讲解安全要求，组织热身，提示控球节奏
students=按队形完成热身，跟随口令进行球性练习
organization=四列横队散点展开

@flow
part=基本部分
time=27分钟
intensity=中高
content=行进间运球练习、绕桶运球接力、小组挑战
teacher=示范动作，分层指导，纠正低头看球和控球过高问题
students=分组练习，观察同伴动作，完成接力挑战
organization=四组纵队，标志桶间隔布置

@flow
part=结束部分
time=5分钟
intensity=低
content=放松拉伸、课堂评价、课后练习布置
teacher=组织放松，总结表现，布置家庭练习
students=完成拉伸，自评互评，整理器材
organization=圆形队伍集中

@evaluation
level=三颗星
description=能稳定完成行进间运球，绕桶路线清楚，并能遵守接力规则。

@evaluation
level=二颗星
description=能基本完成行进间运球和绕桶接力，偶有控球失误。

@evaluation
level=一颗星
description=能积极参与练习，但移动中控球和规则意识仍需加强。

@equipment
venue=半个篮球场
equipment=篮球20个
equipment=标志桶8个

@safety
保持前后左右安全距离。
绕桶返回时不得逆向穿插。
球滚出练习区时先观察再捡球。

@load
load_level=中等偏上
target_heart_rate_range=140-155次/分钟
average_heart_rate=145次/分钟
group_density=约75%
individual_density=约45%
rationale=准备部分逐步升温，基本部分通过分组轮换和接力挑战形成中高强度，结束部分放松恢复。
`;

describe("competition-lesson-protocol", () => {
  it("parses the complete lesson line protocol into the stable CompetitionLessonPlan contract", () => {
    const plan = parseLessonPlanProtocolToCompetitionLessonPlan(completeProtocol);

    expect(competitionLessonPlanSchema.parse(plan)).toEqual(plan);
    expect(plan.title).toBe("篮球行进间运球");
    expect(plan.subtitle).toBe("小学体育课时计划");
    expect(plan.teacher).toEqual({
      name: "未填写教师",
      school: "未填写学校",
    });
    expect(plan.periodPlan.rows.map((row) => row.structure)).toEqual(["准备部分", "基本部分", "结束部分"]);
    expect(plan.periodPlan.rows[0]?.content).toEqual(["课堂常规、热身跑、球性练习"]);
    expect(plan.periodPlan.rows[1]?.content).toEqual([
      "行进间运球练习、绕桶运球接力、小组挑战",
    ]);
    expect(plan.flowSummary).toEqual([
      "课堂常规",
      "专项热身",
      "球性游戏",
      "技术学练",
      "运球接力",
      "分层挑战",
      "放松拉伸",
    ]);
    expect(plan.evaluation.map((item) => item.level)).toEqual(["三颗星", "二颗星", "一颗星"]);
    expect(plan.loadEstimate.chartPoints.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps flowSummary concise when flow content contains verbose teaching steps", () => {
    const protocol = completeProtocol.replace(
      "content=课堂常规、热身跑、球性练习",
      "content=课堂常规：集合整队，宣布本课内容与安全要求。2. 球性游戏：“听数抱团”运球游戏，学生运球移动，听教师报数后迅速与相应人数抱成一团并保持运球。3. 专项热身：动态拉伸结合原地高低运球、体前变向等球性练习。",
    );
    const plan = parseLessonPlanProtocolToCompetitionLessonPlan(protocol);

    expect(plan.flowSummary.slice(0, 3)).toEqual(["课堂常规", "球性游戏", "专项热身"]);
    expect(plan.flowSummary.join(" → ")).toContain("课堂常规 → 球性游戏 → 专项热身");
    expect(plan.periodPlan.rows[0]?.content[0]).toContain("听数抱团");
  });

  it("keeps multiple basic-part @flow blocks and prioritizes dynamic sections plus chartPoints", () => {
    const plan = parseLessonPlanProtocolToCompetitionLessonPlan(`
@lesson
title=篮球体前变向运球
topic=篮球体前变向运球
grade=五年级
student_count=40人
lesson_no=第2课时
level=水平三
@section narrative.guiding_thought
坚持健康第一，在真实挑战情境中提升学生变向运球能力。
@section narrative.textbook_analysis
体前变向运球是篮球突破与摆脱防守的重要基础技术。
@section narrative.student_analysis
五年级学生已有直线运球经验，但变向前降重心和护球意识仍需加强。
@section objectives.sport_ability
能在行进间完成体前变向运球并保持控球稳定。
@section objectives.health_behavior
能根据对抗强度主动调整节奏并保持安全距离。
@section objectives.sport_morality
能在小组挑战中遵守规则并主动鼓励同伴。
@section key_difficult_points.student_learning
学生在变向前主动减速降重心，变向后快速加速衔接。
@section key_difficult_points.teaching_content
体前变向时的手型控制、护球位置与步伐衔接。
@section key_difficult_points.teaching_organization
四组纵队分区练习，往返路线与等待区分离。
@section key_difficult_points.teaching_method
采用分解示范、同伴互评、闯关挑战和比赛迁移相结合的教学方法。
@section period_plan.homework
课后连续完成左右手交替体前变向运球各30次。
观察家附近安全场地，记录一次运球变向时的控球体验。
@section period_plan.reflection
后续课时需重点跟踪学生变向前减速和护球手运用情况。
@flow
part=准备部分
time=8分钟
content=课堂常规、热身跑、球性激活
teacher=组织热身并强调变向前观察
students=跟随口令完成热身和熟悉球性
organization=四列横队散点展开
@flow
part=基本部分
time=10分钟
content=动作学习
teacher=示范体前变向的降重心和换手时机
students=跟随口令分解模仿
organization=四列横队错位展开
@flow
part=基本部分
time=10分钟
content=分组练习
teacher=分层巡回指导并纠正高重心问题
students=两人一组往返练习并互评
organization=四组纵队往返轮换
@flow
part=基本部分
time=7分钟
content=比赛挑战
teacher=组织计分挑战并提示加速突破
students=完成变向接力比赛
organization=四组分区挑战
@flow
part=结束部分
time=5分钟
content=放松拉伸、课堂评价
teacher=组织放松并总结表现
students=自评互评并整理器材
organization=圆形队伍集中
@evaluation
level=三颗星
description=能稳定完成体前变向运球，并在挑战中主动观察与加速突破。
@evaluation
level=二颗星
description=能基本完成体前变向运球，偶有控球不稳。
@evaluation
level=一颗星
description=能积极参与练习，但变向前降重心和护球意识仍需加强。
@equipment
venue=半个篮球场
equipment=篮球20个
equipment=标志桶12个
@safety
变向前先观察前方通道。
接力返回时不得逆向穿插。
@load
load_level=中等偏上
target_heart_rate_range=140-155次/分钟
average_heart_rate=146次/分钟
group_density=约76%
individual_density=约48%
chartPoints=0'=88，8'=118，18'=146，28'=154，35'=138，40'=102
rationale=准备部分逐步升温，基本部分通过动作学习、分组练习和比赛挑战形成递进负荷，结束部分放松恢复。
`);

    expect(plan.periodPlan.rows.map((row) => row.structure)).toEqual([
      "准备部分",
      "基本部分",
      "基本部分",
      "基本部分",
      "结束部分",
    ]);
    expect(plan.periodPlan.rows[1]?.content).toEqual(["动作学习"]);
    expect(plan.periodPlan.rows[2]?.content).toEqual(["分组练习"]);
    expect(plan.periodPlan.rows[3]?.content).toEqual(["比赛挑战"]);
    expect(plan.keyDifficultPoints.studentLearning).toEqual([
      "学生在变向前主动减速降重心，变向后快速加速衔接。",
    ]);
    expect(plan.keyDifficultPoints.teachingMethod).toEqual([
      "采用分解示范、同伴互评、闯关挑战和比赛迁移相结合的教学方法。",
    ]);
    expect(plan.periodPlan.homework).toEqual([
      "课后连续完成左右手交替体前变向运球各30次。",
      "观察家附近安全场地，记录一次运球变向时的控球体验。",
    ]);
    expect(plan.periodPlan.reflection).toEqual([
      "后续课时需重点跟踪学生变向前减速和护球手运用情况。",
    ]);
    expect(plan.loadEstimate.chartPoints).toEqual([
      { timeMinute: 0, heartRate: 88, label: "0'" },
      { timeMinute: 8, heartRate: 118, label: "8'" },
      { timeMinute: 18, heartRate: 146, label: "18'" },
      { timeMinute: 28, heartRate: 154, label: "28'" },
      { timeMinute: 35, heartRate: 138, label: "35'" },
      { timeMinute: 40, heartRate: 102, label: "40'" },
    ]);
  });

  it("accepts Chinese key separators, body lines, repeated fields, unknown blocks, and shuffled blocks", () => {
    const draft = parseLessonPlanProtocolText(`
@equipment
场地：学校篮球场
器材：篮球20个
equipment=标志桶8个
@unknown ignored
这行会被忽略
@lesson
标题：足球脚内侧传接球
主题：足球脚内侧传接球
年级：四年级
人数：36人
课次：第2课时
@evaluation
level=二颗星
description=能基本完成传接球任务。
@evaluation
level=三颗星
description=能准确完成传接球并主动合作。
@evaluation
level=一颗星
description=能参与练习但动作还需改进。
@section objectives.sport_ability
- 能完成脚内侧传球动作。
@section objectives.health_behavior
能保持练习间距。
@section objectives.sport_morality
能尊重同伴。
@section narrative.guiding_thought
以学生发展为中心组织足球学练。
@section narrative.textbook_analysis
脚内侧传球是足球基础技术。
@section narrative.student_analysis
四年级学生具备基本跑动能力。
@flow
part=基本部分
time=28分钟
content=传接球练习
teacher=示范传接球动作
students=分组练习
organization=两人一组
@flow
part=准备部分
time=7分钟
content=热身和熟悉球性
teacher=组织热身
students=完成热身
organization=散点
@flow
part=结束部分
time=5分钟
content=放松和评价
teacher=总结
students=放松
organization=集合
@safety
传球前观察同伴位置。
@load
平均心率：140次/分钟
`);
    const plan = normalizeLessonProtocolDraftToCompetitionLessonPlan(draft);

    expect(draft.warnings).toEqual(expect.arrayContaining([expect.stringContaining("未知块")]));
    expect(plan.title).toBe("足球脚内侧传接球");
    expect(plan.meta.studentCount).toBe("36人");
    expect(plan.venueEquipment.equipment).toEqual(["篮球20个", "标志桶8个"]);
    expect(plan.periodPlan.rows[0]?.content).toEqual(["热身和熟悉球性"]);
    expect(plan.periodPlan.rows[1]?.content).toEqual(["传接球练习"]);
    expect(plan.loadEstimate.averageHeartRate).toBe("140次/分钟");
  });

  it("reports Chinese diagnostics for missing required protocol sections", () => {
    expect(() =>
      parseLessonPlanProtocolToCompetitionLessonPlan(`
@lesson
title=跳绳
@flow
part=准备部分
content=热身
@flow
part=结束部分
content=放松
@evaluation
level=三颗星
description=优秀
`),
    ).toThrow(LessonPlanProtocolError);

    try {
      parseLessonPlanProtocolToCompetitionLessonPlan(`
@lesson
title=跳绳
@flow
part=准备部分
content=热身
@flow
part=结束部分
content=放松
@evaluation
level=三颗星
description=优秀
`);
    } catch (error) {
      expect(error).toBeInstanceOf(LessonPlanProtocolError);
      expect(String((error as Error).message)).toContain("教案协议缺少 @flow 基本部分");
      expect(String((error as Error).message)).toContain("教案协议缺少 @evaluation 二颗星");
    }
  });

  it("fills maintainable defaults without introducing placeholder text", () => {
    const plan = parseLessonPlanProtocolToCompetitionLessonPlan(completeProtocol);

    expect(JSON.stringify(plan)).not.toMatch(/XXX|待补充|同上/);
    expect(plan.keyDifficultPoints.teachingMethod[0]).toContain("讲解示范");
    expect(plan.periodPlan.homework).toHaveLength(2);
    expect(plan.periodPlan.reflection[0]).toContain("课后重点观察");
  });
});
