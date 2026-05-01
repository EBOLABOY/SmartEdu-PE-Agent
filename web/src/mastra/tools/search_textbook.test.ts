import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resetTextbookRetrievalProvider,
  setTextbookRetrievalProvider,
} from "@/mastra/knowledge/provider-registry";
import { runTextbookRetrievalSkill } from "@/mastra/skills";
import { searchTextbook, searchTextbookToolInputSchema } from "@/mastra/tools/search_textbook";

describe("searchTextbook", () => {
  afterEach(() => {
    resetTextbookRetrievalProvider();
  });

  it("tool schema reuses zod coercion for string limit values", () => {
    const input = searchTextbookToolInputSchema.parse({
      query: "三年级 篮球 运球 教材分析",
      limit: "3",
    });

    expect(input.limit).toBe(3);
  });

  it("delegates search requests to the injected retrieval provider", async () => {
    const provider = {
      id: "test-textbook-provider",
      search: vi.fn().mockResolvedValue({
        market: "cn-compulsory-2022",
        stage: "小学",
        publisher: "人教版",
        grade: "三年级",
        references: [],
        context: "textbook-provider-context",
      }),
    };

    setTextbookRetrievalProvider(provider);

    await expect(
      searchTextbook("三年级 篮球 运球 教材分析", {
        grade: "三年级",
        limit: 4,
        market: "cn-compulsory-2022",
        publisher: "人教版",
      }),
    ).resolves.toMatchObject({
      context: "textbook-provider-context",
      publisher: "人教版",
    });
    expect(provider.search).toHaveBeenCalledWith("三年级 篮球 运球 教材分析", {
      grade: "三年级",
      limit: 4,
      market: "cn-compulsory-2022",
      publisher: "人教版",
      stage: "小学",
    });
  });

  it("runtime skill delegates to searchTextbook", async () => {
    const provider = {
      id: "test-textbook-provider",
      search: vi.fn().mockResolvedValue({
        market: "cn-compulsory-2022",
        stage: "小学",
        references: [],
        context: "skill-textbook-context",
      }),
    };

    setTextbookRetrievalProvider(provider);

    const result = await runTextbookRetrievalSkill({
      query: "五年级 足球 传球 教材分析",
      publisher: "人教版",
    });

    expect(result.context).toBe("skill-textbook-context");
    expect(provider.search).toHaveBeenCalledWith("五年级 足球 传球 教材分析", {
      grade: "",
      limit: 5,
      market: "cn-compulsory-2022",
      publisher: "人教版",
      stage: "小学",
    });
  });
});
