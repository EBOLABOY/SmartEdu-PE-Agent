import { z } from "zod";

import {
  competitionLessonPlanSchema,
  type CompetitionLessonPlan,
} from "@/lib/competition-lesson-contract";

const JSON_POINTER_SEGMENT_LIMIT = 80;
const JSON_POINTER_DEPTH_LIMIT = 8;
const PATCH_OPERATION_LIMIT = 12;
const BLOCKED_POINTER_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export const competitionLessonPatchOperationSchema = z
  .object({
    op: z.enum(["replace", "append", "remove"]),
    path: z
      .string()
      .trim()
      .min(1)
      .max(240)
      .regex(/^\//, "path 必须是 JSON Pointer 格式，例如 /learningObjectives/sportAbility。"),
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

export const competitionLessonPatchResponseSchema = z
  .object({
    patch: competitionLessonPatchSchema,
    lessonPlan: competitionLessonPlanSchema,
  })
  .strict();

export type CompetitionLessonPatchOperation = z.infer<typeof competitionLessonPatchOperationSchema>;
export type CompetitionLessonPatch = z.infer<typeof competitionLessonPatchSchema>;
export type CompetitionLessonPatchRequestBody = z.infer<typeof competitionLessonPatchRequestBodySchema>;
export type CompetitionLessonPatchResponse = z.infer<typeof competitionLessonPatchResponseSchema>;

export class CompetitionLessonPatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompetitionLessonPatchError";
  }
}

function cloneLessonPlan(plan: CompetitionLessonPlan): CompetitionLessonPlan {
  return structuredClone(plan);
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
    throw new CompetitionLessonPatchError("不允许替换整份教案对象。");
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
      `patch 应用后教案结构不合法：${parsedNextPlan.error.issues.map((issue) => issue.path.join(".")).join("、")}`,
    );
  }

  return parsedNextPlan.data;
}
