/**
 * structured_authoring_trace_helpers.ts
 *
 * 结构化创作流适配器的辅助函数集合，包括：
 * - Trace entry 的创建与构建
 * - Artifact 数据的构建
 * - 流消息的解析与过滤
 * - HTML 草稿与校验辅助
 *
 * 本模块中的函数均为无状态纯函数或仅依赖传入参数的构建函数，
 * 不持有可变状态，不直接操作 writer。
 */

import type { UIMessageChunk } from "ai";

import {
  competitionLessonPlanSchema,
} from "@/lib/lesson/contract";
import { deepClone } from "@/lib/utils/type-guards";
import { ensureCompleteHtmlDocument } from "@/lib/html-screen-editor";
import {
  STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
  structuredArtifactDataSchema,
  type GenerationMode,
  type StructuredArtifactData,
  type UiHint,
  type WorkflowTraceData,
  type WorkflowTraceEntry,
} from "@/lib/lesson/authoring-contract";
import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

import {
  nowIsoString,
  hasCompleteHtmlDocumentShell,
  stripHtmlComments,
  type ReadyHtmlArtifactValidationResult,
} from "./structured_authoring_stream_types";

// ---------------------------------------------------------------------------
// Trace entry 创建
// ---------------------------------------------------------------------------

export function createTraceEntry(
  step: string,
  status: WorkflowTraceEntry["status"],
  detail: string,
): WorkflowTraceEntry {
  return {
    step,
    status,
    detail,
    timestamp: nowIsoString(),
  };
}

export function buildTraceData(
  workflow: LessonWorkflowOutput,
  requestId: string,
  trace: WorkflowTraceEntry[],
  phase: WorkflowTraceData["phase"],
  uiHints: UiHint[] = workflow.uiHints,
): WorkflowTraceData {
  const traceData: WorkflowTraceData = {
    protocolVersion: STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
    requestId,
    mode: workflow.generationPlan.mode,
    phase,
    responseTransport: workflow.generationPlan.responseTransport,
    requestedMarket: workflow.standards.requestedMarket,
    resolvedMarket: workflow.standards.resolvedMarket,
    warnings: deepClone(workflow.safety.warnings),
    uiHints: deepClone(uiHints),
    trace: deepClone(trace),
    updatedAt: nowIsoString(),
  };

  if (workflow.standards.corpus && workflow.standards.references) {
    traceData.standards = {
      corpusId: workflow.standards.corpus.corpusId,
      displayName: workflow.standards.corpus.displayName,
      issuer: workflow.standards.corpus.issuer,
      version: workflow.standards.corpus.version,
      url: workflow.standards.corpus.url,
      references: workflow.standards.references,
    };
  }

  return traceData;
}

// ---------------------------------------------------------------------------
// Artifact 数据构建
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 公开 API 包装函数（保持与原文件相同的 export 签名）
// ---------------------------------------------------------------------------

export function createStructuredArtifactData(
  workflow: LessonWorkflowOutput,
  options: {
    content: string;
    contentType?: StructuredArtifactData["contentType"];
    isComplete: boolean;
    status: StructuredArtifactData["status"];
    title?: string;
    warningText?: string;
  },
) {
  return buildArtifactData(workflow, options);
}

export function createWorkflowTraceData(
  workflow: LessonWorkflowOutput,
  requestId: string,
  trace: WorkflowTraceEntry[],
  phase: WorkflowTraceData["phase"],
  uiHints?: UiHint[],
) {
  return buildTraceData(workflow, requestId, trace, phase, uiHints);
}

export function createWorkflowTraceStep(
  step: string,
  status: WorkflowTraceEntry["status"],
  detail: string,
) {
  return createTraceEntry(step, status, detail);
}

// ---------------------------------------------------------------------------
// Artifact 数据构建（内部实现）
// ---------------------------------------------------------------------------

