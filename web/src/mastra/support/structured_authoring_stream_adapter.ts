/**
 * structured_authoring_stream_adapter.ts
 *
 * 结构化创作流适配器集合。
 *
 * 三种 adapter，按使用场景拆分：
 *
 * - createLessonStreamAdapter — lesson 模式专用，直接消费 lessonDraftStream，
 *   不接收上游 UI chunk 流。Production 路径用这个。
 *
 * - createUpstreamUiStreamAdapter — html 模式 + lesson text-only 兜底专用，
 *   消费上游 UI chunk 流（agent stream / html stream）并维护 reader.read 主循环。
 *
 * - createStructuredAuthoringStreamAdapter — @deprecated dispatcher，
 *   保留向后兼容（主要服务于现有测试用例）。新代码请直接调用上面两个。
 *
 * - createLessonClarificationStreamAdapter — 任务方向澄清回复，保持原样。
 *
 * 辅助逻辑已拆分至：
 * - structured_authoring_stream_types.ts — 常量、类型、纯工具函数
 * - structured_authoring_trace_helpers.ts — trace/artifact 构建、流解析、HTML 校验
 * - structured_authoring_stream_finalizers.ts — 终态处理（持久化、校验、图表增强）
 */

import {
  createUIMessageStream,
  type DeepPartial,
  type FinishReason,
  type InferUIMessageChunk,
  type UIMessageChunk,
} from "ai";

import {
  competitionLessonPlanSchema,
  type CompetitionLessonPlan,
} from "@/lib/lesson/contract";
import { buildCompetitionLessonDraft } from "@/lib/lesson/draft";
import type {
  GenerationMode,
  SmartEduUIMessage,
  StructuredArtifactData,
  UiHint,
  WorkflowTraceData,
  WorkflowTraceEntry,
} from "@/lib/lesson/authoring-contract";
import type { LessonAuthoringPersistence } from "@/lib/persistence/lesson-authoring-store";
import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

import { DRAFT_TRACE_UPDATE_INTERVAL } from "./structured_authoring_stream_types";
import {
  createTraceEntry,
  buildTraceData,
  buildArtifactData,
  readStructuredOutputPart,
  shouldForwardAssistantText,
  shouldForwardUiChunk,
  readArtifactDataPart,
  buildHtmlDraftArtifact,
} from "./structured_authoring_trace_helpers";
import {
  finalizeLessonArtifact,
  finalizeHtmlArtifact,
  completeServerPipelineTrace,
  type StreamFinalizerContext,
} from "./structured_authoring_stream_finalizers";

// ---------------------------------------------------------------------------
// Re-export：保持公开 API 不变
// ---------------------------------------------------------------------------

export { createStructuredArtifactData } from "./structured_authoring_trace_helpers";
export { createWorkflowTraceData, createWorkflowTraceStep } from "./structured_authoring_trace_helpers";

// ---------------------------------------------------------------------------
// 共享类型
// ---------------------------------------------------------------------------

type SharedAdapterArgs = {
  originalMessages: SmartEduUIMessage[];
  persistence?: LessonAuthoringPersistence | null;
  projectId?: string;
  requestId: string;
  runtimeTrace?: WorkflowTraceEntry[];
  runtimeUiHints?: UiHint[];
  workflow: LessonWorkflowOutput;
};

export type LessonStreamAdapterArgs = SharedAdapterArgs & {
  finalLessonPlanPromise?: Promise<CompetitionLessonPlan>;
  lessonDraftStream?: AsyncIterable<DeepPartial<CompetitionLessonPlan>>;
};

export type UpstreamUiStreamAdapterArgs = SharedAdapterArgs & {
  allowTextOnlyResponse?: boolean;
  mode: GenerationMode;
  stream: ReadableStream<UIMessageChunk>;
};

// ---------------------------------------------------------------------------
// Lesson Adapter（lesson 模式专用，直接驱动自 lessonDraftStream）
// ---------------------------------------------------------------------------

