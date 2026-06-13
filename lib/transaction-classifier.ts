// Classificador de transações bancárias brasileiras (corporativo PJ)
// Detecta método de pagamento, categoria corporativa, e flags de negócio
// a partir da descrição do extrato bancário.

export type PaymentMethod =
  | 'PIX' | 'TED' | 'DOC' | 'BOLETO' | 'DEBITO_AUTOMATICO'
  | 'CARTAO' | 'CHEQUE' | 'DINHEIRO' | 'TARIFA' | 'TRANSFERENCIA' | 'OUTROS';

export type CorporateCategory =
  | 'SALARIOS_FOLHA'
  | 'ENCARGOS_FGTS'
  | 'ENCARGOS_INSS'
  | 'IMPOSTOS_FEDERAIS'
  | 'IMPOSTOS_MUNICIPAIS'
  | 'IMPOSTOS_ESTADUAIS'
  | 'SIMPLES_NACIONAL'
  | 'INVESTIMENTOS'
  | 'REEMBOLSOS'
  | 'TARIFAS_BANCARIAS'
  | 'TRANSFERENCIA_PROPRIA'
  | 'FORNECEDORES'
  | 'RECEITAS_VENDAS'
  | 'OUTROS';

export interface TransactionClassification {
  paymentMethod: PaymentMethod;
  corporateCategory: CorporateCategory;
  counterpartyHint: string | null;
  /** Sugestão de nome de categoria para salvar no lançamento */
  categoryLabel: string;
  isTax: boolean;
  isSalary: boolean;
  isInvestment: boolean;
  isReimbursement: boolean;
  isBankFee: boolean;
  isOwnTransfer: boolean;
  confidence: 'high' | 'medium' | 'low';
}

