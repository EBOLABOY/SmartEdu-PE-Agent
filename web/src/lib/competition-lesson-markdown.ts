import {
  DEFAULT_COMPETITION_LESSON_PLAN,
  competitionLessonPlanSchema,
  type CompetitionLessonLoadChartPoint,
  type CompetitionLessonPlan,
} from "@/lib/competition-lesson-contract";

const SECTION_TITLES = [
  "一、指导思想",
  "二、教材分析",
  "三、学情分析",
  "四、学习目标",
  "五、教学重难点",
  "六、教学流程",
  "七、学习评价",
  "八、运动负荷预计",
  "九、场地与器材",
  "十、课时计划（教案）",
];

const PRINT_SAFETY_ITEM_LIMIT = 3;
const PRINT_SAFETY_TEXT_LIMIT = 34;
const PRINT_VENUE_ITEM_LIMIT = 1;
const PRINT_VENUE_TEXT_LIMIT = 24;
const PRINT_EQUIPMENT_ITEM_LIMIT = 4;
const PRINT_EQUIPMENT_TEXT_LIMIT = 18;
const NON_CORE_EQUIPMENT_PATTERN =
  /急救|医药|药箱|任务卡|学习单|记录单|评价表|记分|计分|积分|秒表|哨子|扩音|音响|展板|白板|粉笔|笔|号码牌|队服|马甲|袖标|观察|等待|通道|分区牌/;

function normalizeMarkdown(markdown: string) {
  return markdown.replace(/\r\n/g, "\n").trim();
}

function stripMarkdownSyntax(text: string) {
  return text
    .replace(/^#{1,6}\s*/, "")
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+[.、]\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .trim();
}

function splitSentences(text: string, fallback: string[]) {
  const parts = text
    .split(/\n+/)
    .map(stripMarkdownSyntax)
    .flatMap((line) => line.split(/(?<=[。；;])/))
    .map((line) => line.trim())
    .filter(Boolean);

  return parts.length ? parts : fallback;
}

function firstTextAfterLabel(markdown: string, labels: string[], fallback: string) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`${escaped}[：:]\\s*([^\\n|]+)`).exec(markdown);

    if (match?.[1]?.trim()) {
      return stripMarkdownSyntax(match[1]);
    }
  }

  return fallback;
}

function splitCellLines(text: string) {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .split(/\n|；|;/)
    .map(stripMarkdownSyntax)
    .filter(Boolean);
}

function compactPrintText(text: string, maxLength: number) {
  const compacted = stripMarkdownSyntax(text).replace(/\s+/g, "");

  return compacted.length > maxLength ? compacted.slice(0, maxLength) : compacted;
}

function compactPrintList(lines: string[], maxItems: number, maxLength: number, fallback: string[]) {
  const seen = new Set<string>();
  const compacted = lines
    .map((line) => compactPrintText(line, maxLength))
    .filter(Boolean)
    .filter((line) => {
      if (seen.has(line)) {
        return false;
      }

      seen.add(line);
      return true;
    })
    .slice(0, maxItems);

  return compacted.length ? compacted : fallback;
}

function compactPrintEquipmentList(lines: string[], fallback: string[]) {
  const equipmentItems = lines
    .flatMap((line) =>
      stripMarkdownSyntax(line)
        .replace(/^器材[：:]\s*/, "")
        .split(/[、，,；;]/),
    )
    .filter((line) => !NON_CORE_EQUIPMENT_PATTERN.test(line))
    .map((line) => compactPrintText(line, PRINT_EQUIPMENT_TEXT_LIMIT))
    .filter(Boolean);

  return compactPrintList(equipmentItems, PRINT_EQUIPMENT_ITEM_LIMIT, PRINT_EQUIPMENT_TEXT_LIMIT, fallback);
}

function compactPrintBoundedFields(plan: CompetitionLessonPlan) {
  plan.periodPlan.safety = compactPrintList(
    plan.periodPlan.safety,
    PRINT_SAFETY_ITEM_LIMIT,
    PRINT_SAFETY_TEXT_LIMIT,
    cloneDefaultPlan().periodPlan.safety,
  );
  plan.venueEquipment.venue = compactPrintList(
    plan.venueEquipment.venue,
    PRINT_VENUE_ITEM_LIMIT,
    PRINT_VENUE_TEXT_LIMIT,
    cloneDefaultPlan().venueEquipment.venue,
  );
  plan.venueEquipment.equipment = compactPrintEquipmentList(
    plan.venueEquipment.equipment,
    cloneDefaultPlan().venueEquipment.equipment,
  );
}

