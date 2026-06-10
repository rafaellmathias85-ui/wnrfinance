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
    const token = await this.getOAuthToken(agent);
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
    const token = await this.getOAuthToken(agent);
    const baseUrl = process.env.INTER_PJ_BASE_URL || 'https://cdpj.partners.bancointer.com.br';
    const params = new URLSearchParams({
      dataInicio: formatTransactionDate(startDate),
      dataFim: formatTransactionDate(endDate),
    });

    const response = await this.requestJson<Record<string, unknown>>(
      `${baseUrl}/banking/v2/extrato?${params.toString()}`,
      {
        method: 'GET',
        agent,
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    const rows = extractTransactionRows(response);
    const accountId = this.getAccountId();

    return rows.map((row) => {
      const amount = pickNumber(row, ['valor', 'amount', 'valorTransacao', 'transactionAmount']);
      const direction = inferDirection(row, amount);
      const date = parseBankDate(firstString(row, ['dataEntrada', 'dataTransacao', 'dataLancamento', 'date']));
      const description =
        firstString(row, ['descricao', 'historico', 'titulo', 'description']) ||
        'Transação Banco Inter';
      const externalId = firstString(row, ['id', 'codigoTransacao', 'transactionId', 'fitid']);
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
        counterpartyName: firstString(row, ['nomeContraparte', 'counterpartyName', 'pagador', 'recebedor']),
        counterpartyTaxId: firstString(row, ['cnpjCpfContraparte', 'counterpartyTaxId', 'cpfCnpj']),
        balanceAfter: pickOptionalNumber(row, ['saldoAposLancamento', 'balanceAfter']),
        status: 'SETTLED',
        rawData: row,
      });
    });
  }

  private createMtlsAgent(): https.Agent {
    const cert = bankCredentialsVault.decrypt(this.connection.certificateEnc);
    const key = bankCredentialsVault.decrypt(this.connection.privateKeyEnc);
    const passphrase = bankCredentialsVault.decrypt(this.connection.certPasswordEnc);

    if (!cert || !key) {
      throw new Error('Certificado e chave privada do Banco Inter PJ são obrigatórios.');
    }

    return new https.Agent({
      cert,
      key,
      passphrase,
      keepAlive: false,
    });
  }

  private async getOAuthToken(agent: https.Agent): Promise<string> {
    const clientId = bankCredentialsVault.decrypt(this.connection.clientIdEnc);
    const clientSecret = bankCredentialsVault.decrypt(this.connection.clientSecretEnc);
    if (!clientId || !clientSecret) {
      throw new Error('Client ID e Client Secret do Banco Inter PJ são obrigatórios.');
    }

    const cacheKey = `${clientId}:${this.getAccountId()}`;
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
      scope: 'extrato.read saldo.read',
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
          headers: {
            Accept: 'application/json',
            ...options.headers,
          },
          agent: options.agent,
          timeout,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            if ((res.statusCode || 500) >= 400) {
              reject(new Error(`Banco Inter PJ retornou HTTP ${res.statusCode}`));
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

function extractTransactionRows(response: Record<string, unknown>): Array<Record<string, unknown>> {
  const candidates = [
    response.transacoes,
    response.transactions,
    response.extrato,
    response.items,
    response.data,
  ];
  const found = candidates.find(Array.isArray);
  return (found as Array<Record<string, unknown>> | undefined) || [];
}

function pickNumber(row: Record<string, unknown>, keys: string[]): number {
  const value = pickOptionalNumber(row, keys);
  return value ?? 0;
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
  const raw = firstString(row, ['tipoOperacao', 'tipo', 'type', 'natureza'])?.toUpperCase() || '';
  if (['C', 'CREDIT', 'CREDITO', 'CRÉDITO', 'ENTRADA'].some((item) => raw.includes(item))) {
    return 'CREDIT';
  }
  if (['D', 'DEBIT', 'DEBITO', 'DÉBITO', 'SAIDA', 'SAÍDA'].some((item) => raw.includes(item))) {
    return 'DEBIT';
  }
  return amount >= 0 ? 'CREDIT' : 'DEBIT';
}

function parseBankDate(value?: string): Date {
  if (!value) return new Date();
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (/^\d{2}\/\d{2}\/\d{4}/.test(value)) {
    const [day, month, year] = value.slice(0, 10).split('/');
    return new Date(`${year}-${month}-${day}T12:00:00Z`);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}
