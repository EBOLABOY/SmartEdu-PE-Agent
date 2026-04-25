import { randomUUID } from "node:crypto";

import { toAISdkStream } from "@mastra/ai-sdk";
import { createUIMessageStream, convertToModelMessages, type FinishReason, type UIMessage, type UIMessageChunk } from "ai";

import { extractHtmlDocumentFromText } from "@/lib/artifact-protocol";
import {
  DEFAULT_STANDARDS_MARKET,
  STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
  type GenerationMode,
  type PeTeacherContext,
  type SmartEduUIMessage,
  type StructuredArtifactData,
  type StandardsMarket,
  type WorkflowTraceData,
  type WorkflowTraceEntry,
} from "@/lib/lesson-authoring-contract";
import type { LessonAuthoringPersistence } from "@/lib/persistence/lesson-authoring-store";
import type { ProjectChatPersistence } from "@/lib/persistence/project-chat-store";
import { mastra } from "@/mastra";
import type { LessonWorkflowInput, LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

export type LessonAuthoringRequest = {
  messages: SmartEduUIMessage[];
  persistence?: LessonAuthoringPersistence | null;
  chatPersistence?: ProjectChatPersistence | null;
  projectId?: string;
  context?: PeTeacherContext;
  mode?: GenerationMode;
  lessonPlan?: string;
  market?: StandardsMarket;
};

export type LessonAuthoringTrace = {
  workflow: LessonWorkflowOutput;
  mode: GenerationMode;
  query: string;
  requestId: string;
};

const MAX_AGENT_STREAM_ATTEMPTS = 5;

export class LessonAuthoringError extends Error {
  constructor(
    message: string,
    public readonly status = 422,
  ) {
    super(message);
    this.name = "LessonAuthoringError";
  }
}

function getLatestUserText(messages: UIMessage[]) {
  const latestUserMessage = messages.findLast((message) => message.role === "user");

  if (!latestUserMessage) {
    return "";
  }

  return latestUserMessage.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

function getWorkflowFailureMessage(result: { status: string; error?: unknown }) {
  if (result.error instanceof Error) {
    return result.error.message;
  }

  return `体育教案工作流执行失败，状态：${result.status}。`;
}

function nowIsoString() {
  return new Date().toISOString();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorStatusCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) {
    return undefined;
  }

  const statusCode = (error as { statusCode?: unknown }).statusCode;

  return typeof statusCode === "number" ? statusCode : undefined;
}

function getRetryDelayMs(attempt: number) {
  const baseDelayMs = 500 * 2 ** (attempt - 1);
  const jitterMs = Math.floor(Math.random() * 250);

  return Math.min(baseDelayMs + jitterMs, 8_000);
}

function isRetryableAgentStreamError(error: unknown) {
  const statusCode = getErrorStatusCode(error);
  const message = error instanceof Error ? error.message : String(error);

  if (statusCode && [408, 409, 425, 429, 500, 502, 503, 504].includes(statusCode)) {
    return true;
  }

  return /No available channels|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|network|timeout/i.test(message);
}

async function streamAgentWithRetry<T>(
  operation: () => Promise<T>,
  context: {
    mode: GenerationMode;
    requestId: string;
  },
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_AGENT_STREAM_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt >= MAX_AGENT_STREAM_ATTEMPTS || !isRetryableAgentStreamError(error)) {
        throw error;
      }

      const delayMs = getRetryDelayMs(attempt);
      console.warn("[lesson-authoring] retrying agent stream", {
        requestId: context.requestId,
        mode: context.mode,
        attempt,
        nextAttempt: attempt + 1,
        maxAttempts: MAX_AGENT_STREAM_ATTEMPTS,
        delayMs,
        statusCode: getErrorStatusCode(error),
        error: error instanceof Error ? error.message : String(error),
      });
      await sleep(delayMs);
    }
  }

  throw lastError;
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

function logLessonAuthoringTrace(trace: LessonAuthoringTrace) {
  console.info("[lesson-authoring]", {
    requestId: trace.requestId,
    mode: trace.mode,
    queryLength: trace.query.length,
    outputProtocol: trace.workflow.generationPlan.outputProtocol,
    responseTransport: trace.workflow.generationPlan.responseTransport,
    htmlSandboxRequired: trace.workflow.safety.htmlSandboxRequired,
    requestedMarket: trace.workflow.standards.requestedMarket,
    resolvedMarket: trace.workflow.standards.resolvedMarket,
    trace: trace.workflow.trace,
    warnings: trace.workflow.safety.warnings,
  });
}