function stripMarkdownTableCell(text: string) {
  return stripMarkdownSyntax(text.replace(/<br\s*\/?>/gi, "\n"));
}

function markdownTableRows(section: string) {
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"))
    .map((line) => line.split("|").slice(1, -1).map(stripMarkdownTableCell))
    .filter((cells) => cells.length > 0 && !cells.every((cell) => /^-+$/.test(cell.replace(/\s/g, ""))));
}

function firstTableCellAfterLabel(markdown: string, labels: string[], fallback: string) {
  const rows = markdownTableRows(markdown);

  for (const row of rows) {
    for (let index = 0; index < row.length - 1; index += 1) {
      if (labels.includes(row[index])) {
        return row[index + 1] || fallback;
      }
    }
  }

  return fallback;
}

function extractTitle(markdown: string) {
  const lines = normalizeMarkdown(markdown)
    .split("\n")
    .map(stripMarkdownSyntax)
    .filter(Boolean);
  const title = lines.find((line) => !line.startsWith("副标题") && !line.startsWith("授课教师"));

  return title ?? DEFAULT_COMPETITION_LESSON_PLAN.title;
}

function extractSection(markdown: string, title: string) {
  const normalized = normalizeMarkdown(markdown);
  const start = normalized.indexOf(title);

  if (start < 0) {
    return "";
  }

  const afterStart = normalized.slice(start + title.length);
  const nextIndexes = SECTION_TITLES.filter((item) => item !== title)
    .map((item) => afterStart.indexOf(item))
    .filter((index) => index >= 0);
  const end = nextIndexes.length ? Math.min(...nextIndexes) : afterStart.length;

  return afterStart.slice(0, end).replace(/^#+\s*/gm, "").trim();
}

function extractObjective(section: string, label: string, fallback: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}[：:]\\s*([^\\n]+(?:\\n(?!\\s*\\d+[.、]|\\s*[-*]|\\s*运动能力|\\s*健康行为|\\s*体育品德).*)*)`).exec(section);

  return match?.[1] ? stripMarkdownSyntax(match[1]) : fallback;
}

function extractListLike(section: string, fallback: string[]) {
  const lines = section
    .split("\n")
    .map(stripMarkdownSyntax)
    .filter((line) => line && !line.includes("|") && !/^[-:| ]+$/.test(line));

  return lines.length ? lines : fallback;
}

function extractLoad(markdown: string, label: string, fallback: string) {
  return firstTextAfterLabel(markdown, [label], fallback);
}

function extractLoadChartPoints(markdown: string, fallback: CompetitionLessonLoadChartPoint[]) {
  const raw = firstTextAfterLabel(markdown, ["心率曲线节点", "心率曲线", "曲线节点"], "");

  if (!raw) {
    return fallback;
  }

  const points: CompetitionLessonLoadChartPoint[] = [];

  raw.split(/[，,；;]/).forEach((segment) => {
    const match = /(\d+(?:\.\d+)?)\s*['’′]?\s*[=:：-]\s*(\d{2,3})/.exec(segment);

    if (!match) {
      return;
    }

    const timeMinute = Number(match[1]);
    const heartRate = Number(match[2]);

    if (!Number.isFinite(timeMinute) || !Number.isInteger(heartRate)) {
      return;
    }

    points.push({
      timeMinute,
      heartRate,
      label: `${timeMinute}'`,
    });
  });

  return points.length >= 2 ? points : fallback;
}

function extractEvaluation(section: string, fallback: CompetitionLessonPlan["evaluation"]) {
  const rows = markdownTableRows(section).filter((row) => row.length >= 2 && row[0] !== "星级");
  const byLevel = new Map(rows.map((row) => [row[0], row[1]]));
  const levels: CompetitionLessonPlan["evaluation"][number]["level"][] = ["三颗星", "二颗星", "一颗星"];
  const extracted = levels.map((level, index) => ({
    level,
    description: byLevel.get(level) || fallback[index]?.description || "",
  }));
  const parsed = competitionLessonPlanSchema.shape.evaluation.safeParse(extracted);

  return parsed.success ? parsed.data : fallback;
}

