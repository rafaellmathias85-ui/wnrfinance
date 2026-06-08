// Rate limiter with Redis backend (ioredis for local/self-hosted, Upstash for cloud).
// Falls back to in-memory when neither is configured.
import crypto from 'crypto';

// ─── In-memory fallback ────────────────────────────────────────────────────
const rateMap = new Map<string, { count: number; resetAt: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateMap) {
    if (val.resetAt <= now) rateMap.delete(key);
  }
}, 60_000);

function inMemoryLimit(
  key: string,
  { maxRequests = 5, windowMs = 60_000 }: { maxRequests?: number; windowMs?: number }
): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  const entry = rateMap.get(key);
  if (!entry || entry.resetAt <= now) {
    rateMap.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, retryAfterMs: 0 };
  }
  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, retryAfterMs: entry.resetAt - now };
  }
  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, retryAfterMs: 0 };
}

// ─── Redis sliding window via MULTI/EXEC ──────────────────────────────────
let redisClient: any = null;

async function getRedis() {
  // Priority 1: local Redis (ioredis)
  const redisUrl = process.env.REDIS_URL; // redis://:password@localhost:6379
  // Priority 2: Upstash (via ioredis-compatible URL)
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;

  if (!redisUrl && !upstashUrl) return null;

  try {
    if (!redisClient) {
      const { default: Redis } = await import('ioredis');
      if (redisUrl) {
        redisClient = new Redis(redisUrl, { lazyConnect: true, enableReadyCheck: false, maxRetriesPerRequest: 1 });
      } else {
        // Upstash also exposes a rediss:// endpoint
        const upstashRedisUrl = process.env.UPSTASH_REDIS_URL; // rediss://... format
        if (!upstashRedisUrl) return null;
        redisClient = new Redis(upstashRedisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
      }
      await redisClient.connect().catch(() => { redisClient = null; });
    }
    return redisClient;
  } catch {
    redisClient = null;
    return null;
  }
}

async function redisLimit(
  redis: any,
  key: string,
  { maxRequests = 5, windowMs = 60_000 }: { maxRequests?: number; windowMs?: number }
): Promise<{ allowed: boolean; remaining: number; retryAfterMs: number }> {
  const now = Date.now();
  const windowKey = `wnr:rl:${key}`;
  const windowSec = Math.ceil(windowMs / 1000);

  // Sliding window using sorted set: score = timestamp
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(windowKey, 0, now - windowMs);   // remove old entries
  pipeline.zadd(windowKey, now, `${now}-${Math.random()}`);  // add current request
  pipeline.zcard(windowKey);                                  // count in window
  pipeline.expire(windowKey, windowSec);                      // auto-expire key
  const results = await pipeline.exec();

  const count: number = results?.[2]?.[1] ?? maxRequests + 1;
  const allowed = count <= maxRequests;
  return {
    allowed,
    remaining: Math.max(0, maxRequests - count),
    retryAfterMs: allowed ? 0 : windowMs,
  };
}

// ─── Public API ────────────────────────────────────────────────────────────
export async function rateLimit(
  key: string,
  opts: { maxRequests?: number; windowMs?: number } = {}
): Promise<{ allowed: boolean; remaining: number; retryAfterMs: number }> {
  try {
    const redis = await getRedis();
    if (redis) return await redisLimit(redis, key, opts);
  } catch {
    // Redis error → degrade to in-memory
  }
  return inMemoryLimit(key, opts);
}

// Synchronous version for middleware / auth routes (in-memory only, fast)
export function rateLimitSync(
  key: string,
  opts: { maxRequests?: number; windowMs?: number } = {}
): { allowed: boolean; remaining: number; retryAfterMs: number } {
  return inMemoryLimit(key, opts);
}

// Hash IP to avoid storing raw IPs in memory/Redis
export function rateLimitKey(prefix: string, ip: string): string {
  return `${prefix}:${crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16)}`;
}
