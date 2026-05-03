import { isDataUIPart, type UIMessage } from "ai";

import {
  structuredArtifactDataSchema,
} from "@/lib/lesson-authoring-contract";
import type {
  ArtifactContentType,
  GenerationMode,
  HtmlStructuredArtifactData,
  SmartEduUIMessage,
  StructuredArtifactData,
  WorkflowTraceData,
} from "@/lib/lesson-authoring-contract";
import {
  competitionLessonPlanSchema,
  type CompetitionLessonPlan,
} from "@/lib/competition-lesson-contract";

export type ExtractedArtifact = {
  stage?: GenerationMode;
  lessonContent: string;
  html: string;
  htmlComplete: boolean;
  htmlPages?: HtmlStructuredArtifactData["htmlPages"];
  source: "structured" | "none";
  status?: StructuredArtifactData["status"];
  title?: string;
  warningText?: string;
  protocolVersion?: string;
  artifact?: StructuredArtifactData;
  lessonPlan?: CompetitionLessonPlan;
  trace?: WorkflowTraceData;
};

const EMPTY_EXTRACTED_ARTIFACT: ExtractedArtifact = {
  lessonContent: "",
  html: "",
  htmlComplete: false,
  source: "none",
};

export function lessonContentToPlan(
  content: string,
  contentType: ArtifactContentType,
): CompetitionLessonPlan | undefined {
  try {
    return contentType === "lesson-json"
      ? competitionLessonPlanSchema.parse(JSON.parse(content))
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizeLessonArtifactContent(content: string) {
  return content;
}

export function getMessageText(message: Pick<UIMessage, "parts">) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export function getMessageReasoningText(message: Pick<UIMessage, "parts">) {
  return message.parts
    .filter((part): part is Extract<SmartEduUIMessage["parts"][number], { type: "reasoning" }> =>
      part.type === "reasoning",
    )
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

function isSmartEduArtifactDataPart(
  part: UIMessage["parts"][number],
): part is Extract<SmartEduUIMessage["parts"][number], { type: "data-artifact" }> {
  return isDataUIPart(part) && part.type === "data-artifact";
}

function isSmartEduTraceDataPart(
  part: UIMessage["parts"][number],
): part is Extract<SmartEduUIMessage["parts"][number], { type: "data-trace" }> {
  return isDataUIPart(part) && part.type === "data-trace";
}

export function getStructuredArtifactPart(message: UIMessage): StructuredArtifactData | undefined {
  const artifactParts = message.parts.filter(
    isSmartEduArtifactDataPart,
  );

  const candidate = artifactParts.at(-1)?.data;
  const parsed = structuredArtifactDataSchema.safeParse(candidate);

  return parsed.success ? parsed.data : undefined;
}

export function getStructuredTracePart(message: UIMessage): WorkflowTraceData | undefined {
  const traceParts = message.parts.filter(
    isSmartEduTraceDataPart,
  );

  return traceParts.at(-1)?.data;
}

export function extractArtifactFromMessage(message: UIMessage): ExtractedArtifact {
  const structuredArtifact = getStructuredArtifactPart(message);

  if (structuredArtifact) {
    const lessonPlan =
      structuredArtifact.stage === "lesson"
        ? lessonContentToPlan(structuredArtifact.content, structuredArtifact.contentType)
        : undefined;
    const htmlPages = structuredArtifact.stage === "html" ? structuredArtifact.htmlPages : undefined;

    return {
      stage: structuredArtifact.stage,
      lessonContent:
        structuredArtifact.stage === "lesson"
          ? normalizeLessonArtifactContent(structuredArtifact.content)
          : "",
      html: structuredArtifact.stage === "html" ? structuredArtifact.content : "",
      htmlComplete:
        structuredArtifact.stage === "html" ? structuredArtifact.isComplete : structuredArtifact.status === "ready",
      htmlPages,
      source: "structured",
      status: structuredArtifact.status,
      title: structuredArtifact.title,
      warningText: structuredArtifact.warningText,
      protocolVersion: structuredArtifact.protocolVersion,
      artifact: structuredArtifact,
      lessonPlan,
      trace: getStructuredTracePart(message),
    };
  }

  return {
    ...EMPTY_EXTRACTED_ARTIFACT,
    trace: getStructuredTracePart(message),
  };
}
