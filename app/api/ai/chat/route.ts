export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const DEFAULT_MODEL = 'gpt-5.4-mini';
const DEFAULT_ENDPOINT = 'https://apps.abacus.ai/v1/chat/completions';

const CIPHER_KEY = process.env.NEXTAUTH_SECRET || process.env.CIPHER_KEY || '';
function decryptKey(encoded: string): string {
  if (!encoded) return '';
  try {
    const buf = Buffer.from(encoded, 'base64');
    const key = Buffer.from(CIPHER_KEY.padEnd(32, '0').slice(0, 32), 'utf8');
    const decrypted = buf.map((b, i) => b ^ key[i % key.length]);
    return Buffer.from(decrypted).toString('utf8');
  } catch { return ''; }
}

interface ProviderConfig {
  id: string;
  name: string;
  model: string;
  endpoint: string;
  apiKey: string;
  priority: number;
  weight: number;
  isBuiltIn: boolean;
}

async function getActiveProviders(userId: string): Promise<ProviderConfig[]> {
  const abacusDefault: ProviderConfig = {
    id: 'default',
    name: 'AbacusAI',
    model: DEFAULT_MODEL,
    endpoint: DEFAULT_ENDPOINT,
    apiKey: process.env.ABACUSAI_API_KEY || '',
    priority: 999,
    weight: 100,
    isBuiltIn: true,
  };

  try {
    const dbProviders = await prisma.aIProvider.findMany({
      where: { userId, isActive: true },
      orderBy: [{ priority: 'asc' }, { sortOrder: 'asc' }],
    });

    if (dbProviders.length === 0) {
      return [{ ...abacusDefault, priority: 1 }];
    }

    const mapped = dbProviders.map(p => {
      const hasOwnKey = !!p.apiKey;
      const hasOwnEndpoint = !!p.endpoint && p.endpoint !== DEFAULT_ENDPOINT;

      if (hasOwnKey && hasOwnEndpoint) {
        return {
          id: p.id, name: p.name, model: p.model,
          endpoint: p.endpoint, apiKey: decryptKey(p.apiKey),
          priority: p.priority, weight: p.weight, isBuiltIn: p.isBuiltIn,
        };
      }
      if (hasOwnKey) {
        return {
          id: p.id, name: p.name, model: p.model,
          endpoint: DEFAULT_ENDPOINT, apiKey: decryptKey(p.apiKey),
          priority: p.priority, weight: p.weight, isBuiltIn: p.isBuiltIn,
        };
      }
      return {
        id: p.id, name: p.name, model: p.model,
        endpoint: DEFAULT_ENDPOINT, apiKey: process.env.ABACUSAI_API_KEY || '',
        priority: p.priority, weight: p.weight, isBuiltIn: true,
      };
    });

    const hasAbacusFallback = mapped.some(m => m.endpoint === DEFAULT_ENDPOINT);
    if (!hasAbacusFallback) mapped.push(abacusDefault);
    return mapped;
  } catch (err) {
    console.error('Error fetching providers:', err);
    return [{ ...abacusDefault, priority: 1 }];
  }
}

async function logProviderCall(
  userId: string, provider: ProviderConfig, success: boolean,
  latencyMs: number, statusCode: number, isFailover: boolean, errorMsg?: string
) {
  try {
    await prisma.aIProviderLog.create({
      data: {
        userId, providerId: provider.id, providerName: provider.name,
        model: provider.model, success, latencyMs, statusCode,
        isFailover, errorMsg: errorMsg?.slice(0, 500) || null,
      },
    });
  } catch (e) {
    console.error('Error logging provider call:', e);
  }
}

