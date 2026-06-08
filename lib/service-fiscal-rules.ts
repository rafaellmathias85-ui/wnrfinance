import type { AccountsReceivable, ServiceFiscalRule } from '@prisma/client';
import { prisma } from '@/lib/prisma';

type ReceivableLike = Pick<AccountsReceivable, 'id' | 'description' | 'amount' | 'dueDate' | 'customerName' | 'customerDoc' | 'customerEmail' | 'fiscalRuleId'>;

export type FiscalValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export type ServiceTaxSnapshot = {
  grossAmount: number;
  netAmount: number;
  rates: Record<string, number>;
  values: Record<string, number>;
  retainedTotal: number;
  informativeTotal: number;
  issWithheld: boolean;
};

const RATE_FIELDS = [
  'issRate',
  'inssRate',
  'irrfRate',
  'csllRate',
  'pisRate',
  'cofinsRate',
  'cbsRate',
  'ibsRate',
] as const;

function clean(value?: string | null) {
  return (value || '').trim();
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calc(grossAmount: number, rate: number) {
  return roundCurrency(grossAmount * (rate / 100));
}

export function calculateServiceTaxes(rule: ServiceFiscalRule, grossAmount: number): ServiceTaxSnapshot {
  const amount = Number(grossAmount) || 0;
  const values = {
    iss: calc(amount, rule.issRate || 0),
    inss: calc(amount, rule.inssRate || 0),
    irrf: calc(amount, rule.irrfRate || 0),
    csll: calc(amount, rule.csllRate || 0),
    pis: calc(amount, rule.pisRate || 0),
    cofins: calc(amount, rule.cofinsRate || 0),
    cbs: calc(amount, rule.cbsRate || 0),
    ibs: calc(amount, rule.ibsRate || 0),
  };

  const retainedTotal = roundCurrency(
    (rule.issWithheld ? values.iss : 0) +
    values.inss +
    values.irrf +
    values.csll +
    values.pis +
    values.cofins
  );

  const informativeTotal = roundCurrency(values.cbs + values.ibs);

  return {
    grossAmount: roundCurrency(amount),
    netAmount: roundCurrency(amount - retainedTotal),
    rates: {
      iss: rule.issRate || 0,
      inss: rule.inssRate || 0,
      irrf: rule.irrfRate || 0,
      csll: rule.csllRate || 0,
      pis: rule.pisRate || 0,
      cofins: rule.cofinsRate || 0,
      cbs: rule.cbsRate || 0,
      ibs: rule.ibsRate || 0,
    },
    values,
    retainedTotal,
    informativeTotal,
    issWithheld: rule.issWithheld,
  };
}

export function validateServiceFiscalRule(
  rule: ServiceFiscalRule | null | undefined,
  receivable?: ReceivableLike | null
): FiscalValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!rule) {
    return {
      ok: false,
      errors: ['Configure uma regra fiscal de servico antes de emitir NFS-e automaticamente.'],
      warnings,
    };
  }

  if (!rule.isActive) errors.push('A regra fiscal selecionada esta inativa.');
  if (!clean(rule.serviceCodeLc116)) errors.push('Informe o codigo de servico da LC 116.');
  if (!clean(rule.cnae)) errors.push('Informe o CNAE do servico.');
  if (!clean(rule.providerCityCode)) errors.push('Informe o municipio do prestador (codigo IBGE).');
  if (!clean(rule.providerMunicipalRegistration)) errors.push('Informe a inscricao municipal do prestador.');
  if (!clean(rule.customerCityCode)) errors.push('Informe o municipio do tomador (codigo IBGE) na regra fiscal.');
  if (!clean(rule.operationNature)) errors.push('Informe a natureza da operacao.');
  if (!clean(rule.taxRegime)) errors.push('Informe o regime tributario.');

  for (const field of RATE_FIELDS) {
    const value = Number(rule[field] ?? 0);
    if (Number.isNaN(value) || value < 0 || value > 100) {
      errors.push(`Aliquota invalida em ${field}.`);
    }
  }

  if ((rule.issRate || 0) > 5) errors.push('A aliquota de ISS nao deve exceder 5% sem revisao do contador.');
  if ((rule.issRate || 0) === 0) warnings.push('ISS com aliquota zero: confirme isencao, imunidade ou regra municipal.');
  if ((rule.cbsRate || 0) > 0 && (!clean(rule.cbsCst) || !clean(rule.cbsClassificationCode))) {
    warnings.push('CBS preenchida sem CST/classificacao tributaria completa.');
  }
  if ((rule.ibsRate || 0) > 0 && (!clean(rule.ibsCst) || !clean(rule.ibsClassificationCode))) {
    warnings.push('IBS preenchido sem CST/classificacao tributaria completa.');
  }

  if (receivable) {
    if (!clean(receivable.customerName)) errors.push('Informe o nome/razao social do tomador.');
    if (!clean(receivable.customerDoc)) errors.push('Informe CPF/CNPJ do tomador.');
    if (!Number.isFinite(receivable.amount) || receivable.amount <= 0) errors.push('Valor bruto deve ser maior que zero.');
    if (!receivable.dueDate) warnings.push('Conta a receber sem vencimento definido.');
  }

  return { ok: errors.length === 0, errors, warnings };
}

export async function getApplicableServiceFiscalRule(companyId: string, fiscalRuleId?: string | null) {
  if (fiscalRuleId) {
    return prisma.serviceFiscalRule.findFirst({
      where: { id: fiscalRuleId, companyId },
    });
  }

  const defaultRule = await prisma.serviceFiscalRule.findFirst({
    where: { companyId, isActive: true, isDefault: true },
    orderBy: { updatedAt: 'desc' },
  });
  if (defaultRule) return defaultRule;

  return prisma.serviceFiscalRule.findFirst({
    where: { companyId, isActive: true },
    orderBy: { updatedAt: 'desc' },
  });
}

export function buildFiscalMetadata(rule: ServiceFiscalRule, grossAmount: number) {
  const taxes = calculateServiceTaxes(rule, grossAmount);
  return {
    ruleId: rule.id,
    ruleName: rule.name,
    serviceCodeLc116: rule.serviceCodeLc116,
    cnae: rule.cnae,
    providerCityCode: rule.providerCityCode,
    customerCityCode: rule.customerCityCode,
    operationNature: rule.operationNature,
    taxRegime: rule.taxRegime,
    isSimplesNacional: rule.isSimplesNacional,
    taxes,
  };
}
