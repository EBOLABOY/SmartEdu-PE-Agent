import {
  lessonAuthoringMemorySchema,
  lessonIntakeResultSchema,
  type LessonAuthoringMemory,
  type LessonIntakeClarification,
  type LessonIntakeField,
  type LessonIntakeKnownInfo,
  type LessonIntakeResult,
  type PeTeacherContext,
} from "@/lib/lesson-authoring-contract";

const REQUIRED_LESSON_FIELDS: LessonIntakeField[] = [
  "grade",
  "topic",
];
const AUTO_GENERATED_LESSON_FIELDS = new Set<LessonIntakeField>(["duration", "studentCount", "venue", "equipment"]);
const DEFAULT_STUDENT_COUNT = 40;

function normalizeText(value?: string) {
  const normalized = value?.replace(/\s+/g, " ").trim();

  return normalized || undefined;
}

function normalizeTextArray(value?: string[]) {
  if (!value?.length) {
    return undefined;
  }

  const seen = new Set<string>();
  const normalized = value
    .map((item) => normalizeText(item))
    .filter((item): item is string => Boolean(item))
    .filter((item) => {
      if (seen.has(item)) {
        return false;
      }

      seen.add(item);
      return true;
    });

  return normalized.length ? normalized : undefined;
}

function normalizeKnownInfo(known?: LessonIntakeKnownInfo): LessonIntakeKnownInfo {
  if (!known) {
    return {};
  }

  return {
    grade: normalizeText(known.grade),
    teachingLevel: normalizeText(known.teachingLevel),
    topic: normalizeText(known.topic),
    durationMinutes: known.durationMinutes,
    studentCount: known.studentCount,
    venue: normalizeText(known.venue),
    equipment: normalizeTextArray(known.equipment),
    objectives: normalizeTextArray(known.objectives),
    constraints: normalizeTextArray(known.constraints),
  };
}

export function mergeLessonKnownInfo(...sources: Array<LessonIntakeKnownInfo | undefined>): LessonIntakeKnownInfo {
  const merged: LessonIntakeKnownInfo = {};

  for (const source of sources.map((item) => normalizeKnownInfo(item))) {
    for (const [key, value] of Object.entries(source) as Array<[keyof LessonIntakeKnownInfo, unknown]>) {
      if (Array.isArray(value)) {
        if (value.length) {
          (merged[key] as string[] | undefined) = value;
        }
        continue;
      }

      if (value !== undefined) {
        (merged[key] as string | number | undefined) = value as string | number;
      }
    }
  }

  return normalizeKnownInfo(merged);
}

function knownInfoFromContext(context?: PeTeacherContext): LessonIntakeKnownInfo {
  if (!context) {
    return {};
  }

  return normalizeKnownInfo({
    grade: context.grade ?? context.teachingGrade,
    teachingLevel: context.teachingLevel,
    topic: context.topic,
    durationMinutes: context.duration,
    venue: context.venue,
    equipment: context.equipment,
  });
}

function stableMemoryDefaults(defaults?: LessonIntakeKnownInfo): LessonIntakeKnownInfo {
  const normalized = normalizeKnownInfo(defaults);

  return {
    grade: normalized.grade,
    teachingLevel: normalized.teachingLevel,
    topic: normalized.topic,
    venue: normalized.venue,
    objectives: normalized.objectives,
    constraints: normalized.constraints,
  };
}

function hasAnyKnownInfo(known: LessonIntakeKnownInfo) {
  return Object.values(known).some((value) => (Array.isArray(value) ? value.length > 0 : value !== undefined));
}

function hasKnownField(known: LessonIntakeKnownInfo, field: LessonIntakeField) {
  if (field === "duration") {
    return typeof known.durationMinutes === "number";
  }

  if (field === "equipment") {
    return Boolean(known.equipment?.length);
  }

  if (field === "objectives") {
    return Boolean(known.objectives?.length);
  }

  if (field === "constraints") {
    return Boolean(known.constraints?.length);
  }

  if (field === "studentCount") {
    return typeof known.studentCount === "number";
  }

  return Boolean(known[field]);
}

function buildLessonSummary(known: LessonIntakeKnownInfo) {
  const parts = [
    known.grade,
    known.teachingLevel,
    known.topic,
    known.durationMinutes ? `${known.durationMinutes}分钟` : "课时由服务端课时计划生成管线自动匹配",
    `${known.studentCount ?? DEFAULT_STUDENT_COUNT}人`,
    known.venue ?? "场地由服务端课时计划生成管线根据课程内容自动匹配",
    known.equipment?.length ? `器材限制/指定：${known.equipment.join("、")}` : "器材由服务端课时计划生成管线自动配置",
    known.objectives?.length ? `目标：${known.objectives.join("、")}` : undefined,
    known.constraints?.length ? `限制：${known.constraints.join("、")}` : undefined,
  ].filter(Boolean);

  return parts.length ? parts.join("；") : undefined;
}

