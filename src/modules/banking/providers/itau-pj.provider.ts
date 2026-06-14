import https from 'https';
import { randomUUID } from 'crypto';
import { bankCredentialsVault } from '../bank-credentials-vault.service';
import { normalizeCanonicalTransaction } from '../bank-transaction-normalizer';
import { formatTransactionDate } from '../bank-transaction-hash';
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
const FRANCESAS_URL = 'https://boleto.api.itau.com/extrato/v1/francesas';

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
    const agent = this.createMtlsAgent();
    const token = await this.getOAuthToken(agent);
    const clientId = bankCredentialsVault.decrypt(this.connection.clientIdEnc) || '';
    const idBeneficiario = this.getIdBeneficiario();

    // Itaú boleto API não expõe saldo de conta corrente diretamente.
    // Verificamos conectividade listando francesas do mês atual.
    try {
      const now = new Date();
      const mesRef = `${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}`;
      const agencia = process.env.ITAU_AGENCIA || this.connection.agency || '';
      const conta = process.env.ITAU_CONTA || this.connection.accountNumber || '';
      const dac = process.env.ITAU_DAC || this.connection.accountDigit || '';
      await this.requestJson<unknown>(
        `${FRANCESAS_URL}?agencia=${agencia}&conta=${conta}&dac=${dac}&mes_referencia=${mesRef}`,
        { method: 'GET', agent, clientId, token },
      );
    } catch {
      // Endpoint de extrato pode não estar habilitado — autenticação OK basta
    }

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
    const agencia = process.env.ITAU_AGENCIA || this.connection.agency || '';
    const conta = process.env.ITAU_CONTA || this.connection.accountNumber || '';
    const dac = process.env.ITAU_DAC || this.connection.accountDigit || '';

    if (!agencia || !conta || !dac) {
      console.warn('[ItauPJ] Agência/Conta/DAC não configurados — sem movimentações.');
      return [];
    }

    const allTxs: CanonicalTransaction[] = [];

    // Itaú extrato trabalha por mês (francesas)
    const cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const last = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

    while (cur <= last) {
      const mesRef = `${String(cur.getMonth() + 1).padStart(2, '0')}${cur.getFullYear()}`;
      try {
        const francesas = await this.requestJson<Record<string, unknown>>(
          `${FRANCESAS_URL}?agencia=${agencia}&conta=${conta}&dac=${dac}&mes_referencia=${mesRef}`,
          { method: 'GET', agent, clientId, token },
        );

        const items = extractArray(francesas, ['data', 'francesas', 'items', 'content']);
        for (const francesa of items) {
          const id = (francesa as any).id || (francesa as any).id_francesa;
          if (!id) continue;
          try {
            const movs = await this.requestJson<Record<string, unknown>>(
              `${FRANCESAS_URL}/${id}/movimentacoes?tipo_cobranca=boleto&tipo_movimentacao=entradas`,
              { method: 'GET', agent, clientId, token },
            );
            const rows = extractArray(movs, ['data', 'movimentacoes', 'items', 'content']);
            for (const row of rows) {
              const tx = this.rowToCanonical(row as Record<string, unknown>, accountId, startDate, endDate);
              if (tx) allTxs.push(tx);
            }
          } catch (e: any) {
            console.warn(`[ItauPJ] Erro movimentações francesa ${id}: ${e?.message}`);
          }
        }
      } catch (e: any) {
        console.warn(`[ItauPJ] Erro francesas ${mesRef}: ${e?.message}`);
      }
      cur.setMonth(cur.getMonth() + 1);
    }

    return allTxs;
  }

  // ── Infraestrutura ─────────────────────────────────────────────────────────

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

  private getIdBeneficiario(): string {
    return (
      process.env.ITAU_ID_BENEFICIARIO ||
      (() => {
        const ag = this.connection.agency?.padStart(4, '0') || '';
        const ct = this.connection.accountNumber?.padStart(5, '0') || '';
        const dac = this.connection.accountDigit || '';
        return ag && ct && dac ? `${ag}00${ct}${dac}` : '';
      })()
    );
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
