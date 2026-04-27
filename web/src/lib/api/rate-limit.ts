type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type SmartEduGlobal = typeof globalThis & {
  __smartEduRateLimitBuckets?: Map<string, RateLimitBucket>;
};

const DEFAULT_MAX_RATE_LIMIT_BUCKETS = 2048;

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

export function takeRateLimitToken({
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
}) {
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
}
