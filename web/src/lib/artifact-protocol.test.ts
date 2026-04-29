import { describe, expect, it } from "vitest";

import {
  extractArtifactFromMessage,
  extractHtmlDocumentFromText,
  extractJsonObjectText,
  getMessageReasoningText,
  getStructuredArtifactPart,
} from "@/lib/artifact-protocol";
import { DEFAULT_COMPETITION_LESSON_PLAN } from "@/lib/competition-lesson-contract";
import { chatRequestBodySchema, lessonScreenPlanSchema, type SmartEduUIMessage } from "@/lib/lesson-authoring-contract";

describe("artifact-protocol", () => {
  it("会校验课堂大屏支持模块契约", () => {
    const screenPlan = lessonScreenPlanSchema.parse({
      sections: [
        {
          title: "战术学习",
          durationSeconds: 480,
          supportModule: "tacticalBoard",
        },
        {
          title: "比赛展示",
          supportModule: "scoreboard",
        },
      ],
    });

    expect(screenPlan.sections[0]?.supportModule).toBe("tacticalBoard");
    expect(
      chatRequestBodySchema.safeParse({
        messages: [],
        mode: "html",
        lessonPlan: "## 十、课时计划",
        screenPlan,
      }).success,
    ).toBe(true);
  });

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

  it("能从结构化 lesson-json data part 中解析流式课时计划", () => {
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
            contentType: "lesson-json",
            content: JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN),
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
    expect(extracted.lessonContent).toBe(JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN));
    expect(extracted.lessonPlan?.title).toBe(DEFAULT_COMPETITION_LESSON_PLAN.title);
    expect(extracted.status).toBe("streaming");
    expect(extracted.html).toBe("");
  });

  it("能从带代码围栏和说明的流式 lesson-json 中提前解析课时计划", () => {
    const message: SmartEduUIMessage = {
      id: "assistant-lesson-fenced",
      role: "assistant",
      parts: [
        {
          type: "data-artifact",
          id: "artifact",
          data: {
            protocolVersion: "structured-v1",
            stage: "lesson",
            contentType: "lesson-json",
            content: `下面是结构化课时计划 JSON：\n\n\`\`\`json\n${JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN)}\n\`\`\``,
            isComplete: false,
            status: "streaming",
            source: "data-part",
            updatedAt: new Date().toISOString(),
          },
        },
      ],
    };

    const extracted = extractArtifactFromMessage(message);

    expect(extracted.lessonPlan?.title).toBe(DEFAULT_COMPETITION_LESSON_PLAN.title);
    expect(extracted.status).toBe("streaming");
  });

  it("会从文本中截取 JSON 对象主体", () => {
    expect(extractJsonObjectText(`说明\n${JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN)}\n结束`)).toBe(
      JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN),
    );
  });

  it("能从 reasoning part 中提取模型返回的思考文本", () => {
    const message: SmartEduUIMessage = {
      id: "assistant-reasoning",
      role: "assistant",
      parts: [
        {
          type: "reasoning",
          text: "先分析年级和教材，再匹配课标。",
          state: "done",
        },
        {
          type: "text",
          text: "课时计划生成中。",
        },
      ],
    };

    expect(getMessageReasoningText(message)).toBe("先分析年级和教材，再匹配课标。");
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
    expect(extracted.lessonContent).toBe("");
  });

  it("能从结构化 lesson-json data part 中保留 JSON 内容并解析 lessonPlan", () => {
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

    expect(extracted.lessonContent).toBe(JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN));
    expect(extracted.lessonPlan?.title).toBe(DEFAULT_COMPETITION_LESSON_PLAN.title);
    expect(extracted.artifact?.contentType).toBe("lesson-json");
  });
});
