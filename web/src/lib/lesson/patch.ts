/**
 * @module competition-lesson-patch
 * 竞赛课教案的增量修补与语义更新。定义 JSON Patch 操作、
 * 语义化更新指令（如修改教学目标、评价等级等），以及将补丁应用到教案的执行逻辑。
 */
import { z } from "zod";

import {
  competitionLessonLoadChartPointSchema,
  competitionLessonPlanSchema,
  type CompetitionLessonPlan,
} from "@/lib/lesson/contract";

const JSON_POINTER_SEGMENT_LIMIT = 80;
const JSON_POINTER_DEPTH_LIMIT = 8;
const PATCH_OPERATION_LIMIT = 24;
const SEMANTIC_UPDATE_LIMIT = 12;
const BLOCKED_POINTER_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export const competitionLessonPatchOperationSchema = z
  .object({
    op: z.enum(["replace", "append", "remove"]),
    path: z
      .string()
      .trim()
      .min(1)
      .max(240)
      .regex(/^\//, "path 必须是 JSON Pointer 格式，例如 /learningObjectives/sportAbility/0。"),
    value: z.unknown().optional(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export const competitionLessonPatchSchema = z
  .object({
    operations: z.array(competitionLessonPatchOperationSchema).min(1).max(PATCH_OPERATION_LIMIT),
  })
  .strict();

export const competitionLessonPatchRequestBodySchema = z
  .object({
    lessonPlan: competitionLessonPlanSchema,
    instruction: z.string().trim().min(1).max(2000),
    targetPaths: z.array(z.string().trim().min(1).max(240).regex(/^\//)).max(12).optional(),
  })
  .strict();

const semanticReasonSchema = z.string().trim().min(1).max(500);
const semanticTextSchema = z.string().trim().min(1).max(1000);
const semanticShortTextSchema = z.string().trim().min(1).max(160);
const semanticTextBlockSchema = z.array(semanticTextSchema).min(1).max(20);
const lessonStageNameSchema = z.enum(["准备部分", "基本部分", "结束部分"]);

function hasAnyDefinedField<T extends Record<string, unknown>>(value: T, keys: Array<keyof T>) {
  return keys.some((key) => value[key] !== undefined);
}

export const updateLessonMetaPayloadSchema = z
  .object({
    title: semanticShortTextSchema.optional().describe("更新后的主标题。"),
    subtitle: semanticShortTextSchema.optional().describe("更新后的副标题。"),
    teacherSchool: semanticShortTextSchema.optional().describe("更新后的授课学校。"),
    teacherName: semanticShortTextSchema.optional().describe("更新后的授课教师姓名。"),
    topic: semanticShortTextSchema.optional().describe("更新后的课题。"),
    lessonNo: semanticShortTextSchema.optional().describe("更新后的课次。"),
    studentCount: semanticShortTextSchema.optional().describe("更新后的学生人数。"),
    grade: semanticShortTextSchema.optional().describe("更新后的年级。"),
    level: semanticShortTextSchema.optional().describe("更新后的水平段。"),
    reason: semanticReasonSchema.describe("修改理由。"),
  })
  .strict()
  .refine(
    (value) =>
      hasAnyDefinedField(value, [
        "title",
        "subtitle",
        "teacherSchool",
        "teacherName",
        "topic",
        "lessonNo",
        "studentCount",
        "grade",
        "level",
      ]),
    "基础信息工具至少要修改一个字段。",
  );

export const updateLearningObjectivesPayloadSchema = z
  .object({
    sportAbility: semanticTextBlockSchema.optional().describe("更新后的运动能力目标数组。"),
    healthBehavior: semanticTextBlockSchema.optional().describe("更新后的健康行为目标数组。"),
    sportMorality: semanticTextBlockSchema.optional().describe("更新后的体育品德目标数组。"),
    reason: semanticReasonSchema.describe("修改理由。"),
  })
  .strict()
  .refine(
    (value) =>
      hasAnyDefinedField(value, ["sportAbility", "healthBehavior", "sportMorality"]),
    "教学目标工具至少要修改一个目标字段。",
  );

export const updateLessonStagePayloadSchema = z
  .object({
    targetStageName: lessonStageNameSchema.describe("要修改的课时环节名称。"),
    targetContentKeyword: semanticShortTextSchema
      .optional()
      .describe("当同一环节有多行时，用原教学内容关键词定位具体行。"),
    newContent: semanticTextBlockSchema.optional().describe("更新后的具体教学内容。"),
    newTeacherMethod: semanticTextBlockSchema.optional().describe("更新后的教师指导方法。"),
    newStudentAction: semanticTextBlockSchema.optional().describe("更新后的学生活动要求。"),
    newOrganization: semanticTextBlockSchema.optional().describe("更新后的组织形式。"),
    newTime: semanticShortTextSchema.optional().describe("更新后的运动时间，例如“8分钟”。"),
    newIntensity: semanticShortTextSchema.optional().describe("更新后的运动强度。"),
    reason: semanticReasonSchema.describe("修改理由。"),
  })
  .strict()
  .refine(
    (value) =>
      hasAnyDefinedField(value, [
        "newContent",
        "newTeacherMethod",
        "newStudentAction",
        "newOrganization",
        "newTime",
        "newIntensity",
      ]),
    "教学环节工具至少要修改一个环节字段。",
  );

export const updateEvaluationPayloadSchema = z
  .object({
    level: z.enum(["三颗星", "二颗星", "一颗星"]).describe("要修改的评价等级。"),
    description: semanticTextSchema.describe("更新后的评价描述。"),
    reason: semanticReasonSchema.describe("修改理由。"),
  })
  .strict();

export const updateLessonSupportPayloadSchema = z
  .object({
    mainContent: semanticTextBlockSchema.optional().describe("更新后的课时主要内容。"),
    safety: semanticTextBlockSchema.optional().describe("更新后的安全保障。"),
    homework: semanticTextBlockSchema.optional().describe("更新后的课后作业。"),
    reflection: semanticTextBlockSchema.optional().describe("更新后的课后反思。"),
    venue: semanticTextBlockSchema.optional().describe("更新后的场地。"),
    equipment: semanticTextBlockSchema.optional().describe("更新后的器材。"),
    reason: semanticReasonSchema.describe("修改理由。"),
  })
  .strict()
  .refine(
    (value) =>
      hasAnyDefinedField(value, [
        "mainContent",
        "safety",
        "homework",
        "reflection",
        "venue",
        "equipment",
      ]),
    "支持信息工具至少要修改一个字段。",
  );

export const updateLoadEstimatePayloadSchema = z
  .object({
    loadLevel: semanticShortTextSchema.optional().describe("更新后的运动负荷等级。"),
    targetHeartRateRange: semanticShortTextSchema.optional().describe("更新后的目标心率范围。"),
    averageHeartRate: semanticShortTextSchema.optional().describe("更新后的平均心率。"),
    groupDensity: semanticShortTextSchema.optional().describe("更新后的群体练习密度。"),
    individualDensity: semanticShortTextSchema.optional().describe("更新后的个体练习密度。"),
    chartPoints: z
      .array(competitionLessonLoadChartPointSchema)
      .min(2)
      .max(12)
      .optional()
      .describe("更新后的运动负荷曲线点。"),
    rationale: semanticTextBlockSchema.optional().describe("更新后的负荷设计说明。"),
    reason: semanticReasonSchema.describe("修改理由。"),
  })
  .strict()
  .refine(
    (value) =>
      hasAnyDefinedField(value, [
        "loadLevel",
        "targetHeartRateRange",
        "averageHeartRate",
        "groupDensity",
        "individualDensity",
        "chartPoints",
        "rationale",
      ]),
    "运动负荷工具至少要修改一个字段。",
  );

export const competitionLessonSemanticUpdateActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("update_lesson_meta"),
      payload: updateLessonMetaPayloadSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("update_objectives"),
      payload: updateLearningObjectivesPayloadSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("update_stage"),
      payload: updateLessonStagePayloadSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("update_evaluation"),
      payload: updateEvaluationPayloadSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("update_support"),
      payload: updateLessonSupportPayloadSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("update_load_estimate"),
      payload: updateLoadEstimatePayloadSchema,
    })
    .strict(),
]);

export const competitionLessonSemanticUpdatesSchema = z
  .array(competitionLessonSemanticUpdateActionSchema)
  .min(1)
  .max(SEMANTIC_UPDATE_LIMIT);

export const competitionLessonPatchResponseSchema = z
  .object({
    patch: competitionLessonPatchSchema,
    patchSummary: z.string().trim().min(1).max(1000).optional(),
    semanticUpdates: competitionLessonSemanticUpdatesSchema.optional(),
    lessonPlan: competitionLessonPlanSchema,
  })
  .strict();

export type CompetitionLessonPatchOperation = z.infer<typeof competitionLessonPatchOperationSchema>;
export type CompetitionLessonPatch = z.infer<typeof competitionLessonPatchSchema>;
export type CompetitionLessonPatchRequestBody = z.infer<typeof competitionLessonPatchRequestBodySchema>;
export type CompetitionLessonPatchResponse = z.infer<typeof competitionLessonPatchResponseSchema>;
export type CompetitionLessonSemanticUpdate = z.infer<typeof competitionLessonSemanticUpdateActionSchema>;
export type CompetitionLessonSemanticApplyResult = {
  lessonPlan: CompetitionLessonPlan;
  patch: CompetitionLessonPatch;
  semanticUpdates: CompetitionLessonSemanticUpdate[];
};

export class CompetitionLessonPatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompetitionLessonPatchError";
  }
}

