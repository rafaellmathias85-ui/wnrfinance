// ============================================================
// Itaú Boleto Service - WnrFinance
// Integração: Emissão de Boleto + Conciliação Bancária
// Carteira: 109 | Base: API Cobrança v2 + Extrato v1
// ============================================================

import https from 'https';
import fs from 'fs';
import { randomUUID } from 'crypto';
import {
  ItauAuthConfig,
  ItauAccessTokenResponse,
  EmissaoBoletoRequest,
  EmissaoBoletoResponse,
  ConsultaBoletoParams,
  ListagemBoletosParams,
  FrancesinhaParams,
  MovimentacaoParams,
  AlteracaoVencimento,
  AlteracaoValorNominal,
  AlteracaoJuros,
  AlteracaoMulta,
  WebhookCadastroRequest,
  TipoNotificacao,
} from './types';

// ---- URLs base ----
const URLS = {
  token:           'https://sts.itau.com.br/api/oauth/token',
  emissao:         'https://api.itau.com.br/cash_management/v2/boletos',
  consulta:        'https://secure.api.cloud.itau.com.br/boletoscash/v2/boletos',
  listagem:        'https://boleto.api.itau.com/boleto/v1/boletos',
  francesa:        'https://boleto.api.itau.com/extrato/v1/francesas',
  webhook:         'https://boletos.cloud.itau.com.br/boletos/v3/notificacoes_boletos',
  certSolicitacao: 'https://sts.itau.com.br/seguranca/v1/certificado/solicitacao',
  certRenovacao:   'https://sts.itau.com.br/seguranca/v1/certificado/renovacao',
};

export class ItauBoletoService {
  private config: ItauAuthConfig;
  private _httpsAgent?: https.Agent;
  private cachedToken: string | null = null;
  private tokenExpiresAt: number = 0;

  private get httpsAgent(): https.Agent {
    if (!this._httpsAgent) {
      this._httpsAgent = new https.Agent({
        cert: fs.readFileSync(this.config.certPath),
        key:  fs.readFileSync(this.config.keyPath),
        rejectUnauthorized: true,
      });
    }
    return this._httpsAgent;
  }

  /**
   * @param config  Credenciais e caminhos de certificado
   *
   * Exemplo:
   * new ItauBoletoService({
   *   clientId:     '371dd04c-8b91-4cb5-8f37-7683aa826a7e',
   *   clientSecret: '<secret_gerado_na_ativacao>',
   *   certPath:     './certs/certificado.crt',
   *   keyPath:      './certs/ARQUIVO_CHAVE_PRIVADA.key',
   * })
   */
  constructor(config: ItauAuthConfig) {
    this.config = config;
  }

  // =========================================================
  // 1. AUTENTICAÇÃO
  // =========================================================

