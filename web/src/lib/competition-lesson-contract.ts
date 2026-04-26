import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const nonEmptyStringArray = z.array(nonEmptyString).min(1);

export const competitionLessonEvaluationLevelSchema = z.enum(["三颗星", "二颗星", "一颗星"]);

export const competitionLessonLoadChartPointSchema = z
  .object({
    timeMinute: z.number().min(0).max(240),
    heartRate: z.number().int().min(60).max(220),
    label: nonEmptyString.optional(),
  })
  .strict();

const defaultLoadChartPoints = [
  { timeMinute: 0, heartRate: 90, label: "0'" },
  { timeMinute: 7, heartRate: 120, label: "7'" },
  { timeMinute: 15, heartRate: 145, label: "15'" },
  { timeMinute: 25, heartRate: 155, label: "25'" },
  { timeMinute: 35, heartRate: 145, label: "35'" },
  { timeMinute: 38, heartRate: 100, label: "38'" },
];

export const competitionLessonLoadEstimateSchema = z
  .object({
    loadLevel: nonEmptyString.default("中等偏上"),
    targetHeartRateRange: nonEmptyString.default("140-155次/分钟"),
    averageHeartRate: nonEmptyString,
    groupDensity: nonEmptyString,
    individualDensity: nonEmptyString,
    chartPoints: z.array(competitionLessonLoadChartPointSchema).min(2).max(12).default(defaultLoadChartPoints),
    rationale: z.string().trim().optional(),
  })
  .strict();

export const competitionLessonPlanRowSchema = z
  .object({
    structure: z.enum(["准备部分", "基本部分", "结束部分"]),
    content: nonEmptyStringArray,
    methods: z.object({
      teacher: nonEmptyStringArray,
      students: nonEmptyStringArray,
    }),
    organization: nonEmptyStringArray,
    time: nonEmptyString,
    intensity: nonEmptyString,
  })
  .strict();

export const competitionLessonPlanSchema = z
  .object({
    title: nonEmptyString,
    subtitle: nonEmptyString,
    teacher: z
      .object({
        school: nonEmptyString,
        name: nonEmptyString,
      })
      .strict(),
    meta: z
      .object({
        topic: nonEmptyString,
        lessonNo: nonEmptyString,
        studentCount: nonEmptyString,
        grade: nonEmptyString.optional(),
        level: nonEmptyString.optional(),
      })
      .strict(),
    narrative: z
      .object({
        guidingThought: nonEmptyStringArray,
        textbookAnalysis: nonEmptyStringArray,
        studentAnalysis: nonEmptyStringArray,
      })
      .strict(),
    learningObjectives: z
      .object({
        sportAbility: nonEmptyString,
        healthBehavior: nonEmptyString,
        sportMorality: nonEmptyString,
      })
      .strict(),
    keyDifficultPoints: z
      .object({
        studentLearning: nonEmptyString,
        teachingContent: nonEmptyString,
        teachingOrganization: nonEmptyString,
        teachingMethod: nonEmptyString,
      })
      .strict(),
    flowSummary: nonEmptyStringArray,
    evaluation: z
      .array(
        z
          .object({
            level: competitionLessonEvaluationLevelSchema,
            description: nonEmptyString,
          })
          .strict(),
      )
      .length(3),
    loadEstimate: competitionLessonLoadEstimateSchema,
    venueEquipment: z
      .object({
        venue: nonEmptyStringArray,
        equipment: nonEmptyStringArray,
      })
      .strict(),
    periodPlan: z
      .object({
        mainContent: nonEmptyString,
        safety: nonEmptyStringArray,
        rows: z.array(competitionLessonPlanRowSchema).min(3),
        homework: nonEmptyStringArray,
        reflection: z.string().optional(),
      })
      .strict(),
  })
  .strict();

export type CompetitionLessonPlan = z.infer<typeof competitionLessonPlanSchema>;
export type CompetitionLessonPlanRow = z.infer<typeof competitionLessonPlanRowSchema>;
export type CompetitionLessonLoadEstimate = z.infer<typeof competitionLessonLoadEstimateSchema>;
export type CompetitionLessonLoadChartPoint = z.infer<typeof competitionLessonLoadChartPointSchema>;

