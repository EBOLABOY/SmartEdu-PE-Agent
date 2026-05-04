import type { StandardsMarket, WorkflowTraceEntry } from "@/lib/lesson/authoring-contract";
import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

import { runTextbookRetrievalSkill } from "./textbook_retrieval_skill";

type TextbookRetrievalResult = Awaited<ReturnType<typeof runTextbookRetrievalSkill>>;
export type ServerTextbookRetriever = typeof runTextbookRetrievalSkill;

const DEFAULT_RETRIEVAL_TIMEOUT_MS = 12_000;
const TEXTBOOK_RETRIEVAL_STEP = "server-textbook-retrieval";

type TextbookRetrievalFailureReason = "retrieval-error" | "timeout";

type TextbookRetrievalOutcome =
  | {
      kind: "success";
      result: TextbookRetrievalResult;
    }
  | {
      error: unknown;
      kind: "failure";
      reason: TextbookRetrievalFailureReason;
    };

export type ServerTextbookEnrichmentResult = {
  outcome: TextbookRetrievalOutcome["kind"];
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

function formatReferencesForPrompt(textbookContext: string) {
  return [
    "服务端已在正式生成前检索体育与健康教材正文。请把以下教材信息转化为“教材分析”的依据，同时可适度用于动作要点、教学组织和安全提示。",
    "教材分析必须在末尾单独写出“教材依据：……”，列出实际命中的教材版本、册次、页码或章节来源。",
    "教材分析使用概括性转述，并只引用实际命中的教材出处；如果教材条目与本课主题不匹配，以本课主题和课标要求为准。",
    "",
    textbookContext,
  ].join("\n");
}

function formatRetrievalFailureForPrompt(message: string) {
  return [
    "服务端已在正式生成前尝试检索教材正文，但本轮检索失败。",
    "请退回通用教材分析原则生成：围绕运动项目特征、动作技术结构、教学价值、学生已有经验和安全风险进行分析；教材出处仅使用系统实际提供的来源。",
    `检索失败原因：${message}`,
  ].join("\n");
}

function formatErrorReason(error: unknown) {
  return error instanceof Error ? error.message : "unknown-error";
}

function getTextbookRetrievalTimeoutMs() {
  const raw = process.env.TEXTBOOK_RETRIEVAL_TIMEOUT_MS;

  if (!raw) {
    return DEFAULT_RETRIEVAL_TIMEOUT_MS;
  }

  const parsed = Number.parseInt(raw, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RETRIEVAL_TIMEOUT_MS;
}

function createRetrievalTimeoutError(timeoutMs: number) {
  return new Error(`教材检索超过 ${timeoutMs}ms，已降级继续生成。`);
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

export function createServerTextbookPendingWorkflow(workflow: LessonWorkflowOutput): LessonWorkflowOutput {
  return {
    ...workflow,
    trace: replaceTraceStep(
      workflow.trace,
      createTraceEntry(
        TEXTBOOK_RETRIEVAL_STEP,
        "running",
        "正在服务端检索教材正文；若教材库不可用，将自动降级继续生成。",
      ),
    ),
  };
}

function applySuccessfulTextbookRetrieval(input: {
  result: TextbookRetrievalResult;
  workflow: LessonWorkflowOutput;
}): LessonWorkflowOutput {
  const trace = replaceTraceStep(
    input.workflow.trace,
    createTraceEntry(
      TEXTBOOK_RETRIEVAL_STEP,
      "success",
      `服务端已检索 ${input.result.references.length} 条教材正文条目并注入教材分析提示。`,
    ),
  );

  trace.push(
    ...(input.result.warning
      ? [createTraceEntry("server-textbook-retrieval-warning", "blocked", input.result.warning)]
      : []),
  );

  return {
    ...input.workflow,
    textbook: {
      market: input.result.market,
      stage: input.result.stage,
      ...(input.result.publisher ? { publisher: input.result.publisher } : {}),
      ...(input.result.grade ? { grade: input.result.grade } : {}),
      referenceCount: input.result.references.length,
      references: input.result.references.slice(0, 5).map((reference) => ({
        id: reference.id,
        title: reference.title,
        summary: reference.summary,
        citation: reference.citation,
        publisher: reference.publisher,
        textbookName: reference.textbookName,
        edition: reference.edition,
        grade: reference.grade,
        level: reference.level,
        module: reference.module,
        sectionPath: reference.sectionPath,
        sourceKind: reference.sourceKind,
        score: reference.score,
      })),
      ...(input.result.warning ? { warning: input.result.warning } : {}),
    },
    system: [
      input.workflow.system,
      formatReferencesForPrompt(input.result.context),
    ].join("\n\n"),
    trace,
  };
}

function createServerTextbookFallbackWorkflow(input: {
  error: unknown;
  workflow: LessonWorkflowOutput;
}): LessonWorkflowOutput {
  const reason = formatErrorReason(input.error);
  const message = `服务端教材检索失败，已退回通用教材分析原则生成：${reason}`;
  const fallbackContext = formatRetrievalFailureForPrompt(reason);

  return {
    ...input.workflow,
    system: [
      input.workflow.system,
      fallbackContext,
    ].join("\n\n"),
    trace: replaceTraceStep(
      input.workflow.trace,
      createTraceEntry(TEXTBOOK_RETRIEVAL_STEP, "blocked", message),
    ),
  };
}

async function retrieveTextbookWithBoundary(input: {
  grade?: string;
  market?: StandardsMarket;
  publisher?: string;
  query: string;
  retriever?: ServerTextbookRetriever;
  stage?: string;
  timeoutMs: number;
}): Promise<TextbookRetrievalOutcome> {
  try {
    const result = await withRetrievalTimeout(
      (input.retriever ?? runTextbookRetrievalSkill)({
        grade: input.grade,
        market: input.market,
        publisher: input.publisher,
        query: input.query,
        stage: input.stage,
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

export async function resolveWorkflowWithServerTextbook(input: {
  grade?: string;
  market?: StandardsMarket;
  publisher?: string;
  query: string;
  retriever?: ServerTextbookRetriever;
  stage?: string;
  timeoutMs?: number;
  workflow: LessonWorkflowOutput;
}): Promise<ServerTextbookEnrichmentResult> {
  const outcome = await retrieveTextbookWithBoundary({
    grade: input.grade,
    market: input.market,
    publisher: input.publisher,
    query: input.query,
    retriever: input.retriever,
    stage: input.stage,
    timeoutMs: input.timeoutMs ?? getTextbookRetrievalTimeoutMs(),
  });

  if (outcome.kind === "success") {
    return {
      outcome: "success",
      workflow: applySuccessfulTextbookRetrieval({
        result: outcome.result,
        workflow: input.workflow,
      }),
    };
  }

  return {
    outcome: "failure",
    workflow: createServerTextbookFallbackWorkflow({
      error: outcome.error,
      workflow: input.workflow,
    }),
  };
}
