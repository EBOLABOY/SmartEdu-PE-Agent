import { z } from "zod";

import {
  competitionLessonPlanSchema,
  type CompetitionLessonPlan,
  type CompetitionLessonPlanRow,
} from "@/lib/competition-lesson-contract";

const nonEmptyString = z.string().trim().min(1);
const textListSchema = z.array(nonEmptyString).default([]);

const FLOW_STRUCTURES = ["准备部分", "基本部分", "结束部分"] as const;
const EVALUATION_LEVELS = ["三颗星", "二颗星", "一颗星"] as const;
const LESSON_KEYS = new Set([
  "grade",
  "lessonNo",
  "level",
  "studentCount",
  "subtitle",
  "teacherName",
  "teacherSchool",
  "title",
  "topic",
]);
const LOAD_KEYS = new Set([
  "averageHeartRate",
  "groupDensity",
  "individualDensity",
  "loadLevel",
  "targetHeartRateRange",
]);

type ProtocolBlock =
  | { kind: "none" }
  | { kind: "lesson" }
  | { kind: "section"; path: string }
  | { kind: "flow"; index: number }
  | { kind: "evaluation"; index: number }
  | { kind: "equipment" }
  | { kind: "safety" }
  | { kind: "load" }
  | { kind: "unknown"; name: string };

export type LessonPlanProtocolDiagnostic = {
  code: "missing-required" | "unknown-block" | "invalid-value";
  line?: number;
  message: string;
};

export class LessonPlanProtocolError extends Error {
  readonly diagnostics: LessonPlanProtocolDiagnostic[];

  constructor(diagnostics: LessonPlanProtocolDiagnostic[]) {
    super(formatLessonPlanProtocolDiagnostics({ diagnostics }));
    this.name = "LessonPlanProtocolError";
    this.diagnostics = diagnostics;
  }
}

export const lessonPlanProtocolDraftSchema = z.object({
  equipment: z.object({
    equipment: textListSchema,
    venue: textListSchema,
  }),
  evaluations: z.array(
    z.object({
      description: nonEmptyString.optional(),
      level: nonEmptyString.optional(),
    }),
  ),
  flows: z.array(
    z.object({
      content: textListSchema,
      intensity: nonEmptyString.optional(),
      organization: textListSchema,
      part: nonEmptyString.optional(),
      students: textListSchema,
      teacher: textListSchema,
      time: nonEmptyString.optional(),
    }),
  ),
  lesson: z.object({
    grade: nonEmptyString.optional(),
    lessonNo: nonEmptyString.optional(),
    level: nonEmptyString.optional(),
    studentCount: nonEmptyString.optional(),
    subtitle: nonEmptyString.optional(),
    teacherName: nonEmptyString.optional(),
    teacherSchool: nonEmptyString.optional(),
    title: nonEmptyString.optional(),
    topic: nonEmptyString.optional(),
  }),
  load: z.object({
    averageHeartRate: nonEmptyString.optional(),
    groupDensity: nonEmptyString.optional(),
    individualDensity: nonEmptyString.optional(),
    loadLevel: nonEmptyString.optional(),
    rationale: textListSchema,
    targetHeartRateRange: nonEmptyString.optional(),
  }),
  narrative: z.object({
    guidingThought: textListSchema,
    studentAnalysis: textListSchema,
    textbookAnalysis: textListSchema,
  }),
  objectives: z.object({
    healthBehavior: textListSchema,
    sportAbility: textListSchema,
    sportMorality: textListSchema,
  }),
  safety: textListSchema,
  warnings: z.array(z.string()).default([]),
});

export type LessonPlanProtocolDraft = z.infer<typeof lessonPlanProtocolDraftSchema>;