export const DEFAULT_COMPETITION_LESSON_PLAN: CompetitionLessonPlan = {
  title: "操控性技能－足球游戏",
  subtitle: "—水平一（一年级）",
  teacher: {
    school: "深圳市大鹏新区葵涌第二小学",
    name: "梁紫薇",
  },
  meta: {
    topic: "小小侦察兵-足球情报特训营",
    lessonNo: "第17次课",
    studentCount: "40人",
    grade: "一年级",
    level: "水平一",
  },
  narrative: {
    guidingThought: ["本课坚持“健康第一”指导思想，落实“立德树人”根本任务，以学生发展为本，依据课程标准设计游戏化学练情境。"],
    textbookAnalysis: ["操控性技能是学生运用身体不同部位控制、支配与调动足球的基础运动能力，是衔接足球兴趣培养与技能进阶的核心环节。"],
    studentAnalysis: ["一年级学生年龄小、兴趣浓、好奇心强，但注意力容易分散，需要通过情境任务、游戏挑战和即时评价保持参与热情。"],
  },
  learningObjectives: {
    sportAbility: "体验用脚轻轻推球，初步学会控制方向，感受速度与力量变化，提升身体协调能力和反应能力。",
    healthBehavior: "遵守课堂规则，乐于参与学练，具备安全运动意识，运动中能与同伴保持安全距离。",
    sportMorality: "展现不怕困难、勇于挑战的精神，做到遵守纪律、尊重他人、与同伴友爱互助。",
  },
  keyDifficultPoints: {
    studentLearning: "体验用脚推拨球的动作，尝试在游戏中运用，了解脚内侧、脚背正面的位置。",
    teachingContent: "通过不同形式的情景游戏，提升学生用脚运球与踢球的能力，尝试控制球的方向与力度。",
    teachingOrganization: "充分利用场地与器材，合理分组，提高练习密度。",
    teachingMethod: "借助完整故事情境激发学生兴趣，巧用过程性评价与比赛激励调动学生积极性。",
  },
  flowSummary: ["突破封锁线", "潜入雷区", "情报传递", "合力突围"],
  evaluation: [
    {
      level: "三颗星",
      description: "运动兴趣浓厚，运动能力突出，能高质量完成所有练习与情景任务；健康行为自律，严格遵守规则；体育品德优秀，主动承担团队角色，协作高效。",
    },
    {
      level: "二颗星",
      description: "运动兴趣较高，运动能力良好，能较好完成练习与情景任务；健康行为自觉，主动遵守规则；体育品德良好，具备团队协作意识。",
    },
    {
      level: "一颗星",
      description: "运动兴趣待激发，运动能力需提升，需教师监督完成部分情景任务；健康行为需引导，团队协作意识需强化。",
    },
  ],
  loadEstimate: {
    loadLevel: "中等偏上",
    targetHeartRateRange: "140-155次/分钟",
    averageHeartRate: "145-150次/分钟",
    groupDensity: "75%-80%",
    individualDensity: "55%-60%",
    chartPoints: defaultLoadChartPoints,
    rationale: "准备部分逐步升温，基本部分通过连续运球、传球与关卡挑战达到主要负荷，结束部分放松恢复。",
  },
  venueEquipment: {
    venue: ["足球场1块"],
    equipment: ["足球41个", "标志碟、标志桶若干个", "球门2个", "挡板8个"],
  },
  periodPlan: {
    mainContent: "操控性技能：用脚运球、踢球",
    safety: ["检查场地，消除不安全因素", "准备活动充分", "运动中提醒学生保持安全距离"],
    rows: [
      {
        structure: "准备部分",
        content: ["集合整队，检查人数", "师生问好，宣布内容与要求", "热身特训：解锁情报密码"],
        methods: {
          teacher: ["引领学生快速、安静、整齐集结", "情境导入并示范球性练习"],
          students: ["听指挥做动作", "保护好足球，集中精神，注意观察"],
        },
        organization: ["热身特训"],
        time: "7分钟",
        intensity: "中等",
      },
      {
        structure: "基本部分",
        content: ["教师动作示范与讲解", "第一关：突破封锁线", "第二关：潜入雷区", "第三关：情报传递", "终极关：合力突围"],
        methods: {
          teacher: ["通过正侧面进行讲解示范", "组织学生练习，巡回指导与纠错", "鼓励学生，调动参与积极性"],
          students: ["认真观察示范", "积极投入练习并遵守规则", "互相鼓励，体验比赛乐趣"],
        },
        organization: ["分组轮换", "关卡挑战"],
        time: "30分钟",
        intensity: "中等偏上",
      },
      {
        structure: "结束部分",
        content: ["侦察兵休整放松拉伸", "小结与评价", "布置课后作业", "宣布下课，回收器材"],
        methods: {
          teacher: ["引领学生有序拉伸", "全面点评表现，肯定优点并指出不足"],
          students: ["积极跟随教师放松", "进行自评和互评，分享参与感受"],
        },
        organization: ["集中放松"],
        time: "3分钟",
        intensity: "小",
      },
    ],
    homework: ["模仿三种动物爬行", "与家长间隔5米玩运球游戏，一组20次，完成3组", "与家长间隔3米玩传球游戏，一组20次，完成3组"],
    reflection: "",
  },
};
