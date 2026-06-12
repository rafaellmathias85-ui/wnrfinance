export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAuditLogs } from '@/lib/audit-log';

// GET /api/audit-logs?entity=&action=&startDate=&endDate=&page=&limit=
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const entity = searchParams.get('entity') || undefined;
    const entityId = searchParams.get('entityId') || undefined;
    const action = searchParams.get('action') || undefined;
    const startDate = searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined;
    const endDate = searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    const isAdmin = session.user.role === 'master' || session.user.role === 'admin';
    const companyId = session.user.activeCompanyId || undefined;

    const result = await getAuditLogs({
      userId: isAdmin ? undefined : session.user.id, // admins see all, regular users see own
      companyId: isAdmin ? undefined : companyId,
      entity,
      entityId,
      action,
      startDate,
      endDate,
      page,
      limit,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Audit log GET error:', error);
    return NextResponse.json({ error: 'Erro ao buscar logs' }, { status: 500 });
  }
}
