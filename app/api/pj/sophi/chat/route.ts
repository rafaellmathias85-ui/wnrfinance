export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// ─── Crypto (same pattern as providers route) ─────────────────────────────────
const CIPHER_KEY = process.env.NEXTAUTH_SECRET || process.env.CIPHER_KEY || '';
const DEFAULT_ENDPOINT = 'https://apps.abacus.ai/v1/chat/completions';
const DEFAULT_MODEL = process.env.ABACUSAI_MODEL || 'gpt-5.4-mini';

function decryptKey(encoded: string): string {
  if (!encoded) return '';
  try {
    const buf = Buffer.from(encoded, 'base64');
    const key = Buffer.from(CIPHER_KEY.padEnd(32, '0').slice(0, 32), 'utf8');
    const decrypted = buf.map((b, i) => b ^ key[i % key.length]);
    return Buffer.from(decrypted).toString('utf8');
  } catch { return ''; }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function brl(n: number | null | undefined): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n || 0));
}

// ─── Financial Context Builder ────────────────────────────────────────────────
async function buildFinancialContext(companyId: string): Promise<string> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const in7Days    = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7,  23, 59, 59);
  const in30Days   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30, 23, 59, 59);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    overdueP, overdueR,
    todayPAgg, todayRAgg,
    weekPAgg, weekRAgg,
    next30PAgg, next30RAgg,
    banks,
    monthRevAgg, monthExpAgg,
  ] = await Promise.all([
    prisma.accountsPayable.findMany({
      where: { companyId, status: 'pendente', dueDate: { lt: todayStart } },
      select: { description: true, amount: true, dueDate: true },
      orderBy: { dueDate: 'asc' }, take: 10,
    }),
    prisma.accountsReceivable.findMany({
      where: { companyId, status: 'pendente', dueDate: { lt: todayStart } },
      select: { description: true, amount: true, dueDate: true },
      orderBy: { dueDate: 'asc' }, take: 10,
    }),
    prisma.accountsPayable.aggregate({
      where: { companyId, status: 'pendente', dueDate: { gte: todayStart, lte: todayEnd } },
      _sum: { amount: true }, _count: true,
    }),
    prisma.accountsReceivable.aggregate({
      where: { companyId, status: 'pendente', dueDate: { gte: todayStart, lte: todayEnd } },
      _sum: { amount: true }, _count: true,
    }),
    prisma.accountsPayable.aggregate({
      where: { companyId, status: 'pendente', dueDate: { gt: todayEnd, lte: in7Days } },
      _sum: { amount: true }, _count: true,
    }),
    prisma.accountsReceivable.aggregate({
      where: { companyId, status: 'pendente', dueDate: { gt: todayEnd, lte: in7Days } },
      _sum: { amount: true }, _count: true,
    }),
    prisma.accountsPayable.aggregate({
      where: { companyId, status: 'pendente', dueDate: { gte: todayStart, lte: in30Days } },
      _sum: { amount: true }, _count: true,
    }),
    prisma.accountsReceivable.aggregate({
      where: { companyId, status: 'pendente', dueDate: { gte: todayStart, lte: in30Days } },
      _sum: { amount: true }, _count: true,
    }),
    prisma.bankConnection.findMany({
      where: { companyId },
      select: { bankName: true, accountNumber: true, openingBalance: true },
    }),
    prisma.accountsReceivable.aggregate({
      where: { companyId, status: 'recebido', receivedAt: { gte: monthStart } },
      _sum: { amount: true },
    }),
    prisma.accountsPayable.aggregate({
      where: { companyId, status: 'pago', paidAt: { gte: monthStart } },
      _sum: { amount: true },
    }),
  ]);

  const totalOverdueP = overdueP.reduce((s, p) => s + Number(p.amount), 0);
  const totalOverdueR = overdueR.reduce((s, r) => s + Number(r.amount), 0);
  const net30 = Number(next30RAgg._sum.amount || 0) - Number(next30PAgg._sum.amount || 0);
  const monthRev = Number(monthRevAgg._sum.amount || 0);
  const monthExp = Number(monthExpAgg._sum.amount || 0);

  const fmt = (label: string, val: number, count: number) =>
    `  ${label}: ${brl(val)} (${count} ${count === 1 ? 'item' : 'itens'})\n`;

  let ctx = '\nCONTAS A PAGAR:\n';
  ctx += fmt('Vencidas (urgente)', totalOverdueP, overdueP.length);
  if (overdueP.length) overdueP.slice(0, 5).forEach(p =>
    ctx += `    · ${p.description}: ${brl(Number(p.amount))} — venceu ${new Date(p.dueDate).toLocaleDateString('pt-BR')}\n`);
  ctx += fmt('Vencem hoje', Number(todayPAgg._sum.amount || 0), todayPAgg._count);
  ctx += fmt('Vencem esta semana', Number(weekPAgg._sum.amount || 0), weekPAgg._count);
  ctx += fmt('Total próximos 30 dias', Number(next30PAgg._sum.amount || 0), next30PAgg._count);

  ctx += '\nCONTAS A RECEBER:\n';
  ctx += fmt('Inadimplência (vencidas)', totalOverdueR, overdueR.length);
  if (overdueR.length) overdueR.slice(0, 5).forEach(r =>
    ctx += `    · ${r.description}: ${brl(Number(r.amount))} — venceu ${new Date(r.dueDate).toLocaleDateString('pt-BR')}\n`);
  ctx += fmt('Receber hoje', Number(todayRAgg._sum.amount || 0), todayRAgg._count);
  ctx += fmt('Receber esta semana', Number(weekRAgg._sum.amount || 0), weekRAgg._count);
  ctx += fmt('Total a receber (30 dias)', Number(next30RAgg._sum.amount || 0), next30RAgg._count);

  ctx += `\nSALDO LÍQUIDO PROJETADO (30 dias): ${brl(net30)} ${net30 < 0 ? '⚠️ DÉFICIT' : '✅ superávit'}\n`;

  if (banks.length > 0) {
    ctx += '\nCONTAS BANCÁRIAS:\n';
    banks.forEach(b =>
      ctx += `  · ${b.bankName}${b.accountNumber ? ` (cc ${b.accountNumber})` : ''}: saldo abertura ${brl(Number(b.openingBalance || 0))}\n`);
  }

  ctx += `\nMÊS ATUAL — REALIZADO ATÉ HOJE:\n`;
  ctx += `  Receita recebida : ${brl(monthRev)}\n`;
  ctx += `  Despesas pagas   : ${brl(monthExp)}\n`;
  ctx += `  Resultado líquido: ${brl(monthRev - monthExp)} ${(monthRev - monthExp) < 0 ? '⚠️ prejuízo' : '✅ lucro'}\n`;

  // Pending accounts with IDs — needed for reconciliation actions
  const [pendingP, pendingR] = await Promise.all([
    prisma.accountsPayable.findMany({
      where: { companyId, status: 'pendente' },
      select: { id: true, description: true, amount: true, dueDate: true, supplierName: true },
      orderBy: { dueDate: 'asc' },
      take: 15,
    }),
    prisma.accountsReceivable.findMany({
      where: { companyId, status: 'pendente' },
      select: { id: true, description: true, amount: true, dueDate: true, customerName: true },
      orderBy: { dueDate: 'asc' },
      take: 15,
    }),
  ]);

  const allPending = [
    ...pendingP.map(p => ({ id: p.id, kind: 'PAGAR', desc: p.description, name: p.supplierName, amount: Number(p.amount), due: p.dueDate })),
    ...pendingR.map(r => ({ id: r.id, kind: 'RECEBER', desc: r.description, name: r.customerName, amount: Number(r.amount), due: r.dueDate })),
  ].sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());

  if (allPending.length > 0) {
    ctx += '\nLANÇAMENTOS PENDENTES COM IDs (use para conciliar):\n';
    allPending.slice(0, 20).forEach(x =>
      ctx += `  [${x.kind}] id="${x.id}" | ${x.desc}${x.name ? ` / ${x.name}` : ''} | ${brl(x.amount)} | vcto: ${new Date(x.due).toLocaleDateString('pt-BR')}\n`
    );
  }

  return ctx;
}

