import type { CompetitionLessonPlan } from "@/lib/competition-lesson-contract";

export type LessonBusinessValidationIssue = {
  code: "empty-text" | "placeholder" | "section-missing" | "evaluation-levels";
  message: string;
  path?: string;
};

export type LessonBusinessValidationResult = {
  isValid: boolean;
  issues: LessonBusinessValidationIssue[];
};

const REQUIRED_PERIOD_STRUCTURES = ["准备部分", "基本部分", "结束部分"] as const;
const REQUIRED_EVALUATION_LEVELS = ["三颗星", "二颗星", "一颗星"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlaceholderText(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return false;
  }

  return (
    /^x{3,}$/i.test(normalized) ||
    /待补充|待完善|待填写|正在生成|待生成/.test(normalized) ||
    /^同上(?:[。；;，,！!？?]*)?$/.test(normalized)
  );
}

function collectTextValidationIssues(
  value: unknown,
  path: string,
  issues: LessonBusinessValidationIssue[],
) {
  if (typeof value === "string") {
    const normalized = value.trim();

    if (!normalized) {
      issues.push({
        code: "empty-text",
        message: `${path} 为空，不能作为正式课时计划内容。`,
        path,
      });
      return;
    }

    if (isPlaceholderText(normalized)) {
      issues.push({
        code: "placeholder",
        message: `${path} 仍包含占位符或未完成内容：${normalized}`,
        path,
      });
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectTextValidationIssues(item, `${path}[${index}]`, issues);
    });
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  Object.entries(value).forEach(([key, childValue]) => {
    collectTextValidationIssues(childValue, path ? `${path}.${key}` : key, issues);
  });
}

export function formatLessonValidationIssues(issues: LessonBusinessValidationIssue[]) {
  return issues.map((issue, index) => `${index + 1}. ${issue.message}`).join("\n");
}

export function performLessonBusinessValidation(
  plan: CompetitionLessonPlan,
): LessonBusinessValidationResult {
  const issues: LessonBusinessValidationIssue[] = [];

  collectTextValidationIssues(plan, "lessonPlan", issues);

  const structureSet = new Set(plan.periodPlan.rows.map((row) => row.structure));
  const missingStructures = REQUIRED_PERIOD_STRUCTURES.filter((structure) => !structureSet.has(structure));

  if (missingStructures.length > 0) {
    issues.push({
      code: "section-missing",
      message: `课时计划缺少必要环节：${missingStructures.join("、")}。`,
      path: "lessonPlan.periodPlan.rows",
    });
  }

  const evaluationLevels = plan.evaluation.map((item) => item.level);
  const hasExactEvaluationLevels =
    evaluationLevels.length === REQUIRED_EVALUATION_LEVELS.length &&
    REQUIRED_EVALUATION_LEVELS.every((level) => evaluationLevels.includes(level));

  if (!hasExactEvaluationLevels) {
    issues.push({
      code: "evaluation-levels",
      message: "评价标准必须且只能包含“三颗星 / 二颗星 / 一颗星”各 1 条。",
      path: "lessonPlan.evaluation",
    });
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}
