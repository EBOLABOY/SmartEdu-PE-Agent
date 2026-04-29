import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

import {
  artifactViewSchema,
  DEFAULT_STANDARDS_MARKET,
  STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
  generationModeSchema,
  lessonAuthoringMemorySchema,
  lessonIntakeResultSchema,
  lessonScreenPlanSchema,
  peTeacherContextSchema,
  standardsMarketSchema,
  uiHintSchema,
  workflowTraceEntrySchema,
  workflowStandardsReferenceSchema,
  type ArtifactView,
  type GenerationMode,
  type LessonAuthoringMemory,
  type LessonScreenPlan,
  type PeTeacherContext,
  type SmartEduUIMessage,
  type UiHint,
} from "@/lib/lesson-authoring-contract";

import { buildPeTeacherSystemPrompt } from "../agents/pe_teacher";
import {
  formatLessonIntakeQuestions,
  formatLessonIntakeResultForPrompt,
} from "../agents/lesson_intake";
import {
  runLessonIntakeSkill,
  type LessonIntakeSkillResult,
} from "../skills/lesson_intake_skill";
import {
  lessonIntentSchema,
  runLessonIntentSkill,
  type LessonIntent,
} from "../skills/lesson_intent_skill";
import {
  runStandardsRetrievalSkill,
} from "../skills/standards_retrieval_skill";
import {
  resolveStandardsMarketMetadata,
} from "../tools/search_standards";

const MAX_WORKFLOW_AGENT_STEPS = 3;
const LOW_CONFIDENCE_INTENT_THRESHOLD = 0.7;

const lessonIntakeSkillResultSchema = z
  .object({
    intake: lessonIntakeResultSchema,
    memoryUsed: z.boolean().optional(),
    modelMessageCount: z.number().int().nonnegative(),
    source: z.enum(["agent", "safe-fallback"]),
    warning: z.string().optional(),
  })
  .strict();

export const lessonWorkflowInputSchema = z.object({
  query: z.string().trim().min(1),
  mode: generationModeSchema,
  context: peTeacherContextSchema.optional(),
  market: standardsMarketSchema.default(DEFAULT_STANDARDS_MARKET),
  lessonPlan: z.string().optional(),
  screenPlan: lessonScreenPlanSchema.optional(),
  messages: z.array(z.unknown()).max(60).default([]),
  memory: lessonAuthoringMemorySchema.optional(),
  requestId: z.string().trim().min(1).optional(),
});

export const lessonWorkflowDecisionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("clarify"),
      text: z.string().trim().min(1),
      intentResult: lessonIntentSchema,
      intakeResult: lessonIntakeSkillResultSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("respond"),
      text: z.string().trim().min(1),
      intentResult: lessonIntentSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("generate"),
      intentResult: lessonIntentSchema,
      intakeResult: lessonIntakeSkillResultSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("patch"),
      intentResult: lessonIntentSchema,
    })
    .strict(),
]);

export const lessonWorkflowOutputSchema = z.object({
  system: z.string(),
  standardsContext: z.string(),
  standards: z.object({
    requestedMarket: standardsMarketSchema,
    resolvedMarket: standardsMarketSchema,
    corpusId: z.string(),
    displayName: z.string(),
    officialStatus: z.string(),
    sourceName: z.string(),
    issuer: z.string(),
    version: z.string(),
    url: z.string().url(),
    availability: z.enum(["ready", "planned"]),
    referenceCount: z.number(),
    references: z.array(workflowStandardsReferenceSchema).optional(),
    warning: z.string().optional(),
  }),
  generationPlan: z.object({
    mode: generationModeSchema,
    confirmedLessonRequired: z.boolean(),
    outputProtocol: z.enum(["lesson-json", "html-document"]),
    responseTransport: z.literal("structured-data-part"),
    assistantTextPolicy: z.enum(["mirror-json-text", "suppress-json-text", "suppress-html-text"]),
    maxSteps: z.number(),
    protocolVersion: z.literal(STRUCTURED_ARTIFACT_PROTOCOL_VERSION),
  }),
  safety: z.object({
    htmlSandboxRequired: z.boolean(),
    externalNetworkAllowed: z.boolean(),
    forbiddenCapabilities: z.array(z.string()),
    warnings: z.array(z.string()),
  }),
  uiHints: z.array(uiHintSchema).default([]),
  decision: lessonWorkflowDecisionSchema,
  trace: z.array(workflowTraceEntrySchema),
});

