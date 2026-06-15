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
  prestadorInscricaoMunicipal: string;
  prestadorCodigoMunicipio: string;
  tomadorNome: string;
  tomadorDoc: string;
  tomadorEmail?: string;
  tomadorMunicipioCodigo?: string;
  tomadorMunicipio?: string;
  tomadorUf?: string;
  discriminacao: string;
  serviceCodeLc116: string;
  serviceCityCode?: string;
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

  const body = {
    data_emissao: payload.dataEmissao || new Date().toISOString(),
    prestador: {
      cnpj,
      inscricao_municipal: payload.prestadorInscricaoMunicipal,
      codigo_municipio: payload.prestadorCodigoMunicipio,
    },
    tomador: {
      cpf: doc.length === 11 ? doc : undefined,
      cnpj: doc.length === 14 ? doc : undefined,
      razao_social: payload.tomadorNome,
      email: payload.tomadorEmail,
      municipio: payload.tomadorMunicipio,
      uf: payload.tomadorUf,
    },
    servico: {
      aliquota: payload.issRate,
      base_calculo: payload.grossAmount,
      discriminacao: payload.discriminacao,
      iss_retido: payload.issWithheld ? '1' : '2',
      item_lista_servico: payload.serviceCodeLc116,
      valor_servicos: payload.grossAmount,
      valor_deducoes: payload.deductions || 0,
      valor_iss: payload.issValue,
      codigo_municipio_prestacao: payload.serviceCityCode || payload.prestadorCodigoMunicipio,
    },
    informacoes_adicionais_contribuinte: payload.informacoesAdicionais,
  };

  try {
    const res = await fetch(`${baseUrl}/v2/nfse?ref=${ref}`, {
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
      accessKey: data.codigo_verificacao || data.numero,
      xmlUrl: data.caminho_xml_nota_fiscal || data.xml,
      pdfUrl: data.caminho_danfe || data.caminho_pdf || data.url,
    };
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

  switch (conn.providerKey) {
    case 'focusnfe':
      return emitFocusNFSe(payload, config);
    default:
      return { success: false, errorMessage: `Provedor "${conn.providerKey}" ainda nao suporta NFS-e neste adaptador.` };
  }
}

export async function queryNFeStatus(companyId: string, providerNFeId: string): Promise<{ status: string; accessKey?: string; pdfUrl?: string; xmlUrl?: string }> {
  const conn = await getNFeConnection(companyId);
  if (!conn) return { status: 'erro' };

  const config = decryptConfig(conn.config as any);

  if (conn.providerKey === 'focusnfe') {
    const { apiKey, environment } = config;
    const baseUrl = environment === 'homologacao'
      ? 'https://homologacao.focusnfe.com.br'
      : 'https://api.focusnfe.com.br';

    try {
      const res = await fetch(`${baseUrl}/v2/nfe/${providerNFeId}`, {
        headers: { 'Authorization': `Basic ${Buffer.from(apiKey + ':').toString('base64')}` },
      });
      const data = await res.json();
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
export async function cancelNFe(companyId: string, providerNFeId: string, justification: string): Promise<NFeResult> {
  const conn = await getNFeConnection(companyId);
  if (!conn) return { success: false, errorMessage: 'Conexão NF-e não encontrada' };

  const config = decryptConfig(conn.config as any);

  if (conn.providerKey === 'focusnfe') {
    const { apiKey, environment } = config;
    const baseUrl = environment === 'homologacao'
      ? 'https://homologacao.focusnfe.com.br'
      : 'https://api.focusnfe.com.br';

    try {
      const res = await fetch(`${baseUrl}/v2/nfe/${providerNFeId}`, {
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
