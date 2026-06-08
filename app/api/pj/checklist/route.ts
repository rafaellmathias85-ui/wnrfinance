export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET: pre-emit checklist for company
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });

  // Check certificate
  const activeCert = await prisma.companyCertificate.findFirst({
    where: { companyId, isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  const certExpired = activeCert?.expiresAt ? new Date(activeCert.expiresAt) < new Date() : false;

  // Check connections by category
  const connections = await prisma.companyConnection.findMany({
    where: { companyId, isActive: true },
  });
  const connByCategory: Record<string, any[]> = {};
  connections.forEach(c => {
    if (!connByCategory[c.category]) connByCategory[c.category] = [];
    connByCategory[c.category].push(c);
  });

  // Check bank connections
  const bankConns = await prisma.bankConnection.findMany({
    where: { companyId, status: 'active' },
  });

  const checklist = {
    empresa: {
      ok: !!(company.cnpj && company.name),
      label: 'Dados Cadastrais da Empresa',
      detail: company.cnpj ? `CNPJ: ${company.cnpj}` : 'CNPJ não cadastrado',
    },
    certificado: {
      ok: !!activeCert && !certExpired,
      label: 'Certificado Digital (A1)',
      detail: !activeCert
        ? 'Nenhum certificado ativo. Faça upload do arquivo .pfx.'
        : certExpired
          ? `Certificado expirado em ${new Date(activeCert.expiresAt!).toLocaleDateString('pt-BR')}`
          : `Válido até ${new Date(activeCert.expiresAt!).toLocaleDateString('pt-BR')}`,
      expiresAt: activeCert?.expiresAt,
    },
    nfe: {
      ok: (connByCategory['nfe'] || []).some(c => c.status === 'ok'),
      label: 'Provedor de NF-e',
      detail: connByCategory['nfe']?.length
        ? `${connByCategory['nfe'].length} provedor(es) configurado(s)`
        : 'Nenhum provedor de NF-e configurado. Adicione nas Conexões.',
      connections: connByCategory['nfe'] || [],
    },
    boleto: {
      ok: (connByCategory['boleto'] || []).some(c => c.status === 'ok'),
      label: 'Gateway de Boletos',
      detail: connByCategory['boleto']?.length
        ? `${connByCategory['boleto'].length} gateway(s) configurado(s)`
        : 'Nenhum gateway de boleto configurado.',
      connections: connByCategory['boleto'] || [],
    },
    banco: {
      ok: bankConns.length > 0 || (connByCategory['banco'] || []).some(c => c.status === 'ok'),
      label: 'Conexão Bancária (Extrato)',
      detail: bankConns.length
        ? `${bankConns.length} banco(s) ativo(s)`
        : connByCategory['banco']?.length
          ? `${connByCategory['banco'].length} conexão(ões) configurada(s)`
          : 'Nenhuma conexão bancária. Cadastre na área de Bancos.',
    },
    pagamento: {
      ok: (connByCategory['pagamento'] || []).some(c => c.status === 'ok'),
      label: 'Gateway de Pagamento',
      detail: connByCategory['pagamento']?.length
        ? `${connByCategory['pagamento'].length} gateway(s)`
        : 'Nenhum gateway de pagamento (opcional).',
      optional: true,
    },
    pjFull: {
      ok: company.isPjFull,
      label: 'PJ Full Ativo',
      detail: company.isPjFull
        ? `Plano: ${company.pjFullPlan || 'Ativo'}`
        : 'PJ Full não ativado. Ative na página da Empresa.',
      optional: true,
    },
  };

  const totalRequired = Object.values(checklist).filter((c: any) => !c.optional).length;
  const okRequired = Object.values(checklist).filter((c: any) => !c.optional && c.ok).length;

  return NextResponse.json({
    checklist,
    summary: {
      total: totalRequired,
      ok: okRequired,
      percentage: Math.round((okRequired / totalRequired) * 100),
    },
  });
}
