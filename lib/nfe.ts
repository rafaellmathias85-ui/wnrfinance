// NF-e / NFS-e Integration Layer
// Supports: Focus NFe (focusnfe.com.br), NFe.io, Tecnospeed
// Uses CompanyConnection table for credentials per company

import { prisma } from '@/lib/prisma';
import { safeDecrypt } from '@/lib/encrypt';

function decryptConfig(config: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(config)) {
    if (key.endsWith('_masked')) continue;
    result[key] = typeof value === 'string' && value.length > 30
      ? (safeDecrypt(value) ?? value)
      : value;
  }
  return result;
}

export interface NFeItem {
  codigo: string;
  descricao: string;
  ncm?: string;
  cfop?: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  cst?: string;
  aliquotaICMS?: number;
  aliquotaIPI?: number;
  aliquotaPIS?: number;
  aliquotaCOFINS?: number;
}

export interface NFePayload {
  naturezaOperacao: string;
  dataEmissao?: string;
  tipoDocumento?: number; // 1 = normal
  finalidadeEmissao?: number; // 1 = normal
  consumidorFinal?: number;
  modalidadeFrete?: number;
  // Emitente (empresa emisora — vem dos dados da empresa)
  // Destinatário
  destinatarioNome: string;
  destinatarioDoc: string; // CPF ou CNPJ
  destinatarioEmail?: string;
  destinatarioTelefone?: string;
  destinatarioEndereco?: {
    logradouro?: string;
    numero?: string;
    bairro?: string;
    municipio?: string;
    uf?: string;
    cep?: string;
    pais?: string;
  };
  // Itens
  items: NFeItem[];
  // Pagamento
  formaPagamento?: number; // 01=dinheiro, 02=cheque, 03=cartao, 99=outros
  informacoesAdicionais?: string;
}

export interface NFeResult {
  success: boolean;
  providerNFeId?: string;
  accessKey?: string;
  status?: string;
  xmlUrl?: string;
  pdfUrl?: string;
  errorMessage?: string;
}

