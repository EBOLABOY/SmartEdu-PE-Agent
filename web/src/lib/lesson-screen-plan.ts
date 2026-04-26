import type { CompetitionLessonPlan, CompetitionLessonPlanRow } from "@/lib/competition-lesson-contract";
import type { LessonScreenPlan, LessonScreenSupportModule } from "@/lib/lesson-authoring-contract";

const MODULE_REASON: Record<LessonScreenSupportModule, string> = {
  tacticalBoard: "该环节包含战术、跑位、攻防配合或路线理解，适合用战术板辅助学生看屏自学。",
  scoreboard: "该环节包含比赛、展示、挑战或计分反馈，适合用分组计分板强化即时评价。",
  rotation: "该环节包含站点、分组轮换或接力路线，适合用轮换路线图降低组织理解成本。",
  formation: "该环节更需要明确队形、任务步骤和安全边界，适合用组织队形图辅助课堂运行。",
};

function parseDurationSeconds(timeText: string) {
  const values = timeText.match(/\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) ?? [];

  if (!values.length) {
    return 300;
  }

  const minutes = values.length >= 2 ? (values[0] + values[1]) / 2 : values[0];

  return Math.max(60, Math.round(minutes * 60));
}

function selectSupportModule(row: CompetitionLessonPlanRow): LessonScreenSupportModule {
  if (row.structure === "结束部分" || row.structure === "准备部分") {
    return "formation";
  }

  const text = [
    row.structure,
    ...row.content,
    ...row.methods.teacher,
    ...row.methods.students,
    ...row.organization,
  ].join(" ");

  if (/比赛|竞赛|挑战|对抗|展示|计分|得分|积分|闯关/.test(text)) {
    return "scoreboard";
  }

  if (/站点|轮换|循环|接力|绕返|换位|分区/.test(text) && !/战术|攻防|跑位|阵型|传切|配合/.test(text)) {
    return "rotation";
  }

  if (/战术|攻防|跑位|阵型|路线|传切|传接|掩护|突破|防守|站位|配合/.test(text)) {
    return "tacticalBoard";
  }

  return "formation";
}

function buildLessonPlanSectionReason(module: LessonScreenSupportModule, row: CompetitionLessonPlanRow) {
  return `${MODULE_REASON[module]}时间已从结构化教案解析为 ${row.time}。`;
}

export function buildLessonScreenPlanFromLessonPlan(lessonPlan: CompetitionLessonPlan): LessonScreenPlan {
  return {
    sections: lessonPlan.periodPlan.rows.map((row) => {
      const supportModule = selectSupportModule(row);

      return {
        title: row.content[0] ?? row.structure,
        durationSeconds: parseDurationSeconds(row.time),
        supportModule,
        reason: buildLessonPlanSectionReason(supportModule, row),
      };
    }),
  };
}
