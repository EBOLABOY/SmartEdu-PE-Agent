import {
  createUIMessageStream,
  type DeepPartial,
  type FinishReason,
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
import { buildLessonSlideshowHtml, isPptStyleLessonHtml } from "@/lib/lesson-slideshow-html";
import type { LessonAuthoringPersistence } from "@/lib/persistence/lesson-authoring-store";
import type { ProjectChatPersistence } from "@/lib/persistence/project-chat-store";
import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

import {
  formatLessonValidationIssues,
  performLessonBusinessValidation,
} from "./lesson_generation_validation";

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
    warnings: workflow.safety.warnings,
    uiHints,
    trace,
    updatedAt: nowIsoString(),
  };

  if (workflow.standards.references) {
    traceData.standards = {
      corpusId: workflow.standards.corpusId,
      displayName: workflow.standards.displayName,
      sourceName: workflow.standards.sourceName,
      issuer: workflow.standards.issuer,
      version: workflow.standards.version,
      url: workflow.standards.url,
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
      detail: "模型输出已通过 CompetitionLessonPlan JSON schema 校验。",
      title: parsed.title,
      warningText: undefined,
    };
  } catch (error) {
    throw new Error(
      `模型未返回合法结构化 CompetitionLessonPlan 对象。请查看字段错误后重新生成：${
        error instanceof Error ? error.message : "unknown-error"
      }`,
    );
  }
}

function buildHtmlExtractionWarning(leadingText: string, trailingText: string) {
  const warnings: string[] = [];

  if (leadingText) {
    warnings.push("检测到 HTML 前存在解释性文本，系统已自动剥离。");
  }

  if (trailingText) {
    warnings.push("检测到 HTML 后存在附加文本，系统已自动忽略。");
  }

  return warnings.join(" ");
}

function joinWarnings(...warnings: Array<string | undefined>) {
  return warnings.filter(Boolean).join(" ");
}