function cloneLessonPlan(plan: CompetitionLessonPlan): CompetitionLessonPlan {
  return structuredClone(plan);
}

function pushReplaceTrace(
  operations: CompetitionLessonPatchOperation[],
  path: string,
  value: unknown,
  reason: string,
) {
  operations.push({
    op: "replace",
    path,
    value,
    reason,
  });
}

function rowSearchText(row: CompetitionLessonPlan["periodPlan"]["rows"][number]) {
  return [
    ...row.content,
    ...row.methods.teacher,
    ...row.methods.students,
    ...row.organization,
    row.time,
    row.intensity,
  ]
    .join(" ")
    .toLowerCase();
}

function findUniqueStageRowIndex(
  rows: CompetitionLessonPlan["periodPlan"]["rows"],
  targetStageName: Extract<CompetitionLessonSemanticUpdate, { action: "update_stage" }>["payload"]["targetStageName"],
  targetContentKeyword?: string,
) {
  const keyword = targetContentKeyword?.trim().toLowerCase();
  const matchingIndices: number[] = [];

  rows.forEach((row, index) => {
    if (row.structure !== targetStageName) {
      return;
    }

    if (keyword && !rowSearchText(row).includes(keyword)) {
      return;
    }

    matchingIndices.push(index);
  });

  if (matchingIndices.length === 0) {
    throw new CompetitionLessonPatchError(
      `未找到可修改的教学环节：${targetStageName}${targetContentKeyword ? `（关键词：${targetContentKeyword}）` : ""}`,
    );
  }

  if (matchingIndices.length > 1) {
    throw new CompetitionLessonPatchError(
      `教学环节定位不唯一：${targetStageName}。同一环节有多行时必须提供 targetContentKeyword。`,
    );
  }

  return matchingIndices[0]!;
}

