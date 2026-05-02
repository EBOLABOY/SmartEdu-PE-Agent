import type { CompetitionLessonPlan, CompetitionLessonPlanRow } from "@/lib/competition-lesson-contract";
import type { HtmlScreenPlan } from "@/lib/html-screen-plan-contract";
import {
  HTML_SCREEN_SUPPORTED_FRAGMENT_CLASS_GUIDE,
  HTML_SCREEN_VISUAL_SYSTEM_REFERENCE,
} from "@/lib/html-screen-visual-language";

const REFERENCE_VISUAL_SYSTEM = HTML_SCREEN_VISUAL_SYSTEM_REFERENCE;

type VisualMode = NonNullable<HtmlScreenPlan["sections"][number]["visualMode"]>;

function parseDurationSeconds(timeText: string) {
  const values = timeText.match(/\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) ?? [];

  if (!values.length) {
    return 300;
  }

  const minutes = values.length >= 2 ? (values[0] + values[1]) / 2 : values[0];

  return Math.max(60, Math.round(minutes * 60));
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

function buildVisualIntent(row: CompetitionLessonPlanRow) {
  const title = firstText(row.content, row.structure);
  const visualMode = inferVisualMode(row);

  if (visualMode === "image") {
    return `为“${title}”生成 16:9 横板动作辅助讲解图，用清晰动作分解或关键姿态帮助学生形成动作表象。`;
  }

  if (visualMode === "hybrid") {
    return `为“${title}”先生成 16:9 横板动作辅助讲解图，再用 HTML 叠加任务、安全和评价提示，兼顾直观动作认知与课堂执行。`;
  }

  return `为“${title}”自由选择最有助于课堂执行的视觉表达，可以是路线、队形、规则、节奏、对比、评价或其他教学图形，不受固定模块限制。`;
}

function rowSearchText(row: CompetitionLessonPlanRow) {
  return [
    row.structure,
    ...row.content,
    ...row.methods.teacher,
    ...row.methods.students,
    ...row.organization,
  ].join(" ");
}

function inferVisualMode(row: CompetitionLessonPlanRow): VisualMode {
  const text = rowSearchText(row);

  if (/五步拳|武术|拳|套路|体操|支撑|翻滚|滚翻|腾空|起跳|落地|投掷|挥臂|蹬地|摆臂|发力|姿态|动作要领|关键姿势/.test(text)) {
    return "hybrid";
  }

  if (/战术|跑位|路线|传切|攻防|队形|轮换|站点|分组|绕|接力|拔河|传球|运球|防守|进攻|场地|器材路径/.test(text)) {
    return "html";
  }

  return "html";
}

function buildImagePrompt(row: CompetitionLessonPlanRow) {
  const title = firstText(row.content, row.structure);
  const studentActions = takeActionItems(row);

  return [
    `生成一张 16:9 横板体育课堂辅助讲解图，主题是“${title}”。`,
    "画面用于小学体育课投屏讲解，要求清晰、干净、远距离可读，采用教学插画或动作分解图风格。",
    `动作或学习任务：${compactRowLines([...row.content, ...row.methods.teacher, ...row.methods.students])}`,
    `学生行动重点：${studentActions.length ? studentActions.join("；") : "看图理解动作结构，按教师口令练习"}`,
    `组织与安全：${compactRowLines(row.organization)}；保持安全距离，按教师口令开始与停止。`,
    "构图要求：横向 16:9，主体动作居中或按 3-5 个阶段从左到右展开，右侧或下方留出少量空白用于 HTML 叠加提示。",
    "限制：不要真实人脸，不要照片化杂乱背景，不要大段文字，不要品牌标识，不要血腥或危险画面。",
  ].join("\n");
}

function compactRowLines(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean).join("；");
}

function buildPagePrompt(row: CompetitionLessonPlanRow) {
  const title = firstText(row.content, row.structure);
  const studentActions = takeActionItems(row);
  const visualMode = inferVisualMode(row);
  const visualModeInstruction =
    visualMode === "html"
      ? "媒介选择：visualMode=html，本页不调用生图，必须优先用 HTML/CSS/SVG 表达路线、队形、器材路径、规则或课堂组织。"
      : "媒介选择：visualMode=hybrid，本页会由服务端先生成 16:9 教学辅助图；HTML 片段只需要围绕图片补充核心任务、学生行动、安全提醒和评价观察，不要再手搓复杂动作图。";

  return [
    `为体育课堂大屏的“${title}”时间段生成一个 HTML 内容片段。`,
    "片段将被服务端放入固定 slide 模板中，不要输出完整 HTML、section、script、style 或 Markdown。",
    visualModeInstruction,
    `视觉目标：${buildVisualIntent(row)}`,
    `本环节怎么做：${buildObjective(row)}`,
    `学生行动：${studentActions.length ? studentActions.join("；") : "看清任务；保持距离；听口令切换"}`,
    `安全提醒：${buildSafetyCue(row)}`,
    `评价观察：${buildEvaluationCue(row)}`,
    HTML_SCREEN_SUPPORTED_FRAGMENT_CLASS_GUIDE,
    "风格要求：页面像体育馆里的教师课堂控制台，不要空洞海报，不要大面积玻璃装饰，不要让标题孤立漂浮在画面中央。",
    "页面必须适合体育馆远距离投屏，使用大字号、强层级、清晰图形和简体中文。",
  ].join("\n");
}

export function buildLessonScreenPlanFromLessonPlan(lessonPlan: CompetitionLessonPlan): HtmlScreenPlan {
  return {
    visualSystem: REFERENCE_VISUAL_SYSTEM,
    sections: lessonPlan.periodPlan.rows.map((row, index) => {
      return {
        title: row.content[0] ?? row.structure,
        durationSeconds: parseDurationSeconds(row.time),
        sourceRowIndex: index,
        objective: buildObjective(row),
        studentActions: takeActionItems(row),
        safetyCue: buildSafetyCue(row),
        evaluationCue: buildEvaluationCue(row),
        visualIntent: buildVisualIntent(row),
        visualMode: inferVisualMode(row),
        ...(inferVisualMode(row) !== "html" ? { imagePrompt: buildImagePrompt(row) } : {}),
        pagePrompt: buildPagePrompt(row),
        reason: `从结构化课时计划第 ${index + 1} 行生成教学环节参考草案，时间解析为 ${row.time}。`,
      };
    }),
  };
}