async function callProvider(
  provider: ProviderConfig, messages: any[], tools?: any[],
): Promise<{ response: Response | null; statusCode: number; latencyMs: number; error?: string }> {
  if (!provider.apiKey) return { response: null, statusCode: 0, latencyMs: 0, error: 'No API key' };
  const start = Date.now();
  try {
    const body: any = {
      model: provider.model,
      messages,
      max_tokens: 4000,
      stream: true,
    };
    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }
    const res = await fetch(
      provider.endpoint.endsWith('/chat/completions')
        ? provider.endpoint
        : `${provider.endpoint.replace(/\/$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      }
    );
    const latencyMs = Date.now() - start;
    if (res.ok && res.body) return { response: res, statusCode: res.status, latencyMs };
    const errText = await res.text().catch(() => '');
    return { response: null, statusCode: res.status, latencyMs, error: errText.slice(0, 300) };
  } catch (err: any) {
    return { response: null, statusCode: 0, latencyMs: Date.now() - start, error: err?.message };
  }
}

function buildLocalAssistantResponse(message: string, env: 'pf' | 'pj', contextBlock: string) {
  const lower = message.toLowerCase();
  const wantsCreate = /(criar|cadastrar|registrar|lancar|lançar|adicionar)/i.test(message);
  const lines = [
    '**Analise financeira pronta em modo de contingencia.**',
    '',
    'No momento nao encontrei um provedor externo de IA com chave ativa, entao usei a leitura local dos seus dados para nao deixar a conversa parada.',
    '',
  ];

  if (env === 'pj') {
    lines.push(
      '**Leitura PJ:**',
      '- Verifique primeiro caixa, contas a receber e contas a pagar do mes antes de assumir novos compromissos.',
      '- Priorize baixas de recebiveis vencidos e categorize despesas sem centro de custo para melhorar DRE e fluxo de caixa.',
      '- Para decisao de investimento empresarial, preserve capital de giro antes de buscar rentabilidade.'
    );
  } else {
    lines.push(
      '**Leitura PF:**',
      '- Compare receitas do mes contra despesas pagas e pendentes antes de aumentar gastos variaveis.',
      '- Se a reserva ainda nao cobre alguns meses de custo fixo, priorize liquidez e baixo risco.',
      '- Para investir, separe objetivo, prazo e tolerancia a risco antes de escolher produto.'
    );
  }

  if (contextBlock.trim()) {
    const summary = contextBlock
      .split('\n')
      .filter(line => /^- /.test(line.trim()))
      .slice(0, 8);
    if (summary.length) {
      lines.push('', '**Dados lidos do sistema:**', ...summary);
    }
  }

  if (wantsCreate) {
    lines.push(
      '',
      '**Sobre criar cadastros pelo chat:**',
      'Posso orientar o preenchimento agora, mas a execucao automatica por ferramenta depende de um provedor de IA externo ativo para interpretar a solicitacao com seguranca.'
    );
  }

  lines.push(
    '',
    '**Acao recomendada:** configure uma chave em `Configuracoes > Provedores de IA` para liberar respostas completas, ferramentas automaticas e failover entre modelos.'
  );

  return lines.join('\n');
}

async function staticSseResponse(conversationId: string, provider: string, model: string, content: string) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'meta', conversationId, provider, model })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', content })}\n\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// ================= TOOL DEFINITIONS =================

const AI_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'criar_despesa',
      description: 'Cria uma nova despesa/gasto no sistema. Para PF cria Expense, para PJ cria AccountsPayable.',
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'Descricao da despesa' },
          amount: { type: 'number', description: 'Valor da despesa em reais' },
          category: { type: 'string', description: 'Categoria da despesa. PF: Alimentacao, Transporte, Moradia, Saude, Educacao, Lazer, Vestuario, Assinaturas, Impostos, Seguros, Outros' },
          date: { type: 'string', description: 'Data no formato YYYY-MM-DD. Se nao informado usa hoje' },
          status: { type: 'string', description: 'Status: pendente ou pago', enum: ['pendente', 'pago'] },
        },
        required: ['description', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'criar_receita',
      description: 'Cria uma nova receita/entrada no sistema. Para PF cria Income, para PJ cria AccountsReceivable.',
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'Descricao da receita' },
          amount: { type: 'number', description: 'Valor da receita em reais' },
          type: { type: 'string', description: 'Tipo da receita PF: salario, freelance, investimentos, aluguel, dividendos, pensao, bonus, outros' },
          date: { type: 'string', description: 'Data no formato YYYY-MM-DD' },
        },
        required: ['description', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'criar_categoria',
      description: 'Cria uma nova categoria de despesa ou receita. Funciona apenas em ambiente PJ.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome da categoria' },
          type: { type: 'string', description: 'Tipo: EXPENSE ou INCOME', enum: ['EXPENSE', 'INCOME'] },
          color: { type: 'string', description: 'Cor hex opcional, ex: #3b82f6' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'criar_tag',
      description: 'Cria uma nova tag/etiqueta para organizar lancamentos.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome da tag' },
          color: { type: 'string', description: 'Cor hex opcional' },
          description: { type: 'string', description: 'Descricao opcional da tag' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'criar_cliente',
      description: 'Cria um novo cliente no sistema PJ.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome do cliente' },
          document: { type: 'string', description: 'CPF ou CNPJ' },
          email: { type: 'string', description: 'Email do cliente' },
          phone: { type: 'string', description: 'Telefone' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'criar_fornecedor',
      description: 'Cria um novo fornecedor no sistema PJ.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome do fornecedor' },
          document: { type: 'string', description: 'CPF ou CNPJ' },
          email: { type: 'string', description: 'Email' },
          phone: { type: 'string', description: 'Telefone' },
        },
        required: ['name'],
      },
    },
  },
];

// ================= TOOL EXECUTION =================

async function executeTool(
  toolName: string, args: any, userId: string, env: 'pf' | 'pj', companyId: string | null
): Promise<string> {
  try {
    const today = new Date().toISOString().split('T')[0];

    if (toolName === 'criar_despesa') {
      if (env === 'pj' && companyId) {
        const item = await prisma.accountsPayable.create({
          data: {
            companyId,
            description: args.description,
            amount: args.amount,
            dueDate: new Date(args.date || today),
            status: args.status || 'pendente',
            supplierName: args.supplierName || null,
            createdBy: userId,
          },
        });
        return `Conta a pagar criada com sucesso! ID: ${item.id}, Descricao: "${args.description}", Valor: R$ ${args.amount.toFixed(2)}`;
      } else {
        const expense = await prisma.expense.create({
          data: {
            description: args.description,
            amount: args.amount,
            category: args.category || 'Outros',
            date: new Date(args.date || today),
            status: args.status || 'pendente',
            userId,
          },
        });
        return `Despesa criada com sucesso! ID: ${expense.id}, Descricao: "${args.description}", Valor: R$ ${args.amount.toFixed(2)}, Categoria: ${expense.category}`;
      }
    }

    if (toolName === 'criar_receita') {
      if (env === 'pj' && companyId) {
        const item = await prisma.accountsReceivable.create({
          data: {
            companyId,
            description: args.description,
            amount: args.amount,
            dueDate: new Date(args.date || today),
            status: args.status || 'pendente',
            customerName: args.customerName || null,
            createdBy: userId,
          },
        });
        return `Conta a receber criada com sucesso! ID: ${item.id}, Descricao: "${args.description}", Valor: R$ ${args.amount.toFixed(2)}`;
      } else {
        const income = await prisma.income.create({
          data: {
            description: args.description,
            amount: args.amount,
            date: new Date(args.date || today),
            type: args.type || 'outros',
            userId,
          },
        });
        return `Receita criada com sucesso! ID: ${income.id}, Descricao: "${args.description}", Valor: R$ ${args.amount.toFixed(2)}, Tipo: ${income.type}`;
      }
    }

    if (toolName === 'criar_categoria') {
      if (env === 'pj' && companyId) {
        const cat = await prisma.businessCategory.create({
          data: {
            companyId,
            name: args.name,
            type: args.type || 'EXPENSE',
            color: args.color || '#3b82f6',
          },
        });
        return `Categoria PJ criada: "${cat.name}" (${cat.type})`;
      } else {
        return `Categorias PF sao fixas no sistema: Alimentacao, Transporte, Moradia, Saude, Educacao, Lazer, Vestuario, Assinaturas, Impostos, Seguros, Outros. Nao e possivel criar novas categorias PF.`;
      }
    }

    if (toolName === 'criar_tag') {
      if (env === 'pj' && companyId) {
        const tag = await prisma.tag.create({
          data: {
            name: args.name.trim(),
            color: args.color || '#3b82f6',
            description: args.description || null,
            scope: 'PJ',
            companyId,
          },
        });
        return `Tag PJ criada: "${tag.name}"`;
      } else {
        const tag = await prisma.tag.create({
          data: {
            name: args.name.trim(),
            color: args.color || '#3b82f6',
            description: args.description || null,
            scope: 'PF',
            userId,
          },
        });
        return `Tag PF criada: "${tag.name}"`;
      }
    }

    if (toolName === 'criar_cliente') {
      if (env === 'pj' && companyId) {
        const client = await prisma.client.create({
          data: {
            companyId,
            name: args.name,
            document: args.document || null,
            email: args.email || null,
            phone: args.phone || null,
          },
        });
        return `Cliente criado: "${client.name}" (ID: ${client.id})`;
      }
      return `Clientes so podem ser criados no ambiente PJ. Solicite ao usuario trocar para o ambiente empresarial.`;
    }

    if (toolName === 'criar_fornecedor') {
      if (env === 'pj' && companyId) {
        const supplier = await prisma.supplier.create({
          data: {
            companyId,
            name: args.name,
            document: args.document || null,
            email: args.email || null,
            phone: args.phone || null,
          },
        });
        return `Fornecedor criado: "${supplier.name}" (ID: ${supplier.id})`;
      }
      return `Fornecedores so podem ser criados no ambiente PJ. Solicite ao usuario trocar para o ambiente empresarial.`;
    }

    return `Ferramenta "${toolName}" nao reconhecida.`;
  } catch (err: any) {
    console.error(`[AI Tool] Error executing ${toolName}:`, err);
    return `Erro ao executar ${toolName}: ${err?.message || 'Erro desconhecido'}`;
  }
}

// ================= CONTEXT BUILDERS =================

async function buildUserContextPF(userId: string) {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [user, expensesMonth, incomesMonth, alerts, investments, savings, cards] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, hasPF: true, hasPJ: true },
    }),
    prisma.expense.findMany({
      where: { userId, date: { gte: monthStart } },
      orderBy: { date: 'desc' },
      take: 30,
      select: { description: true, amount: true, category: true, date: true, status: true },
    }),
    prisma.income.findMany({
      where: { userId, date: { gte: monthStart } },
      orderBy: { date: 'desc' },
      take: 30,
      select: { description: true, amount: true, type: true, date: true },
    }),
    prisma.alert.findMany({
      where: { userId, isRead: false },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { type: true, title: true, message: true, severity: true, createdAt: true },
    }),
    prisma.investment.findMany({
      where: { userId },
      orderBy: { currentValue: 'desc' },
      take: 10,
      select: { name: true, type: true, currentValue: true, amount: true, purchaseDate: true, broker: true },
    }),
    prisma.savingsBox.findMany({
      where: { userId },
      select: { name: true, balance: true, goal: true },
    }),
    prisma.creditCard.findMany({
      where: { userId, isActive: true },
      include: {
        transactions: {
          where: { date: { gte: monthStart } },
          select: { amount: true },
        },
      },
    }),
  ]);

  const totalExpensesMonth = expensesMonth.reduce((s, e) => s + e.amount, 0);
  const totalIncomesMonth = incomesMonth.reduce((s, i) => s + i.amount, 0);
  const totalInvestments = investments.reduce((s, i) => s + i.currentValue, 0);
  const totalSavings = savings.reduce((s, sv) => s + sv.balance, 0);

  const expensesByCategory: Record<string, number> = {};
  for (const e of expensesMonth) {
    expensesByCategory[e.category] = (expensesByCategory[e.category] || 0) + e.amount;
  }

  return `CONTEXTO DO USUARIO (Pessoa Fisica):
Nome: ${user?.name || 'Usuario'}
Mes atual: ${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}

RESUMO FINANCEIRO DO MES:
- Receitas do mes: R$ ${totalIncomesMonth.toFixed(2)} (${incomesMonth.length} lancamentos)
- Despesas do mes: R$ ${totalExpensesMonth.toFixed(2)} (${expensesMonth.length} lancamentos)
- Saldo do mes: R$ ${(totalIncomesMonth - totalExpensesMonth).toFixed(2)}
- Total em investimentos: R$ ${totalInvestments.toFixed(2)}
- Total em caixinhas/reserva: R$ ${totalSavings.toFixed(2)}

DESPESAS POR CATEGORIA (mes atual):
${Object.entries(expensesByCategory).map(([c, v]) => `- ${c}: R$ ${v.toFixed(2)}`).join('\n') || 'Sem despesas registradas neste mes'}

INVESTIMENTOS:
${investments.map(i => `- ${i.name} (${i.type}${i.broker ? ', ' + i.broker : ''}): R$ ${i.currentValue.toFixed(2)} (aplicado R$ ${i.amount.toFixed(2)})`).join('\n') || 'Nenhum investimento cadastrado'}

CAIXINHAS/RESERVAS:
${savings.map(s => `- ${s.name}: R$ ${s.balance.toFixed(2)} / meta R$ ${s.goal.toFixed(2)}`).join('\n') || 'Nenhuma caixinha cadastrada'}

CARTOES DE CREDITO:
${cards.map((c: any) => {
  const used = (c.transactions || []).reduce((s: number, t: any) => s + (t.amount || 0), 0);
  return `- ${c.name} (${c.bank}): Limite R$ ${c.cardLimit.toFixed(2)}, uso no mes R$ ${used.toFixed(2)}`;
}).join('\n') || 'Nenhum cartao cadastrado'}

ALERTAS PENDENTES:
${alerts.map(a => `- [${a.severity}] ${a.title}: ${a.message}`).join('\n') || 'Nenhum alerta pendente'}
`;
}

async function buildUserContextPJ(companyId: string) {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [company, payablesMonth, receivablesMonth, categories, investments, accounts] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, cnpj: true, tradeName: true },
    }),
    prisma.accountsPayable.findMany({
      where: { companyId, dueDate: { gte: monthStart } },
      orderBy: { dueDate: 'desc' },
      take: 30,
      include: { category: true },
    }),
    prisma.accountsReceivable.findMany({
      where: { companyId, dueDate: { gte: monthStart } },
      orderBy: { dueDate: 'desc' },
      take: 30,
      include: { category: true },
    }),
    prisma.businessCategory.findMany({
      where: { companyId },
      select: { name: true, type: true, color: true },
      take: 30,
    }),
    prisma.pJInvestment.findMany({
      where: { companyId, status: 'ativo' },
      orderBy: { currentValue: 'desc' },
      take: 10,
      select: { productName: true, investmentType: true, currentValue: true, amountInvested: true, institutionName: true },
    }),
    prisma.businessAccount.findMany({
      where: { companyId },
      select: { bankName: true, accountType: true, balance: true },
    }),
  ]);

  const totalPayables = payablesMonth.reduce((s, p) => s + p.amount, 0);
  const paidPayables = payablesMonth.filter(p => p.status === 'pago' || p.status === 'PAID').reduce((s, p) => s + p.amount, 0);
  const pendingPayables = payablesMonth.filter(p => p.status === 'pendente' || p.status === 'atrasado' || p.status === 'PENDING' || p.status === 'OVERDUE').reduce((s, p) => s + p.amount, 0);
  const totalReceivables = receivablesMonth.reduce((s, r) => s + r.amount, 0);
  const receivedReceivables = receivablesMonth.filter(r => r.status === 'recebido' || r.status === 'RECEIVED').reduce((s, r) => s + r.amount, 0);
  const pendingReceivables = receivablesMonth.filter(r => r.status === 'pendente' || r.status === 'atrasado' || r.status === 'PENDING' || r.status === 'OVERDUE').reduce((s, r) => s + r.amount, 0);
  const totalInvestments = investments.reduce((s, i) => s + i.currentValue, 0);
  const totalBalance = accounts.reduce((s, a) => s + (a.balance || 0), 0);

  const payablesByCategory: Record<string, number> = {};
  for (const p of payablesMonth as any[]) {
    const catName = p.category?.name || 'Sem categoria';
    payablesByCategory[catName] = (payablesByCategory[catName] || 0) + p.amount;
  }

  return `CONTEXTO DA EMPRESA (Pessoa Juridica):
Empresa: ${company?.name || '---'}${company?.tradeName ? ' (' + company.tradeName + ')' : ''} --- CNPJ: ${company?.cnpj || '---'}
Mes atual: ${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}

RESUMO FINANCEIRO DO MES:
- Contas a Pagar: R$ ${totalPayables.toFixed(2)} (${payablesMonth.length} lancamentos)
  . Pagas: R$ ${paidPayables.toFixed(2)}
  . Pendentes/Atrasadas: R$ ${pendingPayables.toFixed(2)}
- Contas a Receber: R$ ${totalReceivables.toFixed(2)} (${receivablesMonth.length} lancamentos)
  . Recebidas: R$ ${receivedReceivables.toFixed(2)}
  . Pendentes/Atrasadas: R$ ${pendingReceivables.toFixed(2)}
- Resultado projetado do mes: R$ ${(totalReceivables - totalPayables).toFixed(2)}
- Saldo em contas bancarias: R$ ${totalBalance.toFixed(2)}
- Total em investimentos: R$ ${totalInvestments.toFixed(2)}

DESPESAS POR CATEGORIA (mes atual):
${Object.entries(payablesByCategory).map(([c, v]) => `- ${c}: R$ ${v.toFixed(2)}`).join('\n') || 'Sem despesas registradas neste mes'}

INVESTIMENTOS PJ:
${investments.map(i => `- ${i.productName} (${i.investmentType}) em ${i.institutionName}: R$ ${i.currentValue.toFixed(2)} (aplicado R$ ${i.amountInvested.toFixed(2)})`).join('\n') || 'Nenhum investimento cadastrado'}

CATEGORIAS CONFIGURADAS:
${categories.map(c => `- ${c.name} (${c.type})`).join('\n') || 'Nenhuma categoria especifica'}

CONTAS BANCARIAS:
${accounts.map(a => `- ${a.bankName}${a.accountType ? ' (' + a.accountType + ')' : ''}: R$ ${(a.balance || 0).toFixed(2)}`).join('\n') || 'Nenhuma conta cadastrada'}
`;
}

function buildSystemPrompt(env: 'pf' | 'pj') {
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `Voce e o **WNR Finance AI** --- consultor financeiro de elite do sistema WNR Finance. Voce combina expertise de CFO, planejador financeiro certificado (CFP) e analista de investimentos para o mercado brasileiro.

PERSONALIDADE:
- Proativo: nao espere o usuario perguntar tudo --- ao ver os dados, ANTECIPE problemas e oportunidades.
- Analitico: use numeros reais do contexto para fundamentar cada orientacao.
- Empatico mas direto: sem enrolacao, foque em acoes concretas.
- Se apresente na PRIMEIRA mensagem de cada conversa com algo breve como "Analisei seus dados..."

Data de hoje: ${today}

SUAS CAPACIDADES:

1) **Analise Proativa** --- ao receber o contexto financeiro:
   ${env === 'pj'
     ? '- Alerte se contas a pagar ultrapassam o caixa disponivel\n   - Identifique clientes inadimplentes e sugira acoes de cobranca\n   - Calcule indices: margem liquida, liquidez corrente, prazo medio recebimento\n   - Detecte categorias de despesa crescentes mes a mes\n   - Sugira otimizacoes no fluxo de caixa'
     : '- Alerte se despesas estao acima de 80% das receitas\n   - Identifique categorias com gastos excessivos vs media\n   - Verifique se a reserva de emergencia cobre 6 meses\n   - Avalie diversificacao dos investimentos\n   - Lembre sobre contas proximas do vencimento'}

2) **Consultoria Especializada:**
   - Investimentos: Tesouro Direto, CDB, LCI/LCA, FIIs, Acoes, ETFs, Cripto (com perfil de risco)
   - Planejamento: 50-30-20, metodo bola de neve, gestao de dividas
   ${env === 'pj' ? '- Tributacao empresarial simplificada (Simples, LP, LR)\n   - Capital de giro e gestao de recebiveis\n   - DRE e indicadores financeiros' : '- IR e declaracao para pessoa fisica\n   - Planejamento de aposentadoria\n   - Score de credito e uso inteligente de cartoes'}

