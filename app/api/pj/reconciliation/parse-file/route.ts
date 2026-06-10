export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const LLM_ENDPOINT = 'https://apps.abacus.ai/v1/chat/completions';
const LLM_MODEL = 'gpt-5.4-mini';

// Parse CSV/TXT content (semicolon-separated: date;reference;amount)
function parseCSVContent(text: string): Array<{date: string; reference: string; amount: number; type: string}> {
  const lines = text.trim().split('\n').filter(l => l.trim() && !l.startsWith('#'));
  const entries: Array<{date: string; reference: string; amount: number; type: string}> = [];

  for (const line of lines) {
    // Try semicolon, comma, tab separators
    let parts: string[] = [];
    if (line.includes(';')) parts = line.split(';').map(p => p.trim());
    else if (line.includes('\t')) parts = line.split('\t').map(p => p.trim());
    else if (line.includes(',')) {
      // Handle comma but be careful with decimal commas
      parts = line.split(',').map(p => p.trim());
    }

    if (parts.length < 3) continue;

    // Skip header rows
    const first = parts[0].toLowerCase();
    if (first === 'data' || first === 'date' || first === 'dt') continue;

    const dateStr = parts[0];
    const reference = parts[1] || 'SEM_REF';
    const amountStr = parts[parts.length - 1] || parts[2];
    const amount = parseFloat(amountStr.replace(/\./g, '').replace(',', '.'));
    if (isNaN(amount) || amount === 0) continue;

    entries.push({
      date: normalizeDate(dateStr),
      reference,
      amount,
      type: amount < 0 ? 'DEBIT' : 'CREDIT',
    });
  }
  return entries;
}

// Normalize date formats (dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd)
function normalizeDate(d: string): string {
  if (!d) return new Date().toISOString().split('T')[0];
  const trimmed = d.trim();
  // yyyy-mm-dd format
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  // dd/mm/yyyy or dd-mm-yyyy
  const match = trimmed.match(/(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/);
  if (match) return `${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`;
  return new Date().toISOString().split('T')[0];
}

// Parse OFX content
function parseOFXContent(text: string): Array<{date: string; reference: string; amount: number; type: string}> {
  const entries: Array<{date: string; reference: string; amount: number; type: string}> = [];
  // Match STMTTRN blocks
  const txRegex = /<STMTTRN>[\s\S]*?<\/STMTTRN>/gi;
  const matches = text.match(txRegex) || [];

  for (const block of matches) {
    const getTag = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}>([^<\n]+)`, 'i'));
      return m ? m[1].trim() : '';
    };

    const dtStr = getTag('DTPOSTED');
    const amtStr = getTag('TRNAMT');
    const memo = getTag('MEMO') || getTag('NAME') || getTag('FITID') || 'SEM_REF';

    const amount = parseFloat(amtStr.replace(',', '.'));
    if (isNaN(amount) || amount === 0) continue;

    let date = new Date().toISOString().split('T')[0];
    if (dtStr.length >= 8) {
      date = `${dtStr.slice(0,4)}-${dtStr.slice(4,6)}-${dtStr.slice(6,8)}`;
    }

    entries.push({ date, reference: memo, amount, type: amount < 0 ? 'DEBIT' : 'CREDIT' });
  }
  return entries;
}

// Parse PDF via LLM
async function parsePDFWithLLM(base64: string, filename: string): Promise<Array<{date: string; reference: string; amount: number; type: string}>> {
  const apiKey = process.env.ABACUSAI_API_KEY;
  if (!apiKey) throw new Error('Chave de API nao configurada para leitura de PDF');

  const systemPrompt = `Voce e um especialista em extrair dados de extratos bancarios em PDF.
Analise o documento e extraia apenas as MOVIMENTACOES (debitos e creditos reais).

Retorne um JSON com a seguinte estrutura:
{
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "reference": "descricao da transacao",
      "amount": -1500.00
    }
  ]
}

