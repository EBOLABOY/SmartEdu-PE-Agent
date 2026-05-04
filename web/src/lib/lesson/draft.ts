/**
 * @module competition-lesson-draft
 * 竞赛课教案的流式草稿构建器。在 AI 流式生成过程中，
 * 将部分 JSON 合并到默认教案模板，产出可渲染的中间草稿。
 */
import type { DeepPartial } from "ai";

import {
  DEFAULT_COMPETITION_LESSON_PLAN,
  competitionLessonPlanSchema,
  type CompetitionLessonPlan,
} from "@/lib/lesson/contract";
import { isPlainObject } from "@/lib/utils/type-guards";

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

function pickLastDefinedValue(values: unknown[]) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];

    if (value === undefined || value === null) {
      continue;
    }

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
}

function mergeLessonDraftArrays(values: unknown[][]): unknown[] {
  const length = values.reduce((max, value) => Math.max(max, value.length), 0);

  return Array.from({ length }, (_, index) =>
    mergeLessonDraftValue(...values.map((value) => value[index])),
  ).filter((value) => value !== undefined);
}

function mergeLessonDraftObjects(values: Array<Record<string, unknown>>) {
  const result: Record<string, unknown> = {};
  const keys = new Set(values.flatMap((value) => Object.keys(value)));

  for (const key of keys) {
    const mergedValue = mergeLessonDraftValue(...values.map((value) => value[key]));

    if (mergedValue !== undefined) {
      result[key] = mergedValue;
    }
  }

  return result;
}

function mergeLessonDraftValue(...values: unknown[]): unknown {
  const definedValues = values.filter((value) => value !== undefined && value !== null);

  if (!definedValues.length) {
    return undefined;
  }

  if (definedValues.every(Array.isArray)) {
    return mergeLessonDraftArrays(definedValues);
  }

  if (definedValues.every(isPlainObject)) {
    return mergeLessonDraftObjects(definedValues);
  }

  return pickLastDefinedValue(definedValues);
}

export function buildCompetitionLessonDraft(
  partial?: DeepPartial<CompetitionLessonPlan>,
  fallback: CompetitionLessonPlan = STREAMING_COMPETITION_LESSON_DRAFT,
): CompetitionLessonPlan {
  const parsed = competitionLessonPlanSchema.safeParse(mergeLessonDraftValue(fallback, partial ?? {}));

  return parsed.success ? parsed.data : fallback;
}
