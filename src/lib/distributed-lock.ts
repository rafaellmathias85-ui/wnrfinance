// Lock distribuído via Redis SET NX — garante que jobs agendados (cron)
// rodem em UMA única instância quando o app escala horizontalmente
// (PM2 cluster, múltiplos containers).
// Sem Redis disponível, degrada para execução local (comportamento atual).

import crypto from 'crypto';

let redisClient: any = null;

async function getRedis(): Promise<any | null> {
  const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;
  if (!redisUrl) return null;
  try {
    if (!redisClient) {
      const { default: Redis } = await import('ioredis');
      redisClient = new Redis(redisUrl, {
        lazyConnect: true,
        enableReadyCheck: false,
        maxRetriesPerRequest: 1,
      });
      await redisClient.connect().catch(() => {
        redisClient = null;
      });
    }
    return redisClient;
  } catch {
    redisClient = null;
    return null;
  }
}

/**
 * Tenta adquirir um lock distribuído.
 * @returns função de release se adquirido; null se outra instância detém o lock.
 *          Se Redis indisponível, retorna release no-op (executa localmente).
 */
export async function acquireLock(
  name: string,
  ttlMs: number,
): Promise<(() => Promise<void>) | null> {
  const redis = await getRedis();
  if (!redis) {
    // Sem Redis → sem coordenação possível; executa (single-instance assumido)
    return async () => {};
  }

  const key = `wnr:lock:${name}`;
  const token = crypto.randomUUID();

  try {
    const acquired = await redis.set(key, token, 'PX', ttlMs, 'NX');
    if (acquired !== 'OK') return null;

    return async () => {
      try {
        // Release atômico: só apaga se o token ainda for nosso (evita apagar lock alheio)
        const script =
          'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
        await redis.eval(script, 1, key, token);
      } catch {
        /* lock expira sozinho pelo TTL */
      }
    };
  } catch {
    return async () => {};
  }
}
