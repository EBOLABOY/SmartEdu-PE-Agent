import type { DeepPartial } from "ai";
import { deepmergeCustom } from "deepmerge-ts";

import {
  DEFAULT_COMPETITION_LESSON_PLAN,
  competitionLessonPlanSchema,
  type CompetitionLessonPlan,
} from "@/lib/competition-lesson-contract";

const STREAMING_TEXT = "正在生成";

const STREAMING_COMPETITION_LESSON_DRAFT: CompetitionLessonPlan = {
  ...DEFAULT_COMPETITION_LESSON_PLAN,
  title: "课时计划生成中",
  subtitle: "——正在生成",
  teacher: {
    school: STREAMING_TEXT,
    name: STREAMING_TEXT,
  },
  meta: {
    topic: STREAMING_TEXT,
    lessonNo: STREAMING_TEXT,
    studentCount: STREAMING_TEXT,
    grade: STREAMING_TEXT,
    level: STREAMING_TEXT,
  },
  narrative: {
    guidingThought: [STREAMING_TEXT],
    textbookAnalysis: [STREAMING_TEXT],
    studentAnalysis: [STREAMING_TEXT],
  },
  learningObjectives: {
    sportAbility: [STREAMING_TEXT],
    healthBehavior: [STREAMING_TEXT],
    sportMorality: [STREAMING_TEXT],
  },
  keyDifficultPoints: {
    studentLearning: [STREAMING_TEXT],
    teachingContent: [STREAMING_TEXT],
    teachingOrganization: [STREAMING_TEXT],
    teachingMethod: [STREAMING_TEXT],
  },
  flowSummary: [STREAMING_TEXT],
  evaluation: [
    {
      level: "三颗星",
      description: STREAMING_TEXT,
    },
    {
      level: "二颗星",
      description: STREAMING_TEXT,
    },
    {
      level: "一颗星",
      description: STREAMING_TEXT,
    },
  ],
  loadEstimate: {
    ...DEFAULT_COMPETITION_LESSON_PLAN.loadEstimate,
    loadLevel: STREAMING_TEXT,
    targetHeartRateRange: "140-155次/分钟",
    averageHeartRate: STREAMING_TEXT,
    groupDensity: STREAMING_TEXT,
    individualDensity: STREAMING_TEXT,
    rationale: [STREAMING_TEXT],
  },
  venueEquipment: {
    venue: [STREAMING_TEXT],
    equipment: [STREAMING_TEXT],
  },
  periodPlan: {
    mainContent: [STREAMING_TEXT],
    safety: [STREAMING_TEXT],
    rows: DEFAULT_COMPETITION_LESSON_PLAN.periodPlan.rows.map((row) => ({
      ...row,
      content: [STREAMING_TEXT],
      methods: {
        teacher: [STREAMING_TEXT],
        students: [STREAMING_TEXT],
      },
      organization: [STREAMING_TEXT],
      time: "1分钟",
      intensity: STREAMING_TEXT,
    })),
    homework: [STREAMING_TEXT],
    reflection: [STREAMING_TEXT],
  },
};

const mergeLessonDraft = deepmergeCustom<unknown>({
  filterValues: (values) => values.filter((value) => value !== undefined && value !== null),
  mergeArrays: (values, utils) => {
    const length = values.reduce((max, value) => Math.max(max, value.length), 0);

    return Array.from({ length }, (_, index) => {
      const indexedValues = values
        .map((value) => value[index])
        .filter((value) => value !== undefined && value !== null);

      return indexedValues.length > 1 ? utils.deepmerge(...indexedValues) : indexedValues[0];
    }).filter((value) => value !== undefined);
  },
  mergeOthers: (values) => {
    for (let index = values.length - 1; index >= 0; index -= 1) {
      const value = values[index];

      if (typeof value === "string") {
        if (value.trim()) {
          return value;
        }
        continue;
      }

      if (typeof value === "number") {
        if (Number.isFinite(value)) {
          return value;
        }
        continue;
      }

      return value;
    }

    return undefined;
  },
});

export function buildCompetitionLessonDraft(
  partial?: DeepPartial<CompetitionLessonPlan>,
  fallback: CompetitionLessonPlan = STREAMING_COMPETITION_LESSON_DRAFT,
): CompetitionLessonPlan {
  const parsed = competitionLessonPlanSchema.safeParse(mergeLessonDraft(fallback, partial ?? {}));

  return parsed.success ? parsed.data : fallback;
}
