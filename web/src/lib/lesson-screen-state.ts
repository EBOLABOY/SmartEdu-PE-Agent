import { buildLessonScreenDesignSpec, type LessonScreenDesignSpec } from "./lesson-screen-design";
import {
  extractLoadCurvePoints,
  resolveLessonSupportModule,
  type LessonSupportModule,
  type LoadCurvePoint,
  type RenderableLessonSlide,
} from "./lesson-screen-modules";
import type { LessonScreenScriptSlide } from "./lesson-screen-script";

export type LessonScreenProjectState = {
  title: string;
  slides: RenderableLessonSlide[];
  designSpec: LessonScreenDesignSpec;
  totalSeconds: number;
  totalMinutes: number;
  boardCount: number;
  supportModuleCounts: Record<LessonSupportModule, number>;
  loadCurvePoints: LoadCurvePoint[];
  slideData: LessonScreenScriptSlide[];
};

export function buildLessonScreenProjectState(input: {
  title: string;
  lessonText: string;
  slides: RenderableLessonSlide[];
}): LessonScreenProjectState {
  const totalSeconds = input.slides.reduce((sum, slide) => sum + slide.durationSeconds, 0);
  const supportModuleCounts = input.slides.reduce<Record<LessonSupportModule, number>>(
    (counts, slide) => {
      counts[resolveLessonSupportModule(slide)] += 1;
      return counts;
    },
    { tacticalBoard: 0, scoreboard: 0, rotation: 0, formation: 0 },
  );

  return {
    title: input.title,
    slides: input.slides,
    designSpec: buildLessonScreenDesignSpec(input.lessonText, input.slides),
    totalSeconds,
    totalMinutes: Math.round(totalSeconds / 60),
    boardCount: supportModuleCounts.tacticalBoard,
    supportModuleCounts,
    loadCurvePoints: extractLoadCurvePoints(input.lessonText),
    slideData: input.slides.map(({ title, durationSeconds }) => ({ title, durationSeconds })),
  };
}
