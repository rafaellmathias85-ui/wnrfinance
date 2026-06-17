// Focus NFe — emissão de NF-e, NFS-e e NFC-e
// Docs: https://focusnfe.com.br/doc/

const FOCUSNFE_BASE = process.env.FOCUSNFE_SANDBOX === 'true'
  ? 'https://homologacao.focusnfe.com.br/v2'
  : 'https://api.focusnfe.com.br/v2';

function authHeader(token: string) {
  const encoded = Buffer.from(`${token}:`).toString('base64');
  return { 'Authorization': `Basic ${encoded}`, 'Content-Type': 'application/json' };
}

// Timeout padrão — Sefaz/prefeituras podem demorar; 60s cobre contingência
// sem deixar a requisição pendurada indefinidamente.
const FOCUSNFE_TIMEOUT_MS = 60_000;

async function focusRequest<T>(token: string, method: string, path: string, body?: object): Promise<T> {
  const res = await fetch(`${FOCUSNFE_BASE}${path}`, {
    method,
    headers: authHeader(token),
    signal: AbortSignal.timeout(FOCUSNFE_TIMEOUT_MS),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 204) return {} as T;

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.mensagem || data?.erros?.[0]?.mensagem || `Focus NFe error ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

// ── NF-e (product) ────────────────────────────────────────────────────────

export interface FocusNFeEmitente {
  cnpj: string;
  nome: string;
  nome_fantasia?: string;
  inscricao_estadual: string;
  crt: '1' | '2' | '3'; // 1=Simples, 2=Simples Excesso, 3=Normal
  logradouro: string;
  numero: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  telefone?: string;
}

export interface FocusNFeDestinatario {
  cpf?: string;
  cnpj?: string;
  nome: string;
  email?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  pais?: string;
  indicador_ie_destinatario?: '1' | '2' | '9';
}

export interface FocusNFeItem {
  numero_item: number;
  codigo_produto: string;
  descricao: string;
  codigo_ncm: string;
  cfop: string;
  unidade_comercial: string;
  quantidade_comercial: number;
  valor_unitario_comercial: number;
  valor_bruto: number;
  icms_origem: '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8';
  icms_modalidade_determinacao_bc?: string;
  icms_aliquota?: number;
  icms_base_calculo?: number;
  icms_valor?: number;
  pis_modalidade?: string;
  cofins_modalidade?: string;
  valor_total_tributos?: number;
}

export interface FocusNFeInput {
  natureza_operacao: string;
  forma_pagamento?: '0' | '1' | '2';
  tipo_documento?: '0' | '1'; // 0=saída, 1=entrada
  emitente: FocusNFeEmitente;
  destinatario: FocusNFeDestinatario;
  items: FocusNFeItem[];
  valor_produtos?: number;
  valor_desconto?: number;
  valor_total?: number;
  informacoes_adicionais_contribuinte?: string;
  forma_de_pagamento?: Array<{ forma_de_pagamento: string; valor: number }>;
}

export interface FocusNFeResponse {
  ref: string;
  status: string;
  status_sefaz?: string;
  mensagem_sefaz?: string;
  chave_nfe?: string;
  numero?: string;
  serie?: string;
  caminho_danfe?: string;
  caminho_xml_nota_fiscal?: string;
  qrcode_url?: string;
  url_consulta_nf?: string;
}

export async function emitirNFe(token: string, ref: string, data: FocusNFeInput): Promise<FocusNFeResponse> {
  return focusRequest<FocusNFeResponse>(token, 'POST', `/nfe?ref=${ref}&completo=1`, data);
}

export async function consultarNFe(token: string, ref: string): Promise<FocusNFeResponse> {
  return focusRequest<FocusNFeResponse>(token, 'GET', `/nfe/${ref}?completo=1`);
}

export async function cancelarNFe(token: string, ref: string, justificativa: string): Promise<FocusNFeResponse> {
  return focusRequest<FocusNFeResponse>(token, 'DELETE', `/nfe/${ref}`, { justificativa });
}

export async function cartaCorrecaoNFe(token: string, ref: string, correcao: string, grupo: string): Promise<FocusNFeResponse> {
  return focusRequest<FocusNFeResponse>(token, 'POST', `/nfe/${ref}/carta_correcao`, { correcao, grupo_alterado: grupo });
}

// ── NFS-e (service) ───────────────────────────────────────────────────────

export interface FocusNFSeInput {
  data_emissao: string;          // ISO date
  natureza_operacao?: number;    // 1=tributação no município (default)
  optante_simples_nacional?: boolean;
  // RPS fields — needed to avoid collision when mixing providers (e.g. Bom Controle + Focus NFe)
  numero_rps?: number;
  serie_rps?: string;
  numero_lote_rps?: number;
  prestador: {
    cnpj: string;
    inscricao_municipal: string;
    codigo_municipio: number;    // IBGE code as integer (e.g. 3548708)
  };
  tomador: {
    cnpj?: string;
    cpf?: string;
    razao_social: string;
    email?: string;
    telefone?: string;
    // Full address required by GINFES municipalities (Focus NFe returns error if missing for SBC)
    endereco?: {
      logradouro: string;
      numero: string;
      complemento?: string;
      bairro: string;
      codigo_municipio: number; // IBGE integer
      uf: string;
      cep: string;
    };
  };
  servico: {
    aliquota: number;
    base_calculo: number;
    discriminacao: string;
    iss_retido: boolean;         // true=retido, false=não retido (boolean, not '1'/'2')
    item_lista_servico: string;
    valor_servicos: number;
    valor_deducoes?: number;
    valor_iss?: number;
    codigo_municipio?: number;   // IBGE integer for service municipality
    // SBC GINFES requires this field (E183 if absent). Focus NFe field name is "codigo_tributario_municipio"
    // (NOT "tributacao"). Value is a composite ISS code, e.g. "1.07/108811/1271" for SBC IT services.
    codigo_tributario_municipio?: string;
  };
}

export async function emitirNFSe(token: string, ref: string, data: FocusNFSeInput): Promise<any> {
  return focusRequest(token, 'POST', `/nfse?ref=${ref}`, data);
}

export async function consultarNFSe(token: string, ref: string): Promise<any> {
  return focusRequest(token, 'GET', `/nfse/${ref}`);
}

export async function cancelarNFSe(token: string, ref: string): Promise<any> {
  return focusRequest(token, 'DELETE', `/nfse/${ref}`);
}

// ── Emitente config ───────────────────────────────────────────────────────

export async function configurarEmitente(token: string, data: FocusNFeEmitente): Promise<any> {
  return focusRequest(token, 'POST', '/emitentes', data);
}

export async function uploadCertificado(token: string, cnpj: string, pfxBase64: string, senha: string): Promise<any> {
  return focusRequest(token, 'PUT', `/emitentes/${cnpj}/certificado`, {
    certificado: pfxBase64,
    senha_certificado: senha,
  });
}

// ── Inutilização ──────────────────────────────────────────────────────────

export async function inutilizarNFe(
  token: string,
  ref: string,
  data: { cnpj: string; serie: string; numero_inicial: number; numero_final: number; justificativa: string }
): Promise<any> {
  return focusRequest(token, 'POST', `/nfe_inutilizacao?ref=${ref}`, data);
}
