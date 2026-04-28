import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const nonEmptyStringArray = z.array(nonEmptyString).min(1);

function normalizeTextBlock(value: unknown) {
  return typeof value === "string" ? [value] : value;
}

export const competitionLessonTextBlockSchema = z.preprocess(normalizeTextBlock, nonEmptyStringArray);

export const competitionLessonEvaluationLevelSchema = z.enum(["三颗星", "二颗星", "一颗星"]);

export function normalizeCompetitionLessonTime(value: unknown, fallback = "8分钟") {
  const raw = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  const compact = raw.replace(/\s+/g, "").replace(/[，,。；;、]+$/g, "");

  if (!compact) {
    return fallback;
  }

  const singleMinute = /^(约|大约)?(\d+(?:\.\d+)?)(?:分钟|分|min(?:ute)?s?|['’′`])?$/i.exec(compact);

  if (singleMinute) {
    return `${singleMinute[1] ?? ""}${singleMinute[2]}分钟`;
  }

  const rangeMinute = /^(约|大约)?(\d+(?:\.\d+)?)(?:[-~－—至到](\d+(?:\.\d+)?))(?:分钟|分|min(?:ute)?s?|['’′`])?$/i.exec(
    compact,
  );

  if (rangeMinute) {
    return `${rangeMinute[1] ?? ""}${rangeMinute[2]}-${rangeMinute[3]}分钟`;
  }

  return compact.replace(/min(?:ute)?s?$/i, "分钟").replace(/分$/g, "分钟");
}

const lessonTimeString = z.preprocess((value) => normalizeCompetitionLessonTime(value), nonEmptyString);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeObjectAliases(
  value: unknown,
  aliases: Array<{ canonical: string; aliases: string[] }>,
) {
  if (!isRecord(value)) {
    return value;
  }

  const normalized = { ...value };

  aliases.forEach(({ canonical, aliases: aliasNames }) => {
    aliasNames.forEach((alias) => {
      if (!Object.prototype.hasOwnProperty.call(normalized, alias)) {
        return;
      }

      if (normalized[canonical] === undefined) {
        normalized[canonical] = normalized[alias];
      }

      delete normalized[alias];
    });
  });

  return normalized;
}

function normalizeCompetitionLessonMethods(value: unknown) {
  return normalizeObjectAliases(value, [
    {
      canonical: "teacher",
      aliases: ["教师", "教师活动", "教的方法", "教师教法", "教师行为"],
    },
    {
      canonical: "students",
      aliases: ["学生", "学生活动", "学的方法", "学生学法", "学生行为"],
    },
  ]);
}

function normalizeCompetitionLessonPlanRow(value: unknown) {
  return normalizeObjectAliases(value, [
    {
      canonical: "structure",
      aliases: ["课的结构", "课堂结构", "结构"],
    },
    {
      canonical: "content",
      aliases: ["具体教学内容", "教学内容", "内容"],
    },
    {
      canonical: "methods",
      aliases: ["教与学的方法", "教学方法", "教法学法"],
    },
    {
      canonical: "organization",
      aliases: ["组织形式", "组织队形"],
    },
    {
      canonical: "time",
      aliases: ["运动时间", "时间"],
    },
    {
      canonical: "intensity",
      aliases: ["强度", "运动强度"],
    },
  ]);
}

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
    rationale: competitionLessonTextBlockSchema,
  })
  .strict();

export const competitionLessonPlanRowSchema = z
  .preprocess(
    normalizeCompetitionLessonPlanRow,
    z
      .object({
        structure: z.enum(["准备部分", "基本部分", "结束部分"]),
        content: competitionLessonTextBlockSchema,
        methods: z.preprocess(
          normalizeCompetitionLessonMethods,
          z
            .object({
              teacher: competitionLessonTextBlockSchema,
              students: competitionLessonTextBlockSchema,
            })
            .strict(),
        ),
        organization: competitionLessonTextBlockSchema,
        time: lessonTimeString,
        intensity: nonEmptyString,
      })
      .strict(),
  );

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
        guidingThought: competitionLessonTextBlockSchema,
        textbookAnalysis: competitionLessonTextBlockSchema,
        studentAnalysis: competitionLessonTextBlockSchema,
      })
      .strict(),
    learningObjectives: z
      .object({
        sportAbility: competitionLessonTextBlockSchema,
        healthBehavior: competitionLessonTextBlockSchema,
        sportMorality: competitionLessonTextBlockSchema,
      })
      .strict(),
    keyDifficultPoints: z
      .object({
        studentLearning: competitionLessonTextBlockSchema,
        teachingContent: competitionLessonTextBlockSchema,
        teachingOrganization: competitionLessonTextBlockSchema,
        teachingMethod: competitionLessonTextBlockSchema,
      })
      .strict(),
    flowSummary: competitionLessonTextBlockSchema,
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
        venue: competitionLessonTextBlockSchema,
        equipment: competitionLessonTextBlockSchema,
      })
      .strict(),
    periodPlan: z
      .object({
        mainContent: competitionLessonTextBlockSchema,
        safety: competitionLessonTextBlockSchema,
        rows: z.array(competitionLessonPlanRowSchema).min(3),
        homework: competitionLessonTextBlockSchema,
        reflection: competitionLessonTextBlockSchema,
      })
      .strict(),
  })
  .strict();

