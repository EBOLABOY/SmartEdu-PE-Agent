import { randomUUID } from "node:crypto";

import type { MastraModelOutput } from "@mastra/core/stream";
import {
  convertToModelMessages,
  createUIMessageStream,
  safeValidateUIMessages,
  type UIMessage,
  type UIMessageStreamWriter,
} from "ai";

import {
  DEFAULT_STANDARDS_MARKET,
  STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
  smartEduDataSchemas,
  type GenerationMode,
  type LessonAuthoringMemory,
  type PeTeacherContext,
  type SmartEduUIMessage,
  type StandardsMarket,
  type UiHint,
} from "@/lib/lesson/authoring-contract";
import type { LessonAuthoringPersistence } from "@/lib/persistence/lesson-authoring-store";
import type { LessonMemoryPersistence } from "@/lib/persistence/lesson-memory-store";
import type { ProjectChatPersistence } from "@/lib/persistence/project-chat-store";
import { mastra } from "@/mastra";
import { createMastraAgentUiMessageStream } from "@/mastra/ai_sdk_stream";
import { buildPeTeacherSystemPrompt } from "@/mastra/agents/pe_teacher";
import * as authoringSkills from "@/mastra/skills";
import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";
import {
  buildWorkflowTraceData,
  buildWorkflowTraceDataFromWorkflow,
  createLessonWorkflowTraceState,
  createWorkflowTraceEntry,
} from "./lesson_workflow_trace";

