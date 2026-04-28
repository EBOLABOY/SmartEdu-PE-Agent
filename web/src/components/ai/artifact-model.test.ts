import { describe, expect, it } from "vitest";

import { buildArtifactLifecycle } from "@/components/ai/artifact-model";
import { DEFAULT_COMPETITION_LESSON_PLAN } from "@/lib/competition-lesson-contract";
import type {
  PersistedArtifactVersion,
  SmartEduUIMessage,
  WorkflowTraceData,
} from "@/lib/lesson-authoring-contract";

function createTrace(requestId: string, mode: "lesson" | "html"): WorkflowTraceData {
  return {
    protocolVersion: "structured-v1",
    requestId,
    mode,
    phase: "completed",
    responseTransport: "structured-data-part",
    requestedMarket: "cn-compulsory-2022",
    resolvedMarket: "cn-compulsory-2022",
    warnings: [],
    uiHints: [],
    trace: [],
    updatedAt: "2026-04-25T12:00:00.000Z",
  };
}

const PERSISTED_VERSIONS: PersistedArtifactVersion[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    artifactId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    stage: "lesson",
    contentType: "lesson-json",
    content: JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN),
    status: "ready",
    protocolVersion: "structured-v1",
    versionNumber: 1,
    createdAt: "2026-04-25T12:00:00.000Z",
    isCurrent: true,
    trace: createTrace("persisted-lesson-trace", "lesson"),
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    artifactId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    stage: "html",
    contentType: "html",
    content: "<!DOCTYPE html><html lang=\"zh-CN\"><body><h1>历史大屏</h1></body></html>",
    status: "ready",
    protocolVersion: "structured-v1",
    versionNumber: 1,
    createdAt: "2026-04-25T12:05:00.000Z",
    isCurrent: true,
    trace: createTrace("persisted-html-trace", "html"),
  },
];