function createEmptyDraft(): LessonPlanProtocolDraft {
  return {
    equipment: {
      equipment: [],
      venue: [],
    },
    evaluations: [],
    flows: [],
    lesson: {},
    load: {
      rationale: [],
    },
    narrative: {
      guidingThought: [],
      studentAnalysis: [],
      textbookAnalysis: [],
    },
    objectives: {
      healthBehavior: [],
      sportAbility: [],
      sportMorality: [],
    },
    safety: [],
    warnings: [],
  };
}

function compactText(value: string) {
  return value.replace(/\u3000/g, " ").trim();
}

function stripListMarker(value: string) {
  return compactText(value).replace(/^[-*•]\s*/, "").replace(/^\d+[.、)]\s*/, "").trim();
}

function pushText(target: string[], value: string) {
  const normalized = stripListMarker(value);

  if (normalized) {
    target.push(normalized);
  }
}

function setText(target: Record<string, string | undefined>, key: string, value: string) {
  const normalized = compactText(value);

  if (normalized) {
    target[key] = normalized;
  }
}

const KEY_ALIASES: Record<string, string> = {
  "average_heart_rate": "averageHeartRate",
  "group_density": "groupDensity",
  "individual_density": "individualDensity",
  "lesson_no": "lessonNo",
  "load_level": "loadLevel",
  "student_count": "studentCount",
  "target_heart_rate_range": "targetHeartRateRange",
  "teacher_name": "teacherName",
  "teacher_school": "teacherSchool",
  "个人练习密度": "individualDensity",
  "人均密度": "individualDensity",
  "人数": "studentCount",
  "内容": "content",
  "器材": "equipment",
  "场地": "venue",
  "学情分析": "studentAnalysis",
  "学生": "students",
  "学生活动": "students",
  "学生人数": "studentCount",
  "学校": "teacherSchool",
  "平均心率": "averageHeartRate",
  "年级": "grade",
  "强度": "intensity",
  "教师": "teacher",
  "教师姓名": "teacherName",
  "教师活动": "teacher",
  "教材分析": "textbookAnalysis",
  "时间": "time",
  "指导思想": "guidingThought",
  "水平": "level",
  "目标心率": "targetHeartRateRange",
  "组密度": "groupDensity",
  "组织": "organization",
  "组织形式": "organization",
  "负荷": "loadLevel",
  "课次": "lessonNo",
  "运动负荷": "loadLevel",
  "运动能力": "sportAbility",
  "体育品德": "sportMorality",
  "健康行为": "healthBehavior",
  "主题": "topic",
  "标题": "title",
  "副标题": "subtitle",
};

function normalizeKey(key: string) {
  const normalized = compactText(key).replace(/\s+/g, "_").toLowerCase();
  return KEY_ALIASES[normalized] ?? KEY_ALIASES[compactText(key)] ?? normalized;
}

function parseKeyValue(line: string) {
  const match = /^([^=：:]+)\s*(?:=|：|:)\s*(.*)$/.exec(line);

  if (!match) {
    return undefined;
  }

  return {
    key: normalizeKey(match[1]),
    value: compactText(match[2]),
  };
}

function parseBlock(line: string): ProtocolBlock | undefined {
  const match = /^@([a-zA-Z_][\w-]*)(?:\s+(.+))?$/.exec(line);

  if (!match) {
    return undefined;
  }

  const name = match[1].toLowerCase();
  const arg = compactText(match[2] ?? "");

  if (name === "lesson") {
    return { kind: "lesson" };
  }

  if (name === "section") {
    return { kind: "section", path: arg };
  }

  if (name === "flow") {
    return { kind: "flow", index: -1 };
  }

  if (name === "evaluation") {
    return { kind: "evaluation", index: -1 };
  }

  if (name === "equipment") {
    return { kind: "equipment" };
  }

  if (name === "safety") {
    return { kind: "safety" };
  }

  if (name === "load") {
    return { kind: "load" };
  }

  return { kind: "unknown", name };
}