// ─── Sophi Base Prompt ────────────────────────────────────────────────────────
function buildSystemPrompt(companyName: string, extraInstructions: string, financialCtx: string, tasksCtx: string): string {
  return `Você é Sophi, CFO e CIO Virtual Sênior da empresa "${companyName}".

Seu objetivo é garantir a saúde financeira de curto prazo e o crescimento patrimonial de longo prazo do negócio. Você age como sócia financeira do CEO.

Para atuar neste nível de senioridade:
1. Analise criticamente o fluxo de caixa — gargalos, custos desnecessários e riscos de liquidez.
2. Proponha estratégias realistas para aumentar o faturamento e melhorar as margens de lucro.
3. Identifique oportunidades do mercado financeiro para investir caixa excedente com liquidez e segurança.
4. Mantenha postura consultiva: direta, analítica, pragmática e focada em dados.

Quando fornecer análises, estruture em:
- **Status Atual** — diagnóstico da situação hoje
- **Pontos de Atenção Crítica** — onde o dinheiro está em risco
- **Plano de Ação Prático** — o que fazer concretamente
- **Recomendação de Alocação** — como mover o capital de forma inteligente

Regras de comportamento:
- Ao sugerir investimentos ou mudanças drásticas, apresente SEMPRE três cenários: Otimista, Realista e Pessimista.
- Seja proativa: se notar anomalias, alerte antes de ser perguntada.
- Questione toda despesa nova sob a ótica do ROI.
- Conecte a realidade da empresa com o contexto macroeconômico (Selic, inflação, câmbio quando relevante).
- Trate o interlocutor como CEO. Seja direta e encorajadora. Aponte riscos sem rodeios.
- Responda em português brasileiro. Use markdown para clareza (negrito, listas, cabeçalhos).
${extraInstructions ? `\nInstruções adicionais do usuário:\n${extraInstructions}` : ''}

=== CAPACIDADES DE AÇÃO ===
Quando o usuário ORDENAR explicitamente (usar palavras como "lança", "cria", "registra", "faz", "cadastra", "concilia"), você pode e DEVE executar as ações abaixo incluindo um bloco JSON no final da resposta.

AÇÃO 1 — LANÇAR CONTA A PAGAR
[ACTION]{"type":"create_payable","data":{"description":"OBRIGATÓRIO","supplierName":"nome do fornecedor","amount":0.00,"dueDate":"YYYY-MM-DD","launchType":"fornecedor","status":"pendente","notes":"opcional"}}[/ACTION]
launchType válidos: fornecedor | funcionario | impostos | transferencia | lucros

AÇÃO 2 — LANÇAR CONTA A RECEBER
[ACTION]{"type":"create_receivable","data":{"description":"OBRIGATÓRIO","customerName":"nome do cliente","amount":0.00,"dueDate":"YYYY-MM-DD","launchType":"venda","status":"pendente","notes":"opcional"}}[/ACTION]
launchType válidos: venda | contrato | aporte | outros

AÇÃO 3 — CONCILIAR LANÇAMENTOS
Use os IDs da seção "LANÇAMENTOS PENDENTES COM IDs" abaixo.
[ACTION]{"type":"reconcile_accounts","data":{"ids":["id1","id2"]}}[/ACTION]

AÇÃO 4 — EXCLUIR CONTA A PAGAR
Use o ID da seção "LANÇAMENTOS PENDENTES COM IDs" abaixo. Exige identificação única e clara.
[ACTION]{"type":"delete_payable","data":{"id":"id-exato","description":"descrição para confirmação"}}[/ACTION]

AÇÃO 5 — EXCLUIR CONTA A RECEBER
Use o ID da seção "LANÇAMENTOS PENDENTES COM IDs" abaixo. Exige identificação única e clara.
[ACTION]{"type":"delete_receivable","data":{"id":"id-exato","description":"descrição para confirmação"}}[/ACTION]

REGRAS OBRIGATÓRIAS:
1. Inclua [ACTION] SOMENTE quando houver ordem explícita. Para análises e perguntas, NUNCA inclua.
2. Se faltar description, amount ou dueDate, PERGUNTE antes de gerar o bloco.
3. Inclua APENAS UM bloco [ACTION] por resposta, sempre no FINAL.
4. amount SEMPRE como número decimal (ex: 1500.00). dueDate SEMPRE em YYYY-MM-DD.
5. Após o bloco, informe que o usuário deve clicar em "Confirmar e executar" para efetivar.
6. Para exclusões, use SEMPRE o id exato da seção LANÇAMENTOS PENDENTES. Se não encontrar o ID, pergunte ao usuário.

=== CONTEXTO FINANCEIRO ATUAL (${new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}) ===
${financialCtx}
${tasksCtx}`;
}