export type LessonWorkflowInput = Omit<z.infer<typeof lessonWorkflowInputSchema>, "messages" | "memory"> & {
  context?: PeTeacherContext;
  memory?: LessonAuthoringMemory;
  messages?: SmartEduUIMessage[];
  mode: GenerationMode;
  screenPlan?: LessonScreenPlan;
};

export type LessonWorkflowDecision = z.infer<typeof lessonWorkflowDecisionSchema>;
export type LessonWorkflowOutput = z.infer<typeof lessonWorkflowOutputSchema>;

type LessonIntakeRunner = typeof runLessonIntakeSkill;
type LessonIntentRunner = typeof runLessonIntentSkill;

const intentClassificationOutputSchema = lessonWorkflowInputSchema.extend({
  intentResult: lessonIntentSchema,
  trace: lessonWorkflowOutputSchema.shape.trace,
});

const intakeCollectionOutputSchema = intentClassificationOutputSchema.extend({
  intakeResult: lessonIntakeSkillResultSchema.optional(),
});

const promptConstructionOutputSchema = intakeCollectionOutputSchema.extend({
  standardsContext: z.string(),
  standards: lessonWorkflowOutputSchema.shape.standards,
  system: z.string(),
});

const deliveryPlanningOutputSchema = promptConstructionOutputSchema.extend({
  generationPlan: lessonWorkflowOutputSchema.shape.generationPlan,
});

const workflowBranchOutputSchema = z
  .object({
    "prepare-intent-clarification-response": lessonWorkflowOutputSchema.optional(),
    "prepare-patch-response": lessonWorkflowOutputSchema.optional(),
    "prepare-standards-consultation-response": lessonWorkflowOutputSchema.optional(),
    "prepare-clarification-response": lessonWorkflowOutputSchema.optional(),
    "prepare-generation-response": lessonWorkflowOutputSchema.optional(),
  })
  .strict();

function nowIsoString() {
  return new Date().toISOString();
}

function createTraceEntry(
  step: string,
  status: z.infer<typeof workflowTraceEntrySchema>["status"],
  detail: string,
) {
  return {
    step,
    status,
    detail,
    timestamp: nowIsoString(),
  };
}

function createGenerationPlan(mode: GenerationMode) {
  return {
    mode,
    confirmedLessonRequired: mode === "html",
    outputProtocol: mode === "html" ? ("html-document" as const) : ("lesson-json" as const),
    responseTransport: "structured-data-part" as const,
    assistantTextPolicy: mode === "html" ? ("suppress-html-text" as const) : ("suppress-json-text" as const),
    maxSteps: MAX_WORKFLOW_AGENT_STEPS,
    protocolVersion: STRUCTURED_ARTIFACT_PROTOCOL_VERSION,
  };
}

function createSafety(mode: GenerationMode, warnings: string[]) {
  return {
    htmlSandboxRequired: mode === "html",
    externalNetworkAllowed: false,
    forbiddenCapabilities: [
      "读取 cookie/localStorage/sessionStorage",
      "发起 fetch/XHR/WebSocket/EventSource 网络请求",
      "引入外部脚本、样式、媒体或 CDN 资源",
      "提交表单或打开新窗口",
    ],
    warnings,
  };
}

function createSwitchTabUiHint(tab: ArtifactView): UiHint {
  return {
    action: "switch_tab",
    params: {
      tab: artifactViewSchema.parse(tab),
    },
  };
}

function createGenerationUiHints(mode: GenerationMode): UiHint[] {
  return [createSwitchTabUiHint(mode === "html" ? "canvas" : "lesson")];
}

function getIntentDisplayLabel(intent: LessonIntent["intent"]) {
  switch (intent) {
    case "generate_lesson":
      return "生成新课时计划";
    case "patch_lesson":
      return "修改现有课时计划";
    case "generate_html":
      return "生成互动大屏";
    case "consult_standards":
      return "咨询课标与合规依据";
    case "clarify":
    default:
      return "继续澄清任务方向";
  }
}

function createLowConfidenceIntentUiHints(intentResult: LessonIntent): UiHint[] {
  if (intentResult.confidence >= LOW_CONFIDENCE_INTENT_THRESHOLD) {
    return [];
  }

  return [
    {
      action: "show_toast",
      params: {
        level: "info",
        title: "我对本轮意图的理解还不够确定",
        description: `当前先按“${getIntentDisplayLabel(intentResult.intent)}”处理；如果理解有误，请直接纠正我。`,
      },
    },
  ];
}