  /**
   * Obtém (ou reutiliza) o access_token OAuth2.
   * Token tem validade de ~5 minutos; renovado automaticamente.
   */
  async getAccessToken(): Promise<string> {
    const agora = Date.now();
    if (this.cachedToken && agora < this.tokenExpiresAt - 30_000) {
      return this.cachedToken;
    }

    const body = new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     this.config.clientId,
      client_secret: this.config.clientSecret,
    }).toString();

    const response = await this.request<ItauAccessTokenResponse>(URLS.token, {
      method: 'POST',
      headers: {
        'Content-Type':       'application/x-www-form-urlencoded',
        'x-itau-flowID':      '1',
        'x-itau-correlationID': randomUUID(),
      },
      body,
    });

    this.cachedToken    = response.access_token;
    this.tokenExpiresAt = agora + response.expires_in * 1000;
    return this.cachedToken;
  }

  // =========================================================
  // 2. EMISSÃO DE BOLETO
  // =========================================================

  /**
   * Emite um boleto no Itaú.
   *
   * ATENÇÃO ao campo etapa_processo_boleto:
   *   'validacao'  → apenas testa a integração (NÃO registra o título)
   *   'efetivacao' → registra o título em produção
   *
   * Exemplo mínimo de chamada:
   * ```
   * await service.emitirBoleto({
   *   data: {
   *     etapa_processo_boleto: 'efetivacao',
   *     codigo_canal_operacao: 'API',
   *     beneficiario: { id_beneficiario: '150000154711' },
   *     dado_boleto: {
   *       descricao_instrumento_cobranca: 'boleto',
   *       tipo_boleto: 'a vista',
   *       codigo_carteira: '109',
   *       codigo_especie: '01',
   *       data_emissao: '2025-10-06',
   *       pagador: {
   *         pessoa: {
   *           nome_pessoa: 'João Silva',
   *           tipo_pessoa: { codigo_tipo_pessoa: 'F', numero_cadastro_pessoa_fisica: '12345678900' }
   *         },
   *         endereco: {
   *           nome_logradouro: 'Rua Exemplo, 71',
   *           nome_bairro: 'Centro',
   *           nome_cidade: 'São Paulo',
   *           sigla_UF: 'SP',
   *           numero_CEP: '01310100'
   *         }
   *       },
   *       dados_individuais_boleto: [{
   *         numero_nosso_numero: '00000001',  // sequencial crescente, único
   *         data_vencimento: '2025-12-30',
   *         valor_titulo: '00000000000005000', // R$50,00 → 17 dígitos
   *         texto_seu_numero: 'PEDIDO-001'
   *       }]
   *     }
   *   }
   * });
   * ```
   */
  async emitirBoleto(payload: EmissaoBoletoRequest): Promise<EmissaoBoletoResponse> {
    const token = await this.getAccessToken();
    return this.request<EmissaoBoletoResponse>(URLS.emissao, {
      method: 'POST',
      headers: this.headersComuns(token),
      body: JSON.stringify(payload),
    });
  }

  // =========================================================
  // 3. CONSULTAS
  // =========================================================

  /** Consulta detalhe de um título específico */
  async consultarBoleto(params: ConsultaBoletoParams): Promise<unknown> {
    const token = await this.getAccessToken();
    const qs = new URLSearchParams({
      id_beneficiario:  params.id_beneficiario,
      codigo_carteira:  params.codigo_carteira,
      nosso_numero:     params.nosso_numero,
      ...(params.view ? { view: params.view } : {}),
    }).toString();

    return this.request(`${URLS.consulta}?${qs}`, {
      method: 'GET',
      headers: this.headersComuns(token),
    });
  }

  /** Lista boletos por período de vencimento */
  async listarBoletos(params: ListagemBoletosParams): Promise<unknown> {
    const token = await this.getAccessToken();
    const qs = new URLSearchParams({
      idBeneficiario:  params.idBeneficiario,
      dataVencimento:  params.dataVencimento,
      page:            String(params.page ?? 0),
      pageSize:        String(params.pageSize ?? 20),
    }).toString();

    return this.request(`${URLS.listagem}?${qs}`, {
      method: 'GET',
      headers: this.headersComuns(token),
    });
  }

  // =========================================================
  // 4. CONCILIAÇÃO BANCÁRIA — FRANCESA (EXTRATO)
  // =========================================================

  /**
   * Extrato mensal de cobranças (Francesa).
   * Equivalente ao arquivo-retorno, mas via API.
   *
   * @param params.mesReferencia  Formato MMYYYY, ex: '102025' = out/2025
   */
  async buscarFrancesinha(params: FrancesinhaParams): Promise<unknown> {
    const token = await this.getAccessToken();
    const qs = new URLSearchParams({
      agencia:       params.agencia,
      conta:         params.conta,
      dac:           params.dac,
      mesReferencia: params.mesReferencia,
    }).toString();

    return this.request(`${URLS.francesa}?${qs}`, {
      method: 'GET',
      headers: this.headersComuns(token),
    });
  }

  /**
   * Movimentações de cobranças (baixas, pagamentos) — detalhe diário.
   * Usar para conciliação bancária diária.
   */
  async buscarMovimentacoes(
    idBeneficiario: string,
    params: Omit<MovimentacaoParams, 'id_beneficiario'>
  ): Promise<unknown> {
    const token = await this.getAccessToken();
    const { data, ...rest } = params;
    const qs = new URLSearchParams({ data, ...Object.fromEntries(
      Object.entries(rest).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
    )}).toString();

    return this.request(
      `${URLS.francesa}/${idBeneficiario}/movimentacoes?${qs}`,
      { method: 'GET', headers: this.headersComuns(token) }
    );
  }

  /** Resumo diário de movimentações (versão simplificada para dashboard) */
  async buscarMovimentacoesResumidas(idBeneficiario: string, data: string): Promise<unknown> {
    const token = await this.getAccessToken();
    return this.request(
      `${URLS.francesa}/${idBeneficiario}/movimentacoes-resumidas?data=${data}`,
      { method: 'GET', headers: this.headersComuns(token) }
    );
  }

  // =========================================================
  // 5. ALTERAÇÕES E INSTRUÇÕES
  // =========================================================

  /** Baixa imediata de um boleto */
  async baixarBoleto(idBoleto: string): Promise<unknown> {
    const token = await this.getAccessToken();
    return this.request(`${URLS.emissao}/${idBoleto}/baixa`, {
      method: 'PATCH',
      headers: this.headersComuns(token),
      body: JSON.stringify({}),
    });
  }

  /** Altera data de vencimento */
  async alterarVencimento(idBoleto: string, novaData: string): Promise<unknown> {
    const token = await this.getAccessToken();
    const payload: AlteracaoVencimento = { data: { data_vencimento: novaData } };
    return this.request(`${URLS.emissao}/${idBoleto}/data_vencimento`, {
      method: 'PATCH',
      headers: this.headersComuns(token),
      body: JSON.stringify(payload),
    });
  }

  /** Altera valor nominal */
  async alterarValor(idBoleto: string, novoValor: string): Promise<unknown> {
    const token = await this.getAccessToken();
    const payload: AlteracaoValorNominal = { data: { valor_titulo: novoValor } };
    return this.request(`${URLS.emissao}/${idBoleto}/valor_nominal`, {
      method: 'PATCH',
      headers: this.headersComuns(token),
      body: JSON.stringify(payload),
    });
  }

  /** Altera juros */
  async alterarJuros(idBoleto: string, juros: AlteracaoJuros['data']): Promise<unknown> {
    const token = await this.getAccessToken();
    return this.request(`${URLS.emissao}/${idBoleto}/juros`, {
      method: 'PATCH',
      headers: this.headersComuns(token),
      body: JSON.stringify({ data: juros }),
    });
  }

  /** Altera multa */
  async alterarMulta(idBoleto: string, multa: AlteracaoMulta['data']): Promise<unknown> {
    const token = await this.getAccessToken();
    return this.request(`${URLS.emissao}/${idBoleto}/multa`, {
      method: 'PATCH',
      headers: this.headersComuns(token),
      body: JSON.stringify({ data: multa }),
    });
  }

  // =========================================================
  // 6. WEBHOOK (NOTIFICAÇÕES DE BAIXA — CONCILIAÇÃO PUSH)
  // =========================================================

  /**
   * Cadastra webhook para receber notificações de baixa de boletos.
   * O Itaú chamará sua URL quando um boleto for pago.
   *
   * Tipos disponíveis:
   *   BAIXA_OPERACIONAL → pagamento registrado (processamento noturno)
   *   BAIXA_EFETIVA     → liquidação confirmada no mercado interbancário
   */
  async cadastrarWebhook(payload: WebhookCadastroRequest): Promise<unknown> {
    const token = await this.getAccessToken();
    return this.request(URLS.webhook, {
      method: 'POST',
      headers: {
        ...this.headersComuns(token),
        'x-itau-apikey': this.config.clientId,
      },
      body: JSON.stringify(payload),
    });
  }

  /** Lista webhooks cadastrados */
  async listarWebhooks(
    idBeneficiario: string,
    tipoNotificacao?: TipoNotificacao
  ): Promise<unknown> {
    const token = await this.getAccessToken();
    const qs = new URLSearchParams({
      id_beneficiario: idBeneficiario,
      ...(tipoNotificacao ? { tipo_notificacao: tipoNotificacao } : {}),
    }).toString();

    return this.request(`${URLS.webhook}?${qs}`, {
      method: 'GET',
      headers: { ...this.headersComuns(token), 'x-itau-apikey': this.config.clientId },
    });
  }

  /** Remove um webhook */
  async excluirWebhook(idNotificacaoBoleto: string): Promise<unknown> {
    const token = await this.getAccessToken();
    return this.request(`${URLS.webhook}/${idNotificacaoBoleto}`, {
      method: 'DELETE',
      headers: { ...this.headersComuns(token), 'x-itau-apikey': this.config.clientId },
    });
  }

  // =========================================================
  // 7. HELPERS
  // =========================================================

  /**
   * Formata id_beneficiario a partir dos dados bancários.
   * Fórmula: Agência(4) + '00' + Conta(5) + DAC(1)
   *
   * Exemplo: agencia='1500', conta='01547', dac='1'  →  '150000015471'
   */
  static formatarIdBeneficiario(agencia: string, conta: string, dac: string): string {
    return agencia.padStart(4, '0') + '00' + conta.padStart(5, '0') + dac;
  }

  /**
   * Formata valor para o padrão da API (17 dígitos, sem ponto ou vírgula).
   * Exemplo: 50.00 → '00000000000005000'
   */
  static formatarValor(valorReais: number): string {
    return Math.round(valorReais * 100).toString().padStart(17, '0');
  }

  /** Gera um nosso_numero sequencial de 8 dígitos */
  static formatarNossoNumero(sequencial: number): string {
    return sequencial.toString().padStart(8, '0');
  }

  // =========================================================
  // INTERNOS
  // =========================================================

  private headersComuns(token: string): Record<string, string> {
    return {
      'Content-Type':         'application/json',
      'Authorization':        `Bearer ${token}`,
      'x-itau-apikey':        this.config.clientId,
      'x-itau-correlationID': randomUUID(),
      'x-itau-flowID':        randomUUID(),
    };
  }

  private async request<T>(
    url: string,
    options: { method: string; headers?: Record<string, string>; body?: string }
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const reqOptions: https.RequestOptions = {
        hostname: parsed.hostname,
        port:     parseInt(parsed.port) || 443,
        path:     parsed.pathname + (parsed.search || ''),
        method:   options.method,
        headers:  options.headers,
        agent:    this.httpsAgent,
      };
      const req = https.request(reqOptions, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          let json: unknown;
          try { json = JSON.parse(text); } catch { json = text; }
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new ItauApiError(res.statusCode ?? 0, url, json));
          } else {
            resolve(json as T);
          }
        });
      });
      req.on('error', reject);
      if (options.body) req.write(options.body);
      req.end();
    });
  }
}

// ---- Erro tipado ----
export class ItauApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly body: unknown
  ) {
    super(`Itaú API error ${status} em ${url}: ${JSON.stringify(body)}`);
    this.name = 'ItauApiError';
  }
}
