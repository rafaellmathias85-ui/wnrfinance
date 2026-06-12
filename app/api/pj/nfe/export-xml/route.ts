export const dynamic = 'force-dynamic';

// Exportação de XMLs de NF-e/NFS-e em lote (paridade BomControle: "Exportar XML").
// POST /api/pj/nfe/export-xml  { ids?: string[], from?: string, to?: string }
// Baixa os XMLs do provedor e devolve um único arquivo .tar (sem dependências externas).
// Uso típico: entrega mensal à contabilidade.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit-log';

// ── Tar builder mínimo (POSIX ustar) ────────────────────────────────────────
function tarHeader(name: string, size: number): Buffer {
  const buf = Buffer.alloc(512);
  buf.write(name.slice(0, 99), 0, 'utf8'); // name
  buf.write('0000644\0', 100, 'ascii'); // mode
  buf.write('0000000\0', 108, 'ascii'); // uid
  buf.write('0000000\0', 116, 'ascii'); // gid
  buf.write(size.toString(8).padStart(11, '0') + '\0', 124, 'ascii'); // size
  buf.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0', 136, 'ascii'); // mtime
  buf.write('        ', 148, 'ascii'); // checksum placeholder (8 espaços)
  buf.write('0', 156, 'ascii'); // typeflag: arquivo normal
  buf.write('ustar\0', 257, 'ascii');
  buf.write('00', 263, 'ascii');
  const checksum = buf.reduce((acc, b) => acc + b, 0);
  buf.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii');
  return buf;
}

function tarEntry(name: string, content: Buffer): Buffer[] {
  const padding = (512 - (content.length % 512)) % 512;
  return [tarHeader(name, content.length), content, Buffer.alloc(padding)];
}

function sanitizeFileName(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.activeCompanyId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  const companyId = session.user.activeCompanyId;

  try {
    const body = await req.json().catch(() => ({}));
    const where: any = { companyId, xmlUrl: { not: null }, status: { in: ['autorizada', 'enviada', 'cancelada'] } };
    if (body.ids?.length) where.id = { in: body.ids };
    if (body.from || body.to) {
      where.issuedAt = {
        ...(body.from ? { gte: new Date(body.from) } : {}),
        ...(body.to ? { lte: new Date(body.to) } : {}),
      };
    }

    const nfes = await prisma.nFe.findMany({
      where,
      select: { id: true, number: true, rpsNumber: true, xmlUrl: true, customerName: true, issuedAt: true, status: true },
      orderBy: { issuedAt: 'asc' },
      take: 500,
    });

    if (nfes.length === 0) {
      return NextResponse.json({ error: 'Nenhuma nota com XML disponível no filtro' }, { status: 404 });
    }

    const chunks: Buffer[] = [];
    const errors: Array<{ id: string; error: string }> = [];

    for (const nfe of nfes) {
      try {
        const res = await fetch(nfe.xmlUrl!, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const xml = Buffer.from(await res.arrayBuffer());
        const fileName = sanitizeFileName(
          `nfse_${nfe.number || nfe.rpsNumber || nfe.id}_${nfe.customerName || 'cliente'}.xml`,
        );
        chunks.push(...tarEntry(fileName, xml));
      } catch (err: any) {
        errors.push({ id: nfe.id, error: err?.message });
      }
    }

    if (chunks.length === 0) {
      return NextResponse.json({ error: 'Falha ao baixar os XMLs do provedor', details: errors }, { status: 502 });
    }

    // Fim do tar: dois blocos de 512 bytes zerados
    chunks.push(Buffer.alloc(1024));
    const tar = Buffer.concat(chunks);

    await createAuditLog({
      userId: session.user.id,
      companyId,
      action: 'EXPORT',
      entity: 'nfe',
      metadata: { event: 'export_xml_batch', count: nfes.length - errors.length, errors: errors.length },
      request: req,
    });

    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(tar as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-tar',
        'Content-Disposition': `attachment; filename="nfse_xmls_${stamp}.tar"`,
        'X-Export-Errors': String(errors.length),
      },
    });
  } catch (error: any) {
    console.error('POST export-xml error:', error);
    return NextResponse.json({ error: 'Erro ao exportar XMLs' }, { status: 500 });
  }
}