export function buildLessonAuthoringMemoryPatch(input: {
  context?: PeTeacherContext;
  intake?: LessonIntakeResult;
  updatedAt?: string;
}): LessonAuthoringMemory | undefined {
  const defaults = stableMemoryDefaults(mergeLessonKnownInfo(knownInfoFromContext(input.context), input.intake?.known));

  if (!hasAnyKnownInfo(defaults)) {
    return undefined;
  }

  return lessonAuthoringMemorySchema.parse({
    defaults,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  });
}

export function mergeLessonAuthoringMemory(
  existing?: LessonAuthoringMemory,
  patch?: LessonAuthoringMemory,
): LessonAuthoringMemory | undefined {
  const parsedExisting = existing ? lessonAuthoringMemorySchema.parse(existing) : undefined;
  const parsedPatch = patch ? lessonAuthoringMemorySchema.parse(patch) : undefined;

  if (!parsedExisting && !parsedPatch) {
    return undefined;
  }

  return lessonAuthoringMemorySchema.parse({
    defaults: mergeLessonKnownInfo(parsedExisting?.defaults, parsedPatch?.defaults),
    updatedAt: parsedPatch?.updatedAt ?? parsedExisting?.updatedAt ?? new Date().toISOString(),
  });
}

export function formatLessonAuthoringMemoryForPrompt(memory?: LessonAuthoringMemory) {
  const parsed = memory ? lessonAuthoringMemorySchema.parse(memory) : undefined;
  const defaults = parsed?.defaults;

  if (!defaults || !hasAnyKnownInfo(defaults)) {
    return "项目教学记忆：暂无。";
  }

  const lines = [
    "项目教学记忆（只能作为默认值；本轮用户明确说明优先）：",
    defaults.grade ? `- 常用年级/本项目年级：${defaults.grade}` : null,
    defaults.teachingLevel ? `- 常用水平段：${defaults.teachingLevel}` : null,
    defaults.topic ? `- 本项目课程内容：${defaults.topic}` : null,
    defaults.venue ? `- 常用场地：${defaults.venue}` : null,
    defaults.objectives?.length ? `- 常用目标倾向：${defaults.objectives.join("、")}` : null,
    defaults.constraints?.length ? `- 已知限制：${defaults.constraints.join("、")}` : null,
    "- 学生人数未明确时默认 40 人。",
    "- 课时由服务端课时计划生成管线根据内容和环节自动匹配。",
    "- 场地未明确时由服务端课时计划生成管线根据课程内容自动匹配。",
    "- 器材由服务端课时计划生成管线根据课程内容、场地和人数自动配置。",
  ].filter(Boolean);

  return lines.join("\n");
}

function uniqueFields(fields: LessonIntakeField[]) {
  return Array.from(new Set(fields));
}

function keepClarificationsForRemainingMissing(
  clarifications: LessonIntakeClarification[],
  remainingMissing: LessonIntakeField[],
) {
  if (!clarifications.length || !remainingMissing.length) {
    return [];
  }

  const remainingSet = new Set(remainingMissing);

  return clarifications.filter((item) => remainingSet.has(item.field));
}

export function fillLessonIntakeWithMemory(
  result: LessonIntakeResult,
  memory?: LessonAuthoringMemory,
  context?: PeTeacherContext,
): { intake: LessonIntakeResult; memoryUsed: boolean } {
  const parsed = lessonIntakeResultSchema.parse(result);
  const defaults = memory ? stableMemoryDefaults(lessonAuthoringMemorySchema.parse(memory).defaults) : {};
  const contextKnown = knownInfoFromContext(context);
  const knownWithoutMemory = mergeLessonKnownInfo({ studentCount: DEFAULT_STUDENT_COUNT }, contextKnown, parsed.known);
  const known = mergeLessonKnownInfo(
    { studentCount: DEFAULT_STUDENT_COUNT },
    defaults,
    contextKnown,
    parsed.known,
  );
  const nonAutoMissing = parsed.missing.filter((field) => !AUTO_GENERATED_LESSON_FIELDS.has(field));

  const buildMissing = (knownInfo: LessonIntakeKnownInfo) => {
    const inferredMissing = REQUIRED_LESSON_FIELDS.filter((field) => !hasKnownField(knownInfo, field));

    return uniqueFields([...nonAutoMissing, ...inferredMissing]).filter((field) => !hasKnownField(knownInfo, field));
  };

  const missingWithoutMemory = buildMissing(knownWithoutMemory);
  const missing = buildMissing(known);
  const memoryUsed =
    Boolean(memory) &&
    missingWithoutMemory.some((field) => !missing.includes(field) && hasKnownField(defaults, field));
  const requiredReady = REQUIRED_LESSON_FIELDS.every((field) => hasKnownField(known, field));
  const readyToGenerate = missing.length === 0 && (parsed.readyToGenerate || requiredReady);
  const summary = parsed.summary ?? (readyToGenerate ? buildLessonSummary(known) : undefined);
  const reason = memoryUsed ? `${parsed.reason} 已使用项目教学记忆补齐缺失字段。` : parsed.reason;
  const clarifications = readyToGenerate ? [] : keepClarificationsForRemainingMissing(parsed.clarifications, missing);

  return {
    intake: lessonIntakeResultSchema.parse({
      ...parsed,
      known,
      missing,
      clarifications,
      readyToGenerate,
      summary,
      reason,
    }),
    memoryUsed,
  };
}