export interface NFSePayload {
  ref?: string;
  dataEmissao?: string;
  naturezaOperacao?: number;      // 1=tributação no município (default)
  optanteSimplesNacional?: boolean;
  // GINFES SBC requires this for Simples Nacional (E166 if absent). Focus NFe XSD: range 1-6 only (0 rejected).
  // Default=6 (ME/EPP). 1=Microempr.Munic, 2=Estimativa, 3=Soc.Profissionais, 4=Cooperativa, 5=MEI, 6=ME/EPP
  regimeEspecialTributacao?: number;
  prestadorInscricaoMunicipal: string;
  prestadorCodigoMunicipio: string; // IBGE code (string internally, cast to number when sending)
  tomadorNome: string;
  tomadorDoc: string;
  tomadorEmail?: string;
  tomadorTelefone?: string;
  tomadorMunicipioCodigo?: string;
  tomadorMunicipio?: string;
  tomadorUf?: string;
  // Full address — required by GINFES municipalities (e.g. SBC → Focus NFe error if missing)
  tomadorLogradouro?: string;
  tomadorNumero?: string;
  tomadorComplemento?: string;
  tomadorBairro?: string;
  tomadorCep?: string;
  discriminacao: string;
  serviceCodeLc116: string;
  serviceCityCode?: string;
  // SBC GINFES: composite code from ISS Decree (e.g. "1.07/108811/1271" for IT services).
  // Field name on Focus NFe is "codigo_tributario_municipio" (not "tributacao").
  // Get the correct value from an existing NFS-e XML issued via Bom Controle.
  codigoTributarioMunicipio?: string;
  grossAmount: number;
  issRate: number;
  issWithheld: boolean;
  deductions?: number;
  issValue?: number;
  informacoesAdicionais?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Get provider credentials for a company
// ─────────────────────────────────────────────────────────────────────────────
async function getNFeConnection(companyId: string) {
  const conn = await prisma.companyConnection.findFirst({
    where: {
      companyId,
      category: 'nfe',
      isActive: true,
      status: { not: 'erro' },
    },
    orderBy: { createdAt: 'desc' },
  });
  return conn;
}

// ─────────────────────────────────────────────────────────────────────────────
// Focus NFe API adapter
// ─────────────────────────────────────────────────────────────────────────────
async function emitFocusNFe(payload: NFePayload, config: any): Promise<NFeResult> {
  const { apiKey, environment } = config;
  const cnpj = (config.cnpj || '').replace(/\D/g, '');
  const baseUrl = environment === 'homologacao'
    ? 'https://homologacao.focusnfe.com.br'
    : 'https://api.focusnfe.com.br';

  const ref = `nfe_${Date.now()}`;

  const body = {
    natureza_operacao: payload.naturezaOperacao,
    data_emissao: payload.dataEmissao || new Date().toISOString().slice(0, 19),
    tipo_documento: payload.tipoDocumento ?? 1,
    finalidade_emissao: payload.finalidadeEmissao ?? 1,
    consumidor_final: payload.consumidorFinal ?? 1,
    modalidade_frete: payload.modalidadeFrete ?? 9,
    emitente: { cnpj },
    destinatario: {
      nome: payload.destinatarioNome,
      cpf: payload.destinatarioDoc.replace(/\D/g, '').length === 11 ? payload.destinatarioDoc.replace(/\D/g, '') : undefined,
      cnpj: payload.destinatarioDoc.replace(/\D/g, '').length === 14 ? payload.destinatarioDoc.replace(/\D/g, '') : undefined,
      email: payload.destinatarioEmail,
      telefone: payload.destinatarioTelefone,
      endereco: payload.destinatarioEndereco ? {
        logradouro: payload.destinatarioEndereco.logradouro,
        numero: payload.destinatarioEndereco.numero,
        bairro: payload.destinatarioEndereco.bairro,
        municipio: payload.destinatarioEndereco.municipio,
        uf: payload.destinatarioEndereco.uf,
        cep: payload.destinatarioEndereco.cep?.replace(/\D/g, ''),
        pais: payload.destinatarioEndereco.pais || 'Brasil',
        codigo_pais: '1058',
      } : undefined,
    },
    items: payload.items.map((item, i) => ({
      numero_item: i + 1,
      codigo_produto: item.codigo,
      descricao: item.descricao,
      ncm: item.ncm || '00000000',
      cfop: item.cfop || '5102',
      unidade_comercial: item.unidade,
      quantidade_comercial: item.quantidade,
      valor_unitario_comercial: item.valorUnitario,
      valor_bruto: item.valorTotal,
      icms_origem: 0,
      icms_modalidade: '102',
      pis_modalidade: '07',
      cofins_modalidade: '07',
    })),
    formas_pagamento: [{ forma_pagamento: String(payload.formaPagamento ?? '99').padStart(2, '0'), valor: payload.items.reduce((s, i) => s + i.valorTotal, 0) }],
    informacoes_adicionais_contribuinte: payload.informacoesAdicionais,
  };

  try {
    const res = await fetch(`${baseUrl}/v2/nfe?ref=${ref}`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch { /* non-JSON response */ }

    if (!res.ok) {
      const msg = data.mensagem || data.message || (data.erros ? JSON.stringify(data.erros) : null) || text.slice(0, 300) || `HTTP ${res.status}`;
      return { success: false, errorMessage: msg };
    }

    return {
      success: true,
      providerNFeId: ref,
      status: data.status || 'enviada',
      accessKey: data.chave_nfe,
      xmlUrl: data.caminho_xml_nota_fiscal,
      pdfUrl: data.caminho_danfe,
    };
  } catch (err: any) {
    return { success: false, errorMessage: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NFe.io API adapter
// ─────────────────────────────────────────────────────────────────────────────
async function emitNFeIO(payload: NFePayload, config: any): Promise<NFeResult> {
  const { apiKey, companyId: providerCompanyId, environment } = config;
  const baseUrl = environment === 'homologacao'
    ? 'https://api.nfe.io/v1'
    : 'https://api.nfe.io/v1';

  const body = {
    nature: payload.naturezaOperacao,
    recipient: {
      name: payload.destinatarioNome,
      taxNumber: payload.destinatarioDoc.replace(/\D/g, ''),
      email: payload.destinatarioEmail,
      address: payload.destinatarioEndereco ? {
        street: payload.destinatarioEndereco.logradouro,
        number: payload.destinatarioEndereco.numero,
        district: payload.destinatarioEndereco.bairro,
        city: { name: payload.destinatarioEndereco.municipio },
        state: payload.destinatarioEndereco.uf,
        postalCode: payload.destinatarioEndereco.cep?.replace(/\D/g, ''),
      } : undefined,
    },
    items: payload.items.map((item) => ({
      code: item.codigo,
      description: item.descricao,
      unitOfMeasurement: item.unidade,
      quantity: item.quantidade,
      unitPrice: item.valorUnitario,
      totalPrice: item.valorTotal,
    })),
  };

  try {
    const res = await fetch(`${baseUrl}/companies/${providerCompanyId}/nfe`, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok || data.errors) {
      return { success: false, errorMessage: data.message || JSON.stringify(data.errors || data) };
    }

    return {
      success: true,
      providerNFeId: data.id,
      status: data.flowStatus || 'enviada',
      accessKey: data.accessKey,
      xmlUrl: data.links?.find((l: any) => l.rel === 'xml')?.href,
      pdfUrl: data.links?.find((l: any) => l.rel === 'danfe')?.href,
    };
  } catch (err: any) {
    return { success: false, errorMessage: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main emission function — auto-selects provider
// ─────────────────────────────────────────────────────────────────────────────
export async function emitNFe(companyId: string, payload: NFePayload): Promise<NFeResult> {
  const conn = await getNFeConnection(companyId);

  if (!conn) {
    return { success: false, errorMessage: 'Nenhuma conexão NF-e ativa. Configure em Conexões → NF-e.' };
  }

  const config = decryptConfig(conn.config as any);

  // Sempre usa o CNPJ da própria empresa — nunca o que foi digitado na configuração da conexão.
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { cnpj: true } });
  if (company?.cnpj) config.cnpj = company.cnpj.replace(/\D/g, '');

  switch (conn.providerKey) {
    case 'focusnfe':
      return emitFocusNFe(payload, config);
    case 'nfe_io':
      return emitNFeIO(payload, config);
    default:
      return { success: false, errorMessage: `Provedor "${conn.providerKey}" não suportado` };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Query NF-e status from provider
// ─────────────────────────────────────────────────────────────────────────────
async function emitFocusNFSe(payload: NFSePayload, config: any): Promise<NFeResult> {
  const { apiKey, environment } = config;
  const cnpj = (config.cnpj || '').replace(/\D/g, '');
  const baseUrl = environment === 'homologacao'
    ? 'https://homologacao.focusnfe.com.br'
    : 'https://api.focusnfe.com.br';
  const ref = payload.ref || `nfse_${Date.now()}`;
  const doc = payload.tomadorDoc.replace(/\D/g, '');

  const inscricaoMunicipal = payload.prestadorInscricaoMunicipal || config.inscricaoMunicipal || '';
  const codigoMunicipioPrestador = parseInt(payload.prestadorCodigoMunicipio || config.codigoMunicipio || '0', 10);
  const codigoMunicipioServico = parseInt(payload.serviceCityCode || payload.prestadorCodigoMunicipio || config.codigoMunicipio || '0', 10);

  // "codigo_tributario_municipio" — SBC GINFES E183 if missing; Focus NFe field name is "tributario" NOT "tributacao".
  // SBC confirmed value: "1.07/102320/1234" (from NFS-e 2577 / Bom Controle, June 2026).
  // Store in ServiceFiscalRule.codigoTributarioMunicipio per company/service.
  const codigoTributario = payload.codigoTributarioMunicipio || config.codigoTributarioMunicipio || undefined;

  const hasAddress = payload.tomadorLogradouro || payload.tomadorBairro || payload.tomadorCep;

  // regime_especial_tributacao: GINFES SBC requires this for Simples Nacional (E166 if absent).
  // Focus NFe XSD rejects value 0; use 6 (ME/EPP) as the required value for Simples Nacional.
  // Bom Controle displays "0 - Nenhum" because they submit XML directly, bypassing Focus NFe's XSD check.
  const isSimples = payload.optanteSimplesNacional ?? true;
  const regimeEspecial = payload.regimeEspecialTributacao
    ?? config.regimeEspecialTributacao
    ?? (isSimples ? 6 : undefined);

  // Date in Brazil timezone (UTC-3): Focus NFe SBC guide uses "-0300" offset; UTC ("Z") triggers E16.
  const brDate = payload.dataEmissao || (() => {
    const now = new Date();
    const offset = -3 * 60;
    const d = new Date(now.getTime() + (offset - now.getTimezoneOffset()) * 60000);
    return d.toISOString().replace('Z', '-0300');
  })();

  // Focus NFe ignores serie_rps field and always uses '1'. To avoid collision with Bom Controle
  // (which already registered RPSes 1-1721 in GINFES SBC), we pass numero_rps explicitly starting
  // from offset 10000. Computed from company's NFe count so each emission gets a unique number.
  const nfseCount = config.companyId
    ? await prisma.nFe.count({ where: { companyId: config.companyId, type: 'nfse' } })
    : 0;
  const numeroRps = nfseCount + 10000;

  const body: any = {
    data_emissao: brDate,
    numero_rps: String(numeroRps),
    natureza_operacao: payload.naturezaOperacao ?? 1,
    optante_simples_nacional: payload.optanteSimplesNacional ?? true,
    ...(regimeEspecial !== undefined ? { regime_especial_tributacao: regimeEspecial } : {}),
    prestador: {
      cnpj,
      ...(inscricaoMunicipal ? { inscricao_municipal: inscricaoMunicipal } : {}),
      codigo_municipio: codigoMunicipioPrestador,
    },
    tomador: {
      cpf: doc.length === 11 ? doc : undefined,
      cnpj: doc.length === 14 ? doc : undefined,
      razao_social: payload.tomadorNome,
      email: payload.tomadorEmail || undefined,
      telefone: payload.tomadorTelefone || undefined,
      ...(hasAddress ? {
        endereco: {
          logradouro: payload.tomadorLogradouro || '',
          numero: payload.tomadorNumero || 'S/N',
          complemento: payload.tomadorComplemento || undefined,
          bairro: payload.tomadorBairro || '',
          codigo_municipio: payload.tomadorMunicipioCodigo ? parseInt(payload.tomadorMunicipioCodigo, 10) : codigoMunicipioPrestador,
          uf: payload.tomadorUf || '',
          cep: payload.tomadorCep?.replace(/\D/g, '') || '',
        },
      } : {}),
    },
    servico: {
      aliquota: payload.issRate,
      base_calculo: payload.grossAmount,
      discriminacao: payload.discriminacao,
      iss_retido: payload.issWithheld,
      item_lista_servico: payload.serviceCodeLc116,
      valor_servicos: payload.grossAmount,
      valor_deducoes: payload.deductions || 0,
      valor_iss: payload.issValue,
      codigo_municipio: codigoMunicipioServico,
      ...(codigoTributario ? { codigo_tributario_municipio: codigoTributario } : {}),
    },
    informacoes_adicionais_contribuinte: payload.informacoesAdicionais || undefined,
  };

  const authHeader = `Basic ${Buffer.from(apiKey + ':').toString('base64')}`;

  try {
    const res = await fetch(`${baseUrl}/v2/nfse?ref=${ref}`, {
      method: 'POST',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch { /* non-JSON response */ }

    if (!res.ok) {
      const msg = data.mensagem || data.message || (data.erros ? JSON.stringify(data.erros) : null) || text.slice(0, 300) || `HTTP ${res.status}`;
      return { success: false, errorMessage: msg };
    }

    // GINFES processes asynchronously — poll until resolved (max 90s).
    // Without polling, rejected NFS-es (e.g. E183) would be incorrectly saved as "enviada".
    const TERMINAL = new Set(['autorizado', 'erro_autorizacao', 'cancelado']);
    const POLL_INTERVAL_MS = 8_000;
    const MAX_WAIT_MS = 90_000;
    const deadline = Date.now() + MAX_WAIT_MS;

    let polled = data;
    while (!TERMINAL.has(polled.status) && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
      try {
        const pr = await fetch(`${baseUrl}/v2/nfse/${ref}`, { headers: { 'Authorization': authHeader } });
        polled = await pr.json();
      } catch { /* keep last known state */ }
    }

    if (polled.status === 'autorizado') {
      // PDF/XML may not be immediately available — queryNFeStatus can be called later to refresh.
      return {
        success: true,
        providerNFeId: ref,
        status: 'autorizado',
        accessKey: polled.codigo_verificacao || polled.numero_nfse || polled.numero,
        xmlUrl: polled.caminho_xml_nota_fiscal || polled.caminho_xml_nfse || undefined,
        pdfUrl: polled.url_danfse || polled.caminho_pdf_nfse || polled.caminho_nfse_pdf || undefined,
      };
    }

    if (polled.status === 'erro_autorizacao') {
      const erros: Array<{ codigo: string; mensagem: string }> = polled.erros || [];
      const msg = erros.map((e: { codigo: string; mensagem: string }) => `[${e.codigo}] ${e.mensagem}`).join(' ') || 'GINFES rejeitou a NFS-e';
      return { success: false, providerNFeId: ref, errorMessage: msg };
    }

    // Still processing after timeout — return as pending so caller can retry later
    return { success: true, providerNFeId: ref, status: 'processando' };
  } catch (err: any) {
    return { success: false, errorMessage: err.message };
  }
}

export async function emitNFSe(companyId: string, payload: NFSePayload): Promise<NFeResult> {
  const conn = await getNFeConnection(companyId);

  if (!conn) {
    return { success: false, errorMessage: 'Nenhuma conexao NFS-e ativa. Configure em Conexoes -> NF-e/NFS-e.' };
  }

  const config = decryptConfig(conn.config as any);

  // Sempre usa o CNPJ da própria empresa — nunca o que foi digitado na configuração da conexão,
  // que pode estar desatualizado ou conter o CNPJ de um cliente por engano.
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { cnpj: true } });
  if (company?.cnpj) config.cnpj = company.cnpj.replace(/\D/g, '');
  config.companyId = companyId;

  switch (conn.providerKey) {
    case 'focusnfe':
      return emitFocusNFSe(payload, config);
    default:
      return { success: false, errorMessage: `Provedor "${conn.providerKey}" ainda nao suporta NFS-e neste adaptador.` };
  }
}

export async function queryNFeStatus(
  companyId: string,
  providerNFeId: string,
  noteType: string = 'nfe',
): Promise<{ status: string; accessKey?: string; pdfUrl?: string; xmlUrl?: string }> {
  const conn = await getNFeConnection(companyId);
  if (!conn) return { status: 'erro' };

  const config = decryptConfig(conn.config as any);

  if (conn.providerKey === 'focusnfe') {
    const { apiKey, environment } = config;
    const baseUrl = environment === 'homologacao'
      ? 'https://homologacao.focusnfe.com.br'
      : 'https://api.focusnfe.com.br';

    // NFS-e (serviço) usa endpoint diferente de NF-e (produto)
    const isNFSe = noteType === 'nfse';
    const path = isNFSe ? `/v2/nfse/${providerNFeId}` : `/v2/nfe/${providerNFeId}`;

    try {
      const res = await fetch(`${baseUrl}${path}`, {
        headers: { 'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}` },
      });
      const data = await res.json();
      if (isNFSe) {
        return {
          status: data.status || 'desconhecido',
          pdfUrl: data.url_danfse || data.caminho_pdf_nfse || data.caminho_nfse_pdf,
          xmlUrl: data.caminho_xml_nota_fiscal || data.caminho_xml_nfse,
        };
      }
      return {
        status: data.status || 'desconhecido',
        accessKey: data.chave_nfe,
        pdfUrl: data.caminho_danfe,
        xmlUrl: data.caminho_xml_nota_fiscal,
      };
    } catch {
      return { status: 'erro' };
    }
  }

  return { status: 'desconhecido' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cancel NF-e
// ─────────────────────────────────────────────────────────────────────────────
export async function cancelNFe(companyId: string, providerNFeId: string, justification: string, type: 'nfe' | 'nfse' = 'nfe'): Promise<NFeResult> {
  const conn = await getNFeConnection(companyId);
  if (!conn) return { success: false, errorMessage: 'Conexão NF-e não encontrada' };

  const config = decryptConfig(conn.config as any);

  if (conn.providerKey === 'focusnfe') {
    const { apiKey, environment } = config;
    const baseUrl = environment === 'homologacao'
      ? 'https://homologacao.focusnfe.com.br'
      : 'https://api.focusnfe.com.br';
    // NFS-e uses /v2/nfse/{ref}; NF-e uses /v2/nfe/{ref}
    const path = type === 'nfse' ? `/v2/nfse/${providerNFeId}` : `/v2/nfe/${providerNFeId}`;

    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ justificativa: justification }),
      });
      const data = await res.json();
      return res.ok
        ? { success: true, status: 'cancelada' }
        : { success: false, errorMessage: data.mensagem || 'Erro ao cancelar' };
    } catch (err: any) {
      return { success: false, errorMessage: err.message };
    }
  }

  return { success: false, errorMessage: 'Cancelamento não suportado para este provedor' };
}
