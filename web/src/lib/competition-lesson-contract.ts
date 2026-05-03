import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const nonEmptyStringArray = z.array(nonEmptyString).min(1);

export const competitionLessonTextBlockSchema = nonEmptyStringArray;

export const competitionLessonEvaluationLevelSchema = z.enum(["三颗星", "二颗星", "一颗星"]);

const lessonTimeString = nonEmptyString;

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

export const competitionLessonDiagramAssetSchema = z
  .object({
    alt: nonEmptyString,
    caption: nonEmptyString.optional(),
    height: z.number().int().positive().optional(),
    imageUrl: nonEmptyString,
    kind: z
      .enum(["formation", "movement", "station-rotation", "safety-layout"])
      .default("formation"),
    prompt: nonEmptyString.optional(),
    source: z.enum(["ai-generated", "code-generated", "uploaded"]).default("ai-generated"),
    width: z.number().int().positive().optional(),
  })
  .strict();

export const competitionLessonPlanRowSchema = z
  .object({
    structure: z.enum(["准备部分", "基本部分", "结束部分"]),
    content: competitionLessonTextBlockSchema,
    methods: z
      .object({
        teacher: competitionLessonTextBlockSchema,
        students: competitionLessonTextBlockSchema,
      })
      .strict(),
    organization: competitionLessonTextBlockSchema,
    diagramAssets: z.array(competitionLessonDiagramAssetSchema).max(9).optional(),
    time: lessonTimeString,
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

export const competitionLessonHeaderSchema = competitionLessonPlanSchema.pick({
  meta: true,
  subtitle: true,
  teacher: true,
  title: true,
});

export const competitionLessonTeachingDesignSchema = competitionLessonPlanSchema.pick({
  flowSummary: true,
  keyDifficultPoints: true,
  learningObjectives: true,
  narrative: true,
});

export const competitionLessonAssessmentLoadSchema = competitionLessonPlanSchema.pick({
  evaluation: true,
  loadEstimate: true,
});

export const competitionLessonExecutionSchema = competitionLessonPlanSchema.pick({
  periodPlan: true,
  venueEquipment: true,
});

export type CompetitionLessonPlan = z.infer<typeof competitionLessonPlanSchema>;
export type CompetitionLessonHeader = z.infer<typeof competitionLessonHeaderSchema>;
export type CompetitionLessonTeachingDesign = z.infer<typeof competitionLessonTeachingDesignSchema>;
export type CompetitionLessonAssessmentLoad = z.infer<typeof competitionLessonAssessmentLoadSchema>;
export type CompetitionLessonExecution = z.infer<typeof competitionLessonExecutionSchema>;
export type CompetitionLessonPlanRow = z.infer<typeof competitionLessonPlanRowSchema>;
export type CompetitionLessonLoadEstimate = z.infer<typeof competitionLessonLoadEstimateSchema>;
export type CompetitionLessonLoadChartPoint = z.infer<typeof competitionLessonLoadChartPointSchema>;
export type CompetitionLessonDiagramAsset = z.infer<typeof competitionLessonDiagramAssetSchema>;

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
