import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resetStandardsRetrievalProvider,
  setStandardsRetrievalProvider,
} from "@/mastra/knowledge/provider-registry";
import { runStandardsRetrievalSkill } from "@/mastra/skills";
import { searchStandards, searchStandardsToolInputSchema } from "@/mastra/tools/search_standards";

describe("search-standards", () => {
  afterEach(() => {
    resetStandardsRetrievalProvider();
  });

  it("请求 SHAPE 市场时会返回可审计的回退信息", async () => {
    const result = await searchStandards("五年级 篮球 运球", {
      market: "us-shape-k12",
    });

    expect(result.requestedMarket).toBe("us-shape-k12");
    expect(result.resolvedMarket).toBe("cn-compulsory-2022");
    expect(result.warning).toContain("尚未接入 SHAPE");
    expect(result.references.length).toBeGreaterThan(0);
  });

  it("runtime skill 保持课标检索结果与回退信息", async () => {
    const result = await runStandardsRetrievalSkill({
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

  it("兼容入口会委托给已注入的 retrieval provider", async () => {
    const provider = {
      id: "test-provider",
      search: vi.fn().mockResolvedValue({
        requestedMarket: "cn-compulsory-2022",
        resolvedMarket: "cn-compulsory-2022",
        references: [],
        context: "provider-context",
        corpus: {
          corpusId: "provider-corpus",
          displayName: "测试课标语料",
          officialStatus: "ready",
          sourceName: "测试源",
          issuer: "测试机构",
          version: "1.0",
          url: "https://example.com/provider-corpus",
          availability: "ready" as const,
        },
      }),
    };

    setStandardsRetrievalProvider(provider);

    await expect(
      searchStandards("测试查询", {
        limit: 4,
        market: "cn-compulsory-2022",
      }),
    ).resolves.toMatchObject({
      context: "provider-context",
      corpus: {
        corpusId: "provider-corpus",
      },
    });
    expect(provider.search).toHaveBeenCalledWith("测试查询", {
      limit: 4,
      market: "cn-compulsory-2022",
    });
  });
});
