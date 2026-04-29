import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resetStandardsRetrievalProvider,
  setStandardsRetrievalProvider,
} from "@/mastra/knowledge/provider-registry";
import { runStandardsRetrievalSkill } from "@/mastra/skills";
import { searchStandards, searchStandardsToolInputSchema } from "@/mastra/tools/search_standards";

describe("searchStandards", () => {
  afterEach(() => {
    resetStandardsRetrievalProvider();
  });

  it("preserves the requested market instead of fabricating a fallback corpus", async () => {
    const result = await searchStandards("五年级 篮球 运球", {
      market: "us-shape-k12",
    });

    expect(result.requestedMarket).toBe("us-shape-k12");
    expect(result.resolvedMarket).toBe("us-shape-k12");
    expect(result.references).toEqual([]);
  });

  it("runtime skill keeps the requested market when default provider returns no data", async () => {
    const result = await runStandardsRetrievalSkill({
      query: "五年级 篮球 运球",
      market: "us-shape-k12",
    });

    expect(result.requestedMarket).toBe("us-shape-k12");
    expect(result.resolvedMarket).toBe("us-shape-k12");
    expect(result.context).toContain("未检索到匹配");
    expect(result.references).toEqual([]);
  });

  it("tool schema reuses zod coercion for string limit values", () => {
    const input = searchStandardsToolInputSchema.parse({
      query: "五年级 篮球 运球",
      limit: "3",
    });

    expect(input.limit).toBe(3);
  });

  it("delegates search requests to the injected retrieval provider", async () => {
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

  it("default provider returns an empty result with warning when prerequisites are unavailable", async () => {
    const result = await searchStandards("测试查询", {
      market: "cn-compulsory-2022",
    });

    expect(result.references).toEqual([]);
    expect(result.warning).toBeTruthy();
    expect(result.context).toContain("未检索到匹配");
  });
});
