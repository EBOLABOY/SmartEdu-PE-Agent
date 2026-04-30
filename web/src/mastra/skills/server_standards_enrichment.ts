import type { StandardsMarket, WorkflowTraceEntry } from "@/lib/lesson-authoring-contract";
import type { LessonWorkflowInput, LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

import { runStandardsRetrievalSkill } from "./standards_retrieval_skill";

type StandardsRetrievalResult = Awaited<ReturnType<typeof runStandardsRetrievalSkill>>;
export type ServerStandardsRetriever = typeof runStandardsRetrievalSkill;

function nowIsoString() {
  return new Date().toISOString();
}

function createTraceEntry(
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

function formatReferencesForPrompt(standardsContext: string) {
  return [
    "服务端已在正式生成前检索体育课程标准，请把以下依据落实到教学目标、重难点、安全保障、评价标准和运动负荷设计中。",
    "",
    standardsContext,
  ].join("\n");
}

function formatRetrievalFailureForPrompt(message: string) {
  return [
    "服务端已在正式生成前尝试检索体育课程标准，但本轮检索失败。",
    "请退回通用体育与健康课程标准原则生成：目标、重难点、安全保障、评价标准和运动负荷必须保持自洽、可执行、适龄。",
    `检索失败原因：${message}`,
  ].join("\n");
}

function toWorkflowStandards(input: StandardsRetrievalResult) {
  return {
    requestedMarket: input.requestedMarket,
    resolvedMarket: input.resolvedMarket,
    corpus: input.corpus,
    referenceCount: input.references.length,
    references: input.references.map((reference) => ({
      citation: reference.citation,
      gradeBands: reference.gradeBands,
      id: reference.id,
      module: reference.module,
      score: reference.score,
      sectionPath: reference.sectionPath,
      summary: reference.summary,
      title: reference.title,
    })),
    warning: input.warning,
  } satisfies LessonWorkflowOutput["standards"];
}

export async function enrichWorkflowWithServerStandards(input: {
  market?: StandardsMarket;
  query: string;
  retriever?: ServerStandardsRetriever;
  workflow: LessonWorkflowOutput;
}): Promise<LessonWorkflowOutput> {
  try {
    const standardsResult = await (input.retriever ?? runStandardsRetrievalSkill)({
      market: input.market,
      query: input.query,
    });
    const trace = [
      ...input.workflow.trace,
      createTraceEntry(
        "server-standards-retrieval",
        "success",
        `服务端已检索 ${standardsResult.references.length} 条课标条目并注入结构化生成提示。`,
      ),
      ...(standardsResult.warning
        ? [createTraceEntry("server-standards-retrieval-warning", "blocked", standardsResult.warning)]
        : []),
    ];

    return {
      ...input.workflow,
      standardsContext: standardsResult.context,
      standards: toWorkflowStandards(standardsResult),
      system: [
        input.workflow.system,
        formatReferencesForPrompt(standardsResult.context),
      ].join("\n\n"),
      trace,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown-error";
    const message = `服务端课标检索失败，已退回通用课标原则生成：${reason}`;
    const fallbackContext = formatRetrievalFailureForPrompt(reason);

    return {
      ...input.workflow,
      standardsContext: fallbackContext,
      standards: {
        ...input.workflow.standards,
        referenceCount: 0,
        references: [],
        warning: message,
      },
      system: [
        input.workflow.system,
        fallbackContext,
      ].join("\n\n"),
      trace: [
        ...input.workflow.trace,
        createTraceEntry("server-standards-retrieval", "blocked", message),
      ],
    };
  }
}

export type ServerStandardsEnrichmentInput = Pick<LessonWorkflowInput, "market" | "query">;
