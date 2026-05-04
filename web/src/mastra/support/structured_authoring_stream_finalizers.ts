/**
 * structured_authoring_stream_finalizers.ts
 *
 * 结构化创作流适配器的终态处理函数。
 * 包含 artifact 持久化、课时计划/HTML 最终校验与写入等逻辑。
 *
 * 这些函数从主适配器闭包中提取而来，通过 StreamFinalizerContext
 * 接口获取共享状态与回调，避免闭包层级过深。
 */

import type { CompetitionLessonPlan } from "@/lib/lesson/contract";
import type {
  StructuredArtifactData,
  WorkflowTraceData,
  WorkflowTraceEntry,
} from "@/lib/lesson/authoring-contract";
import type { LessonAuthoringPersistence } from "@/lib/persistence/lesson-authoring-store";
import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

import { ensureCompleteHtmlDocument } from "@/lib/html-screen-editor";
import { enrichLessonPlanWithDiagramAssets } from "../skills/runtime/lesson_diagram_generation_skill";import {
  createTraceEntry,
  buildTraceData,
  buildArtifactData,
  buildLessonJsonArtifactContent,
  validateAndCreateReadyHtmlArtifact,
} from "./structured_authoring_trace_helpers";
import { TERMINAL_RUNNING_TRACE_STEPS } from "./structured_authoring_stream_types";

// ---------------------------------------------------------------------------
// Context 定义
// ---------------------------------------------------------------------------

/**
 * 流适配器终态处理的共享上下文。
 * 主适配器在调用 finalizer 函数时构造此对象并传入，
 * 使得提取出的函数无需依赖闭包即可访问状态与回调。
 */
export interface StreamFinalizerContext {
  // —— 不可变参数 ——
  workflow: LessonWorkflowOutput;
  requestId: string;
  mode: "lesson" | "html";
  persistence?: LessonAuthoringPersistence | null;
  projectId?: string;
  allowTextOnlyResponse: boolean;
  finalLessonPlanPromise?: Promise<CompetitionLessonPlan>;
  effectiveUiHints: import("@/lib/lesson/authoring-contract").UiHint[];

  // —— 可变状态（通过引用传递，修改对调用方可见） ——
  runtimeTrace: WorkflowTraceEntry[];

  // —— 回调（由主适配器闭包提供） ——
  pushOrReplaceTraceEntry: (step: string, status: WorkflowTraceEntry["status"], detail: string) => void;
  completeRunningTraceStep: (step: string, detail: string) => void;
  markStructuredActivity: () => void;
  writeTrace: (phase: WorkflowTraceData["phase"]) => void;
  writeArtifact: (artifact: StructuredArtifactData) => void;
  writeStreamError: (step: string, errorText: string) => void;
}

// ---------------------------------------------------------------------------
// Artifact 持久化
// ---------------------------------------------------------------------------

export async function persistArtifact(
  ctx: StreamFinalizerContext,
  artifact: StructuredArtifactData,
) {
  if (!ctx.persistence || !ctx.projectId) {
    return;
  }

  try {
    await ctx.persistence.saveArtifactVersion({
      artifact,
      projectId: ctx.projectId,
      requestId: ctx.requestId,
      trace: buildTraceData(ctx.workflow, ctx.requestId, ctx.runtimeTrace, "completed", ctx.effectiveUiHints),
    });
  } catch (error) {
    ctx.runtimeTrace.push(
      createTraceEntry(
        "persist-artifact-version",
        "blocked",
        `Artifact 持久化失败，但主结果已保留：${
          error instanceof Error ? error.message : "unknown-error"
        }`,
      ),
    );
    console.warn("[lesson-authoring] persist-artifact-failed", {
      requestId: ctx.requestId,
      message: error instanceof Error ? error.message : "unknown-error",
    });
  }
}

// ---------------------------------------------------------------------------
// 课时计划图表增强
// ---------------------------------------------------------------------------