export function createStructuredAuthoringStreamAdapter({
  finalLessonPlanPromise,
  mode,
  originalMessages,
  chatPersistence,
  lessonDraftStream,
  lessonPlan,
  persistence,
  projectId,
  requestId,
  runtimeTrace: providedRuntimeTrace,
  runtimeUiHints,
  workflow,
  stream,
}: {
  finalLessonPlanPromise?: Promise<CompetitionLessonPlan>;
  mode: GenerationMode;
  originalMessages: SmartEduUIMessage[];
  chatPersistence?: ProjectChatPersistence | null;
  lessonDraftStream?: AsyncIterable<DeepPartial<CompetitionLessonPlan>>;
  lessonPlan?: string;
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
    onFinish: async ({ responseMessage }) => {
      if (!chatPersistence || !projectId) {
        return;
      }

      try {
        await chatPersistence.saveMessages({
          projectId,
          requestId,
          messages: [responseMessage],
        });
      } catch (error) {
        console.warn("[lesson-authoring] persist-assistant-message-failed", {
          requestId,
          message: error instanceof Error ? error.message : "unknown-error",
        });
      }
    },
    execute: async ({ writer }) => {
      let rawText = "";
      let hasFinished = false;
      let structuredLessonOutput: unknown;
      const reader = stream.getReader();

      const writeTrace = (phase: WorkflowTraceData["phase"]) => {
        writer.write({
          type: "data-trace",
          id: "lesson-authoring-trace",
          data: buildTraceData(workflow, requestId, runtimeTrace, phase, effectiveUiHints),
        });
      };

      const writeArtifact = (artifact: StructuredArtifactData) => {
        writer.write({
          type: "data-artifact",
          id: `lesson-authoring-artifact-${artifact.contentType}`,
          data: artifact,
        });
      };

      let latestLessonDraft = buildCompetitionLessonDraft();

      const writeLessonDraftArtifact = (partial?: DeepPartial<CompetitionLessonPlan>) => {
        latestLessonDraft = buildCompetitionLessonDraft(partial, latestLessonDraft);

        writeArtifact(
          buildArtifactData(workflow, {
            content: JSON.stringify(latestLessonDraft),
            contentType: "lesson-json",
            isComplete: false,
            status: "streaming",
            title: latestLessonDraft.title,
          }),
        );
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
              `Artifact 持久化失败，但主生成结果已保留：${
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
        runtimeTrace.push(createTraceEntry(step, "failed", errorText));
        writeTrace("failed");
        writer.write({ type: "error", errorText });
        finishStream("error");
      };

      const finalizeLessonArtifact = async () => {
        let trustedLessonOutput = structuredLessonOutput;

        if (finalLessonPlanPromise) {
          try {
            trustedLessonOutput = await finalLessonPlanPromise;
          } catch (error) {
            writeStreamError(
              "lesson-repair-failed",
              error instanceof Error ? error.message : "结构化课时计划自动修复失败。",
            );
            return false;
          }
        }

        if (trustedLessonOutput === undefined) {
          writeStreamError(
            "validate-lesson-output",
            "模型未返回可用的结构化课时计划对象；系统已禁止回退到原始文本 JSON 解析。",
          );
          return false;
        }

        const lessonJson = buildLessonJsonArtifactContent(trustedLessonOutput);
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
        return true;
      };

      const finalizeHtmlArtifact = async () => {
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
        const shouldUseFallback = !isPptStyleLessonHtml(extraction.html);
        const finalHtml = shouldUseFallback ? buildLessonSlideshowHtml(lessonPlan ?? "") : extraction.html;
        const fallbackWarning = shouldUseFallback
          ? "模型 HTML 未满足课堂学习辅助大屏结构或学生理解支撑要求，系统已按已确认课时计划生成多页倒计时学习辅助大屏兜底版本。"
          : undefined;

        if (shouldUseFallback) {
          runtimeTrace.push(
            createTraceEntry(
              "html-slideshow-fallback",
              "success",
              "已将不合格 HTML 替换为多页课堂倒计时学习辅助大屏。",
            ),
          );
          // 运行期原地注入兜底 Toast，与 Repair Toast 保持一致的注入模式
          effectiveUiHints.push({
            action: "show_toast",
            params: {
              level: "warning",
              title: "互动大屏已自动替换",
              description: "模型 HTML 未满足课堂辅助要求，系统已按课时计划生成兜底版本。",
            },
          });
        }

        const artifact = buildArtifactData(workflow, {
          content: finalHtml,
          isComplete: true,
          status: "ready",
          warningText: joinWarnings(extractedWarning, fallbackWarning) || undefined,
        });

        writeArtifact(artifact);
        await persistArtifact(artifact);
        return true;
      };

      const finalizeArtifact = async () => (mode === "lesson" ? finalizeLessonArtifact() : finalizeHtmlArtifact());

      const consumeLessonDraftStream = async () => {
        if (mode !== "lesson" || !lessonDraftStream) {
          return;
        }

        writeLessonDraftArtifact();

        for await (const partial of lessonDraftStream) {
          if (hasFinished) {
            return;
          }

          writeLessonDraftArtifact(partial);
        }
      };

      const createLessonDraftTask = () => consumeLessonDraftStream().catch((error) => {
        runtimeTrace.push(
          createTraceEntry(
            "lesson-draft-stream",
            "blocked",
            `课时计划草稿流已中断，最终 JSON 校验仍将继续：${
              error instanceof Error ? error.message : "unknown-error"
            }`,
          ),
        );
      });

      writer.write({ type: "start" });
      writeTrace("workflow");

      if (!runtimeTrace.some((entry) => entry.step === "agent-stream-started")) {
        runtimeTrace.push(
        createTraceEntry(
          "agent-stream-started",
          "running",
          mode === "html" ? "已开始生成互动大屏 HTML 文档流。" : "已开始流式生成 CompetitionLessonPlan JSON。",
        ),
        );
      }
      writeTrace("generation");
      const lessonDraftTask = createLessonDraftTask();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          const part = value;
          const structuredOutput = mode === "lesson" ? readStructuredOutputPart(part) : undefined;

          if (structuredOutput !== undefined) {
            structuredLessonOutput = structuredOutput;
            const lessonPlan = unwrapAgentLessonGenerationResult(structuredOutput);

            writeArtifact(
              buildArtifactData(workflow, {
                content: JSON.stringify(competitionLessonPlanSchema.parse(lessonPlan)),
                contentType: "lesson-json",
                isComplete: false,
                status: "streaming",
                title: lessonPlan.title,
              }),
            );
          }

          switch (part.type) {
            case "text-start": {
              if (
                mode === "lesson" &&
                workflow.generationPlan.assistantTextPolicy === "mirror-json-text"
              ) {
                writer.write({
                  type: "text-start",
                  id: part.id,
                  ...(part.providerMetadata ? { providerMetadata: part.providerMetadata } : {}),
                });
              }
              break;
            }

            case "text-delta": {
              rawText += part.delta;

              if (mode === "lesson") {
                if (
                  workflow.generationPlan.assistantTextPolicy === "mirror-json-text"
                ) {
                  writer.write({
                    type: "text-delta",
                    id: part.id,
                    delta: part.delta,
                    ...(part.providerMetadata ? { providerMetadata: part.providerMetadata } : {}),
                  });
                }
                break;
              }

              const extraction = extractHtmlDocumentFromText(rawText);

              if (extraction.html) {
                writeArtifact(
                  buildArtifactData(workflow, {
                    content: extraction.html,
                    isComplete: extraction.htmlComplete,
                    status: extraction.htmlComplete ? "ready" : "streaming",
                    warningText: buildHtmlExtractionWarning(extraction.leadingText, extraction.trailingText) || undefined,
                  }),
                );
              }
              break;
            }

            case "text-end": {
              if (
                mode === "lesson" &&
                workflow.generationPlan.assistantTextPolicy === "mirror-json-text"
              ) {
                writer.write({
                  type: "text-end",
                  id: part.id,
                  ...(part.providerMetadata ? { providerMetadata: part.providerMetadata } : {}),
                });
              }
              break;
            }

            case "reasoning-start": {
              writer.write({
                type: "reasoning-start",
                id: part.id,
                ...(part.providerMetadata ? { providerMetadata: part.providerMetadata } : {}),
              });
              break;
            }

            case "reasoning-delta": {
              writer.write({
                type: "reasoning-delta",
                id: part.id,
                delta: part.delta,
                ...(part.providerMetadata ? { providerMetadata: part.providerMetadata } : {}),
              });
              break;
            }

            case "reasoning-end": {
              writer.write({
                type: "reasoning-end",
                id: part.id,
                ...(part.providerMetadata ? { providerMetadata: part.providerMetadata } : {}),
              });
              break;
            }

            case "start-step": {
              writer.write(part);
              runtimeTrace.push(
                createTraceEntry("agent-step-start", "running", "模型进入新一步推理或工具执行阶段。"),
              );
              writeTrace("generation");
              break;
            }

            case "finish-step": {
              writer.write(part);
              runtimeTrace.push(
                createTraceEntry("agent-step-finish", "success", "模型当前步骤已完成并回写到 UI 流。"),
              );
              writeTrace("generation");
              break;
            }

            case "tool-input-start": {
              writer.write(part);
              break;
            }

            case "tool-input-delta": {
              writer.write(part);
              break;
            }

            case "tool-input-available": {
              writer.write(part);
              break;
            }

            case "tool-input-error": {
              writer.write(part);
              break;
            }

            case "tool-approval-request": {
              writer.write(part);
              break;
            }

            case "tool-output-available": {
              writer.write(part);
              break;
            }

            case "tool-output-error": {
              writer.write(part);
              break;
            }

            case "tool-output-denied": {
              writer.write(part);
              break;
            }

            case "error": {
              const errorText = part.errorText;

              runtimeTrace.push(createTraceEntry("agent-stream-error", "failed", errorText));
              writeTrace("failed");
              writer.write({ type: "error", errorText });
              finishStream("error");
              return;
            }

            case "abort": {
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

              runtimeTrace.push(
                createTraceEntry(
                  "generation-finished",
                  "success",
                  mode === "html" ? "HTML Artifact 已完成结构化封装。" : "课时计划 Artifact 已完成结构化封装。",
                ),
              );
              writeTrace("completed");
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

          runtimeTrace.push(
            createTraceEntry(
              "generation-stream-closed-without-finish",
              "blocked",
              "底层模型流未发送 finish chunk；系统已完成最终校验后再关闭响应。",
            ),
          );
          writeTrace("completed");
          finishStream("stop");
        }
      } catch (error) {
        const errorText = error instanceof Error ? error.message : "体育课时计划生成流异常。";

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
  chatPersistence,
  projectId,
  requestId,
  workflow,
  text,
}: {
  originalMessages: SmartEduUIMessage[];
  chatPersistence?: ProjectChatPersistence | null;
  projectId?: string;
  requestId: string;
  workflow: LessonWorkflowOutput;
  text: string;
}) {
  const runtimeTrace: WorkflowTraceEntry[] = [...workflow.trace];

  return createUIMessageStream<SmartEduUIMessage>({
    originalMessages,
    onFinish: async ({ responseMessage }) => {
      if (!chatPersistence || !projectId) {
        return;
      }

      try {
        await chatPersistence.saveMessages({
          projectId,
          requestId,
          messages: [responseMessage],
        });
      } catch (error) {
        console.warn("[lesson-authoring] persist-clarification-message-failed", {
          requestId,
          message: error instanceof Error ? error.message : "unknown-error",
        });
      }
    },
    execute: ({ writer }) => {
      const id = "lesson-intake-clarification";

      writer.write({ type: "start" });
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
