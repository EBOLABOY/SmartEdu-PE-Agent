import { describe, expect, it } from "vitest";

import {
  buildAiGatewayRateLimitKey,
  isAiGatewayRateLimitedPath,
} from "@/lib/api/ai-gateway";
import { SMARTEDU_PROJECT_HEADER } from "@/lib/api/smartedu-request-headers";

describe("ai gateway rate limit", () => {
  it("matches only the targeted AI POST endpoints", () => {
    expect(isAiGatewayRateLimitedPath("/api/chat")).toBe(true);
    expect(isAiGatewayRateLimitedPath("/api/competition-lesson-patches")).toBe(false);
    expect(isAiGatewayRateLimitedPath("/api/projects")).toBe(false);
  });

  it("builds a coarse rate limit key from path, actor ip, and optional project id", () => {
    const request = new Request("https://example.com/api/chat", {
      headers: {
        "x-forwarded-for": "203.0.113.8",
        [SMARTEDU_PROJECT_HEADER]: "project-789",
      },
    });

    expect(buildAiGatewayRateLimitKey(request)).toBe(
      "ai-gateway:/api/chat:project:project-789:actor:ip:203.0.113.8",
    );
  });
});