function normalizeSectionPath(path: string) {
  const normalized = compactText(path).replace(/\s+/g, "_").toLowerCase();
  const alias = KEY_ALIASES[normalized] ?? KEY_ALIASES[path] ?? normalized;

  return alias.replace("narrative.", "narrative.").replace("objectives.", "objectives.");
}

function sectionTarget(draft: LessonPlanProtocolDraft, path: string) {
  const normalized = normalizeSectionPath(path);

  switch (normalized) {
    case "narrative.guiding_thought":
    case "narrative.guidingthought":
    case "guidingThought":
    case "guiding_thought":
      return draft.narrative.guidingThought;
    case "narrative.textbook_analysis":
    case "narrative.textbookanalysis":
    case "textbookAnalysis":
    case "textbook_analysis":
      return draft.narrative.textbookAnalysis;
    case "narrative.student_analysis":
    case "narrative.studentanalysis":
    case "studentAnalysis":
    case "student_analysis":
      return draft.narrative.studentAnalysis;
    case "objectives.sport_ability":
    case "objectives.sportability":
    case "sportAbility":
    case "sport_ability":
      return draft.objectives.sportAbility;
    case "objectives.health_behavior":
    case "objectives.healthbehavior":
    case "healthBehavior":
    case "health_behavior":
      return draft.objectives.healthBehavior;
    case "objectives.sport_morality":
    case "objectives.sportmorality":
    case "sportMorality":
    case "sport_morality":
      return draft.objectives.sportMorality;
    default:
      return undefined;
  }
}

function ensureFlow(draft: LessonPlanProtocolDraft, index: number) {
  draft.flows[index] ??= {
    content: [],
    organization: [],
    students: [],
    teacher: [],
  };

  return draft.flows[index];
}

function ensureEvaluation(draft: LessonPlanProtocolDraft, index: number) {
  draft.evaluations[index] ??= {};

  return draft.evaluations[index];
}

function applyKeyValue(draft: LessonPlanProtocolDraft, block: ProtocolBlock, key: string, value: string) {
  if (!value) {
    return;
  }

  if (block.kind === "lesson") {
    if (LESSON_KEYS.has(key)) {
      setText(draft.lesson as Record<string, string | undefined>, key, value);
    }
    return;
  }

  if (block.kind === "section") {
    const target = sectionTarget(draft, block.path) ?? sectionTarget(draft, key);

    if (target) {
      pushText(target, value);
    }
    return;
  }

  if (block.kind === "flow") {
    const flow = ensureFlow(draft, block.index);

    if (key === "content" || key === "organization" || key === "students" || key === "teacher") {
      pushText(flow[key], value);
      return;
    }

    if (key === "part" || key === "time" || key === "intensity") {
      setText(flow as unknown as Record<string, string | undefined>, key, value);
    }
    return;
  }

  if (block.kind === "evaluation") {
    const evaluation = ensureEvaluation(draft, block.index);

    if (key === "description" || key === "level") {
      setText(evaluation as Record<string, string | undefined>, key, value);
    }
    return;
  }

  if (block.kind === "equipment") {
    if (key === "venue") {
      pushText(draft.equipment.venue, value);
      return;
    }

    if (key === "equipment") {
      pushText(draft.equipment.equipment, value);
    }
    return;
  }

  if (block.kind === "load") {
    if (key === "rationale") {
      pushText(draft.load.rationale, value);
      return;
    }

    if (LOAD_KEYS.has(key)) {
      draft.load[key as Exclude<keyof LessonPlanProtocolDraft["load"], "rationale">] = compactText(value);
    }
  }
}

function appendBodyLine(draft: LessonPlanProtocolDraft, block: ProtocolBlock, line: string) {
  if (block.kind === "section") {
    const target = sectionTarget(draft, block.path);

    if (target) {
      pushText(target, line);
    }
    return;
  }

  if (block.kind === "safety") {
    pushText(draft.safety, line);
    return;
  }

  if (block.kind === "equipment") {
    pushText(draft.equipment.equipment, line);
    return;
  }

  if (block.kind === "load") {
    pushText(draft.load.rationale, line);
    return;
  }

  if (block.kind === "flow") {
    pushText(ensureFlow(draft, block.index).content, line);
    return;
  }

  if (block.kind === "evaluation") {
    const evaluation = ensureEvaluation(draft, block.index);
    evaluation.description = [evaluation.description, stripListMarker(line)].filter(Boolean).join("；");
  }
}