function applyLessonMetaUpdate(
  nextPlan: CompetitionLessonPlan,
  payload: Extract<CompetitionLessonSemanticUpdate, { action: "update_lesson_meta" }>["payload"],
  operations: CompetitionLessonPatchOperation[],
) {
  const { reason } = payload;

  if (payload.title !== undefined) {
    nextPlan.title = payload.title;
    pushReplaceTrace(operations, "/title", payload.title, reason);
  }

  if (payload.subtitle !== undefined) {
    nextPlan.subtitle = payload.subtitle;
    pushReplaceTrace(operations, "/subtitle", payload.subtitle, reason);
  }

  if (payload.teacherSchool !== undefined) {
    nextPlan.teacher.school = payload.teacherSchool;
    pushReplaceTrace(operations, "/teacher/school", payload.teacherSchool, reason);
  }

  if (payload.teacherName !== undefined) {
    nextPlan.teacher.name = payload.teacherName;
    pushReplaceTrace(operations, "/teacher/name", payload.teacherName, reason);
  }

  if (payload.topic !== undefined) {
    nextPlan.meta.topic = payload.topic;
    pushReplaceTrace(operations, "/meta/topic", payload.topic, reason);
  }

  if (payload.lessonNo !== undefined) {
    nextPlan.meta.lessonNo = payload.lessonNo;
    pushReplaceTrace(operations, "/meta/lessonNo", payload.lessonNo, reason);
  }

  if (payload.studentCount !== undefined) {
    nextPlan.meta.studentCount = payload.studentCount;
    pushReplaceTrace(operations, "/meta/studentCount", payload.studentCount, reason);
  }

  if (payload.grade !== undefined) {
    nextPlan.meta.grade = payload.grade;
    pushReplaceTrace(operations, "/meta/grade", payload.grade, reason);
  }

  if (payload.level !== undefined) {
    nextPlan.meta.level = payload.level;
    pushReplaceTrace(operations, "/meta/level", payload.level, reason);
  }
}