function mergeUiHints(...collections: UiHint[][]) {
  return collections.flat();
}

function getWorkflowRequestId(inputData: z.infer<typeof lessonWorkflowInputSchema>, runId: string) {
  return inputData.requestId ?? runId;
}

function getWorkflowMessages(inputData: z.infer<typeof lessonWorkflowInputSchema>) {
  if (inputData.messages.length > 0) {
    return inputData.messages as SmartEduUIMessage[];
  }

  return [
    {
      id: "workflow-query",
      role: "user",
      parts: [{ type: "text", text: inputData.query }],
    },
  ] as SmartEduUIMessage[];
}

function resolveGenerationMode(inputData: {
  intentResult?: LessonIntent;
  mode: GenerationMode;
}) {
  if (inputData.mode === "html" || inputData.intentResult?.intent === "generate_html") {
    return "html" as const;
  }

  return "lesson" as const;
}

function buildDeferredStandardsWorkflowFields(
  inputData: Pick<z.infer<typeof lessonWorkflowInputSchema>, "market">,
) {
  const resolved = resolveStandardsMarketMetadata(inputData.market);
  const deferredWarning = "课程标准检索已交给 peTeacherAgent 的 searchStandardsTool 按需执行；工作流不再预取课标片段。";
  const warning = [resolved.warning, deferredWarning].filter(Boolean).join(" ");

  return {
    standardsContext: "未预取课标片段。生成 Agent 可在需要课标依据时调用 searchStandardsTool。",
    standards: {
      requestedMarket: resolved.requestedMarket,
      resolvedMarket: resolved.resolvedMarket,
      corpusId: resolved.corpus.corpusId,
      displayName: resolved.corpus.displayName,
      officialStatus: resolved.corpus.officialStatus,
      sourceName: resolved.corpus.sourceName,
      issuer: resolved.corpus.issuer,
      version: resolved.corpus.version,
      url: resolved.corpus.url,
      availability: resolved.corpus.availability,
      referenceCount: 0,
      references: [],
      warning,
    },
    trace: [
      createTraceEntry(
        "delegate-standards-tooling",
        "success",
        `目标市场 ${resolved.requestedMarket} 已解析为 ${resolved.resolvedMarket}，课标检索将由 searchStandardsTool 按需执行。`,
      ),
      ...(resolved.warning
        ? [
            createTraceEntry(
              "resolve-standards-market",
              "blocked",
              resolved.warning,
            ),
          ]
        : []),
    ],
  };
}

async function buildResolvedStandardsWorkflowFields(inputData: {
  market: z.infer<typeof lessonWorkflowInputSchema>["market"];
  query: string;
}) {
  const standardsResult = await runStandardsRetrievalSkill({
    query: inputData.query,
    market: inputData.market,
  });

  return {
    standardsContext: standardsResult.context,
    standards: {
      requestedMarket: standardsResult.requestedMarket,
      resolvedMarket: standardsResult.resolvedMarket,
      corpusId: standardsResult.corpus.corpusId,
      displayName: standardsResult.corpus.displayName,
      officialStatus: standardsResult.corpus.officialStatus,
      sourceName: standardsResult.corpus.sourceName,
      issuer: standardsResult.corpus.issuer,
      version: standardsResult.corpus.version,
      url: standardsResult.corpus.url,
      availability: standardsResult.corpus.availability,
      referenceCount: standardsResult.references.length,
      references: standardsResult.references.map((reference) => ({
        id: reference.id,
        title: reference.title,
        summary: reference.summary,
        citation: reference.citation,
        module: reference.module,
        gradeBands: reference.gradeBands,
        sectionPath: reference.sectionPath,
        score: reference.score,
      })),
      warning: standardsResult.warning,
    },
    trace: [
      createTraceEntry(
        "consult-standards-context",
        "success",
        `已检索 ${standardsResult.references.length} 条课标条目，供直接咨询答复使用。`,
      ),
      ...(standardsResult.warning
        ? [createTraceEntry("resolve-standards-market", "blocked", standardsResult.warning)]
        : []),
    ],
  };
}

