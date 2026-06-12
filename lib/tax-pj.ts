// Tax Calculator PJ — Simples Nacional, MEI, DAS
// Tables based on LC 123/2006 with 2024 values

export type TaxRegime = 'simples_nacional' | 'lucro_presumido' | 'lucro_real' | 'mei';
export type SimplesAnexo = 'I' | 'II' | 'III' | 'IV' | 'V';

// ─────────────────────────────────────────────────────────────────────────────
// MEI — monthly fixed amounts (2024)
// ─────────────────────────────────────────────────────────────────────────────
const MEI_RATES = {
  commerce_industry: { inss: 70.60, icms: 1.00, iss: 0, total: 71.60 }, // comércio/indústria
  services: { inss: 70.60, icms: 0, iss: 5.00, total: 75.60 },          // serviços
  both: { inss: 70.60, icms: 1.00, iss: 5.00, total: 76.60 },           // ambos
};

export function calculateMEIDAS(activityType: 'commerce_industry' | 'services' | 'both' = 'services') {
  const rates = MEI_RATES[activityType];
  return {
    inss: rates.inss,
    icms: rates.icms,
    iss: rates.iss,
    total: rates.total,
    details: 'DAS MEI — valor fixo mensal',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Simples Nacional — Anexo I (Comércio), II (Indústria), III-V (Serviços)
// Tables: faixa de receita bruta acumulada nos últimos 12 meses
// ─────────────────────────────────────────────────────────────────────────────

interface SimplesRange {
  min: number;
  max: number;
  aliquota: number;    // nominal %
  deducao: number;     // R$ deduction
}

const SIMPLES_ANEXO: Record<SimplesAnexo, SimplesRange[]> = {
  // Anexo I — Comércio
  I: [
    { min: 0, max: 180000, aliquota: 4.0, deducao: 0 },
    { min: 180000.01, max: 360000, aliquota: 7.3, deducao: 5940 },
    { min: 360000.01, max: 720000, aliquota: 9.5, deducao: 13860 },
    { min: 720000.01, max: 1800000, aliquota: 10.7, deducao: 22500 },
    { min: 1800000.01, max: 3600000, aliquota: 14.3, deducao: 87300 },
    { min: 3600000.01, max: 4800000, aliquota: 19.0, deducao: 378000 },
  ],
  // Anexo II — Indústria
  II: [
    { min: 0, max: 180000, aliquota: 4.5, deducao: 0 },
    { min: 180000.01, max: 360000, aliquota: 7.8, deducao: 5940 },
    { min: 360000.01, max: 720000, aliquota: 10.0, deducao: 13860 },
    { min: 720000.01, max: 1800000, aliquota: 11.2, deducao: 22500 },
    { min: 1800000.01, max: 3600000, aliquota: 14.7, deducao: 85500 },
    { min: 3600000.01, max: 4800000, aliquota: 30.0, deducao: 720000 },
  ],
  // Anexo III — Serviços (instalação, reparo, limpeza, etc.)
  III: [
    { min: 0, max: 180000, aliquota: 6.0, deducao: 0 },
    { min: 180000.01, max: 360000, aliquota: 11.2, deducao: 9360 },
    { min: 360000.01, max: 720000, aliquota: 13.5, deducao: 17640 },
    { min: 720000.01, max: 1800000, aliquota: 16.0, deducao: 35640 },
    { min: 1800000.01, max: 3600000, aliquota: 21.0, deducao: 125640 },
    { min: 3600000.01, max: 4800000, aliquota: 33.0, deducao: 648000 },
  ],
  // Anexo IV — Serviços (construção, vigilância, saúde, advocacia, etc.)
  IV: [
    { min: 0, max: 180000, aliquota: 4.5, deducao: 0 },
    { min: 180000.01, max: 360000, aliquota: 9.0, deducao: 8100 },
    { min: 360000.01, max: 720000, aliquota: 10.2, deducao: 12420 },
    { min: 720000.01, max: 1800000, aliquota: 14.0, deducao: 39780 },
    { min: 1800000.01, max: 3600000, aliquota: 22.0, deducao: 183780 },
    { min: 3600000.01, max: 4800000, aliquota: 33.0, deducao: 828000 },
  ],
  // Anexo V — Serviços (TI, engenharia, publicidade, etc.)
  V: [
    { min: 0, max: 180000, aliquota: 15.5, deducao: 0 },
    { min: 180000.01, max: 360000, aliquota: 18.0, deducao: 4500 },
    { min: 360000.01, max: 720000, aliquota: 19.5, deducao: 9900 },
    { min: 720000.01, max: 1800000, aliquota: 20.5, deducao: 17100 },
    { min: 1800000.01, max: 3600000, aliquota: 23.0, deducao: 62100 },
    { min: 3600000.01, max: 4800000, aliquota: 30.5, deducao: 540000 },
  ],
};

export interface DASCalculation {
  regime: string;
  anexo?: SimplesAnexo;
  bruto12Months: number;
  receitaMes: number;
  aliquotaNominal: number;
  aliquotaEfetiva: number;
  dasAmount: number;
  details: string;
  breakdown?: Record<string, number>;
}

export function calculateDAS(
  regime: TaxRegime,
  receitaMes: number,
  bruto12Months: number,
  anexo: SimplesAnexo = 'III',
  activityType?: 'commerce_industry' | 'services' | 'both'
): DASCalculation {
  if (regime === 'mei') {
    const mei = calculateMEIDAS(activityType);
    return {
      regime: 'MEI',
      receitaMes,
      bruto12Months,
      aliquotaNominal: 0,
      aliquotaEfetiva: 0,
      dasAmount: mei.total,
      details: mei.details,
      breakdown: { INSS: mei.inss, ICMS: mei.icms, ISS: mei.iss },
    };
  }

  if (regime === 'simples_nacional') {
    const table = SIMPLES_ANEXO[anexo];
    const faixa = table.find((f) => bruto12Months >= f.min && bruto12Months <= f.max)
      || table[table.length - 1];

    const aliquotaEfetiva = bruto12Months > 0
      ? ((bruto12Months * (faixa.aliquota / 100)) - faixa.deducao) / bruto12Months * 100
      : faixa.aliquota;
    const dasAmount = receitaMes * (aliquotaEfetiva / 100);

    return {
      regime: 'Simples Nacional',
      anexo,
      bruto12Months,
      receitaMes,
      aliquotaNominal: faixa.aliquota,
      aliquotaEfetiva: Math.max(0, aliquotaEfetiva),
      dasAmount: Math.max(0, dasAmount),
      details: `Anexo ${anexo} — Faixa até R$ ${faixa.max.toLocaleString('pt-BR')}`,
    };
  }

  if (regime === 'lucro_presumido') {
    // Basic PIS + COFINS for Lucro Presumido (non-cumulative PIS/COFINS excluded)
    const pis = receitaMes * 0.0065;
    const cofins = receitaMes * 0.03;
    const csll = receitaMes * 0.12 * 0.09;
    const irpj = receitaMes * 0.08 * 0.15;
    const total = pis + cofins + csll + irpj;

    return {
      regime: 'Lucro Presumido',
      bruto12Months,
      receitaMes,
      aliquotaNominal: 0,
      aliquotaEfetiva: receitaMes > 0 ? (total / receitaMes) * 100 : 0,
      dasAmount: total,
      details: 'Estimativa: PIS 0,65% + COFINS 3% + CSLL 9% (base 12%) + IRPJ 15% (base 8%)',
      breakdown: { PIS: pis, COFINS: cofins, CSLL: csll, IRPJ: irpj },
    };
  }

  return {
    regime: 'Lucro Real',
    bruto12Months,
    receitaMes,
    aliquotaNominal: 0,
    aliquotaEfetiva: 0,
    dasAmount: 0,
    details: 'Lucro Real requer apuração contábil completa. Consulte seu contador.',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Get last 12 months revenue from DB for a company
// ─────────────────────────────────────────────────────────────────────────────
export async function getLast12MonthsRevenue(companyId: string): Promise<number> {
  const { prisma } = await import('@/lib/prisma');
  const since = new Date();
  since.setFullYear(since.getFullYear() - 1);

  const result = await prisma.accountsReceivable.aggregate({
    where: {
      companyId,
      status: { in: ['recebido', 'parcial'] },
      receivedAt: { gte: since },
    },
    _sum: { amountReceived: true },
  });

  return result._sum.amountReceived || 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Monthly revenue for a specific month/year
// ─────────────────────────────────────────────────────────────────────────────
export async function getMonthRevenue(companyId: string, year: number, month: number): Promise<number> {
  const { prisma } = await import('@/lib/prisma');
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);

  const result = await prisma.accountsReceivable.aggregate({
    where: {
      companyId,
      status: { in: ['recebido', 'parcial'] },
      receivedAt: { gte: start, lte: end },
    },
    _sum: { amountReceived: true },
  });

  return result._sum.amountReceived || 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Due dates for federal taxes
// ─────────────────────────────────────────────────────────────────────────────
export function getDASdueDate(year: number, month: number): Date {
  // DAS Simples Nacional: 20th of the following month
  return new Date(year, month, 20); // month here is already "next month" (0-indexed)
}

export function getPISDueDate(year: number, month: number): Date {
  // PIS/COFINS LP: last business day of following month (simplified: 25th)
  return new Date(year, month, 25);
}