function applyLearningObjectivesUpdate(
  nextPlan: CompetitionLessonPlan,
  payload: Extract<CompetitionLessonSemanticUpdate, { action: "update_objectives" }>["payload"],
  operations: CompetitionLessonPatchOperation[],
) {
  const { reason } = payload;

  if (payload.sportAbility !== undefined) {
    nextPlan.learningObjectives.sportAbility = payload.sportAbility;
    pushReplaceTrace(operations, "/learningObjectives/sportAbility", payload.sportAbility, reason);
  }

  if (payload.healthBehavior !== undefined) {
    nextPlan.learningObjectives.healthBehavior = payload.healthBehavior;
    pushReplaceTrace(operations, "/learningObjectives/healthBehavior", payload.healthBehavior, reason);
  }

  if (payload.sportMorality !== undefined) {
    nextPlan.learningObjectives.sportMorality = payload.sportMorality;
    pushReplaceTrace(operations, "/learningObjectives/sportMorality", payload.sportMorality, reason);
  }
}

function applyLessonStageUpdate(
  nextPlan: CompetitionLessonPlan,
  payload: Extract<CompetitionLessonSemanticUpdate, { action: "update_stage" }>["payload"],
  operations: CompetitionLessonPatchOperation[],
) {
  const rowIndex = findUniqueStageRowIndex(
    nextPlan.periodPlan.rows,
    payload.targetStageName,
    payload.targetContentKeyword,
  );
  const row = nextPlan.periodPlan.rows[rowIndex];
  const rowPath = `/periodPlan/rows/${rowIndex}`;
  const { reason } = payload;

  if (!row) {
    throw new CompetitionLessonPatchError(`教学环节定位失败：${payload.targetStageName}`);
  }

  if (payload.newContent !== undefined) {
    row.content = payload.newContent;
    pushReplaceTrace(operations, `${rowPath}/content`, payload.newContent, reason);
  }

  if (payload.newTeacherMethod !== undefined) {
    row.methods.teacher = payload.newTeacherMethod;
    pushReplaceTrace(operations, `${rowPath}/methods/teacher`, payload.newTeacherMethod, reason);
  }

  if (payload.newStudentAction !== undefined) {
    row.methods.students = payload.newStudentAction;
    pushReplaceTrace(operations, `${rowPath}/methods/students`, payload.newStudentAction, reason);
  }

  if (payload.newOrganization !== undefined) {
    row.organization = payload.newOrganization;
    pushReplaceTrace(operations, `${rowPath}/organization`, payload.newOrganization, reason);
  }

  if (payload.newTime !== undefined) {
    row.time = payload.newTime;
    pushReplaceTrace(operations, `${rowPath}/time`, payload.newTime, reason);
  }

  if (payload.newIntensity !== undefined) {
    row.intensity = payload.newIntensity;
    pushReplaceTrace(operations, `${rowPath}/intensity`, payload.newIntensity, reason);
  }
}