function buildIntentClarificationText(intentResult: LessonIntent) {
  return [
    "我还不能直接执行当前请求。",
    "请明确你是要：",
    "1. 生成一份新的体育课时计划；",
    "2. 修改当前已确认课时计划；",
    "3. 生成互动大屏；",
    "4. 咨询课标、安全或评价依据。",
    `当前判断依据：${intentResult.reason}`,
  ].join("\n");
}

function buildPatchRequiresLessonText() {
  return "要修改现有课时计划，请先提供一份已确认的结构化课时计划，再说明你想调整的部分。";
}

function buildStandardsConsultationText(standardsContext: string) {
  return [
    "以下是与当前问题最相关的课标与教学依据：",
    standardsContext,
    "",
    "如果你愿意，我可以继续基于这些依据生成课时计划，或对现有课时计划做合规性核对。",
  ].join("\n");
}

function buildIntakePromptParts(intakeResult?: LessonIntakeSkillResult) {
  if (!intakeResult?.intake.readyToGenerate) {
    return [];
  }

  return [
    "课时计划生成 Agent 启动前的信息收集结果：",
    "你必须严格基于下列已确认信息生成课时计划；不得补写与其冲突的年级、课题、人数、课时、场地或器材。未确认学生人数时按 40 人生成；未确认课时、场地和器材时，根据课程内容、教学环节和安全要求自动匹配。",
    formatLessonIntakeResultForPrompt(intakeResult.intake),
  ];
}

function buildWorkflowWarnings(inputData: {
  intakeResult?: LessonIntakeSkillResult;
  standards: LessonWorkflowOutput["standards"];
}) {
  const standardsRetrievalDeferred = inputData.standards.warning?.includes("searchStandardsTool") === true;

  return [
    ...(inputData.standards.warning ? [inputData.standards.warning] : []),
    ...(inputData.intakeResult?.warning ? [inputData.intakeResult.warning] : []),
    ...(inputData.standards.referenceCount === 0 && !standardsRetrievalDeferred
      ? ["未命中目标市场课标结构化条目，生成内容需以正式现行课标文本为准。"]
      : []),
  ];
}

function createClassifyIntentStep(runLessonIntent: LessonIntentRunner) {
  return createStep({
    id: "classify-intent",
    description: "识别当前请求是生成课时计划、修改课时计划、生成互动大屏、咨询课标，还是需要先澄清。",
    inputSchema: lessonWorkflowInputSchema,
    outputSchema: intentClassificationOutputSchema,
    execute: async ({ inputData, runId }) => {
      const intentResult = await runLessonIntent({
        lessonPlan: inputData.lessonPlan,
        messages: getWorkflowMessages(inputData),
        mode: inputData.mode,
        query: inputData.query,
        requestId: getWorkflowRequestId(inputData, runId),
      });

      return {
        ...inputData,
        intentResult,
        trace: [
          createTraceEntry(
            "classify-intent",
            "success",
            `已识别当前请求意图为 ${intentResult.intent}，置信度 ${intentResult.confidence.toFixed(2)}。${intentResult.reason}`,
          ),
        ],
      };
    },
  });
}

function createCollectLessonRequirementsStep(runLessonIntake: LessonIntakeRunner) {
  return createStep({
    id: "collect-lesson-requirements",
    description: "在正式生成体育课时计划前核对年级、课题等必要信息，并决定追问或继续生成。",
    inputSchema: intentClassificationOutputSchema,
    outputSchema: intakeCollectionOutputSchema,
    execute: async ({ inputData, runId }) => {
      if (inputData.intentResult.intent !== "generate_lesson") {
        return {
          ...inputData,
          intakeResult: undefined,
        };
      }

      const intakeResult = await runLessonIntake({
        context: inputData.context,
        maxSteps: MAX_WORKFLOW_AGENT_STEPS,
        memory: inputData.memory,
        messages: getWorkflowMessages(inputData),
        requestId: getWorkflowRequestId(inputData, runId),
      });
      const memoryDetail = intakeResult.memoryUsed ? " 已使用项目教学记忆减少追问。" : "";

      return {
        ...inputData,
        intakeResult,
        trace: [
          createTraceEntry(
            "collect-lesson-requirements",
            intakeResult.intake.readyToGenerate ? "success" : "blocked",
            intakeResult.intake.readyToGenerate
              ? `信息收集 Agent 已确认可以生成课时计划：${intakeResult.intake.reason}${memoryDetail}`
              : `信息收集 Agent 已阻止随机生成：${intakeResult.intake.reason}${memoryDetail}`,
          ),
        ],
      };
    },
  });
}