3) **Acoes no Sistema** (TOOLS/FUNCOES DISPONIVEIS):
   Voce pode EXECUTAR acoes diretamente no sistema quando o usuario solicitar:
   - **criar_despesa**: Registrar uma nova despesa/conta a pagar
   - **criar_receita**: Registrar uma nova receita/conta a receber
   - **criar_categoria**: Criar nova categoria (apenas PJ)
   - **criar_tag**: Criar nova tag para organizar lancamentos
   - **criar_cliente**: Cadastrar novo cliente (apenas PJ)
   - **criar_fornecedor**: Cadastrar novo fornecedor (apenas PJ)
   
   IMPORTANTE: Quando o usuario pedir para criar/registrar/lancar algo, USE A FERRAMENTA correspondente. Confirme os dados com o usuario antes se nao tiver certeza do valor/descricao. Apos executar, informe o resultado.

4) **Guia do Sistema WNR Finance:**
   ${env === 'pj'
     ? '- Paginas PJ: Dashboard, Faturamento, DRE, Contas a Pagar/Receber, Fluxo de Caixa, Bancos, Cartoes, Investimentos, Conciliacao, Categorias, Tags, Empresa, Usuarios'
     : '- Paginas PF: Dashboard, Despesas, Receitas, Cartoes, Investimentos, Caixinhas, Bancos, Relatorios, Conciliacao, Alertas'}
   - Explique onde clicar e como usar cada funcionalidade

