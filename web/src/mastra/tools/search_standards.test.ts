import { describe, expect, it } from "vitest";

import { runStandardsRetrievalSkill } from "@/mastra/skills";
import { searchStandards, searchStandardsToolInputSchema } from "@/mastra/tools/search_standards";

describe("search-standards", () => {
  it("请求 SHAPE 市场时会返回可审计的回退信息", () => {
    const result = searchStandards("五年级 篮球 运球", {
      market: "us-shape-k12",
    });

    expect(result.requestedMarket).toBe("us-shape-k12");
    expect(result.resolvedMarket).toBe("cn-compulsory-2022");
    expect(result.warning).toContain("尚未接入 SHAPE");
    expect(result.references.length).toBeGreaterThan(0);
  });

  it("runtime skill 保持课标检索结果与回退信息", () => {
    const result = runStandardsRetrievalSkill({
      query: "五年级 篮球 运球",
      market: "us-shape-k12",
    });

    expect(result.requestedMarket).toBe("us-shape-k12");
    expect(result.resolvedMarket).toBe("cn-compulsory-2022");
    expect(result.warning).toContain("尚未接入 SHAPE");
    expect(result.context).toContain("课标要求");
    expect(result.references.length).toBeGreaterThan(0);
  });

  it("工具 schema 复用 Zod coercion 容忍模型生成的字符串 limit", () => {
    const input = searchStandardsToolInputSchema.parse({
      query: "五年级 篮球 运球",
      limit: "3",
    });

    expect(input.limit).toBe(3);
  });
});
