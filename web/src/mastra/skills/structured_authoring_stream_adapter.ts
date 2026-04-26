import { createUIMessageStream, type FinishReason, type UIMessageChunk } from "ai";

import { extractHtmlDocumentFromText } from "@/lib/artifact-protocol";
import { competitionLessonPlanSchema } from "@/lib/competition-lesson-contract";
import {
  STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
  type GenerationMode,
  type SmartEduUIMessage,
  type StructuredArtifactData,
  type WorkflowTraceData,
  type WorkflowTraceEntry,
} from "@/lib/lesson-authoring-contract";
import { buildLessonSlideshowHtml, isPptStyleLessonHtml } from "@/lib/lesson-slideshow-html";
import type { LessonAuthoringPersistence } from "@/lib/persistence/lesson-authoring-store";
import type { ProjectChatPersistence } from "@/lib/persistence/project-chat-store";
import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

import type { LessonJsonRepairSkill } from "./lesson_json_repair_skill";

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
    title: workflow.generationPlan.mode === "html" ? "互动大屏 Artifact" : "教案 Artifact",
    ...(options.warningText ? { warningText: options.warningText } : {}),
    updatedAt: nowIsoString(),
  };
}

function stripCodeFence(text: string) {
  const trimmed = text.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);

  return match?.[1]?.trim() ?? trimmed;
}

function extractJsonObjectText(text: string) {
  const stripped = stripCodeFence(text);
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");

  if (start < 0 || end <= start) {
    return stripped;
  }

  return stripped.slice(start, end + 1);
}

function containsDefaultPlaceholder(value: unknown) {
  return JSON.stringify(value).includes("\"XXX\"");
}

