import { describe, expect, it } from "vitest";

import type { SmartEduUIMessage } from "@/lib/lesson-authoring-contract";

import {
  getAssistantCitationLabel,
  getAssistantCitationSources,
  getAssistantSources,
  getAssistantSuggestions,
} from "./assistant-reference-ui";

const messageWithStandards = {
  id: "assistant-1",
  role: "assistant",
  parts: [
    {
      type: "data-trace",
      id: "trace-1",
      data: {
        protocolVersion: "structured-v1",
        requestId: "request-1",
        mode: "lesson",
        phase: "completed",
        responseTransport: "structured-data-part",
        requestedMarket: "cn-compulsory-2022",
        resolvedMarket: "cn-compulsory-2022",
        warnings: [],
        standards: {
          corpusId: "cn-compulsory-2022",
          displayName: "义务教育体育与健康课程标准",
          sourceName: "义务教育体育与健康课程标准（2022年版）",
          issuer: "中华人民共和国教育部",
          version: "2022",
          url: "https://example.com/standards.pdf",
          references: [
            {
              id: "std-1",
              title: "运动能力",
              summary: "发展专项运动能力。",
              citation: "课程标准第 10 页",
              module: "核心素养",
              gradeBands: ["5-6年级"],
              sectionPath: ["课程目标", "核心素养"],
              score: 12,
            },
          ],
        },
        trace: [],
        updatedAt: "2026-04-26T00:00:00.000Z",
      },
    },
  ],
} as SmartEduUIMessage;

describe("assistant-reference-ui", () => {
  it("会把 trace 中的课标引用转换为 sources 组件所需数据", () => {
    const sources = getAssistantSources(messageWithStandards);

    expect(sources).toEqual([
      expect.objectContaining({
        id: "std-1",
        title: "运动能力",
        href: "https://example.com/standards.pdf",
        citation: "课程标准第 10 页",
      }),
    ]);
    expect(sources[0]?.description).toContain("5-6年级");
  });

  it("会为行内引用提供来源链接与中文标签", () => {
    expect(getAssistantCitationSources(messageWithStandards)).toEqual([
      "https://example.com/standards.pdf",
    ]);
    expect(getAssistantCitationLabel(messageWithStandards)).toBe("依据 1 条课标引用");
  });

  it("会根据当前工作区阶段生成业务建议", () => {
    expect(
      getAssistantSuggestions({
        canGenerateHtml: true,
        hasHtml: false,
        hasLessonPlan: true,
        isLoading: false,
      }),
    ).toContain("我已确认教案无误，请生成互动大屏");

    expect(
      getAssistantSuggestions({
        canGenerateHtml: false,
        hasHtml: false,
        hasLessonPlan: false,
        isLoading: false,
      }),
    ).toContain("六年级 羽毛球 正手发球 40分钟");
  });
});
