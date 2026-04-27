import { describe, expect, it } from "vitest";

import { getSafeAppRedirectPath } from "./safe-redirect";

describe("getSafeAppRedirectPath", () => {
  it("keeps site-relative paths with query and hash", () => {
    expect(getSafeAppRedirectPath("/account?tab=security#password")).toBe(
      "/account?tab=security#password",
    );
  });

  it("falls back for absolute or protocol-relative URLs", () => {
    expect(getSafeAppRedirectPath("https://example.com/phish")).toBe("/");
    expect(getSafeAppRedirectPath("//example.com/phish")).toBe("/");
  });

  it("falls back for empty paths and backslash-based browser normalizations", () => {
    expect(getSafeAppRedirectPath(null)).toBe("/");
    expect(getSafeAppRedirectPath("/\\example.com")).toBe("/");
  });
});
