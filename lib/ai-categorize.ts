// AI Auto-categorization using Claude Haiku (cheapest model)
// Suggests category + costCenter for a transaction based on description

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export interface CategorySuggestion {
  categoryName: string;
  categoryType: 'INCOME' | 'EXPENSE';
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

// Fast in-memory heuristics (no API call needed for common cases)
const HEURISTICS: { pattern: RegExp; category: string; type: 'INCOME' | 'EXPENSE' }[] = [
  { pattern: /aluguel|locação|locacao|imóvel|imovel/i, category: 'Aluguel', type: 'EXPENSE' },
  { pattern: /salário|salario|folha|rh|funcionário/i, category: 'Salários', type: 'EXPENSE' },
  { pattern: /energia|luz|enel|cpfl|cemig/i, category: 'Energia Elétrica', type: 'EXPENSE' },
  { pattern: /água|agua|sabesp|copasa/i, category: 'Água e Saneamento', type: 'EXPENSE' },
  { pattern: /internet|banda larga|tim|claro|vivo|oi|net/i, category: 'Telecomunicações', type: 'EXPENSE' },
  { pattern: /telefone|celular|móvel/i, category: 'Telecomunicações', type: 'EXPENSE' },
  { pattern: /material escritório|papelaria|suprimentos/i, category: 'Material de Escritório', type: 'EXPENSE' },
  { pattern: /combustível|gasolina|etanol|diesel|posto/i, category: 'Combustível', type: 'EXPENSE' },
  { pattern: /manutenção|manutencao|reparo|conserto/i, category: 'Manutenção', type: 'EXPENSE' },
  { pattern: /marketing|publicidade|propaganda|ads|anúncio/i, category: 'Marketing', type: 'EXPENSE' },
  { pattern: /contabilidade|contador|contábil/i, category: 'Contabilidade', type: 'EXPENSE' },
  { pattern: /software|sistema|saas|assinatura|licença/i, category: 'Software e TI', type: 'EXPENSE' },
  { pattern: /seguro|apólice/i, category: 'Seguros', type: 'EXPENSE' },
  { pattern: /imposto|das|irpf|irpj|iss|icms|pis|cofins/i, category: 'Impostos', type: 'EXPENSE' },
  { pattern: /fornecedor|compra|aquisição/i, category: 'Fornecedores', type: 'EXPENSE' },
  { pattern: /venda|serviço prestado|prestação|honorário/i, category: 'Receita de Vendas', type: 'INCOME' },
  { pattern: /consultoria|assessoria/i, category: 'Consultoria', type: 'INCOME' },
  { pattern: /recebimento|cobrança|parcela recebida/i, category: 'Receitas', type: 'INCOME' },
  { pattern: /juros|rendimento|aplicação/i, category: 'Rendimentos Financeiros', type: 'INCOME' },
];

export function suggestCategoryByHeuristic(description: string): CategorySuggestion | null {
  for (const h of HEURISTICS) {
    if (h.pattern.test(description)) {
      return {
        categoryName: h.category,
        categoryType: h.type,
        confidence: 'high',
        reasoning: `Padrão identificado: "${description}"`,
      };
    }
  }
  return null;
}

// AI-based suggestion via Claude Haiku (called only when heuristics fail)
export async function suggestCategoryByAI(
  description: string,
  existingCategories: string[],
  transactionType: 'INCOME' | 'EXPENSE' | 'auto' = 'auto',
): Promise<CategorySuggestion | null> {
  if (!ANTHROPIC_API_KEY) return null;

  try {
    const categoriesHint = existingCategories.length > 0
      ? `\nCategorias já existentes no sistema: ${existingCategories.slice(0, 20).join(', ')}`
      : '';

    const prompt = `Você é um assistente financeiro brasileiro. Classifique esta transação financeira e sugira uma categoria.

Descrição: "${description}"
Tipo esperado: ${transactionType === 'auto' ? 'determinar automaticamente (receita ou despesa)' : transactionType === 'INCOME' ? 'Receita' : 'Despesa'}
${categoriesHint}

Responda APENAS com JSON válido no formato:
{"categoryName":"Nome da Categoria","categoryType":"INCOME ou EXPENSE","confidence":"high/medium/low","reasoning":"motivo em 1 frase"}

Use categorias em português. Prefira categorias existentes se aplicável.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]+\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

// Main function: heuristic first, AI fallback
export async function suggestCategory(
  description: string,
  existingCategories: string[] = [],
  type: 'INCOME' | 'EXPENSE' | 'auto' = 'auto',
): Promise<CategorySuggestion | null> {
  const heuristic = suggestCategoryByHeuristic(description);
  if (heuristic) {
    // Filter by expected type if specified
    if (type !== 'auto' && heuristic.categoryType !== type) return null;
    return heuristic;
  }
  return suggestCategoryByAI(description, existingCategories, type);
}