function normalizeFlowPart(value?: string) {
  const text = compactText(value ?? "");

  if (/准备|开始|热身/.test(text)) {
    return "准备部分" as const;
  }

  if (/基本|主体|主要|技能|练习|比赛|拓展/.test(text)) {
    return "基本部分" as const;
  }

  if (/结束|放松|恢复|小结|总结/.test(text)) {
    return "结束部分" as const;
  }

  return undefined;
}

function normalizeEvaluationLevel(value: string | undefined, fallbackIndex: number) {
  const text = compactText(value ?? "");

  if (/三颗星|三星|优秀|熟练|高/.test(text)) {
    return "三颗星" as const;
  }

  if (/二颗星|两颗星|二星|良好|基本|中/.test(text)) {
    return "二颗星" as const;
  }

  if (/一颗星|一星|合格|需要|待|低/.test(text)) {
    return "一颗星" as const;
  }

  return EVALUATION_LEVELS[fallbackIndex] ?? EVALUATION_LEVELS[0];
}

function requiredText(values: string[], fallback: string) {
  return values.length > 0 ? values : [fallback];
}

function firstText(values: string[], fallback: string) {
  return values.find((value) => value.trim()) ?? fallback;
}

function normalizeEvaluations(draft: LessonPlanProtocolDraft) {
  return EVALUATION_LEVELS.map((level, index) => {
    const matched =
      draft.evaluations.find((evaluation) => normalizeEvaluationLevel(evaluation.level, index) === level) ??
      draft.evaluations[index];

    return {
      description:
        matched?.description ??
        (level === "三颗星"
          ? "能稳定完成主要练习任务，动作质量较好，并能主动遵守规则、帮助同伴。"
          : level === "二颗星"
            ? "能基本完成主要练习任务，动作和规则意识总体达标，偶有失误。"
            : "能积极参与课堂练习，但动作稳定性、规则意识或安全距离保持仍需继续加强。"),
      level,
    };
  });
}

function normalizeFlows(draft: LessonPlanProtocolDraft): CompetitionLessonPlanRow[] {
  const rowsByPart = new Map<(typeof FLOW_STRUCTURES)[number], LessonPlanProtocolDraft["flows"][number]>();

  draft.flows.forEach((flow, index) => {
    const part = normalizeFlowPart(flow.part) ?? FLOW_STRUCTURES[index];

    if (part && !rowsByPart.has(part)) {
      rowsByPart.set(part, flow);
    }
  });

  return FLOW_STRUCTURES.map((structure) => {
    const flow = rowsByPart.get(structure);

    return {
      content: requiredText(flow?.content ?? [], `${structure}课堂活动`),
      intensity:
        flow?.intensity ??
        (structure === "准备部分" ? "中" : structure === "基本部分" ? "中高" : "低"),
      methods: {
        students: requiredText(flow?.students ?? [], "按教师要求完成练习，并保持安全距离。"),
        teacher: requiredText(flow?.teacher ?? [], "讲解示范、巡视指导，并及时提示安全要求。"),
      },
      organization: requiredText(
        flow?.organization ?? [],
        structure === "基本部分" ? "分组轮换练习队形" : "集合队形",
      ),
      structure,
      time: flow?.time ?? (structure === "准备部分" ? "8分钟" : structure === "基本部分" ? "27分钟" : "5分钟"),
    };
  });
}

