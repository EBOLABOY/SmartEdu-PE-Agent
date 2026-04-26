import type { LessonScreenPlan, LessonScreenSupportModule } from "@/lib/lesson-authoring-contract";

import { extractLessonSlides, type LessonSlide } from "./lesson-slideshow-html";

const MODULE_REASON: Record<LessonScreenSupportModule, string> = {
  tacticalBoard: "该环节包含战术、跑位、攻防配合或路线理解，适合用战术板辅助学生看屏自学。",
  scoreboard: "该环节包含比赛、展示、挑战或计分反馈，适合用分组计分板强化即时评价。",
  rotation: "该环节包含站点、分组轮换或接力路线，适合用轮换路线图降低组织理解成本。",
  formation: "该环节更需要明确队形、任务步骤和安全边界，适合用组织队形图辅助课堂运行。",
};

function buildSupportModuleReason(slide: LessonSlide) {
  const basis = slide.estimated ? "时间由系统估算" : `时间已从教案解析为 ${slide.durationLabel}`;

  return `${MODULE_REASON[slide.supportModule]}${basis}。`;
}

export function buildLessonScreenPlanFromMarkdown(markdown: string): LessonScreenPlan {
  const slides = extractLessonSlides(markdown);

  return {
    sections: slides.map((slide) => ({
      title: slide.title,
      durationSeconds: slide.durationSeconds,
      supportModule: slide.supportModule,
      reason: buildSupportModuleReason(slide),
    })),
  };
}
