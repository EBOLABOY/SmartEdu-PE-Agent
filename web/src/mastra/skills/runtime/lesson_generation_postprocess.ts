import {
  competitionLessonPlanSchema,
  type CompetitionLessonPlan,
} from "@/lib/competition-lesson-contract";
import type { WorkflowTraceEntry } from "@/lib/lesson-authoring-contract";

import {
  formatLessonValidationIssues,
  performLessonBusinessValidation,
} from "../../support/lesson_generation_validation";
import { runLessonGenerationSkill } from "./lesson_generation_skill";

function nowIsoString() {
  return new Date().toISOString();
}

function createPostProcessTraceEntry(
  step: string,
  status: WorkflowTraceEntry["status"],
  detail: string,
): WorkflowTraceEntry {
  return {
    detail,
    status,
    step,
    timestamp: nowIsoString(),
  };
}

function normalizeCitationText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function formatTextbookCitationForLesson(input: {
  citation: string;
  edition: string | null;
  module: string;
  publisher: string;
  textbookName: string;
}) {
  const citation = normalizeCitationText(input.citation);
  const edition = input.edition ? `，${input.edition}` : "";

  return `${input.publisher}${edition}《${input.textbookName}》${input.module}：${citation}`;
}

function buildTextbookCitationLine(workflow: Parameters<typeof runLessonGenerationSkill>[0]["workflow"]) {
  const references = workflow.textbook?.references ?? [];
  const citations = [
    ...new Set(
      references
        .filter((reference) => reference.sourceKind === "teacher-guide" || reference.sourceKind === "textbook-body")
        .map((reference) =>
          formatTextbookCitationForLesson({
            citation: reference.citation,
            edition: reference.edition,
            module: reference.module,
            publisher: reference.publisher,
            textbookName: reference.textbookName,
          }),
        )
        .filter(Boolean),
    ),
  ].slice(0, 3);

  if (citations.length === 0) {
    return undefined;
  }

  return `教材依据：${citations.join("；")}。`;
}

function hasTextbookCitationLine(lessonPlan: CompetitionLessonPlan) {
  return lessonPlan.narrative.textbookAnalysis.some((line) => /^教材依据[:：]/.test(line.trim()));
}

export function appendTextbookCitationsToLessonPlan(
  lessonPlan: CompetitionLessonPlan,
  workflow: Parameters<typeof runLessonGenerationSkill>[0]["workflow"],
) {
  const citationLine = buildTextbookCitationLine(workflow);
  const analysisWithoutUntrustedCitations = lessonPlan.narrative.textbookAnalysis.filter(
    (line) => !/^教材依据[:：]/.test(line.trim()),
  );

  if (!citationLine && !hasTextbookCitationLine(lessonPlan)) {
    return lessonPlan;
  }

  return competitionLessonPlanSchema.parse({
    ...lessonPlan,
    narrative: {
      ...lessonPlan.narrative,
      textbookAnalysis: citationLine
        ? [...analysisWithoutUntrustedCitations, citationLine]
        : analysisWithoutUntrustedCitations,
    },
  });
}

export async function runLessonGenerationWithPostProcess(
  input: Parameters<typeof runLessonGenerationSkill>[0] & {
    onTrace?: (entry: WorkflowTraceEntry) => void;
  },
) {
  const generation = await runLessonGenerationSkill(input);

  const finalLessonPlanPromise = generation.finalLessonPlanPromise?.then((draft) => {
    const citedDraft = appendTextbookCitationsToLessonPlan(draft, input.workflow);
    const validation = performLessonBusinessValidation(citedDraft);

    if (!validation.isValid) {
      const detail = `结构化课时计划未通过最终业务校验：\n${formatLessonValidationIssues(validation.issues)}`;

      input.onTrace?.(
        createPostProcessTraceEntry(
          "validate-lesson-output",
          "failed",
          detail,
        ),
      );

      throw new Error(detail);
    }

    input.onTrace?.(
      createPostProcessTraceEntry(
        "validate-lesson-output",
        "success",
        input.workflow.textbook?.references?.length
          ? "结构化课时计划已完成最终 schema 与业务校验，并已写入教材依据引用。"
          : "结构化课时计划已完成最终 schema 与业务校验。",
      ),
    );

    return citedDraft;
  });

  return {
    ...generation,
    finalLessonPlanPromise,
  };
}