// ─── Route Handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const companyId = session.user.activeCompanyId;
    if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

    const uc = await prisma.userCompany.findUnique({
      where: { userId_companyId: { userId: session.user.id, companyId } },
    });
    if (!uc) return NextResponse.json({ error: 'Sem acesso à empresa' }, { status: 403 });

    const { messages } = await req.json();
    if (!Array.isArray(messages)) return NextResponse.json({ error: 'messages deve ser array' }, { status: 400 });

    // Company + sophi config
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, features: true },
    });
    const sophiConfig = ((company?.features as any)?.sophi) || {};
    const extraInstructions: string = sophiConfig.extraInstructions || '';
    const dailyTasks: any[] = (sophiConfig.dailyTasks || []).filter((t: any) => t.active);
    const reminders: any[] = (sophiConfig.reminders || []).filter((r: any) => r.active);

    // Build context sections
    const financialCtx = await buildFinancialContext(companyId);
    const tasksCtx = (dailyTasks.length || reminders.length)
      ? `\n=== TAREFAS E LEMBRETES CONFIGURADOS ===\n${[
          ...dailyTasks.map((t: any) => `- Tarefa${t.time ? ` [${t.time}]` : ''}: ${t.task}`),
          ...reminders.map((r: any) => `- Lembrete: ${r.text}`),
        ].join('\n')}\n`
      : '';

    const systemPrompt = buildSystemPrompt(company?.name || 'sua empresa', extraInstructions, financialCtx, tasksCtx);

    // Get AI providers
    const dbProviders = await prisma.aIProvider.findMany({
      where: { userId: session.user.id, isActive: true },
      orderBy: [{ priority: 'asc' }, { sortOrder: 'asc' }],
    });

    type P = { name: string; endpoint: string; apiKey: string; model: string };
    const providers: P[] = dbProviders
      .map(p => ({
        name: p.name,
        endpoint: p.endpoint?.includes('/chat/completions')
          ? p.endpoint
          : `${(p.endpoint || '').replace(/\/$/, '')}/chat/completions`,
        apiKey: decryptKey(p.apiKey),
        model: p.model,
      }))
      .filter(p => p.apiKey);

    if (!providers.some(p => p.endpoint === DEFAULT_ENDPOINT)) {
      const abKey = process.env.ABACUSAI_API_KEY;
      if (abKey) providers.push({ name: 'AbacusAI', endpoint: DEFAULT_ENDPOINT, apiKey: abKey, model: DEFAULT_MODEL });
    }
    if (providers.length === 0) {
      return NextResponse.json({ error: 'Nenhum provedor de IA configurado' }, { status: 503 });
    }

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.slice(-20),
    ];

    // Stream response
    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        let success = false;

        for (const provider of providers) {
          try {
            const res = await fetch(provider.endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${provider.apiKey}` },
              body: JSON.stringify({ model: provider.model, messages: apiMessages, max_tokens: 4096, stream: true }),
              signal: AbortSignal.timeout(90_000),
            });

            if (!res.ok || !res.body) { console.error(`Sophi ${provider.name}: ${res.status}`); continue; }

            const reader = res.body.getReader();
            const dec = new TextDecoder();
            let buf = '';

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });
              const lines = buf.split('\n');
              buf = lines.pop() || '';
              let finished = false;
              for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const data = line.slice(6).trim();
                if (data === '[DONE]') { finished = true; break; }
                try {
                  const content = JSON.parse(data).choices?.[0]?.delta?.content;
                  if (content) controller.enqueue(enc.encode(`data: ${JSON.stringify({ content })}\n\n`));
                } catch { /* skip */ }
              }
              if (finished) break;
            }

            controller.enqueue(enc.encode('data: [DONE]\n\n'));
            success = true;
            break;
          } catch (err) { console.error(`Sophi ${provider.name} error:`, err); }
        }

        if (!success) {
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ content: 'Não consegui conectar a nenhum provedor de IA. Verifique as configurações em **Provedores de IA**.' })}\n\n`));
          controller.enqueue(enc.encode('data: [DONE]\n\n'));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err: any) {
    console.error('Sophi chat error:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno' }, { status: 500 });
  }
}
