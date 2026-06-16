export const dynamic = 'force-dynamic';

/**
 * GET /api/pj/boleto/[id]/view
 *
 * Retorna página HTML com visualização do boleto Itaú:
 * linha digitável, código de barras e dados do pagador.
 * Atualiza também boletoBarCode caso esteja vazio.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { resolveItauBoletoData } from '@/lib/boleto';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return new NextResponse('Não autorizado', { status: 401 });
  }

  const companyId = (session.user as any).activeCompanyId as string | undefined;
  if (!companyId) {
    return new NextResponse('Selecione uma empresa', { status: 400 });
  }

  const charge = await prisma.boletoCharge.findFirst({
    where: { id: params.id, companyId },
  });

  if (!charge) {
    return new NextResponse('Cobrança não encontrada', { status: 404 });
  }

  // Tenta enriquecer com dados do Itaú se ainda não temos o barcode
  let linhaDigitavel = charge.boletoBarCode || null;
  if (!linhaDigitavel && charge.nossoNumero && charge.providerKey === 'itau') {
    const data = await resolveItauBoletoData(companyId, charge.id, charge.nossoNumero);
    linhaDigitavel = data?.linhaDigitavel || null;
  }

  const fmtDate = (d: Date | null) =>
    d ? new Date(d).toLocaleDateString('pt-BR') : '—';
  const fmtMoney = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Boleto — ${charge.customerName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; background: #f5f5f5; display: flex; justify-content: center; padding: 20px; }
    .boleto { background: white; max-width: 800px; width: 100%; border: 1px solid #ccc; padding: 20px; }
    .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #003d7d; padding-bottom: 10px; margin-bottom: 16px; }
    .header h1 { font-size: 18px; color: #003d7d; }
    .header .bank { font-size: 24px; font-weight: bold; color: #003d7d; }
    .row { display: flex; gap: 12px; margin-bottom: 10px; }
    .field { flex: 1; }
    .field label { font-size: 10px; text-transform: uppercase; color: #666; display: block; margin-bottom: 2px; }
    .field span { font-size: 13px; font-weight: 500; }
    .linha { background: #f0f7ff; border: 1px solid #003d7d; border-radius: 4px; padding: 12px 16px; margin: 16px 0; }
    .linha label { font-size: 11px; color: #003d7d; font-weight: bold; display: block; margin-bottom: 4px; }
    .linha .code { font-size: 15px; font-family: monospace; letter-spacing: 1px; word-break: break-all; }
    .copy-btn { display: inline-block; margin-top: 8px; padding: 6px 14px; background: #003d7d; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; }
    .copy-btn:hover { background: #005bbd; }
    .barcode-section { text-align: center; margin: 16px 0; padding: 12px; background: white; }
    .barcode-section label { font-size: 11px; color: #666; display: block; margin-bottom: 8px; }
    .barcode-num { font-family: monospace; font-size: 11px; color: #333; word-break: break-all; }
    .footer { border-top: 1px solid #ccc; margin-top: 16px; padding-top: 12px; font-size: 11px; color: #999; text-align: center; }
    .alert { background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 10px 14px; margin-bottom: 12px; font-size: 12px; color: #856404; }
    @media print { body { background: white; padding: 0; } .copy-btn { display: none; } }
  </style>
</head>
<body>
  <div class="boleto">
    <div class="header">
      <div class="bank">341 ITAÚ</div>
      <h1>Boleto Bancário</h1>
    </div>

    ${!linhaDigitavel ? '<div class="alert">⚠️ Linha digitável ainda não disponível. Tente novamente em alguns minutos após o registro do boleto no banco.</div>' : ''}

    <div class="row">
      <div class="field"><label>Beneficiário</label><span>WINNER SOLUÇÕES EM TECNOLOGIA</span></div>
      <div class="field"><label>CNPJ</label><span>21.147.041/0001-85</span></div>
    </div>
    <div class="row">
      <div class="field"><label>Pagador</label><span>${charge.customerName}</span></div>
      <div class="field"><label>Documento</label><span>${charge.customerDoc || '—'}</span></div>
    </div>
    <div class="row">
      <div class="field"><label>Valor</label><span>${fmtMoney(charge.amount)}</span></div>
      <div class="field"><label>Vencimento</label><span>${fmtDate(charge.dueDate)}</span></div>
      <div class="field"><label>Nosso Número</label><span>${charge.nossoNumero?.toString().padStart(8, '0') || '—'}</span></div>
    </div>
    <div class="row">
      <div class="field"><label>Descrição</label><span>${charge.description || '—'}</span></div>
    </div>

    ${linhaDigitavel ? `
    <div class="linha">
      <label>Linha Digitável — use para pagar pelo Internet Banking</label>
      <div class="code" id="linha">${linhaDigitavel}</div>
      <button class="copy-btn" onclick="navigator.clipboard.writeText(document.getElementById('linha').textContent).then(()=>this.textContent='✓ Copiado!').catch(()=>alert('Copie manualmente'))">
        Copiar Linha Digitável
      </button>
    </div>

    <div class="barcode-section">
      <label>Código de Barras</label>
      <div class="barcode-num">${linhaDigitavel}</div>
    </div>` : ''}

    <div class="footer">
      Boleto emitido por WNR Finance &bull; Itaú Unibanco &bull; Carteira 109
      <br>Para suporte: rafael@wticorp.com.br
    </div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
