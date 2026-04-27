import { beforeEach, describe, expect, it } from "vitest";

import {
  getRateLimitBucketKeysForTest,
  resetRateLimitBucketsForTest,
  takeRateLimitToken,
} from "@/lib/api/rate-limit";

describe("takeRateLimitToken", () => {
  beforeEach(() => {
    resetRateLimitBucketsForTest();
  });

  it("removes expired buckets before recording a new access", () => {
    expect(takeRateLimitToken({ key: "old", limit: 1, now: 0, windowMs: 1000 })).toEqual({
      ok: true,
    });
    expect(getRateLimitBucketKeysForTest()).toEqual(["old"]);

    expect(takeRateLimitToken({ key: "fresh", limit: 1, now: 1000, windowMs: 1000 })).toEqual({
      ok: true,
    });

    expect(getRateLimitBucketKeysForTest()).toEqual(["fresh"]);
  });

  it("trims the oldest buckets when the configured maximum is exceeded", () => {
    takeRateLimitToken({ key: "a", limit: 1, maxBuckets: 2, now: 0, windowMs: 10_000 });
    takeRateLimitToken({ key: "b", limit: 1, maxBuckets: 2, now: 0, windowMs: 10_000 });
    takeRateLimitToken({ key: "c", limit: 1, maxBuckets: 2, now: 0, windowMs: 10_000 });

    expect(getRateLimitBucketKeysForTest()).toEqual(["b", "c"]);
  });

  it("treats a repeated access as recent before trimming", () => {
    takeRateLimitToken({ key: "a", limit: 3, maxBuckets: 2, now: 0, windowMs: 10_000 });
    takeRateLimitToken({ key: "b", limit: 3, maxBuckets: 2, now: 0, windowMs: 10_000 });
    takeRateLimitToken({ key: "a", limit: 3, maxBuckets: 2, now: 1, windowMs: 10_000 });
    takeRateLimitToken({ key: "c", limit: 3, maxBuckets: 2, now: 1, windowMs: 10_000 });

    expect(getRateLimitBucketKeysForTest()).toEqual(["a", "c"]);
  });
});