export type CompetitionLessonPlan = z.infer<typeof competitionLessonPlanSchema>;
export type CompetitionLessonPlanRow = z.infer<typeof competitionLessonPlanRowSchema>;
export type CompetitionLessonLoadEstimate = z.infer<typeof competitionLessonLoadEstimateSchema>;
export type CompetitionLessonLoadChartPoint = z.infer<typeof competitionLessonLoadChartPointSchema>;

export const DEFAULT_COMPETITION_LESSON_PLAN: CompetitionLessonPlan = {
  title: "XXX",
  subtitle: "XXX",
  teacher: {
    school: "XXX",
    name: "XXX",
  },
  meta: {
    topic: "XXX",
    lessonNo: "XXX",
    studentCount: "XXX",
    grade: "XXX",
    level: "XXX",
  },
  narrative: {
    guidingThought: ["XXX"],
    textbookAnalysis: ["XXX"],
    studentAnalysis: ["XXX"],
  },
  learningObjectives: {
    sportAbility: ["XXX"],
    healthBehavior: ["XXX"],
    sportMorality: ["XXX"],
  },
  keyDifficultPoints: {
    studentLearning: ["XXX"],
    teachingContent: ["XXX"],
    teachingOrganization: ["XXX"],
    teachingMethod: ["XXX"],
  },
  flowSummary: ["XXX"],
  evaluation: [
    {
      level: "三颗星",
      description: "XXX",
    },
    {
      level: "二颗星",
      description: "XXX",
    },
    {
      level: "一颗星",
      description: "XXX",
    },
  ],
  loadEstimate: {
    loadLevel: "XXX",
    targetHeartRateRange: "XXX",
    averageHeartRate: "XXX",
    groupDensity: "XXX",
    individualDensity: "XXX",
    chartPoints: defaultLoadChartPoints,
    rationale: ["XXX"],
  },
  venueEquipment: {
    venue: ["XXX"],
    equipment: ["XXX"],
  },
  periodPlan: {
    mainContent: ["XXX"],
    safety: ["XXX"],
    rows: [
      {
        structure: "准备部分",
        content: ["XXX"],
        methods: {
          teacher: ["XXX"],
          students: ["XXX"],
        },
        organization: ["XXX"],
        time: "XXX",
        intensity: "XXX",
      },
      {
        structure: "基本部分",
        content: ["XXX"],
        methods: {
          teacher: ["XXX"],
          students: ["XXX"],
        },
        organization: ["XXX"],
        time: "XXX",
        intensity: "XXX",
      },
      {
        structure: "结束部分",
        content: ["XXX"],
        methods: {
          teacher: ["XXX"],
          students: ["XXX"],
        },
        organization: ["XXX"],
        time: "XXX",
        intensity: "XXX",
      },
    ],
    homework: ["XXX", "XXX"],
    reflection: ["XXX"],
  },
};
