export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { validateServiceFiscalRule } from '@/lib/service-fiscal-rules';

const UpdateFiscalRuleSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  serviceDescription: z.string().max(500).optional().nullable(),
  serviceCodeLc116: z.string().min(1).max(30).optional(),
  cnae: z.string().min(1).max(20).optional(),
  providerMunicipalRegistration: z.string().min(1).max(40).optional(),
  providerCityCode: z.string().min(1).max(20).optional(),
  providerCityName: z.string().max(120).optional().nullable(),
  customerCityCode: z.string().min(1).max(20).optional(),
  customerCityName: z.string().max(120).optional().nullable(),
  operationNature: z.string().min(1).max(80).optional(),
  taxRegime: z.string().min(1).max(80).optional(),
  isSimplesNacional: z.boolean().optional(),
  issRate: z.preprocess(Number, z.number().min(0).max(5)).optional(),
  issWithheld: z.boolean().optional(),
  inssRate: z.preprocess(v => Number(v ?? 0), z.number().min(0).max(100)).optional(),
  irrfRate: z.preprocess(v => Number(v ?? 0), z.number().min(0).max(100)).optional(),
  csllRate: z.preprocess(v => Number(v ?? 0), z.number().min(0).max(100)).optional(),
  pisRate: z.preprocess(v => Number(v ?? 0), z.number().min(0).max(100)).optional(),
  cofinsRate: z.preprocess(v => Number(v ?? 0), z.number().min(0).max(100)).optional(),
  cbsRate: z.preprocess(v => Number(v ?? 0), z.number().min(0).max(100)).optional(),
  ibsRate: z.preprocess(v => Number(v ?? 0), z.number().min(0).max(100)).optional(),
  cbsCst: z.string().max(20).optional().nullable(),
  ibsCst: z.string().max(20).optional().nullable(),
  cbsClassificationCode: z.string().max(30).optional().nullable(),
  ibsClassificationCode: z.string().max(30).optional().nullable(),
  codigoTributarioMunicipio: z.string().max(60).optional().nullable(),
  regimeEspecialTributacao: z.number().int().min(0).max(6).optional().nullable(),
  effectiveFrom: z.string().optional().nullable(),
  effectiveTo: z.string().optional().nullable(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  notes: z.string().max(2000).optional().nullable(),
});

async function getContext() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { error: NextResponse.json({ error: 'Nao autorizado' }, { status: 401 }) };
  const companyId = session.user.activeCompanyId;
  if (!companyId) return { error: NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 }) };
  return { session, companyId };
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getContext();
  if (ctx.error) return ctx.error;

  const rule = await prisma.serviceFiscalRule.findFirst({
    where: { id: params.id, companyId: ctx.companyId },
  });
  if (!rule) return NextResponse.json({ error: 'Regra fiscal nao encontrada' }, { status: 404 });

  return NextResponse.json({ rule, validation: validateServiceFiscalRule(rule) });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getContext();
  if (ctx.error) return ctx.error;

  const existing = await prisma.serviceFiscalRule.findFirst({
    where: { id: params.id, companyId: ctx.companyId },
  });
  if (!existing) return NextResponse.json({ error: 'Regra fiscal nao encontrada' }, { status: 404 });

  const raw = await req.json().catch(() => null);
  const parsed = UpdateFiscalRuleSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const body = parsed.data;
  const data = {
    ...body,
    effectiveFrom: body.effectiveFrom === undefined ? undefined : body.effectiveFrom ? new Date(body.effectiveFrom) : null,
    effectiveTo: body.effectiveTo === undefined ? undefined : body.effectiveTo ? new Date(body.effectiveTo) : null,
  };

  const rule = await prisma.$transaction(async tx => {
    if (body.isDefault === true) {
      await tx.serviceFiscalRule.updateMany({
        where: { companyId: ctx.companyId, id: { not: params.id } },
        data: { isDefault: false },
      });
    }
    return tx.serviceFiscalRule.update({ where: { id: params.id }, data });
  });

  return NextResponse.json({ rule, validation: validateServiceFiscalRule(rule) });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getContext();
  if (ctx.error) return ctx.error;

  const existing = await prisma.serviceFiscalRule.findFirst({
    where: { id: params.id, companyId: ctx.companyId },
  });
  if (!existing) return NextResponse.json({ error: 'Regra fiscal nao encontrada' }, { status: 404 });

  const linkedCount = await prisma.accountsReceivable.count({ where: { fiscalRuleId: params.id } });
  if (linkedCount > 0) {
    await prisma.serviceFiscalRule.update({ where: { id: params.id }, data: { isActive: false, isDefault: false } });
    return NextResponse.json({ ok: true, archived: true });
  }

  await prisma.serviceFiscalRule.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