export function buildArtifactData(
  workflow: LessonWorkflowOutput,
  options: {
    content: string;
    contentType?: StructuredArtifactData["contentType"];
    isComplete: boolean;
    status: StructuredArtifactData["status"];
    title?: string;
    warningText?: string;
  },
): StructuredArtifactData {
  const title =
    options.title ??
    (workflow.generationPlan.mode === "html" ? "互动大屏 Artifact" : "课时计划 Artifact");
  const updatedAt = nowIsoString();

  if (workflow.generationPlan.mode === "html") {
    if (options.contentType && options.contentType !== "html") {
      throw new Error("HTML artifact 的 contentType 必须为 html。");
    }

    return {
      protocolVersion: STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
      stage: "html",
      contentType: "html",
      content: options.content,
      isComplete: options.isComplete,
      status: options.status,
      source: "data-part",
      title,
      ...(options.warningText ? { warningText: options.warningText } : {}),
      updatedAt,
    };
  }

  if (options.contentType && options.contentType !== "lesson-json") {
    throw new Error("课时计划 artifact 的 contentType 必须为 lesson-json。");
  }

  return {
    protocolVersion: STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
    stage: "lesson",
    contentType: "lesson-json",
    content: options.content,
    isComplete: options.isComplete,
    status: options.status,
    source: "data-part",
    title,
    ...(options.warningText ? { warningText: options.warningText } : {}),
    updatedAt,
  };
}

// ---------------------------------------------------------------------------
// 流消息解析与过滤
// ---------------------------------------------------------------------------

export function readStructuredOutputPart(part: UIMessageChunk) {
  const candidate = part as {
    data?: {
      object?: unknown;
    };
    type?: string;
  };

  if (candidate.type !== "data-structured-output") {
    return undefined;
  }

  return candidate.data?.object;
}

export function shouldForwardAssistantText(mode: GenerationMode, workflow: LessonWorkflowOutput) {
  return (
    mode === "lesson" && workflow.generationPlan.assistantTextPolicy === "mirror-json-text"
  );
}

export function shouldForwardUiChunk(
  part: UIMessageChunk,
  options: {
    forwardAssistantText: boolean;
  },
) {
  if (
    part.type === "start" ||
    part.type === "finish" ||
    part.type === "error" ||
    part.type === "abort" ||
    part.type === "data-structured-output"
  ) {
    return false;
  }

  if (
    (part.type === "text-start" || part.type === "text-delta" || part.type === "text-end") &&
    !options.forwardAssistantText
  ) {
    return false;
  }

  return true;
}

export function readArtifactDataPart(part: UIMessageChunk): StructuredArtifactData | undefined {
  if (part.type !== "data-artifact") {
    return undefined;
  }

  const data = (part as { data?: unknown }).data;
  const parsed = structuredArtifactDataSchema.safeParse(data);

  return parsed.success ? parsed.data : undefined;
}

// ---------------------------------------------------------------------------
// 课时计划 JSON 构建
// ---------------------------------------------------------------------------

export function buildLessonJsonArtifactContent(structuredOutput: unknown) {
  try {
    const parsed = competitionLessonPlanSchema.parse(structuredOutput);

    return {
      content: JSON.stringify(parsed),
      contentType: "lesson-json" as const,
      lessonPlan: parsed,
      title: parsed.title,
      warningText: undefined,
    };
  } catch (error) {
    throw new Error(
      `模型未返回合法的 CompetitionLessonPlan。请检查字段后重试：${
        error instanceof Error ? error.message : "unknown-error"
      }`,
    );
  }
}

// ---------------------------------------------------------------------------
// HTML 草稿与校验
// ---------------------------------------------------------------------------

export function buildHtmlDraftArtifact(
  workflow: LessonWorkflowOutput,
  rawHtml: string,
): StructuredArtifactData {
  return buildArtifactData(workflow, {
    content: ensureCompleteHtmlDocument(rawHtml),
    contentType: "html",
    isComplete: false,
    status: "streaming",
  });
}

export function validateReadyHtmlDocument(rawHtml: string) {
  const html = stripHtmlComments(rawHtml.trim());
  const errors: string[] = [];

  if (!hasCompleteHtmlDocumentShell(html)) {
    errors.push("HTML 文档必须包含完整的 <!DOCTYPE html>、<html>、<head>、<body>、</body>、</html> 结构，当前结果疑似被截断。");
  }

  return errors;
}

export function validateAndCreateReadyHtmlArtifact(input: {
  completedHtml: string;
  rawHtml: string;
  workflow: LessonWorkflowOutput;
}): ReadyHtmlArtifactValidationResult {
  const validationErrors = validateReadyHtmlDocument(input.completedHtml);

  if (validationErrors.length > 0) {
    return {
      ok: false,
      errorText: validationErrors.join("；"),
    };
  }

  return {
    ok: true,
    artifact: buildArtifactData(input.workflow, {
      content: input.completedHtml,
      contentType: "html",
      isComplete: true,
      status: "ready",
    }),
  };
}
