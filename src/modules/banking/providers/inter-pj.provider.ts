import https from 'https';
import { bankCredentialsVault } from '../bank-credentials-vault.service';
import { normalizeCanonicalTransaction } from '../bank-transaction-normalizer';
import { formatTransactionDate } from '../bank-transaction-hash';
import type {
  BankBalance,
  BankConnection,
  BankConnectionTestResult,
  BankProvider,
  CanonicalTransaction,
  TransactionDirection,
} from '../bank-provider.interface';

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

export class InterPJProvider implements BankProvider {
  providerName = 'Banco Inter PJ';
  bankCode = 'INTER';
  personType = 'PJ' as const;

  private static tokenCache = new Map<string, CachedToken>();

  constructor(private readonly connection: BankConnection) {}

  async testConnection(): Promise<BankConnectionTestResult> {
    try {
      const balance = await this.getBalance();
      return {
        success: true,
        message: 'Conexão Banco Inter PJ realizada com sucesso',
        balancePreview: balance,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error?.message || 'Erro ao testar conexão Banco Inter PJ',
        errorCode: 'CONNECTION_ERROR',
      };
    }
  }

  async getBalance(): Promise<BankBalance> {
    const agent = this.createMtlsAgent();
    const token = await this.getOAuthToken(agent, 'extrato.read saldo.read');
    const baseUrl = process.env.INTER_PJ_BASE_URL || 'https://cdpj.partners.bancointer.com.br';
    const response = await this.requestJson<Record<string, unknown>>(`${baseUrl}/banking/v2/saldo`, {
      method: 'GET',
      agent,
      headers: { Authorization: `Bearer ${token}` },
    });

    return {
      available: pickNumber(response, ['disponivel', 'saldoDisponivel', 'available', 'valorDisponivel']),
      current: pickNumber(response, ['saldoAtual', 'current', 'saldo', 'valorAtual']),
      blocked: pickOptionalNumber(response, ['bloqueado', 'saldoBloqueado', 'blocked']),
      currency: 'BRL',
      importedAt: new Date(),
    };
  }

  async getTransactions(startDate: Date, endDate: Date): Promise<CanonicalTransaction[]> {
    const agent = this.createMtlsAgent();
    // Tokens separados: cobranças usa escopo próprio e falha independentemente do extrato
    const extratoToken = await this.getOAuthToken(agent, 'extrato.read saldo.read');
    const boletoToken = await this.getOAuthToken(agent, 'boleto-cobranca.read').catch(() => null);
    const accountId = this.getAccountId();

    const [extratoTxs, boletoTxs] = await Promise.all([
      this.fetchExtratoTransactions(agent, extratoToken, startDate, endDate, accountId),
      boletoToken
        ? this.fetchPaidBoletos(agent, boletoToken, startDate, endDate, accountId)
        : Promise.resolve([]),
    ]);

    // Dedup in-memory by checksum before returning to avoid double-importing
    // the same movement if both extrato and cobranças ever return it.
    const seenChecksums = new Set<string>();
    const merged: CanonicalTransaction[] = [];
    for (const tx of [...extratoTxs, ...boletoTxs]) {
      if (!seenChecksums.has(tx.checksum)) {
        seenChecksums.add(tx.checksum);
        merged.push(tx);
      }
    }
    return merged;
  }

  // ── Extrato (PIX, TED, DOC, tarifas, saques) ──────────────────────────────

  private async fetchExtratoTransactions(
    agent: https.Agent,
    token: string,
    startDate: Date,
    endDate: Date,
    accountId: string,
  ): Promise<CanonicalTransaction[]> {
    const baseUrl = process.env.INTER_PJ_BASE_URL || 'https://cdpj.partners.bancointer.com.br';
    const allRows: Array<Record<string, unknown>> = [];
    let page = 0;
    const pageSize = 50;
    let totalPages = 1;

    do {
      const params = new URLSearchParams({
        dataInicio: formatTransactionDate(startDate),
        dataFim: formatTransactionDate(endDate),
        pagina: String(page),
        tamanhoPagina: String(pageSize),
      });

      const response = await this.requestJson<Record<string, unknown>>(
        `${baseUrl}/banking/v2/extrato?${params}`,
        { method: 'GET', agent, headers: { Authorization: `Bearer ${token}` } },
      );

      const rows = extractTransactionRows(response);
      allRows.push(...rows);

      // Inter API retorna paginação aninhada: { "pagina": { "totalPaginas": N } }
      const paginaObj = response.pagina as Record<string, unknown> | undefined;
      const total =
        paginaObj?.totalPaginas ??
        response.totalPaginas ??
        paginaObj?.totalPages ??
        response.totalPages;

      if (typeof total === 'number' && total > 1) {
        totalPages = total;
      } else {
        break;
      }
      page++;
    } while (page < totalPages && page < 20);

    return allRows.map(row => this.rowToCanonical(row, accountId));
  }

