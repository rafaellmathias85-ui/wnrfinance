// ============================================================
// Itaú API - Tipos e Interfaces para WnrFinance
// Carteira: 109 | CNPJ: 21.147.041/0001-85
// ============================================================

// --- Autenticação ---

export interface ItauAuthConfig {
  clientId: string;        // client_id recebido do Itaú
  clientSecret: string;    // secret gerado na ativação do certificado
  certPath: string;        // caminho para o certificado.crt
  keyPath: string;         // caminho para ARQUIVO_CHAVE_PRIVADA.key
}

export interface ItauAccessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;      // segundos (tipicamente 300 = 5 min)
  scope: string;
}

// --- Boleto ---

export type EtapaProcessoBoleto = 'validacao' | 'efetivacao';
// 'validacao' = TESTE (não registra)  |  'efetivacao' = PRODUÇÃO (registra)

export type CodigoTipoPessoa = 'F' | 'J'; // F = Física, J = Jurídica

export interface PessoaFisica {
  codigo_tipo_pessoa: 'F';
  numero_cadastro_pessoa_fisica: string; // CPF (somente números)
}

export interface PessoaJuridica {
  codigo_tipo_pessoa: 'J';
  numero_cadastro_pessoa_juridica: string; // CNPJ (somente números)
}

export interface Pagador {
  pessoa: {
    nome_pessoa: string;
    tipo_pessoa: PessoaFisica | PessoaJuridica;
  };
  endereco: {
    nome_logradouro: string;
    nome_bairro: string;
    nome_cidade: string;
    sigla_UF: string;
    numero_CEP: string;
  };
}

export interface DadoIndividualBoleto {
  numero_nosso_numero: string;    // Sequencial, único, crescente (responsabilidade da empresa)
  data_vencimento: string;        // 'YYYY-MM-DD'
  valor_titulo: string;           // 17 dígitos sem separador decimal, ex: "00000000000005000" = R$50,00
  texto_uso_beneficiario?: string;
  texto_seu_numero?: string;      // Seu número interno de referência
}

export interface Multa {
  codigo_tipo_multa: '01' | '02'; // 01 = valor fixo, 02 = percentual
  quantidade_dias_multa: number;
  percentual_multa?: string;      // 12 dígitos, ex: "000000100000" = 1%
  valor_multa?: string;
}

export interface Juros {
  codigo_tipo_juros: number;      // 90 = percentual ao dia
  quantidade_dias_juros: number;
  percentual_juros?: string;      // 12 dígitos, ex: "000000100000" = 1% ao dia
  valor_juros?: string;
}

export interface RecebimentoDivergente {
  codigo_tipo_autorizacao: '01' | '02' | '03';
  // 01 = Aceitar qualquer valor
  // 02 = Aceitar valor maior
  // 03 = Não aceitar valor divergente
  percentual_minimo?: string;
  percentual_maximo?: string;
  valor_minimo?: string;
  valor_maximo?: string;
}

export interface InstrucaoCobranca {
  codigo_instrucao_cobranca: string;
  quantidade_dias_apos_vencimento?: number;
  dia_util?: boolean;
}

export interface EmissaoBoletoRequest {
  data: {
    etapa_processo_boleto: EtapaProcessoBoleto;
    codigo_canal_operacao: 'API';
    beneficiario: {
      id_beneficiario: string; // Agência(4) + '00' + Conta(5) + DAC(1)
    };
    dado_boleto: {
      descricao_instrumento_cobranca: 'boleto';
      tipo_boleto: 'a vista' | 'parcelado';
      codigo_carteira: '109';
      codigo_especie: string;   // '01' = DM (Duplicata Mercantil)
      valor_abatimento?: string;
      data_emissao: string;     // 'YYYY-MM-DD'
      pagador: Pagador;
      dados_individuais_boleto: DadoIndividualBoleto[];
      multa?: Multa;
      juros?: Juros;
      recebimento_divergente?: RecebimentoDivergente;
      instrucao_cobranca?: InstrucaoCobranca[];
      desconto_expresso?: boolean;
      forma_envio?: 'email';
      texto_endereco_email?: string;
      assunto_email?: string;
      mensagem_email?: string;
    };
  };
}

