import { describe, expect, it } from "vitest";

import {
  extractArtifactFromMessage,
  extractHtmlDocumentFromText,
  getStructuredArtifactPart,
} from "@/lib/artifact-protocol";
import { DEFAULT_COMPETITION_LESSON_PLAN } from "@/lib/competition-lesson-contract";
import type { SmartEduUIMessage } from "@/lib/lesson-authoring-contract";

describe("artifact-protocol", () => {
  it("能从带前置说明和后置围栏的文本中提取 HTML 文档", () => {
    const extraction = extractHtmlDocumentFromText(`
      下面是你要的互动大屏

      \`\`\`html
      <!DOCTYPE html>
      <html lang="zh-CN">
        <head><title>篮球课</title></head>
        <body><h1>篮球课</h1></body>
      </html>
      \`\`\`
    `);

    expect(extraction.html).toContain("<!DOCTYPE html>");
    expect(extraction.html).toContain("<html lang=\"zh-CN\">");
    expect(extraction.htmlComplete).toBe(true);
    expect(extraction.leadingText).toContain("下面是你要的互动大屏");
  });

  it("能识别流式未完成的 HTML 文档", () => {
    const extraction = extractHtmlDocumentFromText(`
      <!DOCTYPE html>
      <html lang="zh-CN">
        <head><title>测试</title></head>
        <body><div>倒计时
    `);

    expect(extraction.html).toContain("<html lang=\"zh-CN\">");
    expect(extraction.htmlComplete).toBe(false);
  });

  it("能从结构化 lesson data part 中解析流式教案", () => {
    const message: SmartEduUIMessage = {
      id: "assistant-lesson",
      role: "assistant",
      parts: [
        {
          type: "data-artifact",
          id: "artifact",
          data: {
            protocolVersion: "structured-v1",
            stage: "lesson",
            contentType: "markdown",
            content: "# 教案方案\n\n## 一、基础信息",
            isComplete: false,
            status: "streaming",
            source: "data-part",
            updatedAt: new Date().toISOString(),
          },
        },
      ],
    };

    const artifact = getStructuredArtifactPart(message);
    const extracted = extractArtifactFromMessage(message);

    expect(artifact?.stage).toBe("lesson");
    expect(extracted.markdown).toContain("# 教案方案");
    expect(extracted.status).toBe("streaming");
    expect(extracted.html).toBe("");
  });

  it("能从结构化 html data part 中解析 HTML Artifact", () => {
    const message: SmartEduUIMessage = {
      id: "assistant-html",
      role: "assistant",
      parts: [
        {
          type: "data-artifact",
          id: "artifact",
          data: {
            protocolVersion: "structured-v1",
            stage: "html",
            contentType: "html",
            content: "<!DOCTYPE html><html lang=\"zh-CN\"><body>OK</body></html>",
            isComplete: true,
            status: "ready",
            source: "data-part",
            updatedAt: new Date().toISOString(),
          },
        },
      ],
    };

    const extracted = extractArtifactFromMessage(message);

    expect(extracted.html).toContain("<body>OK</body>");
    expect(extracted.htmlComplete).toBe(true);
    expect(extracted.markdown).toBe("");
  });

  it("能从结构化 lesson-json data part 中派生 Markdown", () => {
    const message: SmartEduUIMessage = {
      id: "assistant-lesson-json",
      role: "assistant",
      parts: [
        {
          type: "data-artifact",
          id: "artifact",
          data: {
            protocolVersion: "structured-v1",
            stage: "lesson",
            contentType: "lesson-json",
            content: JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN),
            isComplete: true,
            status: "ready",
            source: "data-part",
            updatedAt: new Date().toISOString(),
          },
        },
      ],
    };

    const extracted = extractArtifactFromMessage(message);

    expect(extracted.markdown).toContain("# 操控性技能－足球游戏");
    expect(extracted.markdown).toContain("## 十、课时计划（教案）");
    expect(extracted.lessonPlan?.title).toBe(DEFAULT_COMPETITION_LESSON_PLAN.title);
    expect(extracted.artifact?.contentType).toBe("lesson-json");
  });
});
