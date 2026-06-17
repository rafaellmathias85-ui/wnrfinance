import { prisma } from '@/lib/prisma';
import { createCharge, type ChargePayload } from '@/lib/boleto';
import { emitNFSe, type NFSePayload } from '@/lib/nfe';
import {
  buildFiscalMetadata,
  calculateServiceTaxes,
  getApplicableServiceFiscalRule,
  validateServiceFiscalRule,
} from '@/lib/service-fiscal-rules';

export type AutomationResult = {
  nfe?: { id?: string; status: string; errorMessage?: string };
  boleto?: { id?: string; status: string; errorMessage?: string };
};

export async function runReceivableAutomation(
  receivableId: string,
  companyId: string,
  opts?: { nfe?: boolean; boleto?: boolean }
): Promise<AutomationResult> {
  const receivable = await prisma.accountsReceivable.findUnique({
    where: { id: receivableId },
  });
  if (!receivable) return {};

  const doNfe = opts?.nfe ?? receivable.autoNfe;
  const doBoleto = opts?.boleto ?? receivable.autoBoleto;
  const result: AutomationResult = {};

  if (doNfe) {
    result.nfe = await generateNFSe(receivable, companyId);
    const nfeReadyForCharge = ['enviada', 'autorizada'].includes(result.nfe.status);
    if (doBoleto && !nfeReadyForCharge) {
      result.boleto = {
        status: 'bloqueada',
        errorMessage: result.nfe.errorMessage
          ? `Cobranca automatica bloqueada: ${result.nfe.errorMessage}`
          : 'Cobranca automatica bloqueada ate a NFS-e ser enviada com sucesso.',
      };
      return result;
    }
  }

  if (doBoleto) {
    result.boleto = await generateCharge(receivable, companyId);
  }

  return result;
}

async function generateNFSe(
  receivable: any,
  companyId: string
): Promise<{ id?: string; status: string; errorMessage?: string }> {
  const rule = await getApplicableServiceFiscalRule(companyId, receivable.fiscalRuleId);
  const validation = validateServiceFiscalRule(rule, receivable);
  const taxSnapshot = rule ? buildFiscalMetadata(rule, receivable.amount) : null;

  const existing = await prisma.nFe.findFirst({
    where: { receivableId: receivable.id, status: { notIn: ['cancelada', 'rejeitada'] } },
    select: { id: true, status: true },
  });
  if (existing && existing.status !== 'rascunho') {
    return { id: existing.id, status: existing.status };
  }

  const draftData = {
    companyId,
    receivableId: receivable.id,
    type: 'nfse',
    status: 'rascunho',
    customerName: receivable.customerName,
    customerDoc: receivable.customerDoc,
    customerEmail: receivable.customerEmail,
    fiscalRuleId: rule?.id ?? null,
    taxSnapshot: taxSnapshot as any,
    items: [{
      codigo: rule?.serviceCodeLc116 || 'SERVICO',
      descricao: receivable.description,
      unidade: 'UN',
      quantidade: 1,
      valorUnitario: receivable.amount,
      valorTotal: receivable.amount,
    }] as any,
    totals: taxSnapshot ? (taxSnapshot as any).taxes : ({ totalNota: receivable.amount } as any),
    createdBy: receivable.createdBy,
  };

  const validationData = {
    validationStatus: validation.ok ? 'valid' : 'blocked',
    validationErrors: validation.ok
      ? ({ warnings: validation.warnings } as any)
      : ({ errors: validation.errors, warnings: validation.warnings } as any),
    errorMessage: validation.ok ? null : validation.errors.join(' '),
  };

  const nfe = existing
    ? await prisma.nFe.update({ where: { id: existing.id }, data: { ...draftData, ...validationData } })
    : await prisma.nFe.create({ data: { ...draftData, ...validationData } });

  if (!validation.ok || !rule) {
    return { id: nfe.id, status: 'bloqueada', errorMessage: validation.errors.join(' ') };
  }

  const taxes = calculateServiceTaxes(rule, receivable.amount);
  const payload: NFSePayload = {
    ref: `nfse_${nfe.id}`,
    prestadorInscricaoMunicipal: rule.providerMunicipalRegistration || '',
    prestadorCodigoMunicipio: rule.providerCityCode,
    tomadorNome: receivable.customerName || '',
    tomadorDoc: receivable.customerDoc || '',
    tomadorEmail: receivable.customerEmail || undefined,
    tomadorMunicipio: rule.customerCityName || undefined,
    tomadorMunicipioCodigo: rule.customerCityCode || undefined,
    discriminacao: receivable.description,
    serviceCodeLc116: rule.serviceCodeLc116,
    serviceCityCode: rule.providerCityCode,
    grossAmount: receivable.amount,
    issRate: rule.issRate,
    issWithheld: rule.issWithheld,
    issValue: taxes.values.iss,
    informacoesAdicionais: receivable.notes || undefined,
  };

  const emitResult = await emitNFSe(companyId, payload);
  const updated = await prisma.nFe.update({
    where: { id: nfe.id },
    data: {
      status: emitResult.success ? 'enviada' : 'rascunho',
      providerNFeId: emitResult.providerNFeId ?? null,
      accessKey: emitResult.accessKey ?? null,
      xmlUrl: emitResult.xmlUrl ?? null,
      pdfUrl: emitResult.pdfUrl ?? null,
      errorMessage: emitResult.errorMessage ?? null,
      validationStatus: 'valid',
      validationErrors: { warnings: validation.warnings } as any,
      issuedAt: emitResult.success ? new Date() : null,
    },
  });

  return { id: updated.id, status: updated.status, errorMessage: emitResult.errorMessage };
}