export interface BoletoEmitido {
  id_boleto: string;
  numero_nosso_numero: string;
  codigo_barras: string;
  numero_linha_digitavel: string;
  data_vencimento: string;
  valor_titulo: number;
  url_boleto?: string;
}

export interface EmissaoBoletoResponse {
  data: {
    id_boleto: string;
    dado_boleto: {
      dados_individuais_boleto: BoletoEmitido[];
    };
  };
}

// --- Consultas ---

export interface ConsultaBoletoParams {
  id_beneficiario: string;
  codigo_carteira: '109';
  nosso_numero: string;
  view?: 'specific' | 'simple';
}

export interface ListagemBoletosParams {
  idBeneficiario: string;
  dataVencimento: string;  // 'YYYY-MM-DD,YYYY-MM-DD' (range)
  page?: number;
  pageSize?: number;
}

// --- Francesa (Extrato / Conciliação) ---

export interface FrancesinhaParams {
  agencia: string;
  conta: string;
  dac: string;
  mesReferencia: string; // Ex: '102025' = Outubro 2025
}

export interface MovimentacaoParams {
  id_beneficiario: string;
  data: string;                      // 'YYYY-MM-DD'
  tipoCobranca?: 'boleto';
  tipoMovimentacao?: 'entradas' | 'saidas';
  nossoNumero?: string;
  seuNumero?: string;
  numeroCarteira?: string;
  nomePagador?: string;
}

// --- Alterações e Instruções ---

export interface AlteracaoVencimento {
  data: { data_vencimento: string }; // 'YYYY-MM-DD'
}

export interface AlteracaoValorNominal {
  data: { valor_titulo: string };
}

export interface AlteracaoJuros {
  data: Juros;
}

export interface AlteracaoMulta {
  data: Multa;
}

export interface BaixaImediata {
  data: Record<string, never>; // body vazio
}

// --- Webhook (Conciliação via Notificação) ---

export type TipoNotificacao = 'BAIXA_EFETIVA' | 'BAIXA_OPERACIONAL';
// BAIXA_OPERACIONAL: pagamento registrado (noturno, como arquivo retorno)
// BAIXA_EFETIVA: liquidação confirmada no mercado

export interface WebhookCadastroRequest {
  data: {
    id_beneficiario: string;
    webhook_url: string;             // HTTPS obrigatório
    webhook_client_id: string;       // Seu client_id para o Itaú autenticar no seu endpoint
    webhook_client_secret: string;
    webhook_oauth_url: string;       // URL OAuth do seu sistema para o Itaú obter token
    valor_minimo?: number;
    tipo_notificacao?: TipoNotificacao;
    tipos_notificacoes?: TipoNotificacao[];
  };
}

export interface WebhookNotificacaoPayload {
  boletos: WebhookBoletoNotificado[];
}

export interface WebhookBoletoNotificado {
  dataNotificacao: string;
  horaNotificacao: string;
  tipoLiquidacao: string;
  tipoCobranca: 'boleto';
  idBeneficiario: string;
  codigoCarteira: string;
  numeroNossoNumero: string;
  dacTitulo: string;
  idBoleto: string;
  codigoEspecie: string;
  descricaoEspecie: string;
  codigoBarras: string;
  numeroLinhaDigitavel: string;
  dataVencimento: string;
  valorTitulo: string;
  dataInclusaoPagamento: string;
  valorPagoTotalCobranca: string;
  valorCreditado: string | null;
  dataCredito: string | null;
  codigoInstituicaoFinanceiraPagamento: string;
  numeroAgenciaRecebedora: string;
  codigoTipoPessoa: string;
  numeroCadastroPessoaFisica: string | null;
  numeroCadastroNacionalPessoaJuridica: string | null;
  nomePagador: string;
  chavePix: string | null;
  txid: string | null;
}