function applyEvaluationUpdate(
  nextPlan: CompetitionLessonPlan,
  payload: Extract<CompetitionLessonSemanticUpdate, { action: "update_evaluation" }>["payload"],
  operations: CompetitionLessonPatchOperation[],
) {
  const levelIndex = nextPlan.evaluation.findIndex((item) => item.level === payload.level);

  if (levelIndex === -1) {
    throw new CompetitionLessonPatchError(`未找到评价等级：${payload.level}`);
  }

  nextPlan.evaluation[levelIndex]!.description = payload.description;
  pushReplaceTrace(operations, `/evaluation/${levelIndex}/description`, payload.description, payload.reason);
}

function applyLessonSupportUpdate(
  nextPlan: CompetitionLessonPlan,
  payload: Extract<CompetitionLessonSemanticUpdate, { action: "update_support" }>["payload"],
  operations: CompetitionLessonPatchOperation[],
) {
  const { reason } = payload;

  if (payload.mainContent !== undefined) {
    nextPlan.periodPlan.mainContent = payload.mainContent;
    pushReplaceTrace(operations, "/periodPlan/mainContent", payload.mainContent, reason);
  }

  if (payload.safety !== undefined) {
    nextPlan.periodPlan.safety = payload.safety;
    pushReplaceTrace(operations, "/periodPlan/safety", payload.safety, reason);
  }

  if (payload.homework !== undefined) {
    nextPlan.periodPlan.homework = payload.homework;
    pushReplaceTrace(operations, "/periodPlan/homework", payload.homework, reason);
  }

  if (payload.reflection !== undefined) {
    nextPlan.periodPlan.reflection = payload.reflection;
    pushReplaceTrace(operations, "/periodPlan/reflection", payload.reflection, reason);
  }

  if (payload.venue !== undefined) {
    nextPlan.venueEquipment.venue = payload.venue;
    pushReplaceTrace(operations, "/venueEquipment/venue", payload.venue, reason);
  }

  if (payload.equipment !== undefined) {
    nextPlan.venueEquipment.equipment = payload.equipment;
    pushReplaceTrace(operations, "/venueEquipment/equipment", payload.equipment, reason);
  }
}

function applyLoadEstimateUpdate(
  nextPlan: CompetitionLessonPlan,
  payload: Extract<CompetitionLessonSemanticUpdate, { action: "update_load_estimate" }>["payload"],
  operations: CompetitionLessonPatchOperation[],
) {
  const { reason } = payload;

  if (payload.loadLevel !== undefined) {
    nextPlan.loadEstimate.loadLevel = payload.loadLevel;
    pushReplaceTrace(operations, "/loadEstimate/loadLevel", payload.loadLevel, reason);
  }

  if (payload.targetHeartRateRange !== undefined) {
    nextPlan.loadEstimate.targetHeartRateRange = payload.targetHeartRateRange;
    pushReplaceTrace(operations, "/loadEstimate/targetHeartRateRange", payload.targetHeartRateRange, reason);
  }

  if (payload.averageHeartRate !== undefined) {
    nextPlan.loadEstimate.averageHeartRate = payload.averageHeartRate;
    pushReplaceTrace(operations, "/loadEstimate/averageHeartRate", payload.averageHeartRate, reason);
  }

  if (payload.groupDensity !== undefined) {
    nextPlan.loadEstimate.groupDensity = payload.groupDensity;
    pushReplaceTrace(operations, "/loadEstimate/groupDensity", payload.groupDensity, reason);
  }

  if (payload.individualDensity !== undefined) {
    nextPlan.loadEstimate.individualDensity = payload.individualDensity;
    pushReplaceTrace(operations, "/loadEstimate/individualDensity", payload.individualDensity, reason);
  }

  if (payload.chartPoints !== undefined) {
    nextPlan.loadEstimate.chartPoints = payload.chartPoints;
    pushReplaceTrace(operations, "/loadEstimate/chartPoints", payload.chartPoints, reason);
  }

  if (payload.rationale !== undefined) {
    nextPlan.loadEstimate.rationale = payload.rationale;
    pushReplaceTrace(operations, "/loadEstimate/rationale", payload.rationale, reason);
  }
}

