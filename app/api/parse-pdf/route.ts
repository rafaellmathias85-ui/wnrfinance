export const dynamic = 'force-dynamic';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const LLM_ENDPOINT = 'https://apps.abacus.ai/v1/chat/completions';
const LLM_MODEL = 'gpt-5.4-mini';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const apiKey = process.env.ABACUSAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Chave de API não configurada' }, { status: 500 });

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string; // 'fatura' or 'extrato'

    if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const base64String = Buffer.from(buffer).toString('base64');

    const systemPrompt = type === 'fatura'
      ? `Você é um especialista em extração de dados de faturas de cartão de crédito em PDF.
Extraia todas as transações da fatura e retorne um JSON com a seguinte estrutura:
{
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "Descrição da compra/estabelecimento",
      "amount": 150.50,
      "category": "Categoria (ex: Alimentação, Transporte, Compras, Saúde, Educação, Lazer, Serviços, Outros)",
      "installments": 1
    }
  ]
}

Regras:
- O campo "amount" deve ser sempre positivo (valor absoluto).
- Se houver parcelas (ex: "2/5"), coloque installments como o número da parcela atual.
- Datas devem estar no formato YYYY-MM-DD.
- Se a data tiver apenas dia/mês, assuma o ano da fatura.
- Ignore linhas de totais, pagamentos anteriores, encargos/juros, IOF.
- Foque apenas nas compras/transações individuais.
- Categorize cada transação de acordo com o estabelecimento.
- Responda APENAS com JSON válido, sem markdown ou texto adicional.`
      : `Você é um especialista em extração de dados de extratos bancários em PDF.
Extraia todas as movimentações do extrato e retorne um JSON com a seguinte estrutura:
{
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "Descrição da movimentação",
      "amount": 150.50,
      "type": "credit" ou "debit"
    }
  ]
}

Regras:
- Para entradas/créditos (PIX recebido, depósito, transferência recebida, salário), use type "credit" e amount positivo.
- Para saídas/débitos (pagamento, PIX enviado, tarifa, compra), use type "debit" e amount positivo (valor absoluto).
- Datas devem estar no formato YYYY-MM-DD.
- Se a data tiver apenas dia/mês, assuma o ano do extrato.
- Ignore linhas de saldo, saldo anterior, saldo final, totais de créditos/débitos.
- Foque apenas nas movimentações individuais.
- Responda APENAS com JSON válido, sem markdown ou texto adicional.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          {
            type: 'file',
            file: {
              filename: file.name || 'document.pdf',
              file_data: `data:application/pdf;base64,${base64String}`,
            },
          },
          {
            type: 'text',
            text: type === 'fatura'
              ? 'Extraia todas as transações desta fatura de cartão de crédito.'
              : 'Extraia todas as movimentações deste extrato bancário.',
          },
        ],
      },
    ];

    const response = await fetch(LLM_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages,
        max_tokens: 8000,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('LLM API error:', err);
      return NextResponse.json({ error: 'Erro ao processar PDF com IA. Tente novamente.' }, { status: 500 });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json({ error: 'A IA não retornou conteúdo. Tente novamente.' }, { status: 500 });
    }

    let parsed;
    try {
      // Clean potential markdown fences
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('Failed to parse LLM response:', content);
      return NextResponse.json({ error: 'Não foi possível interpretar a resposta da IA. Tente novamente.' }, { status: 500 });
    }

    const transactions = parsed.transactions || [];
    if (transactions.length === 0) {
      return NextResponse.json({ error: 'Nenhuma transação encontrada no PDF.' }, { status: 200 });
    }

    return NextResponse.json({ transactions, count: transactions.length });
  } catch (err: any) {
    console.error('Parse PDF error:', err);
    return NextResponse.json({ error: 'Erro interno do servidor' || 'Erro interno ao processar PDF.' }, { status: 500 });
  }
}
