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
  return `${MODULE_REASON[module]}时间已从结构化课时计划解析为 ${row.time}。`;
}

function firstText(values: string[], fallback: string) {
  return values.find((value) => value.trim().length > 0) ?? fallback;
}

function takeActionItems(row: CompetitionLessonPlanRow) {
  return row.methods.students.slice(0, 3).map((item) => item.trim()).filter(Boolean);
}

function buildObjective(row: CompetitionLessonPlanRow) {
  return `本页服务于“${firstText(row.content, row.structure)}”：让学生看屏后能明确任务、组织方式和完成标准。`;
}

function buildSafetyCue(row: CompetitionLessonPlanRow) {
  return `注意${firstText(row.organization, "练习区域")}的间距和行进方向，按教师口令开始与停止。`;
}

function buildEvaluationCue(row: CompetitionLessonPlanRow) {
  return `观察学生能否按“${firstText(row.content, row.structure)}”要求完成动作，并及时给出同伴合作反馈。`;
}

function buildVisualIntent(module: LessonScreenSupportModule, row: CompetitionLessonPlanRow) {
  const title = firstText(row.content, row.structure);

  switch (module) {
    case "scoreboard":
      return `为“${title}”绘制分组计分板，突出得分规则、挑战目标和即时反馈。`;
    case "rotation":
      return `为“${title}”绘制小组轮换路线，标清站点顺序、移动方向和等待区。`;
    case "tacticalBoard":
      return `为“${title}”绘制战术板或路线图，展示队员点位、移动箭头和关键配合时机。`;
    case "formation":
      return `为“${title}”绘制队形组织图，突出集合、练习边界和安全距离。`;
  }
}

export function buildLessonScreenPlanFromLessonPlan(lessonPlan: CompetitionLessonPlan): LessonScreenPlan {
  return {
    sections: lessonPlan.periodPlan.rows.map((row, index) => {
      const supportModule = selectSupportModule(row);

      return {
        title: row.content[0] ?? row.structure,
        durationSeconds: parseDurationSeconds(row.time),
        supportModule,
        sourceRowIndex: index,
        objective: buildObjective(row),
        studentActions: takeActionItems(row),
        safetyCue: buildSafetyCue(row),
        evaluationCue: buildEvaluationCue(row),
        visualIntent: buildVisualIntent(supportModule, row),
        reason: buildLessonPlanSectionReason(supportModule, row),
      };
    }),
  };
}