function norm(text: string): string {
  return text
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function has(text: string, ...terms: string[]): boolean {
  return terms.some(t => text.includes(t));
}

// ─── Padrões de método de pagamento ──────────────────────────────────────────

const PIX_PATTERNS = [
  'PIX ', 'TRF PIX', 'TRANSF PIX', 'RECEBIMENTO PIX', 'PAGAMENTO PIX',
  'PIX ENVIADO', 'PIX RECEBIDO', 'VIA PIX', 'PIXOUT', 'PIXIN', 'CHAVE PIX',
  'QR PIX', 'PIX COBRANCA', 'COBRANCA PIX', 'TRANSFERENCIA PIX',
];
const TED_PATTERNS = [
  'TED ', 'TED-', 'TRANSF TED', 'TED ENVIADA', 'TED RECEBIDA',
  'TRANSFERENCIA TED', 'REMESSA TED', 'DOC TED',
];
const DOC_PATTERNS = ['DOC ', 'DOC-', 'TRANSF DOC', 'TRANSFERENCIA DOC'];
const BOLETO_PATTERNS = [
  'BOLETO', 'BOL ', 'PGTO BOL', 'PAG BOL', 'PAGAMENTO BOLETO',
  'COBRANCA BOLETO', 'TITULO ', 'FATURA BOL', 'PGTO TIT', 'PAG TIT',
  'PAGAMENTO TITULO', 'PAGAMENTO DE TITULO', 'LIQUIDACAO BOLETO',
];
const DEBITO_AUTO_PATTERNS = [
  'DEBITO AUTOMATICO', 'DEB AUT', 'DEBAUT', 'DEBITO EM CONTA',
  'COBRANCA AUTOMATICA', 'COB AUT',
];
const CARTAO_PATTERNS = [
  'CARTAO', 'CART ', 'CREDITO ROTATIVO', 'PARCELA CARTAO', 'FATURA CARTAO',
  'PAGAMENTO CARTAO', 'PGTO CARTAO',
];
const CHEQUE_PATTERNS = ['CHEQUE', 'CHQ ', 'COMP CHQ', 'LIQUIDACAO CHQ'];
const TARIFA_PATTERNS = [
  'TARIFA', 'TAR MANUT', 'TAR TED', 'TAR PIX', 'TAR BOL', 'TAR SAQUE',
  'MANUTENCAO CONTA', 'TAXA SERVICO', 'TAXA ADM', 'CUSTAS ', 'ANUIDADE ',
  'COMISSAO ', 'CORRETAGEM',
];

// ─── Padrões de categoria corporativa ────────────────────────────────────────

const SALARY_PATTERNS = [
  'FOLHA', 'SALARIO', 'SALARIOS', 'FOPAG', 'PAGTO SAL', 'PAGAMENTO SALARIO',
  'FOLHA DE PAGAMENTO', 'FOLHA PAG', 'PAGTO FOLHA', 'ADIANTAMENTO SAL',
  'ADTO SAL', '13 SALARIO', 'DECIMO TERCEIRO', 'FERIAS ', 'RESCISAO ',
  'PLR ', 'PARTICIPACAO LUCROS', 'PARTICIPACAO NOS LUCROS', 'GRATIFICACAO',
  'BONIFICACAO', 'HONORARIOS',
];
const FGTS_PATTERNS = ['FGTS', 'DEPOSITO FGTS', 'RECOLHIMENTO FGTS'];
const INSS_PATTERNS = ['INSS', 'GPS ', 'PREVIDENCIA SOCIAL', 'PREV SOC', 'PREVIDENCIA'];
const DARF_PATTERNS = [
  'DARF', 'RECEITA FEDERAL', 'IRPJ', 'IRRF', 'CSLL', 'COFINS',
  'PIS ', 'CONTRIBUICAO SOCIAL', 'CIDE', 'PARCELAMENTO FISCAL', 'REFIS ',
  'PGFN ', 'SIMEI',
];
const ISS_PATTERNS = ['ISS ', 'ISSQN', 'IMPOSTO SOBRE SERVICO', 'ISS PROPRIO'];
const DAS_PATTERNS = ['DAS ', 'SIMPLES NACIONAL', 'SIMPLES NAC', 'MEI '];
const ICMS_PATTERNS = ['ICMS', 'GNRE', 'DAE ICMS'];
const OTHER_TAX_PATTERNS = [
  'IOF ', 'IMPOSTO ', 'TRIBUTO ', 'DAE ', 'GUIA ', 'RECOLHIMENTO ',
  'RECOLH TRIB', 'ARRECAD',
];
const INVEST_PATTERNS = [
  'APLICACAO', 'RESGATE ', 'CDB ', 'LCI ', 'LCA ', 'POUPANCA',
  'FUNDO ', 'FUNDOS ', 'RDB ', 'TESOURO DIRETO', 'DEBENTURE',
  'CRI ', 'CRA ', 'RENDA FIXA', 'RENDA VARIAVEL', 'FII ',
  'ACOES ', 'INVESTIMENTO', 'APORTE FUNDO',
];
const REIMBURSEMENT_PATTERNS = [
  'REEMBOLSO', 'RESSARCIMENTO', 'DEVOLUCAO', 'DEVOL ', 'ESTORNO ',
  'REVERSAO ', 'REEMB ', 'RESTITUICAO', 'CREDITAMENTO',
];
const OWN_TRANSFER_PATTERNS = [
  'ENTRE CONTAS', 'TRANSF MESMA TITU', 'TRANSF PROPRIA', 'PROPRIA CONTA',
  'APLIC AUTOMATICA', 'RESGATE AUTOMATICO', 'RESG AUTOM', 'SWEEP',
  'TRANSFERENCIA ENTRE CONTAS', 'CONTA CORRENTE PARA', 'C C PARA POUPANCA',
];

// ─── OFX TRNTYPE mapping ─────────────────────────────────────────────────────

const OFX_TYPE_MAP: Record<string, PaymentMethod> = {
  XFER: 'TRANSFERENCIA',
  CHECK: 'CHEQUE',
  PAYMENT: 'BOLETO',
  ATM: 'DINHEIRO',
  CASH: 'DINHEIRO',
  FEE: 'TARIFA',
  SRVCHG: 'TARIFA',
  DEP: 'OUTROS',
  POS: 'CARTAO',
  DIRECTDEBIT: 'DEBITO_AUTOMATICO',
  DIRECTDEP: 'OUTROS',
  REPEATPMT: 'DEBITO_AUTOMATICO',
};

// ─── Extrai nome do contraparte da descrição ──────────────────────────────────

function extractCounterparty(normalized: string): string | null {
  // Padrões comuns: "DE JOAO SILVA", "PARA EMPRESA ABC LTDA", "ORIGEM BANCO X"
  const prefixes = ['DE ', 'PARA ', 'ORIGEM ', 'DESTINO ', 'BENEFICIARIO ', 'PAGADOR ', 'FAVORECIDO '];
  for (const prefix of prefixes) {
    const idx = normalized.indexOf(prefix);
    if (idx >= 0) {
      const after = normalized.slice(idx + prefix.length);
      // Pega até 40 chars, para antes de outro keyword
      const stopWords = [' PIX', ' TED', ' DOC', ' BOL', ' CPF', ' CNPJ', ' AG ', ' CC '];
      let end = 40;
      for (const sw of stopWords) {
        const swIdx = after.indexOf(sw);
        if (swIdx > 0 && swIdx < end) end = swIdx;
      }
      const candidate = after.slice(0, end).trim();
      if (candidate.length >= 3) return candidate;
    }
  }
  return null;
}

// ─── Função principal de classificação ───────────────────────────────────────

export function classifyTransaction(
  description: string,
  trntype?: string,
): TransactionClassification {
  const n = norm(description);

  // ── Método de pagamento ──────────────────────────────────────────────────
  let paymentMethod: PaymentMethod = 'OUTROS';
  let methodConfidence: 'high' | 'medium' | 'low' = 'low';

  if (has(n, ...PIX_PATTERNS)) {
    paymentMethod = 'PIX'; methodConfidence = 'high';
  } else if (has(n, ...TED_PATTERNS)) {
    paymentMethod = 'TED'; methodConfidence = 'high';
  } else if (has(n, ...DOC_PATTERNS)) {
    paymentMethod = 'DOC'; methodConfidence = 'high';
  } else if (has(n, ...BOLETO_PATTERNS)) {
    paymentMethod = 'BOLETO'; methodConfidence = 'high';
  } else if (has(n, ...DEBITO_AUTO_PATTERNS)) {
    paymentMethod = 'DEBITO_AUTOMATICO'; methodConfidence = 'high';
  } else if (has(n, ...CARTAO_PATTERNS)) {
    paymentMethod = 'CARTAO'; methodConfidence = 'high';
  } else if (has(n, ...CHEQUE_PATTERNS)) {
    paymentMethod = 'CHEQUE'; methodConfidence = 'high';
  } else if (has(n, ...TARIFA_PATTERNS)) {
    paymentMethod = 'TARIFA'; methodConfidence = 'high';
  } else if (trntype && OFX_TYPE_MAP[trntype.toUpperCase()]) {
    paymentMethod = OFX_TYPE_MAP[trntype.toUpperCase()];
    methodConfidence = 'medium';
  }

  // ── Flags de negócio ─────────────────────────────────────────────────────
  const isSalary      = has(n, ...SALARY_PATTERNS);
  const isFGTS        = has(n, ...FGTS_PATTERNS);
  const isINSS        = has(n, ...INSS_PATTERNS);
  const isDARF        = has(n, ...DARF_PATTERNS);
  const isISS         = has(n, ...ISS_PATTERNS);
  const isDAS         = has(n, ...DAS_PATTERNS);
  const isICMS        = has(n, ...ICMS_PATTERNS);
  const isOtherTax    = has(n, ...OTHER_TAX_PATTERNS);
  const isTax         = isFGTS || isINSS || isDARF || isISS || isDAS || isICMS || isOtherTax;
  const isInvestment  = has(n, ...INVEST_PATTERNS);
  const isReimbursement = has(n, ...REIMBURSEMENT_PATTERNS);
  const isBankFee     = has(n, ...TARIFA_PATTERNS) || paymentMethod === 'TARIFA';
  const isOwnTransfer = has(n, ...OWN_TRANSFER_PATTERNS);

  // ── Categoria corporativa ─────────────────────────────────────────────────
  let corporateCategory: CorporateCategory = 'OUTROS';
  if (isOwnTransfer)    corporateCategory = 'TRANSFERENCIA_PROPRIA';
  else if (isBankFee)   corporateCategory = 'TARIFAS_BANCARIAS';
  else if (isInvestment) corporateCategory = 'INVESTIMENTOS';
  else if (isReimbursement) corporateCategory = 'REEMBOLSOS';
  else if (isSalary)    corporateCategory = 'SALARIOS_FOLHA';
  else if (isFGTS)      corporateCategory = 'ENCARGOS_FGTS';
  else if (isINSS)      corporateCategory = 'ENCARGOS_INSS';
  else if (isDAS)       corporateCategory = 'SIMPLES_NACIONAL';
  else if (isDARF)      corporateCategory = 'IMPOSTOS_FEDERAIS';
  else if (isISS)       corporateCategory = 'IMPOSTOS_MUNICIPAIS';
  else if (isICMS)      corporateCategory = 'IMPOSTOS_ESTADUAIS';
  else if (isOtherTax)  corporateCategory = 'IMPOSTOS_FEDERAIS';

  const CATEGORY_LABELS: Record<CorporateCategory, string> = {
    SALARIOS_FOLHA: 'Salários e Folha de Pagamento',
    ENCARGOS_FGTS: 'FGTS',
    ENCARGOS_INSS: 'INSS / Previdência Social',
    IMPOSTOS_FEDERAIS: 'Impostos Federais',
    IMPOSTOS_MUNICIPAIS: 'ISS / Impostos Municipais',
    IMPOSTOS_ESTADUAIS: 'ICMS / Impostos Estaduais',
    SIMPLES_NACIONAL: 'Simples Nacional / DAS',
    INVESTIMENTOS: 'Investimentos e Aplicações',
    REEMBOLSOS: 'Reembolsos e Devoluções',
    TARIFAS_BANCARIAS: 'Tarifas Bancárias',
    TRANSFERENCIA_PROPRIA: 'Transferência Entre Contas Próprias',
    FORNECEDORES: 'Fornecedores',
    RECEITAS_VENDAS: 'Receitas de Vendas',
    OUTROS: 'Outros',
  };

  const counterpartyHint = extractCounterparty(n);

  const confidence: 'high' | 'medium' | 'low' =
    corporateCategory !== 'OUTROS' ? 'high'
    : paymentMethod !== 'OUTROS' ? methodConfidence
    : 'low';

  return {
    paymentMethod,
    corporateCategory,
    counterpartyHint,
    categoryLabel: CATEGORY_LABELS[corporateCategory],
    isTax,
    isSalary,
    isInvestment,
    isReimbursement,
    isBankFee,
    isOwnTransfer,
    confidence,
  };
}

/** Mapeia método de pagamento do classificador para o valor salvo em AccountsPayable.paymentMethod */
export function toPayablePaymentMethod(pm: PaymentMethod): string | null {
  const map: Partial<Record<PaymentMethod, string>> = {
    PIX: 'PIX',
    TED: 'TRANSFERENCIA',
    DOC: 'TRANSFERENCIA',
    BOLETO: 'BOLETO',
    TRANSFERENCIA: 'TRANSFERENCIA',
  };
  return map[pm] ?? null;
}