const prepareClarificationResponseStep = createStep({
  id: "prepare-clarification-response",
  description: "将信息收集结果转换为面向教师的必要追问，并保持结构化 trace 输出。",
  inputSchema: intakeCollectionOutputSchema,
  outputSchema: lessonWorkflowOutputSchema,
  execute: async ({ inputData }) => {
    if (!inputData.intakeResult) {
      throw new Error("缺少课时计划信息收集结果，无法生成追问。");
    }

    const standards = buildDeferredStandardsWorkflowFields(inputData);
    const warnings = buildWorkflowWarnings({
      intakeResult: inputData.intakeResult,
      standards: standards.standards,
    });

    return {
      system: "",
      standardsContext: standards.standardsContext,
      standards: standards.standards,
      generationPlan: createGenerationPlan(resolveGenerationMode(inputData)),
      safety: createSafety(resolveGenerationMode(inputData), warnings),
      uiHints: createLowConfidenceIntentUiHints(inputData.intentResult),
      decision: {
        type: "clarify" as const,
        intentResult: inputData.intentResult,
        text: formatLessonIntakeQuestions(inputData.intakeResult.intake),
        intakeResult: inputData.intakeResult,
      },
      trace: [
        ...inputData.trace,
        ...standards.trace,
        createTraceEntry(
          "prepare-clarification-response",
          "blocked",
          "信息不足，工作流已停止正式课时计划生成并返回必要追问。",
        ),
      ],
    };
  },
});

const prepareIntentClarificationResponseStep = createStep({
  id: "prepare-intent-clarification-response",
  description: "当入口意图仍不明确时，返回任务方向澄清信息。",
  inputSchema: intakeCollectionOutputSchema,
  outputSchema: lessonWorkflowOutputSchema,
  execute: async ({ inputData }) => {
    const standards = buildDeferredStandardsWorkflowFields(inputData);
    const resolvedMode = resolveGenerationMode(inputData);
    const warnings = buildWorkflowWarnings({
      standards: standards.standards,
    });

    return {
      system: "",
      standardsContext: standards.standardsContext,
      standards: standards.standards,
      generationPlan: createGenerationPlan(resolvedMode),
      safety: createSafety(resolvedMode, warnings),
      uiHints: createLowConfidenceIntentUiHints(inputData.intentResult),
      decision: {
        type: "clarify" as const,
        intentResult: inputData.intentResult,
        text: buildIntentClarificationText(inputData.intentResult),
      },
      trace: [
        ...inputData.trace,
        ...standards.trace,
        createTraceEntry(
          "prepare-intent-clarification-response",
          "blocked",
          "入口意图不够明确，工作流已返回任务方向澄清提示。",
        ),
      ],
    };
  },
});

const prepareStandardsConsultationResponseStep = createStep({
  id: "prepare-standards-consultation-response",
  description: "直接检索课标并返回咨询结果，跳过正式生成链路。",
  inputSchema: intakeCollectionOutputSchema,
  outputSchema: lessonWorkflowOutputSchema,
  execute: async ({ inputData }) => {
    const standards = await buildResolvedStandardsWorkflowFields(inputData);
    const warnings = buildWorkflowWarnings({
      standards: standards.standards,
    });

    return {
      system: "",
      standardsContext: standards.standardsContext,
      standards: standards.standards,
      generationPlan: createGenerationPlan("lesson"),
      safety: createSafety("lesson", warnings),
      uiHints: createLowConfidenceIntentUiHints(inputData.intentResult),
      decision: {
        type: "respond" as const,
        intentResult: inputData.intentResult,
        text: buildStandardsConsultationText(standards.standardsContext),
      },
      trace: [
        ...inputData.trace,
        ...standards.trace,
        createTraceEntry(
          "prepare-standards-consultation-response",
          "success",
          "已完成课标检索，并直接返回咨询结果。",
        ),
      ],
    };
  },
});