export function createLessonStreamAdapter({
  finalLessonPlanPromise,
  lessonDraftStream,
  originalMessages,
  persistence,
  projectId,
  requestId,
  runtimeTrace: providedRuntimeTrace,
  runtimeUiHints,
  workflow,
}: LessonStreamAdapterArgs) {
  const runtimeTrace = providedRuntimeTrace ?? [...workflow.trace];
  const effectiveUiHints = runtimeUiHints ?? workflow.uiHints;

  return createUIMessageStream<SmartEduUIMessage>({
    originalMessages,
    execute: async ({ writer }) => {
      // ---- 状态 ----
      let hasFinished = false;
      let hasStructuredActivity = false;
      let lessonDraftChunkCount = 0;
      let latestLessonDraft = buildCompetitionLessonDraft();

      // ---- Trace 管理闭包 ----
      const ensureAgentStreamStarted = () => {
        if (runtimeTrace.some((entry) => entry.step === "agent-stream-started")) {
          return;
        }
        runtimeTrace.push(
          createTraceEntry("agent-stream-started", "running", "已开始生成课时计划流。"),
        );
      };

      const pushOrReplaceTraceEntry = (
        step: string,
        status: WorkflowTraceEntry["status"],
        detail: string,
      ) => {
        const nextEntry = createTraceEntry(step, status, detail);
        const existingIndex = runtimeTrace.findIndex((entry) => entry.step === step);
        if (existingIndex >= 0) {
          runtimeTrace.splice(existingIndex, 1, nextEntry);
          return;
        }
        runtimeTrace.push(nextEntry);
      };

      const completeRunningTraceStep = (step: string, detail: string) => {
        const existing = runtimeTrace.find((entry) => entry.step === step);
        if (existing?.status !== "running") {
          return;
        }
        pushOrReplaceTraceEntry(step, "success", detail);
      };

      const markStructuredActivity = () => {
        if (hasStructuredActivity) {
          return;
        }
        hasStructuredActivity = true;
        ensureAgentStreamStarted();
      };

      const writeTrace = (phase: WorkflowTraceData["phase"]) => {
        if (!hasStructuredActivity) {
          return;
        }
        writer.write({
          type: "data-trace",
          id: "lesson-authoring-trace",
          data: buildTraceData(workflow, requestId, runtimeTrace, phase, effectiveUiHints),
        });
      };

      // ---- Artifact 写入 ----
      const writeArtifact = (artifact: StructuredArtifactData) => {
        markStructuredActivity();
        writer.write({
          type: "data-artifact",
          id: `lesson-authoring-artifact-${artifact.contentType}`,
          data: artifact,
        });
      };

      // ---- 草稿流闭包 ----
      const shouldWriteDraftTrace = () =>
        lessonDraftChunkCount <= 2 || lessonDraftChunkCount % DRAFT_TRACE_UPDATE_INTERVAL === 0;

      const writeLessonDraftArtifact = (partial?: DeepPartial<CompetitionLessonPlan>) => {
        latestLessonDraft = buildCompetitionLessonDraft(partial, latestLessonDraft);
        lessonDraftChunkCount += 1;
        if (shouldWriteDraftTrace()) {
          pushOrReplaceTraceEntry(
            "stream-lesson-draft",
            "running",
            `正在流式生成课时计划草稿，已同步 ${lessonDraftChunkCount} 次草稿更新。`,
          );
        }
        writeArtifact(
          buildArtifactData(workflow, {
            content: JSON.stringify(latestLessonDraft),
            contentType: "lesson-json",
            isComplete: false,
            status: "streaming",
            title: latestLessonDraft.title,
          }),
        );
        if (shouldWriteDraftTrace()) {
          writeTrace("generation");
        }
      };

      // ---- 流控制 ----
      const finishStream = (finishReason: FinishReason = "stop") => {
        if (hasFinished) {
          return;
        }
        hasFinished = true;
        writer.write({ type: "finish", finishReason });
      };

      const writeStreamError = (step: string, errorText: string) => {
        markStructuredActivity();
        runtimeTrace.push(createTraceEntry(step, "failed", errorText));
        writeTrace("failed");
        writer.write({ type: "error", errorText });
        finishStream("error");
      };

      // ---- Finalizer 上下文 ----
      const buildFinalizerContext = (): StreamFinalizerContext => ({
        workflow,
        requestId,
        mode: "lesson",
        persistence,
        projectId,
        allowTextOnlyResponse: false,
        finalLessonPlanPromise,
        effectiveUiHints,
        runtimeTrace,
        pushOrReplaceTraceEntry,
        completeRunningTraceStep,
        markStructuredActivity,
        writeTrace,
        writeArtifact,
        writeStreamError,
      });

      // ---- 主流程：起手 trace → 消费 draft → finalize → finish ----
      markStructuredActivity();
      writeTrace("generation");

      try {
        if (!lessonDraftStream) {
          pushOrReplaceTraceEntry(
            "stream-lesson-draft",
            "running",
            "正在生成课时计划结构，完成首个结构块后会同步右侧预览。",
          );
          writeTrace("generation");
        } else {
          pushOrReplaceTraceEntry(
            "stream-lesson-draft",
            "running",
            "正在建立课时计划草稿流，右侧预览将同步更新。",
          );
          writeTrace("generation");

          for await (const partial of lessonDraftStream) {
            if (hasFinished) {
              return;
            }
            writeLessonDraftArtifact(partial);
          }
        }
      } catch (error) {
        runtimeTrace.push(
          createTraceEntry(
            "lesson-draft-stream",
            "blocked",
            `课时计划草稿流已中断，但最终 JSON 校验仍将继续：${
              error instanceof Error ? error.message : "unknown-error"
            }`,
          ),
        );
      }

      try {
        const finalized = await finalizeLessonArtifact(buildFinalizerContext(), {
          structuredLessonOutput: undefined,
          rawText: "",
          lessonDraftChunkCount,
        });

        if (!finalized) {
          return;
        }

        if (hasStructuredActivity) {
          completeServerPipelineTrace(buildFinalizerContext(), {
            lessonDraftChunkCount,
            htmlDraftChunkCount: 0,
          });
          runtimeTrace.push(
            createTraceEntry(
              "generation-finished",
              "success",
              "课时计划 Artifact 已完成结构化封装。",
            ),
          );
          writeTrace("completed");
        }
        finishStream("stop");
      } catch (error) {
        const errorText = error instanceof Error ? error.message : "课时计划生成流异常。";
        markStructuredActivity();
        runtimeTrace.push(createTraceEntry("generation-stream-exception", "failed", errorText));
        writeTrace("failed");
        writer.write({ type: "error", errorText });
        finishStream("error");
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Upstream UI Stream Adapter（消费上游 UI chunk 流，html 与 lesson text-only 共用）
// ---------------------------------------------------------------------------

export function createUpstreamUiStreamAdapter({
  allowTextOnlyResponse = false,
  mode,
  originalMessages,
  persistence,
  projectId,
  requestId,
  runtimeTrace: providedRuntimeTrace,
  runtimeUiHints,
  stream,
  workflow,
}: UpstreamUiStreamAdapterArgs) {
  const runtimeTrace = providedRuntimeTrace ?? [...workflow.trace];
  const effectiveUiHints = runtimeUiHints ?? workflow.uiHints;

  return createUIMessageStream<SmartEduUIMessage>({
    originalMessages,
    execute: async ({ writer }) => {
      // ---- 状态 ----
      let rawText = "";
      let hasFinished = false;
      let structuredLessonOutput: unknown;
      let hasStructuredActivity = false;
      let htmlDraftChunkCount = 0;
      let latestUpstreamHtmlArtifact: StructuredArtifactData | undefined;
      const forwardAssistantText = allowTextOnlyResponse || shouldForwardAssistantText(mode, workflow);
      const reader = stream.getReader();

      // ---- Trace 管理闭包 ----
      const ensureAgentStreamStarted = () => {
        if (runtimeTrace.some((entry) => entry.step === "agent-stream-started")) {
          return;
        }
        runtimeTrace.push(
          createTraceEntry(
            "agent-stream-started",
            "running",
            mode === "html" ? "已开始生成互动大屏 HTML 流。" : "已开始生成课时计划流。",
          ),
        );
      };

      const pushOrReplaceTraceEntry = (
        step: string,
        status: WorkflowTraceEntry["status"],
        detail: string,
      ) => {
        const nextEntry = createTraceEntry(step, status, detail);
        const existingIndex = runtimeTrace.findIndex((entry) => entry.step === step);
        if (existingIndex >= 0) {
          runtimeTrace.splice(existingIndex, 1, nextEntry);
          return;
        }
        runtimeTrace.push(nextEntry);
      };

      const completeRunningTraceStep = (step: string, detail: string) => {
        const existing = runtimeTrace.find((entry) => entry.step === step);
        if (existing?.status !== "running") {
          return;
        }
        pushOrReplaceTraceEntry(step, "success", detail);
      };

      const markStructuredActivity = () => {
        if (hasStructuredActivity) {
          return;
        }
        hasStructuredActivity = true;
        ensureAgentStreamStarted();
      };

      const writeTrace = (phase: WorkflowTraceData["phase"]) => {
        if (!hasStructuredActivity) {
          return;
        }
        writer.write({
          type: "data-trace",
          id: "lesson-authoring-trace",
          data: buildTraceData(workflow, requestId, runtimeTrace, phase, effectiveUiHints),
        });
      };

      // ---- 写入辅助 ----
      const startServerPipelineTrace = () => {
        if (allowTextOnlyResponse) {
          return;
        }
        markStructuredActivity();
        writeTrace("generation");
      };

      const writeArtifact = (artifact: StructuredArtifactData) => {
        markStructuredActivity();
        writer.write({
          type: "data-artifact",
          id: `lesson-authoring-artifact-${artifact.contentType}`,
          data: artifact,
        });
      };

      const forwardUiChunk = (part: UIMessageChunk) => {
        if (!shouldForwardUiChunk(part, { forwardAssistantText })) {
          return;
        }
        writer.write(part as InferUIMessageChunk<SmartEduUIMessage>);
      };

      const shouldWriteHtmlDraftTrace = () =>
        htmlDraftChunkCount <= 2 || htmlDraftChunkCount % 10 === 0;

      // ---- 流控制 ----
      const finishStream = (finishReason: FinishReason = "stop") => {
        if (hasFinished) {
          return;
        }
        hasFinished = true;
        writer.write({ type: "finish", finishReason });
      };

      const writeStreamError = (step: string, errorText: string) => {
        markStructuredActivity();
        runtimeTrace.push(createTraceEntry(step, "failed", errorText));
        writeTrace("failed");
        writer.write({ type: "error", errorText });
        finishStream("error");
      };

      // ---- Finalizer 上下文 ----
      const buildFinalizerContext = (): StreamFinalizerContext => ({
        workflow,
        requestId,
        mode,
        persistence,
        projectId,
        allowTextOnlyResponse,
        finalLessonPlanPromise: undefined,
        effectiveUiHints,
        runtimeTrace,
        pushOrReplaceTraceEntry,
        completeRunningTraceStep,
        markStructuredActivity,
        writeTrace,
        writeArtifact,
        writeStreamError,
      });

      const finalizeArtifact = async () => {
        const ctx = buildFinalizerContext();
        return mode === "lesson"
          ? finalizeLessonArtifact(ctx, {
              structuredLessonOutput,
              rawText,
              lessonDraftChunkCount: 0,
            })
          : finalizeHtmlArtifact(ctx, {
              rawText,
              latestUpstreamHtmlArtifact,
            });
      };

      // ---- 主消费循环 ----
      startServerPipelineTrace();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          const part = value;
          const upstreamArtifact = mode === "html" ? readArtifactDataPart(part) : undefined;

          // 保持上游工具事件、artifact 与 trace 的到达顺序
          forwardUiChunk(part);

          if (upstreamArtifact?.contentType === "html") {
            markStructuredActivity();
            latestUpstreamHtmlArtifact = upstreamArtifact;
          }

          const structuredOutput = mode === "lesson" ? readStructuredOutputPart(part) : undefined;

          if (structuredOutput !== undefined) {
            structuredLessonOutput = structuredOutput;
            const parsedLessonPlan = competitionLessonPlanSchema.parse(structuredOutput);
            writeArtifact(
              buildArtifactData(workflow, {
                content: JSON.stringify(competitionLessonPlanSchema.parse(parsedLessonPlan)),
                contentType: "lesson-json",
                isComplete: false,
                status: "streaming",
                title: parsedLessonPlan.title,
              }),
            );
          }

          switch (part.type) {
            case "text-delta": {
              rawText += part.delta;
              if (mode === "lesson") {
                break;
              }
              if (mode === "html" && !latestUpstreamHtmlArtifact) {
                htmlDraftChunkCount += 1;
                if (shouldWriteHtmlDraftTrace()) {
                  pushOrReplaceTraceEntry(
                    "stream-html-draft",
                    "running",
                    `正在流式生成互动大屏源码，已同步 ${htmlDraftChunkCount} 次源码更新。`,
                  );
                  writeArtifact(buildHtmlDraftArtifact(workflow, rawText));
                  writeTrace("generation");
                }
              }
              break;
            }

            case "start-step": {
              runtimeTrace.push(
                createTraceEntry("agent-step-start", "running", "模型进入新一轮推理或工具执行阶段。"),
              );
              writeTrace("generation");
              break;
            }

            case "finish-step": {
              runtimeTrace.push(
                createTraceEntry("agent-step-finish", "success", "模型当前步骤已完成并回写到 UI 流。"),
              );
              writeTrace("generation");
              break;
            }

            case "error": {
              markStructuredActivity();
              runtimeTrace.push(createTraceEntry("agent-stream-error", "failed", part.errorText));
              writeTrace("failed");
              writer.write({ type: "error", errorText: part.errorText });
              finishStream("error");
              return;
            }

            case "abort": {
              markStructuredActivity();
              runtimeTrace.push(
                createTraceEntry("agent-stream-abort", "failed", part.reason ?? "用户或系统中断了当前生成。"),
              );
              writeTrace("failed");
              writer.write({ type: "abort", ...(part.reason ? { reason: part.reason } : {}) });
              finishStream("error");
              return;
            }

            case "finish": {
              const finalized = await finalizeArtifact();
              if (!finalized) {
                return;
              }
              if (hasStructuredActivity) {
                completeServerPipelineTrace(buildFinalizerContext(), {
                  lessonDraftChunkCount: 0,
                  htmlDraftChunkCount,
                });
                runtimeTrace.push(
                  createTraceEntry(
                    "generation-finished",
                    "success",
                    mode === "html" ? "HTML Artifact 已完成结构化封装。" : "课时计划 Artifact 已完成结构化封装。",
                  ),
                );
                writeTrace("completed");
              }
              finishStream(part.finishReason);
              return;
            }

            default: {
              break;
            }
          }
        }

        if (!hasFinished) {
          const finalized = await finalizeArtifact();
          if (!finalized) {
            return;
          }
          if (hasStructuredActivity) {
            completeServerPipelineTrace(buildFinalizerContext(), {
              lessonDraftChunkCount: 0,
              htmlDraftChunkCount,
            });
            runtimeTrace.push(
              createTraceEntry(
                "generation-stream-closed-without-finish",
                "blocked",
                "底层模型流未发送 finish chunk；系统已完成最终校验后关闭响应。",
              ),
            );
            writeTrace("completed");
          }
          finishStream("stop");
        }
      } catch (error) {
        const errorText = error instanceof Error ? error.message : "课时计划生成流异常。";
        markStructuredActivity();
        runtimeTrace.push(createTraceEntry("generation-stream-exception", "failed", errorText));
        writeTrace("failed");
        writer.write({ type: "error", errorText });
        finishStream("error");
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Dispatcher（向后兼容，主要服务于现有测试调用）
// ---------------------------------------------------------------------------

/**
 * @deprecated 优先使用 `createLessonStreamAdapter` / `createUpstreamUiStreamAdapter`。
 *
 * 本 dispatcher 保留是为了向后兼容现有测试调用：测试用例通过统一签名
 * 传入 `stream + lessonDraftStream + finalLessonPlanPromise`，dispatcher 根据
 * 参数路由到合适的 adapter。生产代码不再使用本函数。
 *
 * 路由规则：
 * - `mode === "lesson"` 且非 `allowTextOnlyResponse`，且 `lessonDraftStream` 或
 *   `finalLessonPlanPromise` 至少有其一 → `createLessonStreamAdapter`（忽略 `stream`）。
 * - 其他情况 → `createUpstreamUiStreamAdapter`。
 */
export function createStructuredAuthoringStreamAdapter({
  allowTextOnlyResponse = false,
  finalLessonPlanPromise,
  mode,
  originalMessages,
  lessonDraftStream,
  persistence,
  projectId,
  requestId,
  runtimeTrace,
  runtimeUiHints,
  workflow,
  stream,
}: LessonStreamAdapterArgs & {
  allowTextOnlyResponse?: boolean;
  mode: GenerationMode;
  stream: ReadableStream<UIMessageChunk>;
}) {
  if (
    mode === "lesson" &&
    !allowTextOnlyResponse &&
    (lessonDraftStream !== undefined || finalLessonPlanPromise !== undefined)
  ) {
    return createLessonStreamAdapter({
      finalLessonPlanPromise,
      lessonDraftStream,
      originalMessages,
      persistence,
      projectId,
      requestId,
      runtimeTrace,
      runtimeUiHints,
      workflow,
    });
  }

  return createUpstreamUiStreamAdapter({
    allowTextOnlyResponse,
    mode,
    originalMessages,
    persistence,
    projectId,
    requestId,
    runtimeTrace,
    runtimeUiHints,
    stream,
    workflow,
  });
}

// ---------------------------------------------------------------------------
// 澄清适配器（保持不变）
// ---------------------------------------------------------------------------

export function createLessonClarificationStreamAdapter({
  originalMessages,
  requestId,
  workflow,
  text,
}: {
  originalMessages: SmartEduUIMessage[];
  requestId: string;
  workflow: LessonWorkflowOutput;
  text: string;
}) {
  const runtimeTrace: WorkflowTraceEntry[] = [...workflow.trace];

  return createUIMessageStream<SmartEduUIMessage>({
    originalMessages,
    execute: ({ writer }) => {
      const id = "lesson-intake-clarification";

      writer.write({
        type: "data-trace",
        id: "lesson-authoring-trace",
        data: buildTraceData(workflow, requestId, runtimeTrace, "workflow"),
      });
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: text });
      writer.write({ type: "text-end", id });
      writer.write({ type: "finish", finishReason: "stop" });
    },
  });
}