export async function enrichLessonWithDiagrams(
  ctx: StreamFinalizerContext,
  lessonPlan: CompetitionLessonPlan,
) {
  ctx.pushOrReplaceTraceEntry(
    "generate-lesson-diagrams",
    "running",
    "课时计划文本已完成，正在生成教学组织站位九宫格并回填到课时计划。",
  );
  ctx.writeTrace("generation");

  try {
    const result = await enrichLessonPlanWithDiagramAssets({
      lessonPlan,
      projectId: ctx.projectId,
      requestId: ctx.requestId,
    });

    if (result.generatedCount > 0) {
      ctx.pushOrReplaceTraceEntry(
        "generate-lesson-diagrams",
        "success",
        `已生成并回填 ${result.generatedCount} 张教学组织站位图，存储模式：${
          result.storageMode ?? "unknown"
        }。`,
      );
      ctx.writeTrace("generation");
      return result.lessonPlan;
    }

    ctx.pushOrReplaceTraceEntry(
      "generate-lesson-diagrams",
      "blocked",
      result.skippedReason ?? "教学组织站位图未生成，课时计划文本已保留。",
    );
    ctx.writeTrace("generation");
    return lessonPlan;
  } catch (error) {
    ctx.pushOrReplaceTraceEntry(
      "generate-lesson-diagrams",
      "blocked",
      `教学组织站位图生成失败，已保留纯文本课时计划：${
        error instanceof Error ? error.message : "unknown-error"
      }`,
    );
    ctx.writeTrace("generation");
    return lessonPlan;
  }
}

// ---------------------------------------------------------------------------
// 课时计划 Finalizer
// ---------------------------------------------------------------------------

export async function finalizeLessonArtifact(
  ctx: StreamFinalizerContext,
  state: {
    structuredLessonOutput: unknown;
    rawText: string;
    lessonDraftChunkCount: number;
  },
): Promise<boolean> {
  let trustedLessonOutput = state.structuredLessonOutput;

  if (ctx.finalLessonPlanPromise) {
    try {
      ctx.pushOrReplaceTraceEntry(
        "validate-lesson-output",
        "running",
        "正在等待模型最终结构化输出，并执行课时计划 schema 检查。",
      );
      ctx.writeTrace("generation");
      trustedLessonOutput = await ctx.finalLessonPlanPromise;
    } catch (error) {
      ctx.writeStreamError(
        "validate-lesson-output",
        error instanceof Error ? error.message : "结构化课时计划检查失败。",
      );
      return false;
    }
  }

  if (trustedLessonOutput === undefined) {
    if (ctx.allowTextOnlyResponse && state.rawText.trim()) {
      return true;
    }

    ctx.writeStreamError(
      "validate-lesson-output",
      "模型未返回合法的 CompetitionLessonPlan 结构化输出。",
    );
    return false;
  }

  const lessonJson = buildLessonJsonArtifactContent(trustedLessonOutput);
  ctx.completeRunningTraceStep(
    "agent-stream-started",
    ctx.mode === "html" ? "互动大屏 HTML 模型生成流已结束。" : "课时计划模型生成流已结束。",
  );
  ctx.completeRunningTraceStep(
    "stream-lesson-draft",
    `课时计划草稿流已完成，共同步 ${state.lessonDraftChunkCount} 次草稿更新。`,
  );
  ctx.pushOrReplaceTraceEntry(
    "validate-lesson-output",
    "success",
    "结构化课时计划已通过最终 schema 检查。",
  );
  ctx.writeTrace("generation");
  const artifact = buildArtifactData(ctx.workflow, {
    content: lessonJson.content,
    contentType: lessonJson.contentType,
    isComplete: true,
    status: "ready",
    title: lessonJson.title,
    warningText: lessonJson.warningText,
  });

  ctx.writeArtifact(artifact);
  await persistArtifact(ctx, artifact);

  const enrichedLessonPlan = await enrichLessonWithDiagrams(ctx, lessonJson.lessonPlan);

  if (enrichedLessonPlan !== lessonJson.lessonPlan) {
    const enrichedLessonJson = buildLessonJsonArtifactContent(enrichedLessonPlan);
    const enrichedArtifact = buildArtifactData(ctx.workflow, {
      content: enrichedLessonJson.content,
      contentType: enrichedLessonJson.contentType,
      isComplete: true,
      status: "ready",
      title: enrichedLessonJson.title,
      warningText: enrichedLessonJson.warningText,
    });

    ctx.writeArtifact(enrichedArtifact);
    await persistArtifact(ctx, enrichedArtifact);
  }

  return true;
}

