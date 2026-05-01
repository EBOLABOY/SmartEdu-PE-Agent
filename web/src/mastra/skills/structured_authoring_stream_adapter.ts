import {
  createUIMessageStream,
  type DeepPartial,
  type FinishReason,
  type InferUIMessageChunk,
  type UIMessageChunk,
} from "ai";

import { extractHtmlDocumentFromText } from "@/lib/artifact-protocol";
import {
  competitionLessonPlanSchema,
  unwrapAgentLessonGenerationResult,
  type CompetitionLessonPlan,
} from "@/lib/competition-lesson-contract";
import { buildCompetitionLessonDraft } from "@/lib/competition-lesson-draft";
import {
  STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
  type GenerationMode,
  type SmartEduUIMessage,
  type StructuredArtifactData,
  type UiHint,
  type WorkflowTraceData,
  type WorkflowTraceEntry,
} from "@/lib/lesson-authoring-contract";
import type { LessonAuthoringPersistence } from "@/lib/persistence/lesson-authoring-store";
import {
  SUBMIT_LESSON_PLAN_TOOL_NAME,
  parseSubmitLessonPlanToolInput,
} from "@/mastra/tools/output_tools";
import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

import {
  formatLessonValidationIssues,
  performLessonBusinessValidation,
} from "./lesson_generation_validation";
import { enrichLessonPlanWithDiagramAssets } from "./lesson_diagram_generation_skill";

const DRAFT_TRACE_UPDATE_INTERVAL = 20;
const TERMINAL_RUNNING_TRACE_STEPS = new Set([
  "agent-stream-started",
  "generate-lesson-diagrams",
  "stream-lesson-draft",
  "validate-lesson-output",
]);

function nowIsoString() {
  return new Date().toISOString();
}

