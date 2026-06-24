export const dynamic = 'force-dynamic';

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

  let linhaDigitavel = '';
  let codigoBarras = '';

  if (charge.nossoNumero && charge.providerKey === 'itau') {
    const stored = charge.boletoBarCode || '';
    // Detecta se já temos a linha digitável (≥47 chars) ou só o barcode (44)
    if (stored.replace(/\D/g, '').length >= 44) {
      const digits = stored.replace(/\D/g, '');
      if (digits.length === 44) {
        codigoBarras = digits;
      } else {
        linhaDigitavel = digits;
      }
    }
    // Se faltam dados, busca na API Itaú
    if (!linhaDigitavel || !codigoBarras) {
      const data = await resolveItauBoletoData(companyId, charge.id, charge.nossoNumero);
      if (data) {
        linhaDigitavel = data.linhaDigitavel || linhaDigitavel;
        codigoBarras   = data.codigoBarras   || codigoBarras;
      }
    }
  }

  // Formata linha digitável com pontos e espaços (padrão FEBRABAN)
  function formatLinha(raw: string): string {
    const d = raw.replace(/\D/g, '');
    if (d.length !== 47) return raw;
    return `${d.slice(0,5)}.${d.slice(5,10)} ${d.slice(10,15)}.${d.slice(15,21)} ${d.slice(21,26)}.${d.slice(26,32)} ${d[32]} ${d.slice(33)}`;
  }

  const linhaFmt = linhaDigitavel ? formatLinha(linhaDigitavel) : '';
  const barcodeNum = codigoBarras || linhaDigitavel.replace(/\D/g, '');

  const fmtDate = (d: Date | null) =>
    d ? new Date(d).toLocaleDateString('pt-BR') : '—';
  const fmtMoney = (v: number) =>
    v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const hoje = new Date().toLocaleDateString('pt-BR');
  const nossoNumFmt = charge.nossoNumero?.toString().padStart(8, '0') ?? '—';
  const valorFmt = fmtMoney(charge.amount);
  const vencimento = fmtDate(charge.dueDate);

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Boleto — ${charge.customerName}</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9px; background: #eee; padding: 16px; color: #000; }
  .page { max-width: 780px; margin: 0 auto; background: #fff; }

  /* ── Recibo do sacado / Boleto sections ── */
  .section { border: 1px solid #000; }
  .section + .section { margin-top: 0; border-top: none; }

  /* ── Header row ── */
  .hrow { display: flex; align-items: stretch; border-bottom: 1px solid #000; }
  .h-logo {
    padding: 6px 10px; border-right: 2px solid #000;
    font-size: 18px; font-weight: 900; color: #003f87;
    display: flex; align-items: center; min-width: 110px; justify-content: center;
  }
  .h-code {
    padding: 6px 12px; border-right: 2px solid #000;
    font-size: 14px; font-weight: bold;
    display: flex; align-items: center; min-width: 64px; justify-content: center;
  }
  .h-linha {
    padding: 6px 10px; flex: 1;
    font-size: 11px; font-weight: bold; letter-spacing: 0.5px;
    display: flex; align-items: center; justify-content: flex-end;
    font-family: 'Courier New', monospace;
  }

  /* ── Generic field cell ── */
  .row { display: flex; border-bottom: 1px solid #000; }
  .row:last-child { border-bottom: none; }
  .cell { padding: 3px 6px; border-right: 1px solid #000; min-height: 28px; }
  .cell:last-child { border-right: none; }
  .cell-label { font-size: 7.5px; color: #000; margin-bottom: 1px; }
  .cell-value { font-size: 10px; font-weight: bold; }
  .cell-value.mono { font-family: 'Courier New', monospace; }

  .flex1 { flex: 1; }
  .w80  { width: 80px;  }
  .w100 { width: 100px; }
  .w120 { width: 120px; }
  .w150 { width: 150px; }

  /* ── Instrução cell (taller) ── */
  .cell-instrucao { min-height: 48px; }

  /* ── Sacado block ── */
  .sacado { padding: 4px 6px; }
  .sacado .cell-label { font-size: 7.5px; }
  .sacado .cell-value { font-size: 10px; font-weight: bold; }

  /* ── Cut line ── */
  .cutline {
    text-align: center; padding: 4px 0;
    font-size: 8px; color: #555;
    border-top: 1px dashed #777; border-bottom: 1px dashed #777;
    margin: 0; letter-spacing: 2px;
  }

  /* ── Barcode ── */
  .barcode-wrap { text-align: center; padding: 10px 0 6px; border-top: 1px solid #000; }
  .barcode-wrap svg { display: block; margin: 0 auto; }
  .barcode-num { font-family: 'Courier New', monospace; font-size: 8px; margin-top: 2px; letter-spacing: 1px; }

  /* ── Alert ── */
  .alert { background: #fff8e1; border: 1px solid #f9a825; padding: 8px 12px; font-size: 10px; color: #5d4037; margin-bottom: 8px; }

  /* ── Web-only controls ── */
  .web-bar { background: #003f87; padding: 10px 16px; display: flex; justify-content: space-between; align-items: center; }
  .web-bar h2 { color: #fff; font-size: 13px; }
  .btn { padding: 6px 16px; border: none; border-radius: 3px; cursor: pointer; font-size: 11px; font-weight: bold; }
  .btn-copy { background: #fff; color: #003f87; }
  .btn-print { background: #ffd600; color: #000; }

  @media print {
    body { background: #fff; padding: 0; }
    .web-bar { display: none; }
    .page { max-width: 100%; }
  }
</style>
</head>
<body>

<!-- Web bar (não imprime) -->
<div class="web-bar">
  <h2>341 ITAÚ &nbsp;·&nbsp; Boleto Bancário</h2>
  <div style="display:flex;gap:8px">
    ${linhaFmt ? `<button class="btn btn-copy" onclick="navigator.clipboard.writeText('${linhaFmt}').then(()=>this.textContent='✓ Copiado!').catch(()=>{})">Copiar Linha Digitável</button>` : ''}
    <button class="btn btn-print" onclick="window.print()">Imprimir / Salvar PDF</button>
  </div>
</div>

<div class="page">

${!linhaFmt ? `<div class="alert">⚠️ Linha digitável ainda não disponível — o boleto pode estar em processamento no banco. Tente novamente em alguns minutos.</div>` : ''}

<!-- ═══════════════════════ RECIBO DO SACADO ═══════════════════════ -->
<div class="section">

  <div class="hrow">
    <div class="h-logo">341 ITAÚ</div>
    <div class="h-code">341-7</div>
    <div class="h-linha">${linhaFmt || '&nbsp;'}</div>
  </div>

  <div class="row">
    <div class="cell flex1">
      <div class="cell-label">Local de Pagamento</div>
      <div class="cell-value">Pagável em qualquer banco até o vencimento</div>
    </div>
    <div class="cell w120">
      <div class="cell-label">Vencimento</div>
      <div class="cell-value">${vencimento}</div>
    </div>
  </div>

  <div class="row">
    <div class="cell flex1">
      <div class="cell-label">Beneficiário</div>
      <div class="cell-value">WINNER SOLUÇÕES EM TECNOLOGIA DA INFORMÁTICA LTDA</div>
    </div>
    <div class="cell w150">
      <div class="cell-label">Agência / Código Beneficiário</div>
      <div class="cell-value mono">0263 / 50212-2</div>
    </div>
  </div>

  <div class="row">
    <div class="cell w100">
      <div class="cell-label">Data do Documento</div>
      <div class="cell-value">${hoje}</div>
    </div>
    <div class="cell flex1">
      <div class="cell-label">Número do Documento</div>
      <div class="cell-value mono">${charge.customerDoc || nossoNumFmt}</div>
    </div>
    <div class="cell w80">
      <div class="cell-label">Espécie Doc.</div>
      <div class="cell-value">DM</div>
    </div>
    <div class="cell w80">
      <div class="cell-label">Aceite</div>
      <div class="cell-value">N</div>
    </div>
    <div class="cell w100">
      <div class="cell-label">Data de Processamento</div>
      <div class="cell-value">${hoje}</div>
    </div>
    <div class="cell w120">
      <div class="cell-label">Nosso Número</div>
      <div class="cell-value mono">${nossoNumFmt}</div>
    </div>
  </div>

  <div class="row">
    <div class="cell w80">
      <div class="cell-label">Uso do Banco</div>
      <div class="cell-value">&nbsp;</div>
    </div>
    <div class="cell w80">
      <div class="cell-label">Carteira</div>
      <div class="cell-value">109</div>
    </div>
    <div class="cell w80">
      <div class="cell-label">Espécie</div>
      <div class="cell-value">R$</div>
    </div>
    <div class="cell w80">
      <div class="cell-label">Quantidade</div>
      <div class="cell-value">&nbsp;</div>
    </div>
    <div class="cell w80">
      <div class="cell-label">Valor</div>
      <div class="cell-value">&nbsp;</div>
    </div>
    <div class="cell flex1">
      <div class="cell-label">Valor do Documento</div>
      <div class="cell-value">${valorFmt}</div>
    </div>
  </div>

  <div class="row">
    <div class="cell flex1 cell-instrucao">
      <div class="cell-label">Instruções (Texto de responsabilidade do cedente)</div>
      <div class="cell-value">${charge.description || 'Não receber após o vencimento.'}</div>
    </div>
    <div class="cell w150">
      <div class="cell-label">(=) Valor Cobrado</div>
      <div class="cell-value">&nbsp;</div>
    </div>
  </div>

  <div class="row sacado">
    <div style="flex:1">
      <div class="cell-label">Sacado</div>
      <div class="cell-value">${charge.customerName}${charge.customerDoc ? ` — ${charge.customerDoc}` : ''}</div>
    </div>
  </div>

</div><!-- /section recibo -->

<!-- ═══════════════════════ CORTE ═══════════════════════════════════ -->
<div class="cutline">✂&nbsp;&nbsp;&nbsp;Corte aqui&nbsp;&nbsp;&nbsp;✂</div>

<!-- ═══════════════════════ BOLETO ══════════════════════════════════ -->
<div class="section">

  <div class="hrow">
    <div class="h-logo">341 ITAÚ</div>
    <div class="h-code">341-7</div>
    <div class="h-linha">${linhaFmt || '&nbsp;'}</div>
  </div>

  <div class="row">
    <div class="cell flex1">
      <div class="cell-label">Local de Pagamento</div>
      <div class="cell-value">Pagável em qualquer banco até o vencimento</div>
    </div>
    <div class="cell w120">
      <div class="cell-label">Vencimento</div>
      <div class="cell-value">${vencimento}</div>
    </div>
  </div>

  <div class="row">
    <div class="cell flex1">
      <div class="cell-label">Beneficiário</div>
      <div class="cell-value">WINNER SOLUÇÕES EM TECNOLOGIA DA INFORMÁTICA LTDA</div>
    </div>
    <div class="cell w150">
      <div class="cell-label">Agência / Código Beneficiário</div>
      <div class="cell-value mono">0263 / 50212-2</div>
    </div>
  </div>

  <div class="row">
    <div class="cell w100">
      <div class="cell-label">Data do Documento</div>
      <div class="cell-value">${hoje}</div>
    </div>
    <div class="cell flex1">
      <div class="cell-label">Número do Documento</div>
      <div class="cell-value mono">${charge.customerDoc || nossoNumFmt}</div>
    </div>
    <div class="cell w80">
      <div class="cell-label">Espécie Doc.</div>
      <div class="cell-value">DM</div>
    </div>
    <div class="cell w80">
      <div class="cell-label">Aceite</div>
      <div class="cell-value">N</div>
    </div>
    <div class="cell w100">
      <div class="cell-label">Data de Processamento</div>
      <div class="cell-value">${hoje}</div>
    </div>
    <div class="cell w120">
      <div class="cell-label">Nosso Número</div>
      <div class="cell-value mono">${nossoNumFmt}</div>
    </div>
  </div>

  <div class="row">
    <div class="cell w80">
      <div class="cell-label">Uso do Banco</div>
      <div class="cell-value">&nbsp;</div>
    </div>
    <div class="cell w80">
      <div class="cell-label">Carteira</div>
      <div class="cell-value">109</div>
    </div>
    <div class="cell w80">
      <div class="cell-label">Espécie</div>
      <div class="cell-value">R$</div>
    </div>
    <div class="cell w80">
      <div class="cell-label">Quantidade</div>
      <div class="cell-value">&nbsp;</div>
    </div>
    <div class="cell w80">
      <div class="cell-label">Valor</div>
      <div class="cell-value">&nbsp;</div>
    </div>
    <div class="cell flex1">
      <div class="cell-label">Valor do Documento</div>
      <div class="cell-value">${valorFmt}</div>
    </div>
  </div>

  <div class="row">
    <div class="cell flex1 cell-instrucao">
      <div class="cell-label">Instruções (Texto de responsabilidade do cedente)</div>
      <div class="cell-value">${charge.description || 'Não receber após o vencimento.'}</div>
    </div>
    <div class="cell w150">
      <div class="cell-label">(=) Valor Cobrado</div>
      <div class="cell-value">&nbsp;</div>
    </div>
  </div>

  <div class="row sacado">
    <div style="flex:1">
      <div class="cell-label">Sacado</div>
      <div class="cell-value">${charge.customerName}${charge.customerDoc ? ` — ${charge.customerDoc}` : ''}</div>
    </div>
    <div style="width:200px;text-align:right">
      <div class="cell-label">CNPJ Beneficiário</div>
      <div class="cell-value">21.147.041/0001-85</div>
    </div>
  </div>

  ${barcodeNum ? `
  <div class="barcode-wrap">
    <svg id="barcode"></svg>
    <div class="barcode-num">${barcodeNum}</div>
  </div>` : ''}

</div><!-- /section boleto -->

</div><!-- /page -->

${barcodeNum ? `
<script>
  JsBarcode("#barcode", "${barcodeNum}", {
    format: "ITF",
    width: 1.8,
    height: 50,
    displayValue: false,
    margin: 8,
    background: "#ffffff",
    lineColor: "#000000"
  });
</script>` : ''}

</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
