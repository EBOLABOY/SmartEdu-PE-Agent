import { describe, expect, it } from "vitest";

import { toIsoDateTime } from "@/lib/date-time";

describe("date-time", () => {
  it("会保留标准 UTC ISO 日期时间", () => {
    expect(toIsoDateTime("2026-04-25T12:00:00.000Z")).toBe(
      "2026-04-25T12:00:00.000Z",
    );
  });

  it("会把 offset 日期时间规范化为 Z 结尾 ISO 字符串", () => {
    expect(toIsoDateTime("2026-04-25T12:00:00+00:00")).toBe(
      "2026-04-25T12:00:00.000Z",
    );
  });

  it("会把 Postgres 常见时间字符串规范化为 Z 结尾 ISO 字符串", () => {
    expect(toIsoDateTime("2026-04-25 12:00:00+00")).toBe(
      "2026-04-25T12:00:00.000Z",
    );
  });

  it("遇到非法日期时间时会带字段名抛错", () => {
    expect(() => toIsoDateTime("not-a-date", "projects.created_at")).toThrow(
      "projects.created_at 不是合法的日期时间。",
    );
  });
});