  // ── Cobranças pagas (boletos de cobrança recebidos) ───────────────────────

  private async fetchPaidBoletos(
    agent: https.Agent,
    token: string,
    startDate: Date,
    endDate: Date,
    accountId: string,
  ): Promise<CanonicalTransaction[]> {
    const baseUrl = process.env.INTER_PJ_BASE_URL || 'https://cdpj.partners.bancointer.com.br';

    // A API filtra por dataVencimento, não por dataPagamento.
    // Janela ampliada (90 dias) captura boletos vencidos em períodos anteriores
    // mas pagos dentro do período de interesse. Filtro por pagamento feito em código.
    const wideStart = new Date(startDate);
    wideStart.setDate(wideStart.getDate() - 90);

    const allItems: Array<Record<string, unknown>> = [];
    let page = 0;
    let totalPages = 1;

    do {
      const params = new URLSearchParams({
        dataInicio: formatTransactionDate(wideStart),
        dataFim: formatTransactionDate(endDate),
        situacao: 'PAGO',
        pagina: String(page),
        tamanhoPagina: '50',
      });

      let response: Record<string, unknown>;
      try {
        // Endpoint oficial Inter PJ v2: /cobranca/v2/boletos (sem /sumarizados)
        response = await this.requestJson<Record<string, unknown>>(
          `${baseUrl}/cobranca/v2/boletos?${params}`,
          { method: 'GET', agent, headers: { Authorization: `Bearer ${token}` } },
        );
      } catch (err: any) {
        console.warn(`[InterPJ] cobranças endpoint erro: ${err?.message}`);
        break;
      }

      const items = extractBoletoItems(response);
      allItems.push(...items);

      const paginaObj = response.pagina as Record<string, unknown> | undefined;
      const total =
        paginaObj?.totalPaginas ??
        response.totalPaginas ??
        paginaObj?.totalPages ??
        response.totalPages;

      if (typeof total === 'number' && total > 1) {
        totalPages = total;
      } else {
        break;
      }
      page++;
    } while (page < totalPages && page < 20);

    const startMs = startDate.getTime();
    const endMs = endDate.getTime();

    return allItems
      .map(item => {
        const payDateStr = firstString(item, [
          'dataPagamento',
          'dataHoraPagamento',
          'dataLiquidacao',
          'dataHoraSituacao',
        ]);
        if (!payDateStr) return null;

        const payDate = parseBankDate(payDateStr);
        if (payDate.getTime() < startMs || payDate.getTime() > endMs) return null;

        const amount = pickNumber(item, [
          'valorTotalRecebido',
          'valorPago',
          'valorNominal',
          'valor',
        ]);
        if (!amount) return null;

        const sacado = firstString(item, [
          'nomeSacado',
          'nomeDevedor',
          'nomePagador',
          'pagador',
        ]);
        const nossoNumero = firstString(item, [
          'nossoNumero',
          'idBoleto',
          'codigoUnicoSacado',
          'codigoTransacao',
          'id',
        ]);
        const seuNumero = firstString(item, [
          'seuNumero',
          'numeroDocumento',
          'referencia',
        ]);

        return normalizeCanonicalTransaction({
          bank: 'Banco Inter',
          bankCode: this.bankCode,
          accountId,
          personType: this.personType,
          // Prefixo BOL: garante externalId único e sem colisão com extrato
          externalId: nossoNumero ? `BOL:${nossoNumero}` : undefined,
          date: payDate,
          amount,
          direction: 'CREDIT',
          description: sacado
            ? `Boleto recebido: ${sacado}`
            : 'Boleto de cobrança recebido',
          documentNumber: seuNumero,
          counterpartyName: sacado,
          counterpartyTaxId: firstString(item, [
            'cnpjCpfSacado',
            'cpfCnpjSacado',
            'cpfCnpj',
            'documento',
          ]),
          status: 'SETTLED',
          rawData: item,
        });
      })
      .filter((tx): tx is CanonicalTransaction => tx !== null);
  }