function collectDiagnostics(draft: LessonPlanProtocolDraft) {
  const diagnostics: LessonPlanProtocolDiagnostic[] = [];

  if (!draft.lesson.title) {
    diagnostics.push({
      code: "missing-required",
      message: "教案协议缺少 @lesson title。",
    });
  }

  const parts = new Set(draft.flows.map((flow, index) => normalizeFlowPart(flow.part) ?? FLOW_STRUCTURES[index]));
  FLOW_STRUCTURES.forEach((part) => {
    if (!parts.has(part)) {
      diagnostics.push({
        code: "missing-required",
        message: `教案协议缺少 @flow ${part}。`,
      });
    }
  });

  const levels = new Set(draft.evaluations.map((evaluation, index) => normalizeEvaluationLevel(evaluation.level, index)));
  EVALUATION_LEVELS.forEach((level) => {
    if (!levels.has(level)) {
      diagnostics.push({
        code: "missing-required",
        message: `教案协议缺少 @evaluation ${level}。`,
      });
    }
  });

  return diagnostics;
}

export function formatLessonPlanProtocolDiagnostics(error: {
  diagnostics?: LessonPlanProtocolDiagnostic[];
}) {
  const diagnostics = error.diagnostics ?? [];

  if (diagnostics.length === 0) {
    return "教案协议解析失败。";
  }

  return diagnostics
    .map((diagnostic, index) => {
      const line = diagnostic.line ? `第 ${diagnostic.line} 行：` : "";
      return `${index + 1}. ${line}${diagnostic.message}`;
    })
    .join("\n");
}

export function parseLessonPlanProtocolText(text: string): LessonPlanProtocolDraft {
  const draft = createEmptyDraft();
  let block: ProtocolBlock = { kind: "none" };
  let flowIndex = -1;
  let evaluationIndex = -1;
  const diagnostics: LessonPlanProtocolDiagnostic[] = [];

  text.split(/\r?\n/).forEach((rawLine, lineIndex) => {
    const line = compactText(rawLine);

    if (!line || line.startsWith("#") || line.startsWith("//")) {
      return;
    }

    const nextBlock = parseBlock(line);

    if (nextBlock) {
      if (nextBlock.kind === "flow") {
        flowIndex += 1;
        block = { kind: "flow", index: flowIndex };
        ensureFlow(draft, flowIndex);
        return;
      }

      if (nextBlock.kind === "evaluation") {
        evaluationIndex += 1;
        block = { kind: "evaluation", index: evaluationIndex };
        ensureEvaluation(draft, evaluationIndex);
        return;
      }

      block = nextBlock;

      if (nextBlock.kind === "unknown") {
        diagnostics.push({
          code: "unknown-block",
          line: lineIndex + 1,
          message: `教案协议存在未知块 @${nextBlock.name}，系统已忽略。`,
        });
      }
      return;
    }

    const keyValue = parseKeyValue(line);

    if (keyValue) {
      applyKeyValue(draft, block, keyValue.key, keyValue.value);
      return;
    }

    appendBodyLine(draft, block, line);
  });

  draft.warnings = diagnostics.map((diagnostic) => diagnostic.message);

  return lessonPlanProtocolDraftSchema.parse(draft);
}

