import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const dbUrl = process.env.DATABASE_URL || '';
  // Force low connection pool to avoid idle-session timeout storms
  const separator = dbUrl.includes('?') ? '&' : '?';
  const pooledUrl = dbUrl.includes('connection_limit')
    ? dbUrl
    : `${dbUrl}${separator}connection_limit=5&pool_timeout=10`;

  const client = new PrismaClient({
    log: ['error'],
    datasources: {
      db: { url: pooledUrl },
    },
  });

  // Handle connection errors gracefully with retry
  client.$use(async (params, next) => {
    const MAX_RETRIES = 2;
    let lastError: any;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await next(params);
      } catch (error: any) {
        lastError = error;
        const isTransient =
          error?.message?.includes('idle-session timeout') ||
          error?.message?.includes('Connection reset') ||
          error?.message?.includes('connection is not open') ||
          error?.message?.includes('socket creation failure') ||
          error?.message?.includes('connect ECONNREFUSED') ||
          error?.code === 'P2024' ||
          error?.code === 'P1017';
        if (isTransient && attempt < MAX_RETRIES) {
          try { await client.$disconnect(); } catch {}
          await new Promise(r => setTimeout(r, 200 * (attempt + 1)));
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  });

  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