function extractPeriodPlan(section: string, plan: CompetitionLessonPlan) {
  const rows = markdownTableRows(section);
  const lessonRows = rows.filter(
    (row) => row.length >= 6 && ["准备部分", "基本部分", "结束部分"].includes(row[0]),
  );
  const homeworkRow = rows.find((row) => row[0] === "课后作业");
  const reflectionRow = rows.find((row) => row[0] === "教学反思");

  plan.periodPlan.mainContent = firstTableCellAfterLabel(section, ["主要学习内容"], plan.periodPlan.mainContent);
  plan.periodPlan.safety = splitCellLines(firstTableCellAfterLabel(section, ["安全保障"], plan.periodPlan.safety.join("<br>")));

  if (lessonRows.length) {
    plan.periodPlan.rows = lessonRows.map((row) => {
      const methods = splitCellLines(row[2]);
      const teacherIndex = methods.findIndex((line) => line.replace(/[:：]$/, "") === "教师");
      const studentIndex = methods.findIndex((line) => line.replace(/[:：]$/, "") === "学生");
      const teacher =
        teacherIndex >= 0
          ? methods.slice(teacherIndex + 1, studentIndex >= 0 ? studentIndex : undefined)
          : methods.slice(0, Math.max(1, Math.ceil(methods.length / 2)));
      const students = studentIndex >= 0 ? methods.slice(studentIndex + 1) : methods.slice(teacher.length);

      return {
        structure: row[0] as CompetitionLessonPlan["periodPlan"]["rows"][number]["structure"],
        content: splitCellLines(row[1]),
        methods: {
          teacher: teacher.length ? teacher : plan.periodPlan.rows[0]?.methods.teacher ?? ["教师组织练习并巡回指导。"],
          students: students.length ? students : plan.periodPlan.rows[0]?.methods.students ?? ["学生按要求参与练习。"],
        },
        organization: splitCellLines(row[3]),
        time: row[4] || "8分钟",
        intensity: row[5] || "中等",
      };
    });
  }

  if (homeworkRow?.[1]) {
    plan.periodPlan.homework = splitCellLines(homeworkRow[1]);
  }

  if (reflectionRow?.[1]) {
    plan.periodPlan.reflection = reflectionRow[1];
  }
}

function cloneDefaultPlan(): CompetitionLessonPlan {
  return structuredClone(DEFAULT_COMPETITION_LESSON_PLAN);
}

function joinCell(lines: string[]) {
  return lines.join("<br>");
}

