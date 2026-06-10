export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Parse NF-e XML to extract key fields
function parseNFeXml(xml: string) {
  const get = (tag: string) => {
    const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`));
    return m ? m[1].trim() : null;
  };
  const getAttr = (tag: string, attr: string) => {
    const m = xml.match(new RegExp(`<${tag}[^>]*${attr}="([^"]+)"`));
    return m ? m[1].trim() : null;
  };

  // chave de acesso
  const accessKey = get('chNFe') || getAttr('infNFe', 'Id')?.replace(/^NFe/, '') || null;
  const number = get('nNF');
  const series = get('serie');
  const supplierName = get('xNome');
  const supplierCnpj = get('CNPJ');
  const issueDateStr = get('dhEmi') || get('dEmi');
  const issueDate = issueDateStr ? new Date(issueDateStr) : null;
  const totalValue = get('vNF') ? parseFloat(get('vNF')!) : null;

  // Items
  const items: any[] = [];
  const itemMatches = xml.matchAll(/<det\s+nItem="(\d+)">([\s\S]*?)<\/det>/g);
  for (const m of itemMatches) {
    const itemXml = m[2];
    const itemGet = (tag: string) => {
      const im = itemXml.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`));
      return im ? im[1].trim() : null;
    };
    items.push({
      nItem: m[1],
      descricao: itemGet('xProd'),
      ncm: itemGet('NCM'),
      cfop: itemGet('CFOP'),
      unidade: itemGet('uCom'),
      quantidade: itemGet('qCom') ? parseFloat(itemGet('qCom')!) : null,
      valorUnitario: itemGet('vUnCom') ? parseFloat(itemGet('vUnCom')!) : null,
      valorTotal: itemGet('vProd') ? parseFloat(itemGet('vProd')!) : null,
    });
  }

  return { accessKey, number, series, supplierName, supplierCnpj, issueDate, totalValue, items };
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const status = searchParams.get('status');
  const supplierCnpj = searchParams.get('supplierCnpj');

  const where: any = { companyId };
  if (status) where.status = status;
  if (supplierCnpj) where.supplierCnpj = { contains: supplierCnpj };

  const [items, total] = await Promise.all([
    prisma.receivedNFe.findMany({
      where,
      orderBy: { issueDate: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.receivedNFe.count({ where }),
  ]);

  return NextResponse.json({ items, total, page, pages: Math.ceil(total / limit) });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const contentType = req.headers.get('content-type') || '';

  // XML upload via multipart
  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Arquivo XML obrigatório' }, { status: 400 });

    const xml = await file.text();
    const parsed = parseNFeXml(xml);

    if (!parsed.accessKey) {
      return NextResponse.json({ error: 'Chave de acesso não encontrada no XML' }, { status: 400 });
    }

    try {
      const record = await prisma.receivedNFe.create({
        data: {
          companyId,
          accessKey: parsed.accessKey,
          number: parsed.number,
          series: parsed.series,
          supplierName: parsed.supplierName,
          supplierCnpj: parsed.supplierCnpj,
          issueDate: parsed.issueDate,
          totalValue: parsed.totalValue,
          items: parsed.items,
          xmlContent: xml,
          status: 'valida',
        },
      });
      return NextResponse.json(record, { status: 201 });
    } catch (err: any) {
      if (err.code === 'P2002') {
        return NextResponse.json({ error: 'NF-e com esta chave de acesso já importada' }, { status: 409 });
      }
      throw err;
    }
  }

  // Manual JSON entry (for manual input without XML)
  const body = await req.json();
  if (!body.accessKey) return NextResponse.json({ error: 'Chave de acesso obrigatória' }, { status: 400 });

  try {
    const record = await prisma.receivedNFe.create({
      data: {
        companyId,
        accessKey: body.accessKey.replace(/\s/g, ''),
        number: body.number || null,
        series: body.series || null,
        supplierName: body.supplierName || null,
        supplierCnpj: body.supplierCnpj || null,
        issueDate: body.issueDate ? new Date(body.issueDate) : null,
        totalValue: body.totalValue ? parseFloat(body.totalValue) : null,
        notes: body.notes || null,
        status: 'valida',
      },
    });
    return NextResponse.json(record, { status: 201 });
  } catch (err: any) {
    if (err.code === 'P2002') {
      return NextResponse.json({ error: 'NF-e com esta chave de acesso já importada' }, { status: 409 });
    }
    throw err;
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  const body = await req.json();
  const existing = await prisma.receivedNFe.findFirst({ where: { id, companyId } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const updated = await prisma.receivedNFe.update({
    where: { id },
    data: {
      ...(body.status !== undefined && { status: body.status }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.payableId !== undefined && { payableId: body.payableId }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  const existing = await prisma.receivedNFe.findFirst({ where: { id, companyId } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  await prisma.receivedNFe.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
