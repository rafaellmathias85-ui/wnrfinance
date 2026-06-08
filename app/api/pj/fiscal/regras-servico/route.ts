export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { validateServiceFiscalRule } from '@/lib/service-fiscal-rules';

const FiscalRuleSchema = z.object({
  name: z.string().min(1).max(120),
  serviceDescription: z.string().max(500).optional().nullable(),
  serviceCodeLc116: z.string().min(1).max(30),
  cnae: z.string().min(1).max(20),
  providerMunicipalRegistration: z.string().min(1).max(40),
  providerCityCode: z.string().min(1).max(20),
  providerCityName: z.string().max(120).optional().nullable(),
  customerCityCode: z.string().min(1).max(20),
  customerCityName: z.string().max(120).optional().nullable(),
  operationNature: z.string().min(1).max(80),
  taxRegime: z.string().min(1).max(80),
  isSimplesNacional: z.boolean().optional().default(true),
  issRate: z.preprocess(Number, z.number().min(0).max(5)),
  issWithheld: z.boolean().optional().default(false),
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
  effectiveFrom: z.string().optional().nullable(),
  effectiveTo: z.string().optional().nullable(),
  isDefault: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  notes: z.string().max(2000).optional().nullable(),
});

async function getCompanyContext() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { error: NextResponse.json({ error: 'Nao autorizado' }, { status: 401 }) };
  const companyId = session.user.activeCompanyId;
  if (!companyId) return { error: NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 }) };
  return { session, companyId };
}

export async function GET() {
  const ctx = await getCompanyContext();
  if (ctx.error) return ctx.error;

  const rules = await prisma.serviceFiscalRule.findMany({
    where: { companyId: ctx.companyId },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
  });

  return NextResponse.json({ rules });
}

export async function POST(req: NextRequest) {
  const ctx = await getCompanyContext();
  if (ctx.error) return ctx.error;

  const raw = await req.json().catch(() => null);
  const parsed = FiscalRuleSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const body = parsed.data;
  const data = {
    ...body,
    companyId: ctx.companyId!,
    createdBy: ctx.session!.user.id,
    effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : null,
    effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
  };

  const rule = await prisma.$transaction(async tx => {
    if (body.isDefault) {
      await tx.serviceFiscalRule.updateMany({
        where: { companyId: ctx.companyId },
        data: { isDefault: false },
      });
    }
    return tx.serviceFiscalRule.create({ data });
  });

  const validation = validateServiceFiscalRule(rule);
  return NextResponse.json({ rule, validation }, { status: 201 });
}