export function markdownToCompetitionLessonPlan(markdown: string): CompetitionLessonPlan {
  const normalized = normalizeMarkdown(markdown);

  if (!normalized) {
    return cloneDefaultPlan();
  }

  const plan = cloneDefaultPlan();
  const objectiveSection = extractSection(normalized, "四、学习目标");
  const keyPointSection = extractSection(normalized, "五、教学重难点");
  const flowSection = extractSection(normalized, "六、教学流程");
  const evaluationSection = extractSection(normalized, "七、学习评价");
  const venueSection = extractSection(normalized, "九、场地与器材");
  const periodPlanSection = extractSection(normalized, "十、课时计划（教案）");

  plan.title = extractTitle(normalized);
  plan.subtitle = firstTextAfterLabel(normalized, ["副标题"], plan.subtitle);
  plan.teacher.name = firstTextAfterLabel(normalized, ["授课教师", "教师"], plan.teacher.name);
  plan.teacher.school = firstTableCellAfterLabel(
    normalized,
    ["学校"],
    firstTextAfterLabel(normalized, ["学校"], plan.teacher.school),
  );
  plan.meta.topic = firstTableCellAfterLabel(
    normalized,
    ["主题"],
    firstTextAfterLabel(normalized, ["主题", "课题"], plan.meta.topic),
  );
  plan.meta.lessonNo = firstTableCellAfterLabel(
    normalized,
    ["课次"],
    firstTextAfterLabel(normalized, ["课次"], plan.meta.lessonNo),
  );
  plan.meta.studentCount = firstTableCellAfterLabel(
    normalized,
    ["学生人数"],
    firstTextAfterLabel(normalized, ["学生人数", "人数"], plan.meta.studentCount),
  );
  plan.narrative.guidingThought = splitSentences(
    extractSection(normalized, "一、指导思想"),
    plan.narrative.guidingThought,
  );
  plan.narrative.textbookAnalysis = splitSentences(
    extractSection(normalized, "二、教材分析"),
    plan.narrative.textbookAnalysis,
  );
  plan.narrative.studentAnalysis = splitSentences(
    extractSection(normalized, "三、学情分析"),
    plan.narrative.studentAnalysis,
  );
  plan.learningObjectives.sportAbility = extractObjective(
    objectiveSection,
    "运动能力",
    plan.learningObjectives.sportAbility,
  );
  plan.learningObjectives.healthBehavior = extractObjective(
    objectiveSection,
    "健康行为",
    plan.learningObjectives.healthBehavior,
  );
  plan.learningObjectives.sportMorality = extractObjective(
    objectiveSection,
    "体育品德",
    plan.learningObjectives.sportMorality,
  );
  plan.keyDifficultPoints.studentLearning = extractObjective(
    keyPointSection,
    "学生学习",
    plan.keyDifficultPoints.studentLearning,
  );
  plan.keyDifficultPoints.teachingContent = extractObjective(
    keyPointSection,
    "教学内容",
    plan.keyDifficultPoints.teachingContent,
  );
  plan.keyDifficultPoints.teachingOrganization = extractObjective(
    keyPointSection,
    "教学组织",
    plan.keyDifficultPoints.teachingOrganization,
  );
  plan.keyDifficultPoints.teachingMethod = extractObjective(
    keyPointSection,
    "教学方法",
    plan.keyDifficultPoints.teachingMethod,
  );
  plan.flowSummary = extractListLike(flowSection, plan.flowSummary);
  plan.evaluation = extractEvaluation(evaluationSection, plan.evaluation);
  plan.loadEstimate.loadLevel = firstTextAfterLabel(
    normalized,
    ["负荷等级", "运动负荷等级"],
    plan.loadEstimate.loadLevel,
  );
  plan.loadEstimate.targetHeartRateRange = firstTextAfterLabel(
    normalized,
    ["目标心率区间", "目标区间"],
    plan.loadEstimate.targetHeartRateRange,
  );
  plan.loadEstimate.averageHeartRate = firstTextAfterLabel(
    normalized,
    ["平均心率", "预计平均心率"],
    plan.loadEstimate.averageHeartRate,
  );
  plan.loadEstimate.groupDensity = extractLoad(normalized, "群体运动密度", plan.loadEstimate.groupDensity);
  plan.loadEstimate.individualDensity = extractLoad(
    normalized,
    "个体运动密度",
    plan.loadEstimate.individualDensity,
  );
  plan.loadEstimate.chartPoints = extractLoadChartPoints(normalized, plan.loadEstimate.chartPoints);
  plan.loadEstimate.rationale = extractLoad(normalized, "形成依据", plan.loadEstimate.rationale ?? "");
  plan.venueEquipment.venue = extractListLike(venueSection, plan.venueEquipment.venue).filter((line) =>
    /场地|场|馆/.test(line),
  );
  plan.venueEquipment.equipment = extractListLike(venueSection, plan.venueEquipment.equipment).filter((line) =>
    /器材|球|标志|垫|绳|桶|碟|门/.test(line),
  );

  if (plan.venueEquipment.venue.length === 0) {
    plan.venueEquipment.venue = cloneDefaultPlan().venueEquipment.venue;
  }

  if (plan.venueEquipment.equipment.length === 0) {
    plan.venueEquipment.equipment = cloneDefaultPlan().venueEquipment.equipment;
  }

  extractPeriodPlan(periodPlanSection, plan);
  compactPrintBoundedFields(plan);

  const parsed = competitionLessonPlanSchema.safeParse(plan);

  return parsed.success ? parsed.data : cloneDefaultPlan();
}