const preparePatchResponseStep = createStep({
  id: "prepare-patch-response",
  description: "识别为已确认课时计划修改请求后，跳过 intake 并转入结构化补丁链路。",
  inputSchema: intakeCollectionOutputSchema,
  outputSchema: lessonWorkflowOutputSchema,
  execute: async ({ inputData }) => {
    const standards = buildDeferredStandardsWorkflowFields(inputData);
    const warnings = buildWorkflowWarnings({
      standards: standards.standards,
    });

    if (!inputData.lessonPlan?.trim()) {
      return {
        system: "",
        standardsContext: standards.standardsContext,
        standards: standards.standards,
        generationPlan: createGenerationPlan("lesson"),
        safety: createSafety("lesson", warnings),
        uiHints: createLowConfidenceIntentUiHints(inputData.intentResult),
        decision: {
          type: "clarify" as const,
          intentResult: inputData.intentResult,
          text: buildPatchRequiresLessonText(),
        },
        trace: [
          ...inputData.trace,
          ...standards.trace,
          createTraceEntry(
            "prepare-patch-response",
            "blocked",
            "识别到课时计划修改意图，但当前请求未携带已确认课时计划，已改为返回补充提示。",
          ),
        ],
      };
    }

    return {
      system: "",
      standardsContext: standards.standardsContext,
      standards: standards.standards,
      generationPlan: createGenerationPlan("lesson"),
      safety: createSafety("lesson", warnings),
      uiHints: mergeUiHints(
        createGenerationUiHints("lesson"),
        createLowConfidenceIntentUiHints(inputData.intentResult),
      ),
      decision: {
        type: "patch" as const,
        intentResult: inputData.intentResult,
      },
      trace: [
        ...inputData.trace,
        ...standards.trace,
        createTraceEntry(
          "prepare-patch-response",
          "success",
          "已识别为现有课时计划局部修改请求，跳过 intake 并转入结构化补丁链路。",
        ),
      ],
    };
  },
});

const constructPromptStep = createStep({
  id: "construct-generation-prompt",
  description: "根据生成阶段、课堂上下文、信息收集结果与课标解析结果构造 Agent 系统提示词。",
  inputSchema: intakeCollectionOutputSchema,
  outputSchema: promptConstructionOutputSchema,
  execute: async ({ inputData }) => {
    const standards = buildDeferredStandardsWorkflowFields(inputData);
    const resolvedMode = resolveGenerationMode(inputData);
    const system = [
      buildPeTeacherSystemPrompt(inputData.context, {
        mode: resolvedMode,
        lessonPlan: inputData.lessonPlan,
        screenPlan: inputData.screenPlan,
      }),
      ...buildIntakePromptParts(inputData.intakeResult),
      "课程标准检索策略：searchStandardsTool 已挂载给当前 Agent。生成新课时计划或需要核对课标依据时调用该工具；只做局部改写且用户未要求课标核对时，可以跳过工具。",
      `\n目标市场：${standards.standards.resolvedMarket}`,
      `可用课标语料：${standards.standards.displayName}`,
      `官方状态：${standards.standards.officialStatus}`,
    ].join("\n\n");

    return {
      ...inputData,
      ...standards,
      system,
      trace: [
        ...inputData.trace,
        ...standards.trace,
        createTraceEntry(
          "construct-generation-prompt",
          "success",
          `已构造 ${resolvedMode} 阶段系统提示词，并把课标检索决策交给 Agent 工具。`,
        ),
      ],
    };
  },
});

const planDeliveryStep = createStep({
  id: "plan-structured-delivery",
  description: "规划结构化 Artifact 推流策略、文本可见性与协议版本。",
  inputSchema: promptConstructionOutputSchema,
  outputSchema: deliveryPlanningOutputSchema,
  execute: async ({ inputData }) => {
    const resolvedMode = resolveGenerationMode(inputData);
    return {
      ...inputData,
      generationPlan: createGenerationPlan(resolvedMode),
      trace: [
        ...inputData.trace,
        createTraceEntry(
          "plan-structured-delivery",
          "success",
          resolvedMode === "html"
            ? "已规划 HTML 结构化 Artifact 推流，并抑制原始 HTML 文本进入会话历史。"
            : "已规划 CompetitionLessonPlan JSON 实时推流，并抑制原始 JSON 文本进入会话历史。",
        ),
      ],
    };
  },
});