async function generateCharge(
  receivable: any,
  companyId: string
): Promise<{ id?: string; status: string; errorMessage?: string }> {
  const existing = await prisma.boletoCharge.findFirst({
    where: { receivableId: receivable.id, status: { notIn: ['cancelado'] } },
    select: { id: true, status: true },
  });
  if (existing) return { id: existing.id, status: existing.status };

  const allowedChargeTypes = new Set(['boleto', 'pix', 'boleto_pix', 'link']);
  const chargeType = allowedChargeTypes.has(receivable.chargeType) ? receivable.chargeType : 'boleto_pix';

  if (!receivable.customerDoc) {
    const charge = await prisma.boletoCharge.create({
      data: {
        companyId,
        receivableId: receivable.id,
        type: chargeType,
        status: 'pendente',
        customerName: receivable.customerName || 'Consumidor',
        amount: receivable.amount,
        dueDate: receivable.dueDate,
        description: receivable.description,
        createdBy: receivable.createdBy,
      },
    });
    return { id: charge.id, status: charge.status, errorMessage: 'CPF/CNPJ nao informado; cobranca nao enviada ao provedor.' };
  }

  const payload: ChargePayload = {
    type: chargeType,
    customerName: receivable.customerName || 'Consumidor',
    customerDoc: receivable.customerDoc,
    customerEmail: receivable.customerEmail || undefined,
    amount: receivable.amount,
    dueDate: receivable.dueDate,
    description: receivable.description || undefined,
    externalId: receivable.id,
  };

  const chargeResult = await createCharge(companyId, payload);
  const chargeRecord = await prisma.boletoCharge.create({
    data: {
      companyId,
      receivableId: receivable.id,
      type: chargeType,
      status: 'pendente',
      customerName: receivable.customerName || 'Consumidor',
      customerDoc: receivable.customerDoc,
      customerEmail: receivable.customerEmail,
      amount: receivable.amount,
      dueDate: receivable.dueDate,
      description: receivable.description,
      providerKey: chargeResult.providerKey ?? null,
      providerChargeId: chargeResult.providerChargeId ?? null,
      nossoNumero: chargeResult.nossoNumero ?? null,
      itauBoletoId: chargeResult.itauBoletoId ?? null,
      boletoBarCode: chargeResult.boletoBarCode ?? null,
      boletoUrl: chargeResult.boletoUrl ?? null,
      pixCopiaECola: chargeResult.pixCopiaECola ?? null,
      pixQrCodeUrl: chargeResult.pixQrCodeUrl ?? null,
      pixExpiresAt: chargeResult.pixExpiresAt ?? null,
      createdBy: receivable.createdBy,
    },
  });

  // Tarifa de emissão automática (se habilitada na conta de cobrança)
  if (chargeResult.success) {
    try {
      const { registerIssueFee } = await import('@/lib/bank-fees');
      await registerIssueFee(companyId, chargeRecord.id);
    } catch { /* tarifa é best-effort */ }
  }

  return {
    id: chargeRecord.id,
    status: chargeRecord.status,
    errorMessage: chargeResult.success ? undefined : chargeResult.errorMessage,
  };
}
