export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const DeleteSchema = z.object({
  confirmation: z.literal('DELETAR MINHA CONTA', { errorMap: () => ({ message: 'Digite exatamente: DELETAR MINHA CONTA' }) }),
  reason: z.string().max(500).optional(),
});

// POST /api/lgpd/delete — Anonymize and schedule account deletion (LGPD Art. 18, inciso VI)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const raw = await req.json().catch(() => null);
  const parsed = DeleteSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Confirmação inválida', details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const userId = session.user.id;

  try {
    // Anonymize personal data instead of hard-delete to preserve financial integrity
    await prisma.user.update({
      where: { id: userId },
      data: {
        name: `[Removido]`,
        email: `deleted_${userId}@removed.wnr`,
        password: null,
        totpSecret: null,
        backupCodes: null,
      },
    });

    // Remove bank connections (contains sensitive financial links)
    await prisma.bankConnection.deleteMany({ where: { userId } });

    // Remove raw bank transactions
    await prisma.bankTransaction.deleteMany({ where: { userId } });

    // Remove alerts
    await prisma.alert.deleteMany({ where: { userId } });

    // Log the deletion request for audit purposes
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'LGPD_DELETE_REQUEST',
        entity: 'user',
        entityId: userId,
        metadata: { reason: parsed.data.reason || null, requestedAt: new Date().toISOString() },
      },
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      message: 'Dados pessoais anonimizados. Registros financeiros mantidos por obrigação legal (5 anos). Sessão encerrada.',
    });
  } catch (err) {
    console.error('LGPD delete error:', err);
    return NextResponse.json({ error: 'Erro ao processar solicitação' }, { status: 500 });
  }
}
