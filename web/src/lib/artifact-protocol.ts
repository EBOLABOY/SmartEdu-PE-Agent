import { isDataUIPart, type UIMessage } from "ai";

import type {
  ArtifactContentType,
  GenerationMode,
  SmartEduUIMessage,
  StructuredArtifactData,
  WorkflowTraceData,
} from "@/lib/lesson-authoring-contract";
import {
  competitionLessonPlanSchema,
  type CompetitionLessonPlan,
} from "@/lib/competition-lesson-contract";
import { competitionLessonPlanToMarkdown } from "@/lib/competition-lesson-markdown";

export type ExtractedArtifact = {
  stage?: GenerationMode;
  markdown: string;
  html: string;
  htmlComplete: boolean;
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
  markdown: "",
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

function lessonContentToMarkdown(
  content: string,
  contentType: ArtifactContentType,
  lessonPlan?: CompetitionLessonPlan,
) {
  if (contentType !== "lesson-json") {
    return content;
  }

  return lessonPlan ? competitionLessonPlanToMarkdown(lessonPlan) : content;
}

export function getMessageText(message: Pick<UIMessage, "parts">) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export type HtmlDocumentExtraction = {
  html: string;
  htmlComplete: boolean;
  leadingText: string;
  trailingText: string;
};

export function extractHtmlDocumentFromText(content: string): HtmlDocumentExtraction {
  const documentStartCandidates = [content.search(/<!doctype\s+html/i), content.search(/<html[\s>]/i)].filter(
    (index) => index >= 0,
  );

  if (documentStartCandidates.length === 0) {
    return {
      html: "",
      htmlComplete: false,
      leadingText: content.trim(),
      trailingText: "",
    };
  }

  const documentStartIndex = Math.min(...documentStartCandidates);
  const leadingText = content.slice(0, documentStartIndex).trim();
  const documentBody = content.slice(documentStartIndex);
  const htmlEndMatch = /<\/html>/i.exec(documentBody);

  if (!htmlEndMatch) {
    return {
      html: documentBody.trim(),
      htmlComplete: false,
      leadingText,
      trailingText: "",
    };
  }

  const htmlEndIndex = htmlEndMatch.index + htmlEndMatch[0].length;

  return {
    html: documentBody.slice(0, htmlEndIndex).trim(),
    htmlComplete: true,
    leadingText,
    trailingText: documentBody.slice(htmlEndIndex).trim(),
  };
}

export function getStructuredArtifactPart(message: UIMessage): StructuredArtifactData | undefined {
  const artifactParts = message.parts.filter(
    (part): part is Extract<SmartEduUIMessage["parts"][number], { type: "data-artifact" }> =>
      isDataUIPart(part) && part.type === "data-artifact",
  );

  return artifactParts.at(-1)?.data;
}

export function getStructuredTracePart(message: UIMessage): WorkflowTraceData | undefined {
  const traceParts = message.parts.filter(
    (part): part is Extract<SmartEduUIMessage["parts"][number], { type: "data-trace" }> =>
      isDataUIPart(part) && part.type === "data-trace",
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

    return {
      stage: structuredArtifact.stage,
      markdown:
        structuredArtifact.stage === "lesson"
          ? lessonContentToMarkdown(
              structuredArtifact.content,
              structuredArtifact.contentType,
              lessonPlan,
            )
          : "",
      html: structuredArtifact.stage === "html" ? structuredArtifact.content : "",
      htmlComplete:
        structuredArtifact.stage === "html" ? structuredArtifact.isComplete : structuredArtifact.status === "ready",
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