function createTraceEntry(
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

function cloneJsonLike<T>(value: T): T {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function buildTraceData(
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
    warnings: cloneJsonLike(workflow.safety.warnings),
    uiHints: cloneJsonLike(uiHints),
    trace: cloneJsonLike(trace),
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

function buildArtifactData(
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
  return {
    protocolVersion: STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
    stage: workflow.generationPlan.mode,
    contentType: options.contentType ?? (workflow.generationPlan.mode === "html" ? "html" : "lesson-json"),
    content: options.content,
    isComplete: options.isComplete,
    status: options.status,
    source: "data-part",
    title:
      options.title ??
      (workflow.generationPlan.mode === "html" ? "互动大屏 Artifact" : "课时计划 Artifact"),
    ...(options.warningText ? { warningText: options.warningText } : {}),
    updatedAt: nowIsoString(),
  };
}

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

function readStructuredOutputPart(part: UIMessageChunk) {
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

function readToolInputPart(part: UIMessageChunk) {
  const candidate = part as {
    input?: unknown;
    toolCallId?: string;
    toolName?: string;
    type?: string;
  };

  if (candidate.type !== "tool-input-available" || typeof candidate.toolName !== "string") {
    return undefined;
  }

  return {
    input: candidate.input,
    toolCallId: typeof candidate.toolCallId === "string" ? candidate.toolCallId : undefined,
    toolName: candidate.toolName,
  };
}

function buildLessonJsonArtifactContent(structuredOutput: unknown) {
  try {
    const parsed = unwrapAgentLessonGenerationResult(structuredOutput);
    const validation = performLessonBusinessValidation(parsed);

    if (!validation.isValid) {
      throw new Error(formatLessonValidationIssues(validation.issues));
    }

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

function buildHtmlExtractionWarning(leadingText: string, trailingText: string) {
  const warnings: string[] = [];

  if (leadingText) {
    warnings.push("检测到 HTML 前存在说明性文本，系统已自动剥离。");
  }

  if (trailingText) {
    warnings.push("检测到 HTML 后存在附加文本，系统已自动忽略。");
  }

  return warnings.join(" ");
}

function shouldForwardAssistantText(mode: GenerationMode, workflow: LessonWorkflowOutput) {
  return mode === "lesson" && workflow.generationPlan.assistantTextPolicy === "mirror-json-text";
}

function shouldForwardUiChunk(
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

function createForwardedUiChunkStream(
  stream: ReadableStream<UIMessageChunk>,
  options: {
    forwardAssistantText: boolean;
  },
) {
  return new ReadableStream<InferUIMessageChunk<SmartEduUIMessage>>({
    async start(controller) {
      const reader = stream.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            controller.close();
            return;
          }

          if (shouldForwardUiChunk(value, options)) {
            controller.enqueue(value as InferUIMessageChunk<SmartEduUIMessage>);
          }
        }
      } catch {
        controller.close();
      } finally {
        reader.releaseLock();
      }
    },
  });
}

export function createStructuredAuthoringStreamAdapter({
  allowTextOnlyResponse = false,
  finalLessonPlanPromise,
  mode,
  originalMessages,
  lessonDraftStream,
  persistence,
  projectId,
  requestId,
  runtimeTrace: providedRuntimeTrace,
  runtimeUiHints,
  workflow,
  stream,
}: {
  allowTextOnlyResponse?: boolean;
  finalLessonPlanPromise?: Promise<CompetitionLessonPlan>;
  mode: GenerationMode;
  originalMessages: SmartEduUIMessage[];
  lessonDraftStream?: AsyncIterable<DeepPartial<CompetitionLessonPlan>>;
  persistence?: LessonAuthoringPersistence | null;
  projectId?: string;
  requestId: string;
  runtimeTrace?: WorkflowTraceEntry[];
  runtimeUiHints?: UiHint[];
  workflow: LessonWorkflowOutput;
  stream: ReadableStream<UIMessageChunk>;
}) {
  const runtimeTrace = providedRuntimeTrace ?? [...workflow.trace];
  const effectiveUiHints = runtimeUiHints ?? workflow.uiHints;

  return createUIMessageStream<SmartEduUIMessage>({
    originalMessages,
    execute: async ({ writer }) => {
      let rawText = "";
      let hasFinished = false;
      let structuredLessonOutput: unknown;
      let hasStructuredActivity = false;
      let lessonDraftChunkCount = 0;
      const forwardAssistantText = allowTextOnlyResponse || shouldForwardAssistantText(mode, workflow);
      const [inspectionStream, passthroughStream] = stream.tee();
      const reader = inspectionStream.getReader();

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

      const completeServerPipelineTrace = () => {
        for (const entry of [...runtimeTrace]) {
          if (entry.status !== "running" || !TERMINAL_RUNNING_TRACE_STEPS.has(entry.step)) {
            continue;
          }

          if (entry.step === "agent-stream-started") {
            pushOrReplaceTraceEntry(
              "agent-stream-started",
              "success",
              mode === "html" ? "互动大屏 HTML 模型生成流已结束。" : "课时计划模型生成流已结束。",
            );
            continue;
          }

          if (entry.step === "stream-lesson-draft") {
            pushOrReplaceTraceEntry(
              "stream-lesson-draft",
              "success",
              `课时计划草稿流已完成，共同步 ${lessonDraftChunkCount} 次草稿更新。`,
            );
            continue;
          }

          if (entry.step === "validate-lesson-output") {
            pushOrReplaceTraceEntry(
              "validate-lesson-output",
              "success",
              "结构化课时计划已通过最终 schema 与业务校验。",
            );
          }
        }
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

      let latestLessonDraft = buildCompetitionLessonDraft();

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

      const persistArtifact = async (artifact: StructuredArtifactData) => {
        if (!persistence || !projectId) {
          return;
        }

        try {
          await persistence.saveArtifactVersion({
            artifact,
            projectId,
            requestId,
            trace: buildTraceData(workflow, requestId, runtimeTrace, "completed", effectiveUiHints),
          });
        } catch (error) {
          runtimeTrace.push(
            createTraceEntry(
              "persist-artifact-version",
              "blocked",
              `Artifact 持久化失败，但主结果已保留：${
                error instanceof Error ? error.message : "unknown-error"
              }`,
            ),
          );
          console.warn("[lesson-authoring] persist-artifact-failed", {
            requestId,
            message: error instanceof Error ? error.message : "unknown-error",
          });
        }
      };

      const finishStream = (finishReason: FinishReason = "stop") => {
        if (hasFinished) {
          return;
        }

        hasFinished = true;
        writer.write({
          type: "finish",
          finishReason,
        });
      };

      const writeStreamError = (step: string, errorText: string) => {
        markStructuredActivity();
        runtimeTrace.push(createTraceEntry(step, "failed", errorText));
        writeTrace("failed");
        writer.write({ type: "error", errorText });
        finishStream("error");
      };

      const handleOutputToolInput = (part: UIMessageChunk) => {
        const toolInput = readToolInputPart(part);

        if (!toolInput) {
          return true;
        }

        try {
          if (toolInput.toolName === SUBMIT_LESSON_PLAN_TOOL_NAME) {
            const submission = parseSubmitLessonPlanToolInput(toolInput.input);

            markStructuredActivity();
            structuredLessonOutput = submission.lessonPlan;
            effectiveUiHints.push({
              action: "switch_tab",
              params: { tab: "lesson" },
            });
            runtimeTrace.push(
              createTraceEntry(
                "submit-lesson-plan-tool",
                "success",
                `已收到 submit_lesson_plan 工具提交：${submission.summary}`,
              ),
            );
            writeArtifact(
              buildArtifactData(workflow, {
                content: JSON.stringify(competitionLessonPlanSchema.parse(submission.lessonPlan)),
                contentType: "lesson-json",
                isComplete: false,
                status: "streaming",
                title: submission.lessonPlan.title,
              }),
            );
            writeTrace("generation");
            return true;
          }

          return true;
        } catch (error) {
          writeStreamError(
            "validate-output-tool-input",
            error instanceof Error ? error.message : "输出工具输入校验失败。",
          );
          return false;
        }
      };

      const enrichLessonWithDiagrams = async (lessonPlan: CompetitionLessonPlan) => {
        pushOrReplaceTraceEntry(
          "generate-lesson-diagrams",
          "running",
          "课时计划文本已完成，正在生成教学组织站位九宫格并回填到课时计划。",
        );
        writeTrace("generation");

        try {
          const result = await enrichLessonPlanWithDiagramAssets({
            lessonPlan,
            projectId,
            requestId,
          });

          if (result.generatedCount > 0) {
            pushOrReplaceTraceEntry(
              "generate-lesson-diagrams",
              "success",
              `已生成并回填 ${result.generatedCount} 张教学组织站位图，存储模式：${
                result.storageMode ?? "unknown"
              }。`,
            );
            writeTrace("generation");
            return result.lessonPlan;
          }

          pushOrReplaceTraceEntry(
            "generate-lesson-diagrams",
            "blocked",
            result.skippedReason ?? "教学组织站位图未生成，课时计划文本已保留。",
          );
          writeTrace("generation");
          return lessonPlan;
        } catch (error) {
          pushOrReplaceTraceEntry(
            "generate-lesson-diagrams",
            "blocked",
            `教学组织站位图生成失败，已保留纯文本课时计划：${
              error instanceof Error ? error.message : "unknown-error"
            }`,
          );
          writeTrace("generation");
          return lessonPlan;
        }
      };

      const finalizeLessonArtifact = async () => {
        let trustedLessonOutput = structuredLessonOutput;

        if (finalLessonPlanPromise) {
          try {
            pushOrReplaceTraceEntry(
              "validate-lesson-output",
              "running",
              "正在等待模型最终结构化输出，并执行课时计划 schema 与业务校验。",
            );
            writeTrace("generation");
            trustedLessonOutput = await finalLessonPlanPromise;
          } catch (error) {
            writeStreamError(
              "lesson-repair-failed",
              error instanceof Error ? error.message : "结构化课时计划修复失败。",
            );
            return false;
          }
        }

        if (trustedLessonOutput === undefined) {
          if (allowTextOnlyResponse && rawText.trim()) {
            return true;
          }

          writeStreamError(
            "validate-lesson-output",
            "模型未通过 submit_lesson_plan 提交课时计划，且未返回兼容结构化输出。",
          );
          return false;
        }

        const lessonJson = buildLessonJsonArtifactContent(trustedLessonOutput);
        completeRunningTraceStep(
          "agent-stream-started",
          mode === "html" ? "互动大屏 HTML 模型生成流已结束。" : "课时计划模型生成流已结束。",
        );
        completeRunningTraceStep(
          "stream-lesson-draft",
          `课时计划草稿流已完成，共同步 ${lessonDraftChunkCount} 次草稿更新。`,
        );
        pushOrReplaceTraceEntry(
          "validate-lesson-output",
          "success",
          "结构化课时计划已通过最终 schema 与业务校验。",
        );
        writeTrace("generation");
        const artifact = buildArtifactData(workflow, {
          content: lessonJson.content,
          contentType: lessonJson.contentType,
          isComplete: true,
          status: "ready",
          title: lessonJson.title,
          warningText: lessonJson.warningText,
        });

        writeArtifact(artifact);
        await persistArtifact(artifact);

        const enrichedLessonPlan = await enrichLessonWithDiagrams(lessonJson.lessonPlan);

        if (enrichedLessonPlan !== lessonJson.lessonPlan) {
          const enrichedLessonJson = buildLessonJsonArtifactContent(enrichedLessonPlan);
          const enrichedArtifact = buildArtifactData(workflow, {
            content: enrichedLessonJson.content,
            contentType: enrichedLessonJson.contentType,
            isComplete: true,
            status: "ready",
            title: enrichedLessonJson.title,
            warningText: enrichedLessonJson.warningText,
          });

          writeArtifact(enrichedArtifact);
          await persistArtifact(enrichedArtifact);
        }

        return true;
      };

      const finalizeHtmlArtifact = async () => {
        if (allowTextOnlyResponse && rawText.trim() && !rawText.includes("<html")) {
          return true;
        }

        const extraction = extractHtmlDocumentFromText(rawText);

        if (!extraction.html.trim()) {
          writeStreamError("extract-html-document", "模型响应中未提取到 HTML 文档，无法生成互动大屏。");
          return false;
        }

        if (!extraction.htmlComplete) {
          writeStreamError("extract-html-document", "模型 HTML 文档未完整关闭，已拒绝使用截断的大屏内容。");
          return false;
        }

        const extractedWarning = buildHtmlExtractionWarning(extraction.leadingText, extraction.trailingText);
        const artifact = buildArtifactData(workflow, {
          content: extraction.html,
          isComplete: true,
          status: "ready",
          warningText: extractedWarning,
        });

        completeRunningTraceStep(
          "agent-stream-started",
          "互动大屏 HTML 模型生成流已结束。",
        );
        writeArtifact(artifact);
        await persistArtifact(artifact);
        return true;
      };

      const finalizeArtifact = async () => (mode === "lesson" ? finalizeLessonArtifact() : finalizeHtmlArtifact());

      const consumeLessonDraftStream = async () => {
        if (mode !== "lesson" || allowTextOnlyResponse) {
          return;
        }

        pushOrReplaceTraceEntry(
          "stream-lesson-draft",
          "running",
          "正在建立课时计划草稿流，右侧预览将同步更新。",
        );
        writeTrace("generation");
        writeLessonDraftArtifact();

        if (!lessonDraftStream) {
          return;
        }

        for await (const partial of lessonDraftStream) {
          if (hasFinished) {
            return;
          }

          writeLessonDraftArtifact(partial);
        }
      };

      const createLessonDraftTask = () =>
        consumeLessonDraftStream().catch((error) => {
          runtimeTrace.push(
            createTraceEntry(
              "lesson-draft-stream",
              "blocked",
              `课时计划草稿流已中断，但最终 JSON 校验仍将继续：${
                error instanceof Error ? error.message : "unknown-error"
              }`,
            ),
          );
        });

      writer.merge(
        createForwardedUiChunkStream(passthroughStream, {
          forwardAssistantText,
        }),
      );
      startServerPipelineTrace();
      const lessonDraftTask = createLessonDraftTask();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          const part = value;

          if (!handleOutputToolInput(part)) {
            return;
          }

          const structuredOutput = mode === "lesson" ? readStructuredOutputPart(part) : undefined;

          if (structuredOutput !== undefined) {
            structuredLessonOutput = structuredOutput;
            const parsedLessonPlan = unwrapAgentLessonGenerationResult(structuredOutput);

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

              const extraction = extractHtmlDocumentFromText(rawText);

              writeArtifact(
                buildArtifactData(workflow, {
                  content: extraction.html || rawText,
                  isComplete: Boolean(extraction.html && extraction.htmlComplete),
                  status: extraction.html && extraction.htmlComplete ? "ready" : "streaming",
                  warningText: extraction.html
                    ? buildHtmlExtractionWarning(extraction.leadingText, extraction.trailingText) || undefined
                    : undefined,
                }),
              );
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
              await lessonDraftTask;
              const finalized = await finalizeArtifact();

              if (!finalized) {
                return;
              }

              if (hasStructuredActivity) {
                completeServerPipelineTrace();
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
          await lessonDraftTask;
          const finalized = await finalizeArtifact();

          if (!finalized) {
            return;
          }

          if (hasStructuredActivity) {
            completeServerPipelineTrace();
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