REGRAS:
- Responda SEMPRE em portugues brasileiro
- Use markdown rico: **negrito**, listas, \`codigo\`, tabelas quando util
- Seja conciso mas completo --- prefira bullets a paragrafos longos
- Use dados reais do contexto --- NUNCA invente valores
- Valores sempre em R$ formatados (R$ 1.234,56)
- Fora do escopo financeiro -> redirecione gentilmente
- Assuntos sensiveis (dividas, inadimplencia) -> empatia total
- Se faltar dados -> sugira cadastrar no sistema
- Quando usar ferramentas, SEMPRE informe ao usuario o que foi feito`;
}

// ================= STRATEGY HELPERS =================

function selectProvidersByStrategy(
  providers: ProviderConfig[], strategy: string, seed: number
): ProviderConfig[] {
  if (strategy === 'weighted') {
    // Weighted random selection order
    const shuffled = [...providers];
    shuffled.sort((a, b) => {
      const wa = (a.weight || 100) * Math.random();
      const wb = (b.weight || 100) * Math.random();
      return wb - wa;
    });
    return shuffled;
  }

  if (strategy === 'round-robin') {
    // Round-robin within same priority groups
    const priorityGroups: Record<number, ProviderConfig[]> = {};
    for (const p of providers) {
      if (!priorityGroups[p.priority]) priorityGroups[p.priority] = [];
      priorityGroups[p.priority].push(p);
    }
    const result: ProviderConfig[] = [];
    const sortedPrios = Object.keys(priorityGroups).map(Number).sort((a, b) => a - b);
    for (const prio of sortedPrios) {
      const group = priorityGroups[prio];
      const startIdx = seed % group.length;
      for (let i = 0; i < group.length; i++) {
        result.push(group[(startIdx + i) % group.length]);
      }
    }
    return result;
  }

  // Default: failover - sorted by priority then sortOrder
  return [...providers].sort((a, b) => a.priority - b.priority);
}