const validateSafetyStep = createStep({
  id: "validate-generation-safety",
  description: "校验分阶段生成前置条件，并注入结构化渲染与 HTML 沙箱安全策略。",
  inputSchema: deliveryPlanningOutputSchema,
  outputSchema: lessonWorkflowOutputSchema,
  execute: async ({ inputData }) => {
    const resolvedMode = inputData.generationPlan.mode;

    if (resolvedMode === "html" && !inputData.lessonPlan?.trim()) {
      throw new Error("生成互动大屏前必须提供已确认课时计划。请先完成课时计划确认，再进入 HTML 生成阶段。");
    }

    return {
      system: inputData.system,
      standardsContext: inputData.standardsContext,
      standards: inputData.standards,
      generationPlan: inputData.generationPlan,
      safety: createSafety(
        resolvedMode,
        buildWorkflowWarnings({
          intakeResult: inputData.intakeResult,
          standards: inputData.standards,
        }),
      ),
      uiHints: mergeUiHints(
        createGenerationUiHints(resolvedMode),
        createLowConfidenceIntentUiHints(inputData.intentResult),
      ),
      decision: {
        type: "generate" as const,
        intentResult: inputData.intentResult,
        ...(inputData.intakeResult ? { intakeResult: inputData.intakeResult } : {}),
      },
      trace: [
        ...inputData.trace,
        createTraceEntry(
          "validate-generation-safety",
          "success",
          resolvedMode === "html"
            ? "已通过 HTML 结构化推流前置校验，并要求前端沙箱渲染。"
            : "已通过 CompetitionLessonPlan JSON 结构化推流前置校验。",
        ),
      ],
    };
  },
});

const mergeWorkflowBranchStep = createStep({
  id: "merge-workflow-branch-output",
  description: "归一化追问分支和生成分支的工作流输出。",
  inputSchema: workflowBranchOutputSchema,
  outputSchema: lessonWorkflowOutputSchema,
  execute: async ({ inputData }) => {
    const output =
      inputData["prepare-intent-clarification-response"] ??
      inputData["prepare-standards-consultation-response"] ??
      inputData["prepare-patch-response"] ??
      inputData["prepare-clarification-response"] ??
      inputData["prepare-generation-response"];

    if (!output) {
      throw new Error("课时计划工作流没有命中可执行分支。");
    }

    return output;
  },
});

export function createLessonAuthoringWorkflow(
  options: {
    runLessonIntent?: LessonIntentRunner;
    runLessonIntake?: LessonIntakeRunner;
  } = {},
) {
  const classifyIntentStep = createClassifyIntentStep(
    options.runLessonIntent ?? runLessonIntentSkill,
  );
  const collectLessonRequirementsStep = createCollectLessonRequirementsStep(
    options.runLessonIntake ?? runLessonIntakeSkill,
  );
  const prepareGenerationWorkflow = createWorkflow({
    id: "prepare-generation-response",
    description: "准备正式 lesson/html 生成所需的课标、提示词、结构化推流计划和安全校验。",
    inputSchema: intakeCollectionOutputSchema,
    outputSchema: lessonWorkflowOutputSchema,
  })
    .then(constructPromptStep)
    .then(planDeliveryStep)
    .then(validateSafetyStep)
    .commit();

  return createWorkflow({
    id: "lesson-authoring-workflow",
    description: "编排入口意图识别、信息收集、追问分支、课标咨询、补丁分发、提示词构建与结构化推流安全校验。",
    inputSchema: lessonWorkflowInputSchema,
    outputSchema: lessonWorkflowOutputSchema,
  })
    .then(classifyIntentStep)
    .then(collectLessonRequirementsStep)
    .branch([
      [
        async ({ inputData }) => inputData.intentResult.intent === "clarify",
        prepareIntentClarificationResponseStep,
      ],
      [
        async ({ inputData }) => inputData.intentResult.intent === "consult_standards",
        prepareStandardsConsultationResponseStep,
      ],
      [
        async ({ inputData }) => inputData.intentResult.intent === "patch_lesson",
        preparePatchResponseStep,
      ],
      [
        async ({ inputData }) =>
          inputData.intentResult.intent === "generate_lesson" &&
          inputData.intakeResult?.intake.readyToGenerate === false,
        prepareClarificationResponseStep,
      ],
      [
        async ({ inputData }) =>
          inputData.intentResult.intent === "generate_html" ||
          (inputData.intentResult.intent === "generate_lesson" &&
            inputData.intakeResult?.intake.readyToGenerate === true),
        prepareGenerationWorkflow,
      ],
    ])
    .then(mergeWorkflowBranchStep)
    .commit();
}

export const lessonAuthoringWorkflow = createLessonAuthoringWorkflow();
