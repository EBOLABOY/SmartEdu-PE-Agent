import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getRateLimitBucketKeysForTest,
  resetRateLimitBucketsForTest,
  takeRateLimitToken,
} from "@/lib/api/rate-limit";

describe("takeRateLimitToken", () => {
  beforeEach(() => {
    resetRateLimitBucketsForTest();
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("removes expired buckets before recording a new access", async () => {
    await expect(takeRateLimitToken({ key: "old", limit: 1, now: 0, windowMs: 1000 })).resolves.toEqual({
      ok: true,
    });
    expect(getRateLimitBucketKeysForTest()).toEqual(["old"]);

    await expect(takeRateLimitToken({ key: "fresh", limit: 1, now: 1000, windowMs: 1000 })).resolves.toEqual({
      ok: true,
    });

    expect(getRateLimitBucketKeysForTest()).toEqual(["fresh"]);
  });

  it("trims the oldest buckets when the configured maximum is exceeded", async () => {
    await takeRateLimitToken({ key: "a", limit: 1, maxBuckets: 2, now: 0, windowMs: 10_000 });
    await takeRateLimitToken({ key: "b", limit: 1, maxBuckets: 2, now: 0, windowMs: 10_000 });
    await takeRateLimitToken({ key: "c", limit: 1, maxBuckets: 2, now: 0, windowMs: 10_000 });

    expect(getRateLimitBucketKeysForTest()).toEqual(["b", "c"]);
  });

  it("treats a repeated access as recent before trimming", async () => {
    await takeRateLimitToken({ key: "a", limit: 3, maxBuckets: 2, now: 0, windowMs: 10_000 });
    await takeRateLimitToken({ key: "b", limit: 3, maxBuckets: 2, now: 0, windowMs: 10_000 });
    await takeRateLimitToken({ key: "a", limit: 3, maxBuckets: 2, now: 1, windowMs: 10_000 });
    await takeRateLimitToken({ key: "c", limit: 3, maxBuckets: 2, now: 1, windowMs: 10_000 });

    expect(getRateLimitBucketKeysForTest()).toEqual(["a", "c"]);
  });

  it("does not pretend to rate-limit production traffic without redis", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");

    await expect(takeRateLimitToken({ key: "a", limit: 1, now: 0, windowMs: 10_000 })).resolves.toEqual({
      ok: true,
    });

    expect(getRateLimitBucketKeysForTest()).toEqual([]);
  });
});