describe("artifact-model", () => {
  it("会在无实时消息时回放持久化的教案与大屏", () => {
    const lifecycle = buildArtifactLifecycle([], "ready", false, PERSISTED_VERSIONS);

    expect(lifecycle.lessonContent).toBe(JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN));
    expect(lifecycle.html).toContain("<h1>历史大屏</h1>");
    expect(lifecycle.stage).toBe("html");
    expect(lifecycle.activeArtifact?.stage).toBe("html");
    expect(lifecycle.activeArtifact?.persistedVersionId).toBe(
      "22222222-2222-2222-2222-222222222222",
    );
    expect(lifecycle.versions[0]?.isCurrent).toBe(true);
    expect(lifecycle.activeTrace?.requestId).toBe("persisted-html-trace");
    expect(lifecycle.versions).toHaveLength(2);
  });

  it("会在仅教案为当前版本时优先展示当前教案并清空大屏", () => {
    const lifecycle = buildArtifactLifecycle([], "ready", false, [
      {
        ...PERSISTED_VERSIONS[0],
        isCurrent: true,
      },
      {
        ...PERSISTED_VERSIONS[1],
        isCurrent: false,
      },
    ]);

    expect(lifecycle.stage).toBe("lesson");
    expect(lifecycle.html).toBe("");
    expect(lifecycle.lessonContent).toBe(JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN));
    expect(lifecycle.activeArtifact?.stage).toBe("lesson");
    expect(lifecycle.activeArtifact?.isCurrent).toBe(true);
  });

  it("会在已有实时 assistant Artifact 时优先使用实时版本", () => {
    const assistantMessage = {
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
            updatedAt: "2026-04-25T12:10:00.000Z",
          },
        },
      ],
    } as SmartEduUIMessage;

    const lifecycle = buildArtifactLifecycle(
      [assistantMessage],
      "streaming",
      false,
      PERSISTED_VERSIONS,
    );

    expect(lifecycle.lessonContent).toBe(JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN));
    expect(lifecycle.html).toBe("");
    expect(lifecycle.status).toBe("streaming");
    expect(lifecycle.versions).toHaveLength(1);
    expect(lifecycle.versions[0]?.id).toBe("assistant-lesson-lesson");
  });

  it("流式 lesson-json 只要主体 schema 合法就提前暴露 lessonPlan", () => {
    const assistantMessage = {
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
            content: `下面是结构化教案 JSON：\n\n\`\`\`json\n${JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN)}\n\`\`\``,
            isComplete: false,
            status: "streaming",
            source: "data-part",
            updatedAt: "2026-04-25T12:10:00.000Z",
          },
        },
      ],
    } as SmartEduUIMessage;

    const lifecycle = buildArtifactLifecycle([assistantMessage], "streaming", false, []);

    expect(lifecycle.status).toBe("streaming");
    expect(lifecycle.lessonPlan?.title).toBe(DEFAULT_COMPETITION_LESSON_PLAN.title);
    expect(lifecycle.activeArtifact?.lessonPlan?.title).toBe(DEFAULT_COMPETITION_LESSON_PLAN.title);
  });

  it("data-artifact 尚未到达时不会再把 assistant text 当作 lesson 可信源", () => {
    const assistantMessage = {
      id: "assistant-lesson-text-stream",
      role: "assistant",
      parts: [
        {
          type: "data-trace",
          id: "trace-1",
          data: createTrace("live-text-stream", "lesson"),
        },
        {
          type: "text",
          text: "{\"title\":\"武术课\",\"meta\":",
          state: "streaming",
        },
      ],
    } as SmartEduUIMessage;

    const lifecycle = buildArtifactLifecycle([assistantMessage], "streaming", false, []);

    expect(lifecycle.status).toBe("streaming");
    expect(lifecycle.stage).toBe("lesson");
    expect(lifecycle.lessonContent).toBe("");
    expect(lifecycle.activeArtifact).toBeUndefined();
    expect(lifecycle.activeTrace?.requestId).toBe("live-text-stream");
  });

  it("会把流式 HTML 保留为源码流但不提交到 iframe 预览", () => {
    const messages = [
      {
        id: "assistant-html-ready",
        role: "assistant",
        parts: [
          {
            type: "data-artifact",
            id: "artifact",
            data: {
              protocolVersion: "structured-v1",
              stage: "html",
              contentType: "html",
              content: "<!DOCTYPE html><html lang=\"zh-CN\"><body><h1>旧大屏</h1></body></html>",
              isComplete: true,
              status: "ready",
              source: "data-part",
              updatedAt: "2026-04-25T12:05:00.000Z",
            },
          },
        ],
      },
      {
        id: "assistant-html-streaming",
        role: "assistant",
        parts: [
          {
            type: "data-artifact",
            id: "artifact",
            data: {
              protocolVersion: "structured-v1",
              stage: "html",
              contentType: "html",
              content: "<!DOCTYPE html><html lang=\"zh-CN\"><body><h1>新版生成中",
              isComplete: false,
              status: "streaming",
              source: "data-part",
              updatedAt: "2026-04-25T12:06:00.000Z",
            },
          },
        ],
      },
    ] as SmartEduUIMessage[];

    const lifecycle = buildArtifactLifecycle(messages, "streaming", true, []);

    expect(lifecycle.stage).toBe("html");
    expect(lifecycle.status).toBe("streaming");
    expect(lifecycle.html).toContain("<h1>旧大屏</h1>");
    expect(lifecycle.streamingHtml).toContain("新版生成中");
    expect(lifecycle.isHtmlStreaming).toBe(true);
    expect(lifecycle.htmlPreviewVersionId).toBe("assistant-html-ready-html");
  });

  it("首次生成 HTML 时只展示源码流，完成前不提交预览", () => {
    const assistantMessage = {
      id: "assistant-html-streaming",
      role: "assistant",
      parts: [
        {
          type: "data-artifact",
          id: "artifact",
          data: {
            protocolVersion: "structured-v1",
            stage: "html",
            contentType: "html",
            content: "<!DOCTYPE html><html lang=\"zh-CN\"><body><h1>生成中",
            isComplete: false,
            status: "streaming",
            source: "data-part",
            updatedAt: "2026-04-25T12:06:00.000Z",
          },
        },
      ],
    } as SmartEduUIMessage;

    const lifecycle = buildArtifactLifecycle([assistantMessage], "streaming", true, []);

    expect(lifecycle.stage).toBe("html");
    expect(lifecycle.html).toBe("");
    expect(lifecycle.streamingHtml).toContain("生成中");
    expect(lifecycle.isHtmlStreaming).toBe(true);
    expect(lifecycle.htmlPreviewVersionId).toBeUndefined();
  });

  it("会在恢复到包含 html 的历史消息时直接展示互动大屏", () => {
    const historyMessages = [
      {
        id: "assistant-lesson-history",
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
              updatedAt: "2026-04-25T12:00:00.000Z",
            },
          },
        ],
      },
      {
        id: "assistant-html-history",
        role: "assistant",
        parts: [
          {
            type: "data-artifact",
            id: "artifact",
            data: {
              protocolVersion: "structured-v1",
              stage: "html",
              contentType: "html",
              content: "<!DOCTYPE html><html lang=\"zh-CN\"><body><h1>历史大屏</h1></body></html>",
              isComplete: true,
              status: "ready",
              source: "data-part",
              updatedAt: "2026-04-25T12:05:00.000Z",
            },
          },
        ],
      },
    ] as SmartEduUIMessage[];

    const lifecycle = buildArtifactLifecycle(historyMessages, "ready", false, []);

    expect(lifecycle.stage).toBe("html");
    expect(lifecycle.html).toContain("<h1>历史大屏</h1>");
    expect(lifecycle.activeArtifact?.stage).toBe("html");
  });

  it("会在项目存在持久化当前版本时覆盖历史消息中的旧大屏", () => {
    const historyMessages = [
      {
        id: "assistant-html-history",
        role: "assistant",
        parts: [
          {
            type: "data-artifact",
            id: "artifact",
            data: {
              protocolVersion: "structured-v1",
              stage: "html",
              contentType: "html",
              content: "<!DOCTYPE html><html lang=\"zh-CN\"><body><h1>旧大屏</h1></body></html>",
              isComplete: true,
              status: "ready",
              source: "data-part",
              updatedAt: "2026-04-25T12:05:00.000Z",
            },
          },
        ],
      },
    ] as SmartEduUIMessage[];

    const lifecycle = buildArtifactLifecycle(historyMessages, "ready", false, [
      {
        ...PERSISTED_VERSIONS[0],
        isCurrent: true,
      },
      {
        ...PERSISTED_VERSIONS[1],
        isCurrent: false,
      },
    ]);

    expect(lifecycle.stage).toBe("lesson");
    expect(lifecycle.html).toBe("");
    expect(lifecycle.lessonContent).toBe(JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN));
    expect(lifecycle.versions).toHaveLength(2);
  });

  it("会在新请求仅有用户消息时停止回放旧历史", () => {
    const userMessage = {
      id: "user-lesson",
      role: "user",
      parts: [{ type: "text", text: "请重新生成一份新教案" }],
    } as SmartEduUIMessage;

    const lifecycle = buildArtifactLifecycle([userMessage], "submitted", false, PERSISTED_VERSIONS);

    expect(lifecycle.versions).toHaveLength(0);
    expect(lifecycle.lessonContent).toBe("");
    expect(lifecycle.html).toBe("");
    expect(lifecycle.status).toBe("streaming");
  });

  it("会把持久化 lesson-json 保持为 JSON 内容并解析 lessonPlan", () => {
    const lifecycle = buildArtifactLifecycle([], "ready", false, [
      {
        ...PERSISTED_VERSIONS[0],
        contentType: "lesson-json",
        content: JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN),
      },
    ]);

    expect(lifecycle.lessonContent).toBe(JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN));
    expect(lifecycle.lessonPlan?.title).toBe(DEFAULT_COMPETITION_LESSON_PLAN.title);
    expect(lifecycle.versions[0]?.content).toBe(JSON.stringify(DEFAULT_COMPETITION_LESSON_PLAN));
    expect(lifecycle.versions[0]?.lessonPlan?.title).toBe(DEFAULT_COMPETITION_LESSON_PLAN.title);
    expect(lifecycle.versions[0]?.contentType).toBe("lesson-json");
  });
});
