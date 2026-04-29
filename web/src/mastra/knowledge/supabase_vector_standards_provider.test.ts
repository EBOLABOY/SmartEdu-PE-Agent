import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseVectorStandardsProvider } from "@/mastra/knowledge/supabase_vector_standards_provider";

const mocks = vi.hoisted(() => ({
  createModelProvider: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  embed: vi.fn(),
}));

vi.mock("@/mastra/models", () => ({
  createModelProvider: mocks.createModelProvider,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

vi.mock("ai", () => ({
  embed: mocks.embed,
}));

function createAuthenticatedSupabaseClient(overrides: {
  corpusRow?: Record<string, unknown> | null;
  rpc?: ReturnType<typeof vi.fn>;
} = {}) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data:
      overrides.corpusRow ?? {
        id: "corpus-1",
        display_name: "义务教育体育与健康课程标准（2022年版）结构化知识库",
        issuer: "中华人民共和国教育部",
        market: "cn-compulsory-2022",
        official_version: "2022",
        source_url: "https://example.com/standards.pdf",
        availability: "ready",
        created_at: "2026-04-29T10:00:00.000Z",
        updated_at: "2026-04-29T10:00:00.000Z",
      },
    error: null,
  });
  const limit = vi.fn().mockReturnValue({ maybeSingle });
  const order = vi.fn().mockReturnValue({ limit });
  const eq = vi.fn().mockReturnValue({ order });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: { id: "user-1" },
        },
        error: null,
      }),
    },
    from: vi.fn((table: string) => {
      if (table === "standards_corpora") {
        return {
          select: vi.fn().mockReturnValue({ eq }),
        };
      }

      throw new Error(`unexpected table: ${table}`);
    }),
    rpc: overrides.rpc ?? vi.fn(),
  };
}

describe("supabase-vector-standards-provider", () => {
  const originalAiBaseUrl = process.env.AI_BASE_URL;
  const originalAiApiKey = process.env.AI_API_KEY;
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "test-openai-key";
    delete process.env.AI_BASE_URL;
    delete process.env.AI_API_KEY;

    mocks.createModelProvider.mockReturnValue({
      embeddingModel: vi.fn().mockReturnValue("embedding-model"),
    });
    mocks.embed.mockResolvedValue({
      embedding: [0.11, 0.22, 0.33],
    });
  });

  afterEach(() => {
    process.env.AI_BASE_URL = originalAiBaseUrl;
    process.env.AI_API_KEY = originalAiApiKey;
    process.env.OPENAI_API_KEY = originalOpenAiApiKey;
  });

  it("maps hybrid rpc results into standard references and preserves market fallback warnings", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: "std-1",
          title: "篮球运球与传接球",
          module: "课程内容",
          grade_bands: ["5-6年级"],
          section_path: ["课程内容", "球类运动"],
          keywords: ["篮球", "运球"],
          summary: "聚焦球类基本技术与情境应用。",
          requirements: ["要求一", "要求二"],
          teaching_implications: ["建议一"],
          citation: "课程标准 第10页",
          similarity: 0.8123,
        },
      ],
      error: null,
    });
    const supabase = createAuthenticatedSupabaseClient({ rpc });
    mocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const provider = createSupabaseVectorStandardsProvider();
    const result = await provider.search("五年级 篮球 运球", {
      limit: 4,
      market: "us-shape-k12",
    });

    expect(result.requestedMarket).toBe("us-shape-k12");
    expect(result.resolvedMarket).toBe("cn-compulsory-2022");
    expect(result.warning).toContain("尚未接入 SHAPE");
    expect(result.corpus).toMatchObject({
      corpusId: "corpus-1",
      displayName: "义务教育体育与健康课程标准（2022年版）结构化知识库",
      issuer: "中华人民共和国教育部",
      version: "2022",
      url: "https://example.com/standards.pdf",
      availability: "ready",
    });
    expect(result.references).toHaveLength(1);
    expect(result.references[0]).toMatchObject({
      id: "std-1",
      title: "篮球运球与传接球",
      source: "义务教育体育与健康课程标准（2022年版）结构化知识库",
      officialVersion: "2022",
      module: "课程内容",
    });
    expect(result.references[0]?.score).toBeCloseTo(81.23);
    expect(result.context).toContain("课标要求");
    expect(rpc).toHaveBeenCalledWith("match_standard_entries_hybrid", {
      query_text: "五年级 篮球 运球",
      query_embedding: [0.11, 0.22, 0.33],
      match_limit: 4,
      target_market: "cn-compulsory-2022",
    });
  });

  it("passes lexical query text through hybrid retrieval for entity-heavy queries", async () => {
    const query = "三年级排球双循环赛制";
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: "std-volley-1",
          title: "三年级排球双循环赛制",
          module: "课程内容",
          grade_bands: ["3-4年级"],
          section_path: ["课程内容", "球类运动"],
          keywords: ["排球", "双循环", "比赛"],
          summary: "明确排球双循环赛制的组织与计分方式。",
          requirements: ["要求双循环"],
          teaching_implications: ["建议"],
          citation: "课程标准 第20页",
          similarity: 0.95,
        },
      ],
      error: null,
    });
    const supabase = createAuthenticatedSupabaseClient({ rpc });
    mocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const provider = createSupabaseVectorStandardsProvider();
    const result = await provider.search(query, {
      limit: 3,
      market: "cn-compulsory-2022",
    });

    expect(result.references).toHaveLength(1);
    expect(result.references[0]).toMatchObject({
      id: "std-volley-1",
      title: "三年级排球双循环赛制",
      score: 95,
    });
    expect(rpc).toHaveBeenCalledWith(
      "match_standard_entries_hybrid",
      expect.objectContaining({
        query_text: query,
        target_market: "cn-compulsory-2022",
      }),
    );
  });

  it("returns an empty result with warning when no authenticated user is available", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    });

    const provider = createSupabaseVectorStandardsProvider();
    const result = await provider.search("五年级 篮球 运球", {
      limit: 6,
      market: "cn-compulsory-2022",
    });

    expect(result.references).toEqual([]);
    expect(result.corpus).toBeNull();
    expect(result.warning).toContain("需要登录");
    expect(result.context).toContain("未检索到匹配");
  });

  it("returns an empty result with warning when rpc succeeds but no entries are available", async () => {
    const supabase = createAuthenticatedSupabaseClient({
      rpc: vi.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    });
    mocks.createSupabaseServerClient.mockResolvedValue(supabase);

    const provider = createSupabaseVectorStandardsProvider();
    const result = await provider.search("五年级 篮球 运球", {
      limit: 6,
      market: "cn-compulsory-2022",
    });

    expect(result.references).toEqual([]);
    expect(result.corpus).toMatchObject({
      corpusId: "corpus-1",
    });
    expect(result.warning).toContain("未返回匹配条目");
    expect(result.context).toContain("未检索到匹配");
  });
});