// ---------------------------------------------------------------------------
// HTML Finalizer
// ---------------------------------------------------------------------------

export async function finalizeHtmlArtifact(
  ctx: StreamFinalizerContext,
  state: {
    rawText: string;
    latestUpstreamHtmlArtifact: StructuredArtifactData | undefined;
  },
): Promise<boolean> {
  if (state.latestUpstreamHtmlArtifact?.isComplete && state.latestUpstreamHtmlArtifact.status === "ready") {
    const completedHtml = ensureCompleteHtmlDocument(state.latestUpstreamHtmlArtifact.content);
    const readyArtifactResult = validateAndCreateReadyHtmlArtifact({
      completedHtml,
      rawHtml: state.latestUpstreamHtmlArtifact.content,
      workflow: ctx.workflow,
    });

    if (!readyArtifactResult.ok) {
      ctx.writeStreamError("validate-html-pages", readyArtifactResult.errorText);
      return false;
    }

    ctx.completeRunningTraceStep(
      "agent-stream-started",
      "互动大屏 HTML 模型生成流已结束。",
    );
    await persistArtifact(ctx, {
      ...readyArtifactResult.artifact,
      title: state.latestUpstreamHtmlArtifact.title,
    });
    return true;
  }

  const trimmedRawText = state.rawText.trim();

  if (trimmedRawText) {
    const completedHtml = ensureCompleteHtmlDocument(trimmedRawText);
    const readyArtifactResult = validateAndCreateReadyHtmlArtifact({
      completedHtml,
      rawHtml: trimmedRawText,
      workflow: ctx.workflow,
    });

    if (!readyArtifactResult.ok) {
      ctx.writeStreamError("validate-html-pages", readyArtifactResult.errorText);
      return false;
    }

    ctx.completeRunningTraceStep(
      "agent-stream-started",
      "互动大屏 HTML 模型生成流已结束。",
    );
    ctx.writeArtifact(readyArtifactResult.artifact);
    await persistArtifact(ctx, readyArtifactResult.artifact);
    return true;
  }

  if (ctx.allowTextOnlyResponse && trimmedRawText) {
    return true;
  }

  ctx.writeStreamError(
    "extract-html-document",
    "当前 HTML 结果缺少可保存的完整 HTML 内容，已拒绝写入。",
  );
  return false;
}

// ---------------------------------------------------------------------------
// 服务端管线 trace 完成
// ---------------------------------------------------------------------------

export function completeServerPipelineTrace(
  ctx: StreamFinalizerContext,
  state: {
    lessonDraftChunkCount: number;
    htmlDraftChunkCount: number;
  },
) {
  for (const entry of [...ctx.runtimeTrace]) {
    if (entry.status !== "running" || !TERMINAL_RUNNING_TRACE_STEPS.has(entry.step)) {
      continue;
    }

    if (entry.step === "agent-stream-started") {
      ctx.pushOrReplaceTraceEntry(
        "agent-stream-started",
        "success",
        ctx.mode === "html" ? "互动大屏 HTML 模型生成流已结束。" : "课时计划模型生成流已结束。",
      );
      continue;
    }

    if (entry.step === "stream-lesson-draft") {
      ctx.pushOrReplaceTraceEntry(
        "stream-lesson-draft",
        "success",
        `课时计划草稿流已完成，共同步 ${state.lessonDraftChunkCount} 次草稿更新。`,
      );
      continue;
    }

    if (entry.step === "stream-html-draft") {
      ctx.pushOrReplaceTraceEntry(
        "stream-html-draft",
        "success",
        `互动大屏源码流已完成，共同步 ${state.htmlDraftChunkCount} 次源码更新。`,
      );
      continue;
    }

    if (entry.step === "validate-lesson-output") {
      ctx.pushOrReplaceTraceEntry(
        "validate-lesson-output",
        "success",
        "结构化课时计划已通过最终 schema 检查。",
      );
    }
  }
}