  // ── Conversão de linha do extrato para CanonicalTransaction ───────────────

  private rowToCanonical(row: Record<string, unknown>, accountId: string): CanonicalTransaction {
    const amount = pickNumber(row, ['valor', 'amount', 'valorTransacao', 'transactionAmount']);
    const direction = inferDirection(row, amount);
    const date = parseBankDate(
      firstString(row, [
        'dataEntrada',
        'dataMovimentacao',
        'dataTransacao',
        'dataLancamento',
        'dataHora',
        'date',
      ]),
    );
    const description =
      firstString(row, ['descricao', 'historico', 'titulo', 'description']) ||
      'Transação Banco Inter';
    // idTransacao é o campo canônico do Inter v2; fallbacks para versões anteriores
    const externalId = firstString(row, [
      'idTransacao',
      'id',
      'codigoTransacao',
      'transactionId',
      'fitid',
    ]);
    const documentNumber = firstString(row, ['numeroDocumento', 'documento', 'documentNumber']);

    return normalizeCanonicalTransaction({
      bank: 'Banco Inter',
      bankCode: this.bankCode,
      accountId,
      personType: this.personType,
      externalId: externalId || documentNumber,
      date,
      amount,
      direction,
      description,
      documentNumber,
      counterpartyName: firstString(row, [
        'nomeRecebedorPagador',
        'nomeContraparte',
        'counterpartyName',
        'pagador',
        'recebedor',
      ]),
      counterpartyTaxId: firstString(row, [
        'cnpjCpfRecebedorPagador',
        'cnpjCpfContraparte',
        'counterpartyTaxId',
        'cpfCnpj',
      ]),
      balanceAfter: pickOptionalNumber(row, ['saldoAposLancamento', 'balanceAfter', 'saldo']),
      status: 'SETTLED',
      rawData: row,
    });
  }

  // ── Infraestrutura ─────────────────────────────────────────────────────────

  private createMtlsAgent(): https.Agent {
    const cert = bankCredentialsVault.decrypt(this.connection.certificateEnc);
    const key = bankCredentialsVault.decrypt(this.connection.privateKeyEnc);
    const passphrase = bankCredentialsVault.decrypt(this.connection.certPasswordEnc);

    if (!cert || !key) {
      throw new Error('Certificado e chave privada do Banco Inter PJ são obrigatórios.');
    }

    return new https.Agent({ cert, key, passphrase, keepAlive: false });
  }

  private async getOAuthToken(agent: https.Agent, scope: string): Promise<string> {
    const clientId = bankCredentialsVault.decrypt(this.connection.clientIdEnc);
    const clientSecret = bankCredentialsVault.decrypt(this.connection.clientSecretEnc);
    if (!clientId || !clientSecret) {
      throw new Error('Client ID e Client Secret do Banco Inter PJ são obrigatórios.');
    }

    // Scope incluído na chave do cache: tokens de escopos diferentes ficam separados
    const cacheKey = `${clientId}:${this.getAccountId()}:${scope}`;
    const cached = InterPJProvider.tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() + 60_000) {
      return cached.accessToken;
    }

