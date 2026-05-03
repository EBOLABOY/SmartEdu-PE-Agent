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
} from "@/lib/competition-lesson-contract";
import {
  createHtmlArtifactPages,
  ensureCompleteHtmlDocument,
} from "@/lib/html-screen-editor";
import { buildCompetitionLessonDraft } from "@/lib/competition-lesson-draft";
import {
  STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
  type HtmlStructuredArtifactData,
  structuredArtifactDataSchema,
  type GenerationMode,
  type SmartEduUIMessage,
  type StructuredArtifactData,
  type UiHint,
  type WorkflowTraceData,
  type WorkflowTraceEntry,
} from "@/lib/lesson-authoring-contract";
import type { LessonAuthoringPersistence } from "@/lib/persistence/lesson-authoring-store";
import type { LessonWorkflowOutput } from "@/mastra/workflows/lesson_workflow";

import { enrichLessonPlanWithDiagramAssets } from "../skills/runtime/lesson_diagram_generation_skill";

const DRAFT_TRACE_UPDATE_INTERVAL = 20;
const TERMINAL_RUNNING_TRACE_STEPS = new Set([
  "agent-stream-started",
  "generate-lesson-diagrams",
  "stream-html-draft",
  "stream-lesson-draft",
  "validate-lesson-output",
]);
const MIN_READY_HTML_SLIDE_COUNT = 2;

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
    htmlPages?: HtmlStructuredArtifactData["htmlPages"];
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

    if (!options.htmlPages?.length) {
      throw new Error("HTML artifact 必须包含 htmlPages，当前结果已拒绝写入。");
    }

    return {
      protocolVersion: STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
      stage: "html",
      contentType: "html",
      content: options.content,
      htmlPages: options.htmlPages,
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

export function createStructuredArtifactData(
  workflow: LessonWorkflowOutput,
  options: {
    content: string;
    contentType?: StructuredArtifactData["contentType"];
    htmlPages?: HtmlStructuredArtifactData["htmlPages"];
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

function buildLessonJsonArtifactContent(structuredOutput: unknown) {
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

function shouldForwardAssistantText(mode: GenerationMode, workflow: LessonWorkflowOutput) {
  return (
    mode === "lesson" && workflow.generationPlan.assistantTextPolicy === "mirror-json-text"
  );
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

function readArtifactDataPart(part: UIMessageChunk): StructuredArtifactData | undefined {
  if (part.type !== "data-artifact") {
    return undefined;
  }

  const data = (part as { data?: unknown }).data;
  const parsed = structuredArtifactDataSchema.safeParse(data);

  return parsed.success ? parsed.data : undefined;
}

function buildHtmlDraftArtifact(
  workflow: LessonWorkflowOutput,
  rawHtml: string,
): StructuredArtifactData {
  const draftHtml = ensureCompleteHtmlDocument(rawHtml);

  return buildArtifactData(workflow, {
    content: rawHtml,
    contentType: "html",
    htmlPages: createHtmlArtifactPages(draftHtml),
    isComplete: false,
    status: "streaming",
  });
}

function createReadyHtmlPages(htmlContent: string) {
  return createHtmlArtifactPages(htmlContent, { allowSinglePageFallback: false });
}

function formatHtmlPageCountError(pageCount: number) {
  return `互动大屏必须拆分为至少 ${MIN_READY_HTML_SLIDE_COUNT} 个 <section class="slide"> 页面，当前仅识别到 ${pageCount} 个，已拒绝保存单页结果。`;
}

function countMatches(value: string, pattern: RegExp) {
  return Array.from(value.matchAll(pattern)).length;
}

function stripHtmlComments(value: string) {
  return value.replace(/<!--[\s\S]*?-->/g, "");
}

function hasCompleteHtmlDocumentShell(rawHtml: string) {
  return (
    /<!doctype\s+html\b/i.test(rawHtml) &&
    /<html\b[\s\S]*<\/html>\s*$/i.test(rawHtml) &&
    /<head\b[\s\S]*<\/head>/i.test(rawHtml) &&
    /<body\b[\s\S]*<\/body>/i.test(rawHtml)
  );
}

function findNestedSlidePageIndex(sectionHtml: string) {
  const nestedMatches = Array.from(sectionHtml.matchAll(/<section\b(?=[^>]*\bclass\s*=\s*(?:"[^"]*\bslide\b[^"]*"|'[^']*\bslide\b[^']*'))/gi));

  return nestedMatches.length > 1;
}

function validateReadyHtmlDocument(input: {
  htmlPages: HtmlStructuredArtifactData["htmlPages"];
  rawHtml: string;
}) {
  const html = stripHtmlComments(input.rawHtml.trim());
  const errors: string[] = [];

  if (!hasCompleteHtmlDocumentShell(html)) {
    errors.push("HTML 文档必须包含完整的 <!DOCTYPE html>、<html>、<head>、<body>、</body>、</html> 结构，当前结果疑似被截断。");
  }

  const slideStartCount = countMatches(
    html,
    /<section\b(?=[^>]*\bclass\s*=\s*(?:"[^"]*\bslide\b[^"]*"|'[^']*\bslide\b[^']*'))/gi,
  );
  const sectionEndCount = countMatches(html, /<\/section>/gi);

  if (slideStartCount !== input.htmlPages.length) {
    errors.push(`检测到 ${slideStartCount} 个 slide 起始标签，但只解析出 ${input.htmlPages.length} 个完整页面，请检查是否存在嵌套或未闭合的 <section>。`);
  }

  if (sectionEndCount < slideStartCount) {
    errors.push(`检测到 ${slideStartCount} 个 slide 起始标签，但只有 ${sectionEndCount} 个 </section> 结束标签，当前结果疑似未生成完成。`);
  }

  const nestedPageIndex = input.htmlPages.findIndex((page) => findNestedSlidePageIndex(page.sectionHtml));

  if (nestedPageIndex >= 0) {
    errors.push(`第 ${nestedPageIndex + 1} 页内部嵌套了另一个 class="slide" 的 section，请保持每页 slide 为同级兄弟节点。`);
  }

  return errors;
}

type ReadyHtmlArtifactValidationResult =
  | {
      artifact: StructuredArtifactData;
      ok: true;
    }
  | {
      errorText: string;
      ok: false;
    };

function validateAndCreateReadyHtmlArtifact(input: {
  completedHtml: string;
  rawHtml: string;
  workflow: LessonWorkflowOutput;
}): ReadyHtmlArtifactValidationResult {
  const htmlPages = createReadyHtmlPages(input.completedHtml);

  if (htmlPages.length < MIN_READY_HTML_SLIDE_COUNT) {
    return {
      ok: false,
      errorText: formatHtmlPageCountError(htmlPages.length),
    };
  }

  const validationErrors = validateReadyHtmlDocument({
    htmlPages,
    rawHtml: input.rawHtml,
  });

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
      htmlPages,
      isComplete: true,
      status: "ready",
    }),
  };
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
      let htmlDraftChunkCount = 0;
      let latestUpstreamHtmlArtifact: StructuredArtifactData | undefined;
      const forwardAssistantText = allowTextOnlyResponse || shouldForwardAssistantText(mode, workflow);
      const reader = stream.getReader();

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

          if (entry.step === "stream-html-draft") {
            pushOrReplaceTraceEntry(
              "stream-html-draft",
              "success",
              `互动大屏源码流已完成，共同步 ${htmlDraftChunkCount} 次源码更新。`,
            );
            continue;
          }

          if (entry.step === "validate-lesson-output") {
            pushOrReplaceTraceEntry(
              "validate-lesson-output",
              "success",
              "结构化课时计划已通过最终 schema 检查。",
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

      const forwardUiChunk = (part: UIMessageChunk) => {
        if (!shouldForwardUiChunk(part, { forwardAssistantText })) {
          return;
        }

        writer.write(part as InferUIMessageChunk<SmartEduUIMessage>);
      };

      let latestLessonDraft = buildCompetitionLessonDraft();

      const shouldWriteDraftTrace = () =>
        lessonDraftChunkCount <= 2 || lessonDraftChunkCount % DRAFT_TRACE_UPDATE_INTERVAL === 0;

      const shouldWriteHtmlDraftTrace = () =>
        htmlDraftChunkCount <= 2 || htmlDraftChunkCount % 10 === 0;

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
              "正在等待模型最终结构化输出，并执行课时计划 schema 检查。",
            );
            writeTrace("generation");
            trustedLessonOutput = await finalLessonPlanPromise;
          } catch (error) {
            writeStreamError(
              "validate-lesson-output",
              error instanceof Error ? error.message : "结构化课时计划检查失败。",
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
            "模型未返回合法的 CompetitionLessonPlan 结构化输出。",
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
          "结构化课时计划已通过最终 schema 检查。",
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
        if (latestUpstreamHtmlArtifact?.isComplete && latestUpstreamHtmlArtifact.status === "ready") {
          const completedHtml = ensureCompleteHtmlDocument(latestUpstreamHtmlArtifact.content);
          const readyArtifactResult = validateAndCreateReadyHtmlArtifact({
            completedHtml,
            rawHtml: latestUpstreamHtmlArtifact.content,
            workflow,
          });

          if (!readyArtifactResult.ok) {
            writeStreamError("validate-html-pages", readyArtifactResult.errorText);
            return false;
          }

          completeRunningTraceStep(
            "agent-stream-started",
            "互动大屏 HTML 模型生成流已结束。",
          );
          await persistArtifact({
            ...readyArtifactResult.artifact,
            title: latestUpstreamHtmlArtifact.title,
          });
          return true;
        }

        const trimmedRawText = rawText.trim();

        if (trimmedRawText) {
          const completedHtml = ensureCompleteHtmlDocument(trimmedRawText);
          const readyArtifactResult = validateAndCreateReadyHtmlArtifact({
            completedHtml,
            rawHtml: trimmedRawText,
            workflow,
          });

          if (!readyArtifactResult.ok) {
            writeStreamError("validate-html-pages", readyArtifactResult.errorText);
            return false;
          }

          completeRunningTraceStep(
            "agent-stream-started",
            "互动大屏 HTML 模型生成流已结束。",
          );
          writeArtifact(readyArtifactResult.artifact);
          await persistArtifact(readyArtifactResult.artifact);
          return true;
        }

        if (allowTextOnlyResponse && trimmedRawText) {
          return true;
        }

        writeStreamError(
          "extract-html-document",
          "当前 HTML 结果缺少可识别的 <section class=\"slide\"> 分页结构，已拒绝写入。",
        );
        return false;
      };

      const finalizeArtifact = async () => (mode === "lesson" ? finalizeLessonArtifact() : finalizeHtmlArtifact());

      const consumeLessonDraftStream = async () => {
        if (mode !== "lesson" || allowTextOnlyResponse) {
          return;
        }

        if (!lessonDraftStream) {
          pushOrReplaceTraceEntry(
            "stream-lesson-draft",
            "running",
            "正在生成课时计划结构，完成首个结构块后会同步右侧预览。",
          );
          writeTrace("generation");
          return;
        }

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

      startServerPipelineTrace();
      const lessonDraftTask = createLessonDraftTask();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          const part = value;
          const upstreamArtifact = mode === "html" ? readArtifactDataPart(part) : undefined;
          const isInvalidHtmlArtifactPart =
            mode === "html" &&
            part.type === "data-artifact" &&
            ((part as { data?: Partial<StructuredArtifactData> }).data?.contentType === "html") &&
            !upstreamArtifact;

          if (isInvalidHtmlArtifactPart) {
            writeStreamError(
              "invalid-html-artifact",
              "检测到缺少 htmlPages 的 HTML artifact，已拒绝继续使用。",
            );
            return;
          }

          // 保持上游工具事件、artifact 与 trace 的到达顺序，避免页级 HTML 反馈被最终状态压后。
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
                // 每 10 次 text-delta 发送一次更新，或在前几次立即更新，避免包过多影响性能
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