function applySemanticUpdate(
  nextPlan: CompetitionLessonPlan,
  update: CompetitionLessonSemanticUpdate,
  operations: CompetitionLessonPatchOperation[],
) {
  if (update.action === "update_lesson_meta") {
    applyLessonMetaUpdate(nextPlan, update.payload, operations);
    return;
  }

  if (update.action === "update_objectives") {
    applyLearningObjectivesUpdate(nextPlan, update.payload, operations);
    return;
  }

  if (update.action === "update_stage") {
    applyLessonStageUpdate(nextPlan, update.payload, operations);
    return;
  }

  if (update.action === "update_evaluation") {
    applyEvaluationUpdate(nextPlan, update.payload, operations);
    return;
  }

  if (update.action === "update_support") {
    applyLessonSupportUpdate(nextPlan, update.payload, operations);
    return;
  }

  applyLoadEstimateUpdate(nextPlan, update.payload, operations);
}

export function applySemanticLessonUpdatesWithTrace(
  currentPlan: CompetitionLessonPlan,
  semanticUpdates: CompetitionLessonSemanticUpdate[],
): CompetitionLessonSemanticApplyResult {
  const parsedPlan = competitionLessonPlanSchema.parse(currentPlan);
  const parsedUpdates = competitionLessonSemanticUpdatesSchema.parse(semanticUpdates);
  const nextPlan = cloneLessonPlan(parsedPlan);
  const operations: CompetitionLessonPatchOperation[] = [];

  parsedUpdates.forEach((update) => {
    applySemanticUpdate(nextPlan, update, operations);
  });

  const parsedNextPlan = competitionLessonPlanSchema.safeParse(nextPlan);

  if (!parsedNextPlan.success) {
    throw new CompetitionLessonPatchError(
      `语义修改应用后课时计划结构不合法：${parsedNextPlan.error.issues.map((issue) => issue.path.join(".")).join("、")}`,
    );
  }

  return {
    lessonPlan: parsedNextPlan.data,
    patch: competitionLessonPatchSchema.parse({ operations }),
    semanticUpdates: parsedUpdates,
  };
}

export function applySemanticLessonUpdates(
  currentPlan: CompetitionLessonPlan,
  semanticUpdates: CompetitionLessonSemanticUpdate[],
): CompetitionLessonPlan {
  return applySemanticLessonUpdatesWithTrace(currentPlan, semanticUpdates).lessonPlan;
}

export function summarizeSemanticLessonUpdates(semanticUpdates: CompetitionLessonSemanticUpdate[]) {
  const parsedUpdates = competitionLessonSemanticUpdatesSchema.parse(semanticUpdates);
  const labels = parsedUpdates.map((update) => {
    if (update.action === "update_lesson_meta") return "基础信息";
    if (update.action === "update_objectives") return "学习目标";
    if (update.action === "update_stage") return `${update.payload.targetStageName}教学环节`;
    if (update.action === "update_evaluation") return `${update.payload.level}评价`;
    if (update.action === "update_support") return "课时支持信息";
    return "运动负荷";
  });

  return Array.from(new Set(labels)).join("、");
}

function parseJsonPointer(path: string) {
  if (!path.startsWith("/")) {
    throw new CompetitionLessonPatchError(`非法 path：${path}`);
  }

  const segments = path
    .slice(1)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));

  if (segments.length > JSON_POINTER_DEPTH_LIMIT) {
    throw new CompetitionLessonPatchError(`path 层级过深：${path}`);
  }

  segments.forEach((segment) => {
    if (!segment || segment.length > JSON_POINTER_SEGMENT_LIMIT || BLOCKED_POINTER_KEYS.has(segment)) {
      throw new CompetitionLessonPatchError(`path 包含不允许的字段：${path}`);
    }
  });

  return segments;
}

function isArrayIndex(segment: string) {
  return /^(0|[1-9]\d*)$/.test(segment);
}

function readChild(container: unknown, segment: string) {
  if (Array.isArray(container)) {
    if (!isArrayIndex(segment)) {
      throw new CompetitionLessonPatchError(`数组路径必须使用数字索引：${segment}`);
    }

    const index = Number(segment);

    if (index < 0 || index >= container.length) {
      throw new CompetitionLessonPatchError(`数组索引越界：${segment}`);
    }

    return container[index];
  }

  if (container && typeof container === "object") {
    if (!Object.prototype.hasOwnProperty.call(container, segment)) {
      throw new CompetitionLessonPatchError(`字段不存在：${segment}`);
    }

    return (container as Record<string, unknown>)[segment];
  }

  throw new CompetitionLessonPatchError(`path 指向了不可访问的值：${segment}`);
}