function buildTraceData(
  workflow: LessonWorkflowOutput,
  requestId: string,
  trace: WorkflowTraceEntry[],
  phase: WorkflowTraceData["phase"],
): WorkflowTraceData {
  return {
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
}

function buildArtifactData(
  workflow: LessonWorkflowOutput,
  options: {
    content: string;
    isComplete: boolean;
    status: StructuredArtifactData["status"];
    warningText?: string;
  },
): StructuredArtifactData {
  return {
    protocolVersion: STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
    stage: workflow.generationPlan.mode,
    contentType: workflow.generationPlan.mode === "html" ? "html" : "markdown",
    content: options.content,
    isComplete: options.isComplete,
    status: options.status,
    source: "data-part",
    title: workflow.generationPlan.mode === "html" ? "互动大屏 Artifact" : "教案 Artifact",
    ...(options.warningText ? { warningText: options.warningText } : {}),
    updatedAt: nowIsoString(),
  };
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

function createStructuredAuthoringStream({
  mode,
  originalMessages,
  chatPersistence,
  persistence,
  projectId,
  requestId,
  workflow,
  stream,
}: {
  mode: GenerationMode;
  originalMessages: SmartEduUIMessage[];
  chatPersistence?: ProjectChatPersistence | null;
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
          id: "lesson-authoring-artifact",
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
          mode === "html" ? "已开始生成互动大屏 HTML 文档流。" : "已开始生成 Markdown 教案流。",
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
              if (mode === "lesson") {
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
                writer.write({
                  type: "text-delta",
                  id: part.id,
                  delta: part.delta,
                  ...(part.providerMetadata ? { providerMetadata: part.providerMetadata } : {}),
                });
                writeArtifact(
                  buildArtifactData(workflow, {
                    content: rawText,
                    isComplete: false,
                    status: "streaming",
                  }),
                );
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
              if (mode === "lesson") {
                writer.write({
                  type: "text-end",
                  id: part.id,
                  ...(part.providerMetadata ? { providerMetadata: part.providerMetadata } : {}),
                });
              }
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
                createTraceEntry(
                  "agent-step-finish",
                  "success",
                  "模型当前步骤已完成并回写到 UI 流。",
                ),
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
                const markdown = rawText.trim();

                if (!markdown) {
                  const errorText = "模型未返回可用的 Markdown 教案内容。";

                  runtimeTrace.push(createTraceEntry("validate-lesson-output", "failed", errorText));
                  writeTrace("failed");
                  writer.write({ type: "error", errorText });
                  finishStream("error");
                  return;
                }

                const artifact = buildArtifactData(workflow, {
                    content: markdown,
                    isComplete: true,
                    status: "ready",
                  });

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

                const artifact = buildArtifactData(workflow, {
                    content: extraction.html,
                    isComplete: true,
                    status: "ready",
                    warningText: buildHtmlExtractionWarning(extraction.leadingText, extraction.trailingText) || undefined,
                  });

                writeArtifact(artifact);
                await persistArtifact(artifact);
              }

              runtimeTrace.push(
                createTraceEntry(
                  "generation-finished",
                  "success",
                  mode === "html" ? "HTML Artifact 已完成结构化封装。" : "Markdown 教案已完成结构化封装。",
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

export async function runLessonAuthoringWorkflow(input: LessonWorkflowInput) {
  const workflow = mastra.getWorkflow("lessonAuthoringWorkflow");
  const run = await workflow.createRun();
  const result = await run.start({ inputData: input });

  if (result.status !== "success") {
    throw new LessonAuthoringError(getWorkflowFailureMessage(result));
  }

  return result.result;
}

export async function streamLessonAuthoring(request: LessonAuthoringRequest) {
  const mode = request.mode === "html" ? "html" : "lesson";
  const query = getLatestUserText(request.messages);
  const requestId = randomUUID();
  const workflow = await runLessonAuthoringWorkflow({
    query,
    mode,
    context: request.context,
    lessonPlan: request.lessonPlan,
    market: request.market ?? DEFAULT_STANDARDS_MARKET,
  });

  logLessonAuthoringTrace({ workflow, mode, query, requestId });

  const agent = mastra.getAgent("peTeacherAgent");
  const modelMessages =
    mode === "html"
      ? [
          {
            role: "user" as const,
            content: "请基于系统消息中的已确认教案，生成互动大屏 HTML。",
          },
        ]
      : await convertToModelMessages(request.messages);
  const result = await streamAgentWithRetry(
    () =>
      agent.stream(modelMessages, {
        system: workflow.system,
        maxSteps: workflow.generationPlan.maxSteps,
        providerOptions: {
          openai: {
            store: true,
          },
        },
      }),
    { mode, requestId },
  );

  if (mode === "html") {
    console.info("[lesson-authoring] html generation uses slim model messages", {
      requestId,
      originalMessageCount: request.messages.length,
      modelMessageCount: modelMessages.length,
      lessonPlanLength: request.lessonPlan?.length ?? 0,
    });
  }

  return {
    stream: createStructuredAuthoringStream({
      originalMessages: request.messages,
      chatPersistence: request.chatPersistence,
      mode,
      persistence: request.persistence,
      projectId: request.projectId,
      requestId,
      workflow,
      stream: toAISdkStream(result, {
        from: "agent",
        version: "v6",
        sendStart: false,
        sendFinish: true,
      }),
    }),
    workflow,
    requestId,
  };
}