// ================= MAIN HANDLER =================

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

    const userId = (session.user as any).id;
    const body = await req.json();
    const { conversationId, message, env: bodyEnv, companyId: bodyCompanyId } = body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 });
    }

    const env: 'pf' | 'pj' = bodyEnv === 'pj' ? 'pj' : 'pf';
    const companyId = env === 'pj' ? (bodyCompanyId || (session.user as any).activeCompanyId) : null;

    // Get user's strategy preference
    let userStrategy = 'failover';
    try {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { aiStrategy: true } });
      if (user?.aiStrategy) userStrategy = user.aiStrategy;
    } catch {}

    // Get or create conversation
    let conversation;
    if (conversationId) {
      conversation = await prisma.aIConversation.findFirst({
        where: { id: conversationId, userId },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      });
      if (!conversation) {
        return NextResponse.json({ error: 'Conversa nao encontrada' }, { status: 404 });
      }
    } else {
      conversation = await prisma.aIConversation.create({
        data: {
          userId,
          env,
          companyId: env === 'pj' ? companyId : null,
          title: message.slice(0, 60),
        },
        include: { messages: true },
      });
    }

    // Save user message
    await prisma.aIMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: message,
      },
    });

    // Build context
    let contextBlock = '';
    try {
      if (env === 'pj' && companyId) {
        contextBlock = await buildUserContextPJ(companyId);
      } else {
        contextBlock = await buildUserContextPF(userId);
      }
    } catch (e) {
      console.error('Error building context:', e);
    }

    const systemPrompt = buildSystemPrompt(env);
    const fullSystem = `${systemPrompt}\n\n---\n\n${contextBlock}`;

    const messagesHistory = (conversation.messages || []).map((m: any) => ({
      role: m.role,
      content: m.content,
    }));
    messagesHistory.push({ role: 'user', content: message });

    const apiMessages = [
      { role: 'system', content: fullSystem },
      ...messagesHistory,
    ];

    // Get providers and apply strategy
    const providers = await getActiveProviders(userId);
    const seed = conversationId ? conversationId.length : Date.now();
    const orderedProviders = selectProvidersByStrategy(providers, userStrategy, seed);

    let response: Response | null = null;
    let usedProvider: ProviderConfig | null = null;
    let attemptIndex = 0;

    for (const provider of orderedProviders) {
      const result = await callProvider(provider, apiMessages, AI_TOOLS);
      const isFailover = attemptIndex > 0;

      if (result.response) {
        usedProvider = provider;
        response = result.response;
        console.log(`[AI] Using provider: ${provider.name} (${provider.model}) P${provider.priority}`);
        // Log success asynchronously
        logProviderCall(userId, provider, true, result.latencyMs, result.statusCode, isFailover);
        break;
      } else {
        console.warn(`[AI] Provider ${provider.name} failed: ${result.statusCode} ${result.error?.slice(0, 100)}`);
        logProviderCall(userId, provider, false, result.latencyMs, result.statusCode, isFailover, result.error);
      }
      attemptIndex++;
    }

    if (!response || !usedProvider) {
      const fallbackContent = buildLocalAssistantResponse(message, env, contextBlock);
      await prisma.aIMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          content: fallbackContent,
        },
      });
      await prisma.aIConversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      });
      return staticSseResponse(conversation.id, 'WNR Local', 'contingencia-financeira', fallbackContent);
    }

    const conversationIdFinal = conversation.id;
    const finalProvider = usedProvider;
    const finalResponse = response;

    const stream = new ReadableStream({
      async start(controller) {
        const reader = finalResponse.body!.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let assistantContent = '';
        let partialRead = '';
        let toolCalls: Array<{ id: string; name: string; arguments: string }> = [];

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'meta', conversationId: conversationIdFinal, provider: finalProvider.name, model: finalProvider.model })}\n\n`));

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            partialRead += decoder.decode(value, { stream: true });
            const lines = partialRead.split('\n');
            partialRead = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data: ')) continue;
              const data = trimmed.slice(6);
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                const choice = parsed?.choices?.[0];
                if (!choice) continue;

                const delta = choice.delta;
                if (delta?.content) {
                  assistantContent += delta.content;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', content: delta.content })}\n\n`));
                }

                // Handle tool calls
                if (delta?.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    const idx = tc.index || 0;
                    if (!toolCalls[idx]) {
                      toolCalls[idx] = { id: tc.id || '', name: tc.function?.name || '', arguments: '' };
                    }
                    if (tc.id) toolCalls[idx].id = tc.id;
                    if (tc.function?.name) toolCalls[idx].name = tc.function.name;
                    if (tc.function?.arguments) toolCalls[idx].arguments += tc.function.arguments;
                  }
                }
              } catch {}
            }
          }

          // Execute tool calls if any
          if (toolCalls.length > 0 && toolCalls[0]?.name) {
            const toolResults: string[] = [];
            for (const tc of toolCalls) {
              if (!tc.name) continue;
              let args: any = {};
              try { args = JSON.parse(tc.arguments); } catch {}
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', content: `\n\n*Executando: ${tc.name}...*\n\n` })}\n\n`));
              assistantContent += `\n\n*Executando: ${tc.name}...*\n\n`;
              const result = await executeTool(tc.name, args, userId, env, companyId);
              toolResults.push(result);
              const resultMsg = `**Resultado:** ${result}\n\n`;
              assistantContent += resultMsg;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', content: resultMsg })}\n\n`));
            }
          }

          // Save assistant message
          if (assistantContent) {
            await prisma.aIMessage.create({
              data: {
                conversationId: conversationIdFinal,
                role: 'assistant',
                content: assistantContent,
              },
            });
            await prisma.aIConversation.update({
              where: { id: conversationIdFinal },
              data: { updatedAt: new Date() },
            });
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
        } catch (err) {
          console.error('[AI chat] stream error:', err);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'Erro ao processar resposta' })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    console.error('[AI chat POST] Error:', error);
    return NextResponse.json({ error: 'Erro ao processar mensagem' }, { status: 500 });
  }
}