export function normalizeLessonProtocolDraftToCompetitionLessonPlan(
  draft: LessonPlanProtocolDraft,
): CompetitionLessonPlan {
  const diagnostics = collectDiagnostics(draft);

  if (diagnostics.length > 0) {
    throw new LessonPlanProtocolError(diagnostics);
  }

  const rows = normalizeFlows(draft);
  const title = draft.lesson.title ?? draft.lesson.topic ?? "体育课时计划";
  const topic = draft.lesson.topic ?? title;
  const mainContent = rows.flatMap((row) => row.content);
  const basicRow = rows.find((row) => row.structure === "基本部分") ?? rows[1];

  return competitionLessonPlanSchema.parse({
    evaluation: normalizeEvaluations(draft),
    flowSummary: rows.map((row) => `${row.structure}：${row.content.join("；")}（${row.time}）`),
    keyDifficultPoints: {
      studentLearning: [
        `学生能够围绕“${topic}”明确练习任务，逐步提升动作稳定性、合作意识和安全参与能力。`,
      ],
      teachingContent: [
        `${topic}的动作方法、练习节奏、规则执行与课堂评价标准。`,
        ...basicRow.content.slice(0, 2),
      ],
      teachingMethod: [
        "采用讲解示范、分组练习、巡回指导、同伴互评和游戏化挑战相结合的教学方法。",
      ],
      teachingOrganization: [
        "依据准备、基本、结束三段结构组织课堂，保持练习密度、安全距离和队伍轮换秩序。",
      ],
    },
    learningObjectives: {
      healthBehavior: requiredText(
        draft.objectives.healthBehavior,
        "能根据练习强度调整呼吸与节奏，主动保持安全距离。",
      ),
      sportAbility: requiredText(
        draft.objectives.sportAbility,
        `能理解并完成${topic}的主要练习任务，动作质量逐步提高。`,
      ),
      sportMorality: requiredText(
        draft.objectives.sportMorality,
        "能遵守课堂规则，积极合作，尊重同伴并公平参与练习。",
      ),
    },
    loadEstimate: {
      averageHeartRate: draft.load.averageHeartRate ?? "145次/分钟",
      groupDensity: draft.load.groupDensity ?? "约75%",
      individualDensity: draft.load.individualDensity ?? "约45%",
      loadLevel: draft.load.loadLevel ?? "中等偏上",
      rationale: requiredText(
        draft.load.rationale,
        "准备部分逐步升温，基本部分通过分组练习与挑战保持中高强度，结束部分放松恢复。",
      ),
      targetHeartRateRange: draft.load.targetHeartRateRange ?? "140-155次/分钟",
    },
    meta: {
      grade: draft.lesson.grade ?? "小学",
      lessonNo: draft.lesson.lessonNo ?? "第1课时",
      level: draft.lesson.level ?? "水平二",
      studentCount: draft.lesson.studentCount ?? "40人",
      topic,
    },
    narrative: {
      guidingThought: requiredText(
        draft.narrative.guidingThought,
        "坚持健康第一和学生发展中心，通过结构化练习促进学生运动能力、健康行为和体育品德协同发展。",
      ),
      studentAnalysis: requiredText(
        draft.narrative.studentAnalysis,
        "学生具备一定体育学习经验，但动作稳定性、规则意识和合作练习能力仍需在课堂中持续提升。",
      ),
      textbookAnalysis: requiredText(
        draft.narrative.textbookAnalysis,
        `${topic}是体育课堂中发展学生基本运动能力和综合实践能力的重要内容。`,
      ),
    },
    periodPlan: {
      homework: [
        `课后在安全场地复习${topic}相关动作或体能练习。`,
        "与家长或同伴交流课堂收获，记录一个需要继续改进的动作要点。",
      ],
      mainContent: requiredText(mainContent, topic),
      reflection: [
        "课后重点观察学生参与度、练习密度、动作达成度和安全执行情况，为下一课时调整分层任务。",
      ],
      rows,
      safety: requiredText(draft.safety, "练习中保持安全距离，听从教师口令，发现身体不适及时报告。"),
    },
    subtitle: draft.lesson.subtitle ?? "小学体育课时计划",
    teacher: {
      name: draft.lesson.teacherName ?? "未填写教师",
      school: draft.lesson.teacherSchool ?? "未填写学校",
    },
    title,
    venueEquipment: {
      equipment: requiredText(draft.equipment.equipment, "标志桶、秒表、口哨、课堂练习器材"),
      venue: [firstText(draft.equipment.venue, "学校运动场")],
    },
  });
}

export function parseLessonPlanProtocolToCompetitionLessonPlan(text: string): CompetitionLessonPlan {
  return normalizeLessonProtocolDraftToCompetitionLessonPlan(parseLessonPlanProtocolText(text));
}
