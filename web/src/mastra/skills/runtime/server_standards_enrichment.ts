import type { StandardsMarket, WorkflowTraceEntry } from "@/lib/lesson/authoring-contract";
import type { LessonWorkflowInput, LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

import { runStandardsRetrievalSkill } from "./standards_retrieval_skill";

type StandardsRetrievalResult = Awaited<ReturnType<typeof runStandardsRetrievalSkill>>;
export type ServerStandardsRetriever = typeof runStandardsRetrievalSkill;

const DEFAULT_RETRIEVAL_TIMEOUT_MS = 4_000;
const STANDARDS_RETRIEVAL_STEP = "server-standards-retrieval";

type StandardsRetrievalFailureReason = "retrieval-error" | "timeout";

type StandardsRetrievalOutcome =
  | {
      kind: "success";
      result: StandardsRetrievalResult;
    }
  | {
      error: unknown;
      kind: "failure";
      reason: StandardsRetrievalFailureReason;
    };

export type ServerStandardsEnrichmentResult = {
  outcome: StandardsRetrievalOutcome["kind"];
  workflow: LessonWorkflowOutput;
};

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

function formatErrorReason(error: unknown) {
  return error instanceof Error ? error.message : "unknown-error";
}

function getStandardsRetrievalTimeoutMs() {
  const raw = process.env.STANDARDS_RETRIEVAL_TIMEOUT_MS;

  if (!raw) {
    return DEFAULT_RETRIEVAL_TIMEOUT_MS;
  }

  const parsed = Number.parseInt(raw, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RETRIEVAL_TIMEOUT_MS;
}

function createRetrievalTimeoutError(timeoutMs: number) {
  return new Error(`课程标准检索超过 ${timeoutMs}ms，已降级继续生成。`);
}

function isRetrievalTimeoutError(error: unknown, timeoutMs: number) {
  return error instanceof Error && error.message === createRetrievalTimeoutError(timeoutMs).message;
}

async function withRetrievalTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(createRetrievalTimeoutError(timeoutMs));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function replaceTraceStep(
  trace: WorkflowTraceEntry[],
  entry: WorkflowTraceEntry,
): WorkflowTraceEntry[] {
  return [
    ...trace.filter((existing) => existing.step !== entry.step),
    entry,
  ];
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

export function createServerStandardsPendingWorkflow(workflow: LessonWorkflowOutput): LessonWorkflowOutput {
  return {
    ...workflow,
    trace: replaceTraceStep(
      workflow.trace,
      createTraceEntry(
        STANDARDS_RETRIEVAL_STEP,
        "running",
        "正在服务端检索体育课程标准；若向量库不可用，将自动降级继续生成。",
      ),
    ),
  };
}

function applySuccessfulStandardsRetrieval(input: {
  result: StandardsRetrievalResult;
  workflow: LessonWorkflowOutput;
}): LessonWorkflowOutput {
  const trace = replaceTraceStep(
    input.workflow.trace,
    createTraceEntry(
      STANDARDS_RETRIEVAL_STEP,
      "success",
      `服务端已检索 ${input.result.references.length} 条课标条目并注入结构化生成提示。`,
    ),
  );

  trace.push(
    ...(input.result.warning
      ? [createTraceEntry("server-standards-retrieval-warning", "blocked", input.result.warning)]
      : []),
  );

  return {
    ...input.workflow,
    standardsContext: input.result.context,
    standards: toWorkflowStandards(input.result),
    system: [
      input.workflow.system,
      formatReferencesForPrompt(input.result.context),
    ].join("\n\n"),
    trace,
  };
}

function createServerStandardsFallbackWorkflow(input: {
  error: unknown;
  workflow: LessonWorkflowOutput;
}): LessonWorkflowOutput {
  const reason = formatErrorReason(input.error);
  const message = `服务端课标检索失败，已退回通用课标原则生成：${reason}`;
  const fallbackContext = formatRetrievalFailureForPrompt(reason);

  return {
    ...input.workflow,
    standardsContext: fallbackContext,
    standards: {
      ...input.workflow.standards,
      corpus: null,
      referenceCount: 0,
      references: [],
      warning: message,
    },
    system: [
      input.workflow.system,
      fallbackContext,
    ].join("\n\n"),
    trace: replaceTraceStep(
      input.workflow.trace,
      createTraceEntry(STANDARDS_RETRIEVAL_STEP, "blocked", message),
    ),
  };
}

async function retrieveStandardsWithBoundary(input: {
  market?: StandardsMarket;
  query: string;
  retriever?: ServerStandardsRetriever;
  timeoutMs: number;
}): Promise<StandardsRetrievalOutcome> {
  try {
    const result = await withRetrievalTimeout(
      (input.retriever ?? runStandardsRetrievalSkill)({
        market: input.market,
        query: input.query,
      }),
      input.timeoutMs,
    );

    return {
      kind: "success",
      result,
    };
  } catch (error) {
    return {
      error,
      kind: "failure",
      reason: isRetrievalTimeoutError(error, input.timeoutMs) ? "timeout" : "retrieval-error",
    };
  }
}

export async function resolveWorkflowWithServerStandards(input: {
  market?: StandardsMarket;
  query: string;
  retriever?: ServerStandardsRetriever;
  timeoutMs?: number;
  workflow: LessonWorkflowOutput;
}): Promise<ServerStandardsEnrichmentResult> {
  const outcome = await retrieveStandardsWithBoundary({
    market: input.market,
    query: input.query,
    retriever: input.retriever,
    timeoutMs: input.timeoutMs ?? getStandardsRetrievalTimeoutMs(),
  });

  if (outcome.kind === "success") {
    return {
      outcome: "success",
      workflow: applySuccessfulStandardsRetrieval({
        result: outcome.result,
        workflow: input.workflow,
      }),
    };
  }

  return {
    outcome: "failure",
    workflow: createServerStandardsFallbackWorkflow({
      error: outcome.error,
      workflow: input.workflow,
    }),
  };
}

export type ServerStandardsEnrichmentInput = Pick<LessonWorkflowInput, "market" | "query">;