    const tokenUrl =
      process.env.INTER_PJ_TOKEN_URL ||
      'https://cdpj.partners.bancointer.com.br/oauth/v2/token';

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope,
    }).toString();

    const response = await this.requestJson<{ access_token?: string; expires_in?: number }>(tokenUrl, {
      method: 'POST',
      agent,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': String(Buffer.byteLength(body)),
      },
      body,
    });

    if (!response.access_token) {
      throw new Error('Banco Inter PJ não retornou token OAuth.');
    }

    InterPJProvider.tokenCache.set(cacheKey, {
      accessToken: response.access_token,
      expiresAt: Date.now() + Math.max((response.expires_in || 300) - 30, 60) * 1000,
    });

    return response.access_token;
  }

  private getAccountId(): string {
    const accountId =
      this.connection.accountId ||
      [this.connection.agency, this.connection.accountNumber, this.connection.accountDigit]
        .filter(Boolean)
        .join('-');

    if (!accountId) {
      throw new Error('Conta Banco Inter PJ não configurada.');
    }
    return accountId;
  }

  private requestJson<T>(
    url: string,
    options: {
      method: 'GET' | 'POST';
      agent: https.Agent;
      headers?: Record<string, string>;
      body?: string;
    },
  ): Promise<T> {
    const timeout = Number(process.env.BANK_REQUEST_TIMEOUT_MS || 30000);
    const target = new URL(url);

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          method: options.method,
          protocol: target.protocol,
          hostname: target.hostname,
          port: target.port || undefined,
          path: `${target.pathname}${target.search}`,
          headers: { Accept: 'application/json', ...options.headers },
          agent: options.agent,
          timeout,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            if ((res.statusCode || 500) >= 400) {
              reject(new Error(`Banco Inter PJ retornou HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
              return;
            }
            try {
              resolve(text ? (JSON.parse(text) as T) : ({} as T));
            } catch {
              reject(new Error('Banco Inter PJ retornou JSON inválido.'));
            }
          });
        },
      );

      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('Tempo limite excedido no Banco Inter PJ.')));
      if (options.body) req.write(options.body);
      req.end();
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractTransactionRows(response: Record<string, unknown>): Array<Record<string, unknown>> {
  // Inter v2 usa "transacoes"; v3 pode usar "movimentacoes"
  const candidates = [
    response.transacoes,
    response.movimentacoes,
    response.lancamentos,
    response.transactions,
    response.extrato,
    response.items,
    response.data,
    response.content,
  ];
  const found = candidates.find(Array.isArray);
  return (found as Array<Record<string, unknown>> | undefined) || [];
}

function extractBoletoItems(response: Record<string, unknown>): Array<Record<string, unknown>> {
  const candidates = [
    response.content,
    response.boletos,
    (response as any).cobrancas,
    (response as any)['cobranças'],
    response.data,
    response.items,
    response.transacoes,
  ];
  const found = candidates.find(Array.isArray);
  return (found as Array<Record<string, unknown>> | undefined) || [];
}

function pickNumber(row: Record<string, unknown>, keys: string[]): number {
  return pickOptionalNumber(row, keys) ?? 0;
}

function pickOptionalNumber(row: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = row[key];
    if (value === null || value === undefined || value === '') continue;
    const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
    if (!Number.isNaN(parsed)) return parsed;
  }
  return undefined;
}

function firstString(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return undefined;
}

function inferDirection(row: Record<string, unknown>, amount: number): TransactionDirection {
  // Inter usa tipoOperacao = "C"/"D" ou tipo = "CREDITO"/"DEBITO"
  const raw =
    firstString(row, ['tipoOperacao', 'tipo', 'type', 'natureza'])?.toUpperCase().trim() || '';

  if (raw === 'C' || raw === 'CREDIT' || raw === 'CREDITO' || raw === 'CRÉDITO' || raw === 'ENTRADA') {
    return 'CREDIT';
  }
  if (raw === 'D' || raw === 'DEBIT' || raw === 'DEBITO' || raw === 'DÉBITO' || raw === 'SAIDA' || raw === 'SAÍDA') {
    return 'DEBIT';
  }
  // Broad substring fallback
  if (['CREDIT', 'CREDITO', 'ENTRADA'].some(s => raw.includes(s))) return 'CREDIT';
  if (['DEBIT', 'DEBITO', 'SAIDA'].some(s => raw.includes(s))) return 'DEBIT';

  return amount >= 0 ? 'CREDIT' : 'DEBIT';
}

function parseBankDate(value?: string): Date {
  if (!value) return new Date();
  // YYYY-MM-DD ou YYYY-MM-DDTHH:MM:SS
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return new Date(`${value.slice(0, 10)}T12:00:00Z`);
  // DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}/.test(value)) {
    const [day, month, year] = value.slice(0, 10).split('/');
    return new Date(`${year}-${month}-${day}T12:00:00Z`);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}
