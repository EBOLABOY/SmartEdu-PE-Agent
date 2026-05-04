/**
 * @module rate-limit
 * 通用请求速率限制。基于 Redis（Upstash）或内存桶实现
 * 滑动窗口限流，提供令牌获取和请求方标识提取。
 */
import { Ratelimit, type Duration } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

type SmartEduGlobal = typeof globalThis & {
  __smartEduRateLimitBuckets?: Map<string, RateLimitBucket>;
};

const DEFAULT_MAX_RATE_LIMIT_BUCKETS = 2048;
const RATE_LIMIT_REDIS_PREFIX = "smartedu:ratelimit";

let missingRedisWarningLogged = false;
const upstashRateLimiters = new Map<string, Ratelimit>();

function getBuckets() {
  const globalStore = globalThis as SmartEduGlobal;
  globalStore.__smartEduRateLimitBuckets ??= new Map<string, RateLimitBucket>();
  return globalStore.__smartEduRateLimitBuckets;
}

function pruneExpiredBuckets(buckets: Map<string, RateLimitBucket>, now: number) {
  for (const [bucketKey, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(bucketKey);
    }
  }
}

function trimOldestBuckets(buckets: Map<string, RateLimitBucket>, maxBuckets: number) {
  const bucketLimit = Math.max(1, maxBuckets);

  while (buckets.size > bucketLimit) {
    const oldestKey = buckets.keys().next().value;

    if (oldestKey === undefined) {
      return;
    }

    buckets.delete(oldestKey);
  }
}

function touchBucket(
  buckets: Map<string, RateLimitBucket>,
  key: string,
  bucket: RateLimitBucket,
) {
  buckets.delete(key);
  buckets.set(key, bucket);
}

function toDuration(windowMs: number): Duration {
  return `${Math.max(1, Math.ceil(windowMs / 1000))} s` as Duration;
}

function hasUpstashRedisConfig() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function getUpstashRateLimiter(limit: number, windowMs: number) {
  if (!hasUpstashRedisConfig()) {
    return null;
  }

  const cacheKey = `${limit}:${windowMs}`;
  const cachedRateLimiter = upstashRateLimiters.get(cacheKey);

  if (cachedRateLimiter) {
    return cachedRateLimiter;
  }

  const rateLimiter = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(limit, toDuration(windowMs)),
    prefix: RATE_LIMIT_REDIS_PREFIX,
    ephemeralCache: false,
    analytics: false,
  });

  upstashRateLimiters.set(cacheKey, rateLimiter);
  return rateLimiter;
}

function shouldUseLocalMemoryFallback() {
  return process.env.NODE_ENV !== "production" || process.env.SMARTEDU_RATE_LIMIT_FALLBACK === "memory";
}

function warnMissingDistributedRateLimitOnce() {
  if (missingRedisWarningLogged) {
    return;
  }

  missingRedisWarningLogged = true;
  // TODO: replace with structured logger
  console.warn(
    "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN are missing; production requests are not rate-limited.",
  );
}

function takeLocalRateLimitToken({
  key,
  limit,
  maxBuckets = DEFAULT_MAX_RATE_LIMIT_BUCKETS,
  now = Date.now(),
  windowMs,
}: {
  key: string;
  limit: number;
  maxBuckets?: number;
  now?: number;
  windowMs: number;
}): RateLimitResult {
  const buckets = getBuckets();
  pruneExpiredBuckets(buckets, now);

  const currentBucket = buckets.get(key);

  if (!currentBucket) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    trimOldestBuckets(buckets, maxBuckets);
    return { ok: true as const };
  }

  if (currentBucket.count >= limit) {
    touchBucket(buckets, key, currentBucket);
    trimOldestBuckets(buckets, maxBuckets);
    return {
      ok: false as const,
      retryAfterSeconds: Math.max(1, Math.ceil((currentBucket.resetAt - now) / 1000)),
    };
  }

  currentBucket.count += 1;
  touchBucket(buckets, key, currentBucket);
  trimOldestBuckets(buckets, maxBuckets);
  return { ok: true as const };
}

export async function takeRateLimitToken({
  key,
  limit,
  maxBuckets,
  now,
  windowMs,
}: {
  key: string;
  limit: number;
  maxBuckets?: number;
  now?: number;
  windowMs: number;
}): Promise<RateLimitResult> {
  const upstashRateLimiter = getUpstashRateLimiter(limit, windowMs);

  if (upstashRateLimiter) {
    const response = await upstashRateLimiter.limit(key);
    void response.pending.catch((error: unknown) => {
      // TODO: replace with structured logger
      console.warn("[rate-limit] async upstash task failed", {
        message: error instanceof Error ? error.message : "unknown-error",
      });
    });

    if (response.success) {
      return { ok: true };
    }

    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((response.reset - Date.now()) / 1000)),
    };
  }

  if (shouldUseLocalMemoryFallback()) {
    return takeLocalRateLimitToken({ key, limit, maxBuckets, now, windowMs });
  }

  warnMissingDistributedRateLimitOnce();
  return { ok: true };
}

export function getRequestActorKey(request: Request, userId: string | undefined) {
  if (userId) {
    return `user:${userId}`;
  }

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  return `ip:${forwardedFor || realIp || "unknown"}`;
}

export function getRateLimitBucketKeysForTest() {
  return Array.from(getBuckets().keys());
}

export function resetRateLimitBucketsForTest() {
  getBuckets().clear();
  upstashRateLimiters.clear();
  missingRedisWarningLogged = false;
}