export function competitionLessonPlanToMarkdown(plan: CompetitionLessonPlan): string {
  const lesson = competitionLessonPlanSchema.parse(plan);
  const flowRows = lesson.periodPlan.rows
    .map((row) => {
      const methods = [
        "教师：",
        ...row.methods.teacher,
        "学生：",
        ...row.methods.students,
      ];

      return `| ${row.structure} | ${joinCell(row.content)} | ${joinCell(methods)} | ${joinCell(row.organization)} | ${row.time} | ${row.intensity} |`;
    })
    .join("\n");

  return `# ${lesson.title}

副标题：${lesson.subtitle}
授课教师：${lesson.teacher.school} ${lesson.teacher.name}

## 一、指导思想

${lesson.narrative.guidingThought.join("\n\n")}

## 二、教材分析

${lesson.narrative.textbookAnalysis.join("\n\n")}

## 三、学情分析

${lesson.narrative.studentAnalysis.join("\n\n")}

## 四、学习目标

1.运动能力：${lesson.learningObjectives.sportAbility}

2.健康行为：${lesson.learningObjectives.healthBehavior}

3.体育品德：${lesson.learningObjectives.sportMorality}

## 五、教学重难点

1.学生学习：${lesson.keyDifficultPoints.studentLearning}

2.教学内容：${lesson.keyDifficultPoints.teachingContent}

3.教学组织：${lesson.keyDifficultPoints.teachingOrganization}

4.教学方法：${lesson.keyDifficultPoints.teachingMethod}

## 六、教学流程

${lesson.flowSummary.join("；—")}

## 七、学习评价

| 星级 | 评价方面 |
| --- | --- |
${lesson.evaluation.map((item) => `| ${item.level} | ${item.description} |`).join("\n")}

## 八、运动负荷预计

负荷等级：${lesson.loadEstimate.loadLevel}

目标心率区间：${lesson.loadEstimate.targetHeartRateRange}

平均心率：${lesson.loadEstimate.averageHeartRate}

群体运动密度：${lesson.loadEstimate.groupDensity}

个体运动密度：${lesson.loadEstimate.individualDensity}

心率曲线节点：${lesson.loadEstimate.chartPoints.map((point) => `${point.timeMinute}'=${point.heartRate}`).join("，")}

形成依据：${lesson.loadEstimate.rationale ?? "根据课堂环节时间、练习密度、强度变化和放松恢复安排综合估算。"}

## 九、场地与器材

场地：${lesson.venueEquipment.venue.join("；")}

器材：${lesson.venueEquipment.equipment.join("；")}

## 十、课时计划（教案）

| 主题 | ${lesson.meta.topic} | 课次 | ${lesson.meta.lessonNo} | 学生人数 | ${lesson.meta.studentCount} |
| --- | --- | --- | --- | --- | --- |
| 学习目标 | ${lesson.learningObjectives.sportAbility}<br>${lesson.learningObjectives.healthBehavior}<br>${lesson.learningObjectives.sportMorality} |  |  |  |  |
| 主要学习内容 | ${lesson.periodPlan.mainContent} |  |  |  |  |
| 教学重难点 | ${lesson.keyDifficultPoints.studentLearning}<br>${lesson.keyDifficultPoints.teachingContent}<br>${lesson.keyDifficultPoints.teachingOrganization}<br>${lesson.keyDifficultPoints.teachingMethod} |  |  |  |  |
| 安全保障 | ${joinCell(lesson.periodPlan.safety)} | 场地器材 | ${joinCell([...lesson.venueEquipment.venue, ...lesson.venueEquipment.equipment])} |  |  |

| 课的结构 | 具体教学内容 | 教与学的方法 | 组织形式 | 运动时间 | 强度 |
| --- | --- | --- | --- | --- | --- |
${flowRows}

| 项目 | 内容 |
| --- | --- |
| 预计运动负荷 | 负荷等级：${lesson.loadEstimate.loadLevel}<br>目标心率区间：${lesson.loadEstimate.targetHeartRateRange}<br>平均心率：${lesson.loadEstimate.averageHeartRate}<br>群体运动密度：${lesson.loadEstimate.groupDensity}<br>个体运动密度：${lesson.loadEstimate.individualDensity}<br>心率曲线节点：${lesson.loadEstimate.chartPoints.map((point) => `${point.timeMinute}'=${point.heartRate}`).join("，")} |
| 课后作业 | ${joinCell(lesson.periodPlan.homework)} |
| 教学反思 | ${lesson.periodPlan.reflection ?? ""} |`;
}
