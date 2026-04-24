import { useMemo } from "react";
import type { UIMessage } from "ai";

export type ArtifactLifecycleStatus = "idle" | "streaming" | "ready" | "editing" | "error";
export type ArtifactStage = "lesson" | "html";

export type ExtractedArtifact = {
  markdown: string;
  html: string;
  htmlComplete: boolean;
};

export type ArtifactSnapshot = {
  id: string;
  stage: ArtifactStage;
  title: string;
  content: string;
  status: ArtifactLifecycleStatus;
  version: number;
};

export type ArtifactLifecycle = {
  markdown: string;
  html: string;
  status: ArtifactLifecycleStatus;
  stage: ArtifactStage;
  activeArtifact?: ArtifactSnapshot;
  versions: ArtifactSnapshot[];
};

export function getMessageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export function extractArtifactFromText(content: string): ExtractedArtifact {
  const artifactPattern = /<artifact\b(?=[^>]*\btype\s*=\s*["']html["'])[^>]*>([\s\S]*?)(?:<\/artifact>|$)/i;
  const completeArtifactPattern = /<artifact\b(?=[^>]*\btype\s*=\s*["']html["'])[^>]*>[\s\S]*?<\/artifact>/i;
  const htmlMatch = content.match(artifactPattern);
  const html = htmlMatch?.[1]?.trim() ?? "";
  const markdown = content.replace(artifactPattern, "").trim();
  const htmlComplete = completeArtifactPattern.test(content);

  return { markdown, html, htmlComplete };
}

export function useArtifactLifecycle(
  messages: UIMessage[],
  chatStatus: string,
  lessonConfirmed: boolean,
): ArtifactLifecycle {
  return useMemo(() => {
    const assistantMessages = messages.filter((message) => message.role === "assistant");
    const isStreaming = chatStatus === "submitted" || chatStatus === "streaming";
    const versions: ArtifactSnapshot[] = [];

    assistantMessages.forEach((message, index) => {
      const extracted = extractArtifactFromText(getMessageText(message));
      const messageId = "id" in message ? String(message.id) : `assistant-${index}`;

      if (extracted.markdown) {
        const version = versions.filter((item) => item.stage === "lesson").length + 1;

        versions.push({
          id: `${messageId}-lesson`,
          stage: "lesson",
          title: `教案版本 ${version}`,
          content: extracted.markdown,
          status: isStreaming && index === assistantMessages.length - 1 && !extracted.html ? "streaming" : "ready",
          version,
        });
      }

      if (extracted.html) {
        const version = versions.filter((item) => item.stage === "html").length + 1;

        versions.push({
          id: `${messageId}-html`,
          stage: "html",
          title: `大屏版本 ${version}`,
          content: extracted.html,
          status: extracted.htmlComplete && !isStreaming ? "ready" : "streaming",
          version,
        });
      }
    });

    const latestLesson = [...versions].reverse().find((item) => item.stage === "lesson");
    const latestHtml = [...versions].reverse().find((item) => item.stage === "html");
    const activeArtifact = lessonConfirmed && latestHtml ? latestHtml : latestLesson;

    return {
      markdown: latestLesson?.content ?? "",
      html: lessonConfirmed ? latestHtml?.content ?? "" : "",
      status: activeArtifact?.status ?? (isStreaming ? "streaming" : "idle"),
      stage: lessonConfirmed && latestHtml ? "html" : "lesson",
      activeArtifact,
      versions,
    };
  }, [chatStatus, lessonConfirmed, messages]);
}