function getParent(root: unknown, path: string) {
  const segments = parseJsonPointer(path);

  if (segments.length === 0) {
    throw new CompetitionLessonPatchError("不允许替换整份课时计划对象。");
  }

  const key = segments.at(-1);
  let parent = root;

  for (const segment of segments.slice(0, -1)) {
    parent = readChild(parent, segment);
  }

  if (!key) {
    throw new CompetitionLessonPatchError(`非法 path：${path}`);
  }

  return { parent, key };
}

function replaceAtPath(root: CompetitionLessonPlan, operation: CompetitionLessonPatchOperation) {
  if (!("value" in operation)) {
    throw new CompetitionLessonPatchError(`replace 操作必须提供 value：${operation.path}`);
  }

  const { parent, key } = getParent(root, operation.path);

  if (Array.isArray(parent)) {
    if (!isArrayIndex(key)) {
      throw new CompetitionLessonPatchError(`数组替换必须使用数字索引：${operation.path}`);
    }

    const index = Number(key);

    if (index < 0 || index >= parent.length) {
      throw new CompetitionLessonPatchError(`数组索引越界：${operation.path}`);
    }

    parent[index] = operation.value;
    return;
  }

  if (parent && typeof parent === "object") {
    if (!Object.prototype.hasOwnProperty.call(parent, key)) {
      throw new CompetitionLessonPatchError(`字段不存在：${operation.path}`);
    }

    (parent as Record<string, unknown>)[key] = operation.value;
    return;
  }

  throw new CompetitionLessonPatchError(`replace path 不可写：${operation.path}`);
}

function appendAtPath(root: CompetitionLessonPlan, operation: CompetitionLessonPatchOperation) {
  if (!("value" in operation)) {
    throw new CompetitionLessonPatchError(`append 操作必须提供 value：${operation.path}`);
  }

  const target = parseJsonPointer(operation.path).reduce<unknown>((current, segment) => readChild(current, segment), root);

  if (!Array.isArray(target)) {
    throw new CompetitionLessonPatchError(`append path 必须指向数组：${operation.path}`);
  }

  target.push(operation.value);
}

function removeAtPath(root: CompetitionLessonPlan, operation: CompetitionLessonPatchOperation) {
  const { parent, key } = getParent(root, operation.path);

  if (!Array.isArray(parent) || !isArrayIndex(key)) {
    throw new CompetitionLessonPatchError(`remove 只允许删除数组元素：${operation.path}`);
  }

  const index = Number(key);

  if (index < 0 || index >= parent.length) {
    throw new CompetitionLessonPatchError(`数组索引越界：${operation.path}`);
  }

  parent.splice(index, 1);
}

function applyOperation(root: CompetitionLessonPlan, operation: CompetitionLessonPatchOperation) {
  if (operation.op === "replace") {
    replaceAtPath(root, operation);
    return;
  }

  if (operation.op === "append") {
    appendAtPath(root, operation);
    return;
  }

  removeAtPath(root, operation);
}

export function applyCompetitionLessonPatch(
  plan: CompetitionLessonPlan,
  patch: CompetitionLessonPatch,
): CompetitionLessonPlan {
  const parsedPlan = competitionLessonPlanSchema.parse(plan);
  const parsedPatch = competitionLessonPatchSchema.parse(patch);
  const nextPlan = cloneLessonPlan(parsedPlan);

  parsedPatch.operations.forEach((operation) => {
    applyOperation(nextPlan, operation);
  });

  const parsedNextPlan = competitionLessonPlanSchema.safeParse(nextPlan);

  if (!parsedNextPlan.success) {
    throw new CompetitionLessonPatchError(
      `patch 应用后课时计划结构不合法：${parsedNextPlan.error.issues.map((issue) => issue.path.join(".")).join("、")}`,
    );
  }

  return parsedNextPlan.data;
}
