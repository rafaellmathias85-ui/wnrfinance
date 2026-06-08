export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = session.user.id;

    // Get all logs for this user
    const logs = await prisma.aIProviderLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5000, // Last 5000 entries
    });

    // Group by providerId
    const statsMap: Record<string, {
      providerId: string;
      providerName: string;
      model: string;
      requests: number;
      successes: number;
      failures: number;
      failovers: number;
      totalLatency: number;
      successCount: number;
    }> = {};

    for (const log of logs) {
      const key = log.providerId;
      if (!statsMap[key]) {
        statsMap[key] = {
          providerId: log.providerId,
          providerName: log.providerName,
          model: log.model,
          requests: 0,
          successes: 0,
          failures: 0,
          failovers: 0,
          totalLatency: 0,
          successCount: 0,
        };
      }
      const s = statsMap[key];
      s.requests++;
      if (log.success) {
        s.successes++;
        s.totalLatency += log.latencyMs;
        s.successCount++;
      } else {
        s.failures++;
      }
      if (log.isFailover) s.failovers++;
    }

    const stats = Object.values(statsMap).map(s => ({
      providerId: s.providerId,
      providerName: s.providerName,
      model: s.model,
      requests: s.requests,
      successes: s.successes,
      failures: s.failures,
      failovers: s.failovers,
      avgLatency: s.successCount > 0 ? Math.round(s.totalLatency / s.successCount) : 0,
      availability: s.requests > 0 ? Math.round((s.successes / s.requests) * 1000) / 10 : null,
    }));

    return NextResponse.json({ stats });
  } catch (error: any) {
    console.error('GET /api/ai/providers/stats error:', error);
    return NextResponse.json({ error: 'Erro ao carregar estatisticas' }, { status: 500 });
  }
}
