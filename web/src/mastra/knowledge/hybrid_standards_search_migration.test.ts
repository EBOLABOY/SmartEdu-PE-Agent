import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260429133000_hybrid_standards_search.sql",
);

describe("hybrid-standards-search-migration", () => {
  it("defines the hybrid search rpc with lexical and vector fusion", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("create or replace function public.match_standard_entries_hybrid(");
    expect(sql).toContain("query_text text");
    expect(sql).toContain("plainto_tsquery('simple', raw_query)");
    expect(sql).toContain("ts_rank_cd(");
    expect(sql).toContain("using gin");
    expect(sql).toContain("rrf_k int default 60");
    expect(sql).toContain("exact_match_bonus");
    expect(sql).toContain("fused_score");
    expect(sql).toContain("grant execute on function public.match_standard_entries_hybrid");
  });
});