Regras:
- Valores de debito/saida devem ser NEGATIVOS
- Valores de credito/entrada devem ser POSITIVOS
- Datas no formato YYYY-MM-DD
- IGNORAR completamente linhas de saldo: "Saldo Anterior", "Saldo Total", "Saldo Disponivel", "Saldo Final", "Saldo Atual", "Saldo do Dia" e similares
- IGNORAR linhas informativas que nao sejam movimentacoes reais
- Se nao encontrar transacoes, retorne {"transactions": []}
- Responda APENAS com o JSON, sem markdown ou texto adicional`;

  const res = await fetch(LLM_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'file', file: { filename, file_data: `data:application/pdf;base64,${base64}` } },
            { type: 'text', text: 'Extraia todas as transacoes deste extrato bancario e retorne em JSON.' },
          ],
        },
      ],
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(55000),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[PDF Parse] LLM error:', res.status, err);
    throw new Error(`Erro ao processar PDF: HTTP ${res.status}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '{}';

  try {
    const parsed = JSON.parse(content);
    const txns = parsed.transactions || parsed.transacoes || [];
    return txns.map((t: any) => ({
      date: normalizeDate(t.date || t.data || ''),
      reference: t.reference || t.referencia || t.descricao || t.description || 'SEM_REF',
      amount: typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount || t.valor || '0').replace(/\./g, '').replace(',', '.')),
      type: (typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount || t.valor || '0').replace(',', '.'))) < 0 ? 'DEBIT' : 'CREDIT',
    })).filter((t: any) => t.amount !== 0 && !isNaN(t.amount));
  } catch (e) {
    console.error('[PDF Parse] JSON parse error:', e, content);
    throw new Error('Nao foi possivel interpretar o PDF. Tente um formato diferente.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });

    // Size limit: 10 MB
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Arquivo muito grande. Limite: 10 MB' }, { status: 400 });
    }

    const filename = file.name.toLowerCase();
    const ext = filename.split('.').pop() || '';
    const supportedExts = ['csv', 'txt', 'ofx', 'ofc', 'pdf'];

    if (!supportedExts.includes(ext)) {
      return NextResponse.json({ error: `Formato .${ext} nao suportado. Use: ${supportedExts.join(', ')}` }, { status: 400 });
    }

    // MIME type validation via magic bytes
    const buffer = Buffer.from(await file.arrayBuffer());
    const { fileTypeFromBuffer } = await import('file-type');
    const detected = await fileTypeFromBuffer(buffer);

    // Text-based formats (CSV, TXT, OFX) won't be detected by file-type (no magic bytes) — that's OK
    // Only reject if file-type detects an unexpected binary format
    const BLOCKED_MIMES = ['application/x-msdownload', 'application/x-executable', 'application/x-dosexec'];
    if (detected && BLOCKED_MIMES.includes(detected.mime)) {
      return NextResponse.json({ error: 'Tipo de arquivo não permitido' }, { status: 400 });
    }
    if (ext === 'pdf' && detected && detected.mime !== 'application/pdf') {
      return NextResponse.json({ error: 'Arquivo com extensão .pdf mas conteúdo inválido' }, { status: 400 });
    }

    let entries: Array<{date: string; reference: string; amount: number; type: string}> = [];

    if (ext === 'pdf') {
      const base64 = buffer.toString('base64');
      entries = await parsePDFWithLLM(base64, file.name);
    } else if (ext === 'ofx' || ext === 'ofc') {
      entries = parseOFXContent(buffer.toString('utf8'));
    } else {
      // CSV or TXT
      entries = parseCSVContent(buffer.toString('utf8'));
    }

    // Remove balance / informational lines (not real transactions)
    const BALANCE_KEYWORDS = [
      'SALDO ANTERIOR', 'SALDO TOTAL', 'SALDO DISPONÍVEL', 'SALDO DISPONIVEL',
      'SALDO FINAL', 'SALDO ATUAL', 'SALDO INICIAL', 'SALDO DO DIA',
      'SALDO EM', 'TOTAL DO DIA', 'TOTAL GERAL',
    ];
    entries = entries.filter(e => {
      const ref = e.reference.toUpperCase();
      return !BALANCE_KEYWORDS.some(kw => ref.startsWith(kw) || ref === kw);
    });

    return NextResponse.json({
      entries,
      count: entries.length,
      filename: file.name,
      format: ext.toUpperCase(),
    });
  } catch (error: any) {
    console.error('[parse-file] Error:', error);
    return NextResponse.json({ error: 'Erro ao processar arquivo' }, { status: 500 });
  }
}