async function buildLessonJsonArtifactContent(
  rawText: string,
  repairLessonJson?: LessonJsonRepairSkill,
) {
  try {
    const parsed = competitionLessonPlanSchema.parse(JSON.parse(extractJsonObjectText(rawText)));

    if (containsDefaultPlaceholder(parsed)) {
      throw new Error("模型输出包含默认占位符 XXX，不能作为正式 CompetitionLessonPlan JSON。");
    }

    return {
      content: JSON.stringify(parsed),
      contentType: "lesson-json" as const,
      detail: "模型输出已通过 CompetitionLessonPlan JSON schema 校验。",
      warningText: undefined,
    };
  } catch (error) {
    if (!repairLessonJson) {
      throw new Error(
        `模型未返回合法 CompetitionLessonPlan JSON，且未配置自动修复 skill：${
          error instanceof Error ? error.message : "unknown-error"
        }`,
      );
    }

    const repaired = await repairLessonJson({
      draftText: rawText,
      issue: `模型直接 JSON 输出未通过 schema 校验：${
        error instanceof Error ? error.message : "unknown-error"
      }`,
    });

    if (containsDefaultPlaceholder(repaired)) {
      throw new Error("结构化修复结果仍包含默认占位符 XXX，已拒绝写入正式教案。");
    }

    return {
      content: JSON.stringify(repaired),
      contentType: "lesson-json" as const,
      detail: "模型 JSON 草稿校验失败，已通过结构化修复生成 CompetitionLessonPlan JSON。",
      warningText: "模型首次 JSON 草稿未通过校验，系统已自动调用结构化修复生成正式 JSON。",
    };
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
  mode,
  originalMessages,
  chatPersistence,
  lessonPlan,
  repairLessonJson,
  persistence,
  projectId,
  requestId,
  workflow,
  stream,
}: {
  mode: GenerationMode;
  originalMessages: SmartEduUIMessage[];
  chatPersistence?: ProjectChatPersistence | null;
  lessonPlan?: string;
  repairLessonJson?: LessonJsonRepairSkill;
  persistence?: LessonAuthoringPersistence | null;
  projectId?: string;
  requestId: string;
  workflow: LessonWorkflowOutput;
  stream: ReadableStream<UIMessageChunk>;
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
        console.warn("[lesson-authoring] persist-assistant-message-failed", {
          requestId,
          message: error instanceof Error ? error.message : "unknown-error",
        });
      }
    },
    execute: async ({ writer }) => {
      let rawText = "";
      let hasFinished = false;
      const reader = stream.getReader();

      const writeTrace = (phase: WorkflowTraceData["phase"]) => {
        writer.write({
          type: "data-trace",
          id: "lesson-authoring-trace",
          data: buildTraceData(workflow, requestId, runtimeTrace, phase),
        });
      };

      const writeArtifact = (artifact: StructuredArtifactData) => {
        writer.write({
          type: "data-artifact",
          id: `lesson-authoring-artifact-${artifact.contentType}`,
          data: artifact,
        });
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
            trace: buildTraceData(workflow, requestId, runtimeTrace, "completed"),
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

      writer.write({ type: "start" });
      writeTrace("workflow");

      runtimeTrace.push(
        createTraceEntry(
          "agent-stream-started",
          "running",
          mode === "html" ? "已开始生成互动大屏 HTML 文档流。" : "已开始流式生成 CompetitionLessonPlan JSON。",
        ),
      );
      writeTrace("generation");

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          const part = value;

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
                  writeArtifact(
                    buildArtifactData(workflow, {
                      content: rawText,
                      contentType: "lesson-json",
                      isComplete: false,
                      status: "streaming",
                    }),
                  );
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
              runtimeTrace.push(
                createTraceEntry("agent-step-start", "running", "模型进入新一步推理或工具执行阶段。"),
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

            case "tool-input-available": {
              runtimeTrace.push(
                createTraceEntry("agent-tool-call", "running", `触发工具 ${part.toolName}。`),
              );
              writeTrace("generation");
              break;
            }

            case "tool-output-available": {
              runtimeTrace.push(
                createTraceEntry("agent-tool-result", "success", `工具 ${part.toolCallId} 已返回结果。`),
              );
              writeTrace("generation");
              break;
            }

            case "tool-output-error": {
              runtimeTrace.push(
                createTraceEntry("agent-tool-error", "failed", `工具 ${part.toolCallId} 执行失败：${part.errorText}`),
              );
              writeTrace("generation");
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
              if (mode === "lesson") {
                const lessonText = rawText.trim();

                if (!lessonText) {
                  const errorText = "模型未返回可用的 CompetitionLessonPlan JSON 内容。";

                  runtimeTrace.push(createTraceEntry("validate-lesson-output", "failed", errorText));
                  writeTrace("failed");
                  writer.write({ type: "error", errorText });
                  finishStream("error");
                  return;
                }

                const lessonJson = await buildLessonJsonArtifactContent(lessonText, repairLessonJson);
                const artifact = buildArtifactData(workflow, {
                  content: lessonJson.content,
                  contentType: lessonJson.contentType,
                  isComplete: true,
                  status: "ready",
                  warningText: lessonJson.warningText,
                });

                if (lessonJson.warningText) {
                  runtimeTrace.push(
                    createTraceEntry("repair-lesson-json-artifact", "success", lessonJson.detail),
                  );
                }

                writeArtifact(artifact);
                await persistArtifact(artifact);
              } else {
                const extraction = extractHtmlDocumentFromText(rawText);

                if (!extraction.html.trim()) {
                  const errorText = "模型响应中未提取到 HTML 文档，无法生成互动大屏。";

                  runtimeTrace.push(createTraceEntry("extract-html-document", "failed", errorText));
                  writeTrace("failed");
                  writer.write({ type: "error", errorText });
                  finishStream("error");
                  return;
                }

                const extractedWarning = buildHtmlExtractionWarning(extraction.leadingText, extraction.trailingText);
                const shouldUseFallback = !isPptStyleLessonHtml(extraction.html);
                const finalHtml = shouldUseFallback ? buildLessonSlideshowHtml(lessonPlan ?? "") : extraction.html;
                const fallbackWarning = shouldUseFallback
                  ? "模型 HTML 未满足课堂学习辅助大屏结构，系统已按已确认教案生成多页倒计时学习辅助大屏兜底版本。"
                  : undefined;

                if (shouldUseFallback) {
                  runtimeTrace.push(
                    createTraceEntry(
                      "html-slideshow-fallback",
                      "success",
                      "已将非 PPT 结构 HTML 替换为多页课堂倒计时课件。",
                    ),
                  );
                }

                const artifact = buildArtifactData(workflow, {
                  content: finalHtml,
                  isComplete: true,
                  status: "ready",
                  warningText: joinWarnings(extractedWarning, fallbackWarning) || undefined,
                });

                writeArtifact(artifact);
                await persistArtifact(artifact);
              }

              runtimeTrace.push(
                createTraceEntry(
                  "generation-finished",
                  "success",
                  mode === "html" ? "HTML Artifact 已完成结构化封装。" : "教案 Artifact 已完成结构化封装。",
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
          runtimeTrace.push(
            createTraceEntry("generation-stream-closed", "success", "流已自然结束，已按结构化协议关闭响应。"),
          );
          writeTrace("completed");
          finishStream("stop");
        }
      } catch (error) {
        const errorText = error instanceof Error ? error.message : "体育教案生成流异常。";

        runtimeTrace.push(createTraceEntry("generation-stream-exception", "failed", errorText));
        writeTrace("failed");
        writer.write({ type: "error", errorText });
        finishStream("error");
      }
    },
  });
}