export type LessonAuthoringRequest = {
  messages: SmartEduUIMessage[];
  persistence?: LessonAuthoringPersistence | null;
  chatPersistence?: ProjectChatPersistence | null;
  memory?: LessonAuthoringMemory;
  memoryPersistence?: LessonMemoryPersistence | null;
  mastraStorageAdapter?: import("@/mastra/storage/mastra-storage-adapter").SupabaseMastraStorageAdapter | null;
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

function writeTracePart(
  writer: UIMessageStreamWriter<SmartEduUIMessage>,
  data: ReturnType<typeof buildWorkflowTraceData>,
) {
  writer.write({
    type: "data-trace",
    id: "lesson-authoring-trace",
    data,
  });
}

function writeWorkflowTracePart(input: {
  phase: "workflow" | "generation" | "completed" | "failed";
  requestId: string;
  workflow: LessonWorkflowOutput;
  writer: UIMessageStreamWriter<SmartEduUIMessage>;
}) {
  writeTracePart(
    input.writer,
    buildWorkflowTraceDataFromWorkflow(input.workflow, input.requestId, input.phase),
  );
}

function inferAgenticMode(input: {
  explicitMode: GenerationMode;
  query: string;
}) {
  if (input.explicitMode === "html") {
    return "html" as const;
  }

  return /互动大屏|大屏|投屏|html|页面|课件|幻灯|屏幕|展示页/i.test(input.query) ? ("html" as const) : ("lesson" as const);
}

function isPlainConversationQuery(query: string) {
  const normalized = query.trim().replace(/[！？!?,，。.\s]/g, "");

  if (!normalized) {
    return true;
  }

  if (/^(你好|您好|嗨|哈喽|hello|hi|在吗|早上好|下午好|晚上好|老师好)$/i.test(normalized)) {
    return true;
  }

  if (/^(谢谢|感谢|辛苦了|好的|好|ok|收到|明白|知道了)$/i.test(normalized)) {
    return true;
  }

  if (/^(你是谁|你是干什么的|你能做什么|你可以做什么|介绍一下你自己|介绍一下功能|有什么功能)$/i.test(normalized)) {
    return true;
  }

  if (/^(聊聊|随便聊聊|测试一下|试一下)$/i.test(normalized)) {
    return true;
  }

  return false;
}

function createSwitchTabUiHint(mode: GenerationMode): UiHint {
  return {
    action: "switch_tab",
    params: {
      tab: mode === "html" ? "canvas" : "lesson",
    },
  };
}

function createAgenticWorkflowContext(input: {
  mode: GenerationMode;
  query: string;
  request: LessonAuthoringRequest;
  requestId: string;
  system: string;
}): LessonWorkflowOutput {
  const market = input.request.market ?? DEFAULT_STANDARDS_MARKET;

  return {
    system: input.system,
    standardsContext: "课标检索由服务端生成管线在正式生成前执行。",
    standards: {
      requestedMarket: market,
      resolvedMarket: market,
      corpus: null,
      referenceCount: 0,
      references: [],
      warning: "正式生成前将由服务端主动检索课标并注入结构化生成提示。",
    },
    textbook: undefined,
    generationPlan: {
      mode: input.mode,
      confirmedLessonRequired: input.mode === "html",
      outputProtocol: input.mode === "html" ? "html-document" : "lesson-json",
      responseTransport: "structured-data-part",
      assistantTextPolicy: "mirror-json-text",
      maxSteps: 7,
      protocolVersion: STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
    },
    safety: {
      htmlSandboxRequired: input.mode === "html",
      externalNetworkAllowed: false,
      forbiddenCapabilities: [
        "读取 cookie/localStorage/sessionStorage",
        "发起 fetch/XHR/WebSocket/EventSource 网络请求",
        "引入外部脚本、样式、媒体或 CDN 资源",
        "提交表单或打开新窗口",
      ],
      warnings: [],
    },
    uiHints: [createSwitchTabUiHint(input.mode)],
    decision: {
      type: "generate",
      intentResult: {
        intent: input.mode === "html" ? "generate_html" : "generate_lesson",
        confidence: 1,
        reason: "服务端入口已根据对话上下文选择结构化生成目标；正式产物由服务端确定性管线交付。",
      },
    },
    trace: [
      createWorkflowTraceEntry(
        "authoring-entry",
        "success",
        `已进入体育课时创作入口，初始输出目标为 ${input.mode}。`,
      ),
    ],
  };
}

function createServerGenerationTraceEntry(mode: GenerationMode) {
  return createWorkflowTraceEntry(
    "server-deterministic-entry",
    "success",
    mode === "html"
      ? "已进入服务端 HTML 流式生成管线，正式 HTML 由服务端结构化提交。"
      : "已进入服务端课时计划结构化生成管线，正式课时计划由服务端结构化提交。",
  );
}

function writeAuthoringFailure(input: {
  error: unknown;
  mode: GenerationMode;
  query: string;
  requestId: string;
  requestedMarket: StandardsMarket;
  writer: UIMessageStreamWriter<SmartEduUIMessage>;
}) {
  const errorText = input.error instanceof Error ? input.error.message : "体育课时计划生成服务异常。";
  const state = createLessonWorkflowTraceState({
    query: input.query || "lesson authoring",
    mode: input.mode,
    market: input.requestedMarket,
  });

  state.trace = [
    createWorkflowTraceEntry("lesson-authoring-failed", "failed", errorText),
  ];

  writeTracePart(input.writer, buildWorkflowTraceData(state, input.requestId, "failed"));
  input.writer.write({ type: "error", errorText });
  input.writer.write({ type: "finish", finishReason: "error" });
}

function fallbackHistoryParts(content: string): SmartEduUIMessage["parts"] {
  return [{ type: "text", text: content }];
}

async function restorePersistedHistoryParts(message: {
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<SmartEduUIMessage["parts"]> {
  const serializedUiMessage = message.metadata?.uiMessage;

  if (!serializedUiMessage) {
    return fallbackHistoryParts(message.content);
  }

  let candidate: unknown = serializedUiMessage;

  if (typeof serializedUiMessage === "string") {
    try {
      candidate = JSON.parse(serializedUiMessage);
    } catch {
      return fallbackHistoryParts(message.content);
    }
  }

  const parsedMessage = await safeValidateUIMessages<SmartEduUIMessage>({
    messages: [candidate],
    dataSchemas: smartEduDataSchemas,
  });

  if (!parsedMessage.success) {
    return fallbackHistoryParts(message.content);
  }

  const filteredParts = parsedMessage.data[0]?.parts.filter(
    (part) => part.type !== "data-artifact" && part.type !== "data-trace",
  );

  return filteredParts?.length ? filteredParts : fallbackHistoryParts(message.content);
}

async function buildExecutionMessages(request: LessonAuthoringRequest): Promise<SmartEduUIMessage[]> {
  const incrementalMessages = request.messages;

  if (!request.projectId || !request.mastraStorageAdapter) {
    return incrementalMessages;
  }

  try {
    const history = await request.mastraStorageAdapter.listMessages({
      threadId: request.projectId,
      limit: 15,
    });

    if (history.length === 0) {
      return incrementalMessages;
    }

    // Sanitize: 剥离高 token 的结构化 data part，尽量保留原始非 data parts 作为历史上下文。
    const sanitizedHistory: SmartEduUIMessage[] = await Promise.all(
      history.map(async (msg) => ({
        id: msg.id,
        role: msg.role === "system" ? "system" : msg.role === "user" ? "user" : "assistant",
        content: msg.content,
        parts: await restorePersistedHistoryParts(msg),
      })),
    );

    // 去重合并：因为前端最后一条消息在 route.ts 中已被 upsert，可能包含在 history 里
    const historyIds = new Set(sanitizedHistory.map((m) => m.id));
    const newMessages = incrementalMessages.filter((m) => !historyIds.has(m.id));

    return [...sanitizedHistory, ...newMessages];
  } catch (error) {
    console.warn("[lesson-authoring] build-execution-messages-failed", {
      projectId: request.projectId,
      message: error instanceof Error ? error.message : "unknown-error",
    });
    return incrementalMessages;
  }
}

async function executeLessonAuthoringStream(input: {
  mode: GenerationMode;
  query: string;
  request: LessonAuthoringRequest;
  requestId: string;
  writer: UIMessageStreamWriter<SmartEduUIMessage>;
}) {
  const { mode, query, request, requestId, writer } = input;
  const executionMessages = await buildExecutionMessages(request);
  const agenticMode = inferAgenticMode({ explicitMode: mode, query });
  const shouldUseStructuredAdapter = !isPlainConversationQuery(query);
  let system = buildPeTeacherSystemPrompt(request.context, {
    lessonPlan: request.lessonPlan,
    mode: agenticMode,
    responseStage: agenticMode === "lesson" && shouldUseStructuredAdapter ? "generation" : "tool-use",
  });
  let workflow = createAgenticWorkflowContext({
    mode: agenticMode,
    query,
    request,
    requestId,
    system,
  });

  if (agenticMode === "lesson" && shouldUseStructuredAdapter) {
    workflow.trace.push(createServerGenerationTraceEntry("lesson"));
    workflow = authoringSkills.createServerStandardsPendingWorkflow(workflow);
    writeWorkflowTracePart({
      phase: "workflow",
      requestId,
      workflow,
      writer,
    });
    workflow = (await authoringSkills.resolveWorkflowWithServerStandards({
      market: request.market,
      query,
      workflow,
    })).workflow;
    workflow = authoringSkills.createServerTextbookPendingWorkflow(workflow);
    writeWorkflowTracePart({
      phase: "workflow",
      requestId,
      workflow,
      writer,
    });
    workflow = (await authoringSkills.resolveWorkflowWithServerTextbook({
      grade: request.context?.grade ?? request.context?.teachingGrade,
      market: request.market,
      query,
      stage: "小学",
      workflow,
    })).workflow;

    const generation = await authoringSkills.runLessonGenerationWithPostProcess({
      messages: executionMessages,
      requestId,
      workflow,
    });

    writer.merge(
      authoringSkills.createLessonStreamAdapter({
        finalLessonPlanPromise: generation.finalLessonPlanPromise,
        lessonDraftStream: generation.lessonDraftStream,
        originalMessages: executionMessages,
        persistence: request.persistence,
        projectId: request.projectId,
        requestId,
        workflow,
      }),
    );
    return;
  }

  if (agenticMode === "html" && shouldUseStructuredAdapter) {
    workflow.trace.push(createServerGenerationTraceEntry("html"));

    system = buildPeTeacherSystemPrompt(request.context, {
      lessonPlan: request.lessonPlan,
      mode: "html",
    });
    workflow = {
      ...workflow,
      system,
      trace: [
        ...workflow.trace,
        createWorkflowTraceEntry("html-screen-generation", "success", "已进入直接 HTML 流式生成管线。"),
      ],
    };
    const htmlStream = await authoringSkills.runServerHtmlGenerationSkill({
      lessonPlan: request.lessonPlan ?? "",
      messages: executionMessages,
      requestId,
      workflow,
    });

    writer.merge(
      authoringSkills.createUpstreamUiStreamAdapter({
        mode: "html",
        originalMessages: executionMessages,
        persistence: request.persistence,
        projectId: request.projectId,
        requestId,
        stream: htmlStream,
        workflow,
      }),
    );
    return;
  }

  const agent = mastra.getAgent("peTeacherAgent");
  const modelMessages = await convertToModelMessages(executionMessages);
  const agentResult = (await agent.stream(modelMessages, {
    system,
    maxSteps: workflow.generationPlan.maxSteps,
    providerOptions: {
      openai: {
        store: true,
      },
    },
  } as never)) as MastraModelOutput<unknown>;
  const generationStream = createMastraAgentUiMessageStream(agentResult, {
    sendStart: false,
    sendFinish: true,
  });

  if (!shouldUseStructuredAdapter) {
    writer.merge(generationStream as ReadableStream<never>);
    return;
  }

  writer.merge(
    authoringSkills.createUpstreamUiStreamAdapter({
      allowTextOnlyResponse: true,
      mode: workflow.generationPlan.mode,
      originalMessages: executionMessages,
      persistence: request.persistence,
      projectId: request.projectId,
      requestId,
      stream: generationStream,
      workflow,
    }),
  );
}

export function streamLessonAuthoring(request: LessonAuthoringRequest) {
  const mode = request.mode === "html" ? "html" : "lesson";
  const query = getLatestUserText(request.messages);
  const requestId = randomUUID();

  return {
    stream: createUIMessageStream<SmartEduUIMessage>({
      onFinish: async ({ responseMessage }) => {
        if (!request.chatPersistence || !request.projectId) {
          return;
        }

        try {
          await request.chatPersistence.saveMessages({
            projectId: request.projectId,
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
        writer.write({ type: "start" });

        try {
          await executeLessonAuthoringStream({
            mode,
            query,
            request,
            requestId,
            writer,
          });
        } catch (error) {
          writeAuthoringFailure({
            error,
            mode,
            query,
            requestId,
            requestedMarket: request.market ?? DEFAULT_STANDARDS_MARKET,
            writer,
          });
        }
      },
    }),
    requestId,
  };
}
