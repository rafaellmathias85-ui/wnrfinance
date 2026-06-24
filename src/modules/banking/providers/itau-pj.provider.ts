import https from 'https';
import { randomUUID } from 'crypto';
import { bankCredentialsVault } from '../bank-credentials-vault.service';
import { normalizeCanonicalTransaction } from '../bank-transaction-normalizer';
import type {
  BankBalance,
  BankConnection,
  BankConnectionTestResult,
  BankProvider,
  CanonicalTransaction,
} from '../bank-provider.interface';

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

const TOKEN_URL = 'https://sts.itau.com.br/api/oauth/token';
// Account Statement API — extrato completo de conta corrente (TED, PIX, boletos, tarifas…)
const ACCOUNT_STATEMENT_BASE = 'https://account-statement.api.itau.com';
const ACCOUNT_STATEMENT_PATH = '/account-statement/v1/statements';
const FRANCESAS_URL = 'https://boleto.api.itau.com/extrato/v1/francesas';
const PAGE_SIZE = 500;
const MAX_DAYS = 89;
const MS_PER_DAY = 86_400_000;

export class ItauPJProvider implements BankProvider {
  providerName = 'Itaú PJ';
  bankCode = 'ITAU';
  personType = 'PJ' as const;

  private static tokenCache = new Map<string, CachedToken>();

  constructor(private readonly connection: BankConnection) {}

  async testConnection(): Promise<BankConnectionTestResult> {
    if (!this.hasApiConfiguration()) {
      return {
        success: false,
        message: 'Itaú PJ: informe Client ID, Client Secret, certificado (.crt) e chave privada (.key) na aba Integração.',
        errorCode: 'PENDING_CONFIG',
      };
    }
    try {
      const agent = this.createMtlsAgent();
      await this.getOAuthToken(agent);
      return {
        success: true,
        message: 'Conexão Itaú PJ realizada com sucesso (autenticação mTLS OK)',
      };
    } catch (error: any) {
      return {
        success: false,
        message: error?.message || 'Erro ao testar conexão Itaú PJ',
        errorCode: 'CONNECTION_ERROR',
      };
    }
  }

  async getBalance(): Promise<BankBalance> {
    // Account Statement API não expõe saldo diretamente.
    // Autenticação bem-sucedida via mTLS valida a conectividade.
    const agent = this.createMtlsAgent();
    await this.getOAuthToken(agent);
    return {
      available: 0,
      current: 0,
      currency: 'BRL',
      importedAt: new Date(),
    };
  }

