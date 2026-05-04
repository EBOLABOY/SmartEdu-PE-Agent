import { describe, expect, it } from "vitest";
import { isDataUIPart } from "ai";

import {
  extractArtifactFromMessage,
  getMessageReasoningText,
  getStructuredArtifactPart,
} from "@/lib/artifact/protocol";
import { DEFAULT_COMPETITION_LESSON_PLAN } from "@/lib/lesson/contract";
import {
  chatRequestBodySchema,
  persistedArtifactVersionSchema,
  structuredArtifactDataSchema,
  type SmartEduUIMessage,
} from "@/lib/lesson/authoring-contract";

describe("artifact-protocol", () => {
  it("使用 AI SDK v6 原生 data-${name} part 识别结构化数据", () => {
    const artifactPart: SmartEduUIMessage["parts"][number] = {
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
    };

    expect(isDataUIPart(artifactPart)).toBe(true);
  });

  it("chat 请求契约只保留课时计划相关输入，不再接收大屏分镜计划", () => {
    expect(
      chatRequestBodySchema.safeParse({
        messages: [],
        mode: "html",
        lessonPlan: "## 十、课时计划",
      }).success,
    ).toBe(true);
    expect(
      chatRequestBodySchema.safeParse({
        messages: [],
        mode: "html",
        lessonPlan: "## 十、课时计划",
        unexpectedStoryboard: { pages: [] },
      }).success,
    ).toBe(false);
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
    const htmlDocument = `<!DOCTYPE html>
      <html lang="zh-CN">
        <head><title>篮球课</title></head>
        <body>
          <div class="screen">
            <section class="slide cover-slide active" data-slide-kind="cover">
              <main class="cover-shell"><h1>OK</h1></main>
            </section>
          </div>
        </body>
      </html>`;
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
            content: htmlDocument,
            htmlPages: [
              {
                pageIndex: 0,
                pageRole: "cover",
                pageTitle: "OK",
                sectionHtml:
                  '<section class="slide cover-slide active" data-slide-kind="cover"><main class="cover-shell"><h1>OK</h1></main></section>',
              },
            ],
            isComplete: true,
            status: "ready",
            source: "data-part",
            updatedAt: new Date().toISOString(),
          },
        },
      ],
    };

    const extracted = extractArtifactFromMessage(message);

    expect(extracted.html).toContain("<h1>OK</h1>");
    expect(extracted.htmlComplete).toBe(true);
    expect(extracted.lessonContent).toBe("");
  });

  it("schema 允许 html artifact 与 persisted version 只携带完整 HTML 文件", () => {
    expect(
      structuredArtifactDataSchema.safeParse({
        protocolVersion: "structured-v1",
        stage: "html",
        contentType: "html",
        content: "<!DOCTYPE html><html><body></body></html>",
        isComplete: true,
        status: "ready",
        source: "data-part",
        updatedAt: new Date().toISOString(),
      }).success,
    ).toBe(true);
    expect(
      persistedArtifactVersionSchema.safeParse({
        id: "11111111-1111-4111-8111-111111111111",
        artifactId: "22222222-2222-4222-8222-222222222222",
        stage: "html",
        contentType: "html",
        content: "<!DOCTYPE html><html><body></body></html>",
        status: "ready",
        protocolVersion: "structured-v1",
        versionNumber: 1,
        createdAt: new Date().toISOString(),
      }).success,
    ).toBe(true);
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