  async getTransactions(startDate: Date, endDate: Date): Promise<CanonicalTransaction[]> {
    const agent = this.createMtlsAgent();
    const token = await this.getOAuthToken(agent);
    const clientId = bankCredentialsVault.decrypt(this.connection.clientIdEnc) || '';
    const accountId = this.getAccountId();
    const statementId = this.getAccountStatementId();

    if (!statementId) {
      console.warn('[ItauPJ] Agência/Conta/DAC não configurados — sem movimentações.');
      return [];
    }

    const allTxs: CanonicalTransaction[] = [];

    // 1. Account Statement API — extrato completo (TED, PIX, débitos, tarifas, boletos…)
    let chunkStart = new Date(startDate);
    while (chunkStart <= endDate) {
      const chunkEnd = new Date(Math.min(chunkStart.getTime() + MAX_DAYS * MS_PER_DAY, endDate.getTime()));
      const startDateStr = chunkStart.toISOString().slice(0, 10);
      const endDateStr = chunkEnd.toISOString().slice(0, 10);

      let page = 1;
      let hasMore = true;
      while (hasMore) {
        try {
          const params = new URLSearchParams({
            type: 'current_account',
            start_date: startDateStr,
            end_date: endDateStr,
            page_size: String(PAGE_SIZE),
            page: String(page),
          });
          const resp = await this.requestJson<Record<string, unknown>>(
            `${ACCOUNT_STATEMENT_BASE}${ACCOUNT_STATEMENT_PATH}/${statementId}?${params}`,
            { method: 'GET', agent, clientId, token },
          );
          const events = extractEvents(resp);
          for (const ev of events) {
            const tx = this.eventToCanonical(ev as Record<string, unknown>, accountId);
            if (tx) allTxs.push(tx);
          }
          const totalPages = getTotalPages(resp);
          hasMore = events.length > 0 && page < totalPages;
          page++;
        } catch (e: any) {
          console.warn(`[ItauPJ] Account Statement erro p${page}: ${e?.message}`);
          hasMore = false;
        }
      }

      chunkStart = new Date(chunkEnd.getTime() + MS_PER_DAY);
    }

    // 2. Francesinha — boletos de cobrança recebidos (complementar, não-bloqueante)
    try {
      const boletTxs = await this.fetchFrancesinhaTxs(agent, token, clientId, accountId, startDate, endDate);
      allTxs.push(...boletTxs);
    } catch (e: any) {
      console.warn(`[ItauPJ] Francesinha indisponível: ${e?.message}`);
    }

    // Dedup por externalId
    const seen = new Set<string>();
    return allTxs.filter(tx => {
      const key = tx.externalId;
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ── Infraestrutura ─────────────────────────────────────────────────────────

  private async fetchFrancesinhaTxs(
    agent: https.Agent,
    token: string,
    clientId: string,
    accountId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<CanonicalTransaction[]> {
    const agencia = this.connection.agency || '';
    const conta = this.connection.accountNumber || '';
    const dac = this.connection.accountDigit || '';
    const statementId = this.getAccountStatementId(); // 12-char idBeneficiario
    if (!agencia || !conta || !dac) return [];

    const txs: CanonicalTransaction[] = [];
    const cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const last = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

    while (cur <= last) {
      const yyyy = cur.getFullYear();
      const mm = String(cur.getMonth() + 1).padStart(2, '0');
      // mesReferencia format: MMYYYY (confirmed by itau-boleto.service.ts)
      const mesReferencia = `${mm}${yyyy}`;
      try {
        // Step 1: list francesas (boleto collections) for the month
        const francesas = await this.requestJson<Record<string, unknown>>(
          `${FRANCESAS_URL}?agencia=${agencia}&conta=${conta}&dac=${dac}&mesReferencia=${mesReferencia}`,
          { method: 'GET', agent, clientId, token },
        );
        const items = extractArray(francesas, ['data', 'francesas', 'items', 'content']);

        if (items.length > 0) {
          // Step 2a: movimentações per francesa ID
          for (const francesa of items) {
            const id = (francesa as any).id || (francesa as any).id_francesa;
            if (!id) continue;
            try {
              const movs = await this.requestJson<Record<string, unknown>>(
                `${FRANCESAS_URL}/${id}/movimentacoes?tipoCobranca=boleto&tipoMovimentacao=entradas`,
                { method: 'GET', agent, clientId, token },
              );
              const rows = extractArray(movs, ['data', 'movimentacoes', 'items', 'content']);
              for (const row of rows) {
                const tx = this.rowToCanonical(row as Record<string, unknown>, accountId, startDate, endDate);
                if (tx) txs.push(tx);
              }
            } catch (e: any) {
              console.warn(`[ItauPJ] Erro movimentações francesa ${id}: ${e?.message}`);
            }
          }
        } else if (statementId) {
          // Step 2b: fallback — movimentações diretas via idBeneficiario para cada dia do mês
          const lastDay = new Date(yyyy, cur.getMonth() + 1, 0).getDate();
          for (let d = 1; d <= lastDay; d++) {
            const dataStr = `${yyyy}-${mm}-${String(d).padStart(2, '0')}`;
            const dayDate = new Date(`${dataStr}T12:00:00Z`);
            if (dayDate < startDate || dayDate > endDate) continue;
            try {
              const movs = await this.requestJson<Record<string, unknown>>(
                `${FRANCESAS_URL}/${statementId}/movimentacoes?data=${dataStr}&tipoCobranca=boleto&tipoMovimentacao=entradas`,
                { method: 'GET', agent, clientId, token },
              );
              const rows = extractArray(movs, ['data', 'movimentacoes', 'items', 'content']);
              for (const row of rows) {
                const tx = this.rowToCanonical(row as Record<string, unknown>, accountId, startDate, endDate);
                if (tx) txs.push(tx);
              }
            } catch {
              // daily granularity: silent skip
            }
          }
        }
      } catch (e: any) {
        console.warn(`[ItauPJ] Erro francesas ${mm}/${yyyy}: ${e?.message}`);
      }
      cur.setMonth(cur.getMonth() + 1);
    }
    return txs;
  }

  private createMtlsAgent(): https.Agent {
    const cert = bankCredentialsVault.decrypt(this.connection.certificateEnc);
    const key = bankCredentialsVault.decrypt(this.connection.privateKeyEnc);

    if (!cert || !key) {
      throw new Error('Certificado e chave privada do Itaú PJ são obrigatórios. Configure em Banco → Itaú → Integração.');
    }

    return new https.Agent({ cert, key, rejectUnauthorized: true, keepAlive: false });
  }

  private async getOAuthToken(agent: https.Agent): Promise<string> {
    const clientId = bankCredentialsVault.decrypt(this.connection.clientIdEnc);
    const clientSecret = bankCredentialsVault.decrypt(this.connection.clientSecretEnc);

    if (!clientId || !clientSecret) {
      throw new Error('Client ID e Client Secret do Itaú PJ são obrigatórios.');
    }

    const cacheKey = `itau:${clientId}`;
    const cached = ItauPJProvider.tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() + 60_000) {
      return cached.accessToken;
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }).toString();

    const response = await this.requestJson<{ access_token?: string; expires_in?: number }>(
      TOKEN_URL,
      {
        method: 'POST',
        agent,
        clientId,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
    );

    if (!response.access_token) {
      throw new Error('Itaú PJ não retornou access_token. Verifique credenciais e certificado.');
    }

    ItauPJProvider.tokenCache.set(cacheKey, {
      accessToken: response.access_token,
      expiresAt: Date.now() + Math.max((response.expires_in || 300) - 30, 60) * 1000,
    });

    return response.access_token;
  }

  private hasApiConfiguration(): boolean {
    const clientId = bankCredentialsVault.decrypt(this.connection.clientIdEnc);
    const clientSecret = bankCredentialsVault.decrypt(this.connection.clientSecretEnc);
    const cert = bankCredentialsVault.decrypt(this.connection.certificateEnc);
    const key = bankCredentialsVault.decrypt(this.connection.privateKeyEnc);
    return Boolean(clientId && clientSecret && cert && key);
  }

  // Formato: agencia(4) + '00' + conta(5) + DAC(1) = 12 chars
  private getAccountStatementId(): string {
    const ag = (this.connection.agency || '').padStart(4, '0');
    const ct = (this.connection.accountNumber || '').padStart(5, '0');
    const dac = this.connection.accountDigit || '';
    if (!ag.replace(/0/g, '') && !ct.replace(/0/g, '') || !dac) return '';
    return `${ag}00${ct}${dac}`;
  }

  private getAccountId(): string {
    return (
      this.connection.accountId ||
      [this.connection.agency, this.connection.accountNumber, this.connection.accountDigit]
        .filter(Boolean)
        .join('-') ||
      'itau-pj'
    );
  }

  private eventToCanonical(
    event: Record<string, unknown>,
    accountId: string,
  ): CanonicalTransaction | null {
    // Date — prefer accounting date (settled day), fall back to event timestamp
    const dateObj = event['date'] as Record<string, unknown> | undefined;
    const dateStr =
      (dateObj?.['accounting'] as string) ||
      (dateObj?.['event'] as string) ||
      firstString(event, ['dataLancamento', 'data_lancamento', 'data', 'dataMovimento', 'dataTransacao']);
    if (!dateStr) return null;
    const date = parseBankDate(dateStr);

    // Amount — try amount.value object first, then flat fields
    const amountObj = event['amount'] as Record<string, unknown> | undefined;
    let amount = 0;
    if (amountObj !== undefined && typeof amountObj === 'object') {
      const v = amountObj['value'] ?? amountObj['valor'];
      amount = typeof v === 'number' ? v : parseFloat(String(v ?? '0').replace(',', '.'));
    } else {
      const raw = event['valor'] ?? event['value'] ?? event['valorLancamento'] ?? event['amount'];
      amount = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '0').replace(',', '.'));
    }
    if (!amount || isNaN(amount)) return null;

    // Direction: "C" = credit, "D" = debit
    const operation = String(event['operation'] ?? event['tipo'] ?? event['tipoLancamento'] ?? '').toUpperCase();
    const direction: 'CREDIT' | 'DEBIT' = operation.startsWith('C') ? 'CREDIT' : 'DEBIT';

    // Description from literal object
    const literal = event['literal'] as Record<string, unknown> | undefined;
    const desc =
      (literal?.['complete'] as string) ||
      (literal?.['shortened'] as string) ||
      (literal?.['tip'] as string) ||
      firstString(event, ['description', 'descricao', 'historico', 'descricaoLancamento']) ||
      (direction === 'CREDIT' ? 'Crédito Itaú' : 'Débito Itaú');

    const externalId = firstString(event, ['id', 'transactionId', 'idLancamento', 'numeroDocumento']);

    const counterpart = event['counterpart'] as Record<string, unknown> | undefined;
    const counterpartyName =
      (counterpart?.['name'] as string) ||
      firstString(event, ['counterpartyName', 'nomeContraparte', 'nomeRecebedorPagador', 'nome']);

    return normalizeCanonicalTransaction({
      bank: 'Itaú',
      bankCode: this.bankCode,
      accountId,
      personType: this.personType,
      externalId: externalId ? `AS:${externalId}` : undefined,
      date,
      amount: Math.abs(amount),
      direction,
      description: desc,
      counterpartyName,
      status: 'SETTLED',
      rawData: event,
    });
  }

  private rowToCanonical(
    row: Record<string, unknown>,
    accountId: string,
    startDate: Date,
    endDate: Date,
  ): CanonicalTransaction | null {
    const dateStr = firstString(row, ['data_pagamento', 'dataPagamento', 'data_credito', 'data']);
    if (!dateStr) return null;
    const date = parseBankDate(dateStr);
    if (date < startDate || date > endDate) return null;

    const amountRaw = row['valor_pago'] ?? row['valorPago'] ?? row['valor'] ?? row['amount'];
    const amount = typeof amountRaw === 'string'
      ? parseFloat(amountRaw.replace(',', '.'))
      : typeof amountRaw === 'number' ? amountRaw : 0;
    if (!amount) return null;

    const nossoNumero = firstString(row, ['numero_nosso_numero', 'nossoNumero', 'id_boleto', 'idBoleto']);
    const pagador = firstString(row, ['nome_pagador', 'nomePagador', 'pagador', 'sacado']);

    return normalizeCanonicalTransaction({
      bank: 'Itaú',
      bankCode: this.bankCode,
      accountId,
      personType: this.personType,
      externalId: nossoNumero ? `BOL:${nossoNumero}` : undefined,
      date,
      amount,
      direction: 'CREDIT',
      description: pagador ? `Boleto recebido: ${pagador}` : 'Boleto Itaú recebido',
      counterpartyName: pagador,
      status: 'SETTLED',
      rawData: row,
    });
  }

  private requestJson<T>(
    url: string,
    options: {
      method: 'GET' | 'POST';
      agent: https.Agent;
      clientId?: string;
      token?: string;
      headers?: Record<string, string>;
      body?: string;
    },
  ): Promise<T> {
    const timeout = Number(process.env.BANK_REQUEST_TIMEOUT_MS || 30_000);
    const target = new URL(url);
    const correlationId = randomUUID();

    const baseHeaders: Record<string, string> = {
      Accept: 'application/json',
      'x-itau-flowID': '1',
      'x-itau-correlationID': correlationId,
    };
    if (options.clientId) baseHeaders['x-itau-apikey'] = options.clientId;
    if (options.token) baseHeaders['Authorization'] = `Bearer ${options.token}`;

    const headers = { ...baseHeaders, ...options.headers };

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          method: options.method,
          protocol: target.protocol,
          hostname: target.hostname,
          port: target.port || undefined,
          path: `${target.pathname}${target.search}`,
          headers,
          agent: options.agent,
          timeout,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            if ((res.statusCode || 500) >= 400) {
              reject(new Error(`Itaú PJ retornou HTTP ${res.statusCode}: ${text.slice(0, 300)}`));
              return;
            }
            try {
              resolve(text ? (JSON.parse(text) as T) : ({} as T));
            } catch {
              reject(new Error('Itaú PJ retornou resposta inválida.'));
            }
          });
        },
      );

      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('Tempo limite excedido na conexão Itaú PJ.')));
      if (options.body) req.write(options.body);
      req.end();
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Account Statement API response: { data: [{ events: [...] }] } ou variações
function extractEvents(resp: Record<string, unknown>): unknown[] {
  if (Array.isArray(resp['data'])) {
    const dataArr = resp['data'] as Record<string, unknown>[];
    for (const item of dataArr) {
      if (Array.isArray(item['events'])) return item['events'] as unknown[];
    }
    // data pode ser o próprio array de eventos
    if (dataArr.length > 0 && ('operation' in (dataArr[0] as object) || 'id' in (dataArr[0] as object))) {
      return dataArr;
    }
  }
  for (const key of ['events', 'transactions', 'lancamentos', 'items', 'content']) {
    if (Array.isArray(resp[key])) return resp[key] as unknown[];
  }
  return [];
}

function getTotalPages(resp: Record<string, unknown>): number {
  for (const key of ['pagination', 'meta', 'pagina']) {
    const obj = resp[key] as Record<string, unknown> | undefined;
    if (!obj || typeof obj !== 'object') continue;
    const total = obj['totalPages'] ?? obj['total_pages'] ?? obj['totalPaginas'];
    if (total !== undefined) return Math.max(Number(total), 1);
  }
  return 1;
}

function extractArray(obj: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  if (Array.isArray(obj)) return obj as unknown[];
  return [];
}

function firstString(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function parseBankDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (/^\d{2}\/\d{2}\/\d{4}/.test(value)) {
    const [d, m, y] = value.slice(0, 10).split('/');
    return new Date(`${y}-${m}-${d}T12:00:00Z`);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}
