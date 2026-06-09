// Banco do Brasil API connector
// Docs: https://developers.bb.com.br/
// Auth: OAuth2 client_credentials + developer_application_key header
// Required env: BB_API_URL (default sandbox), BB_AUTH_URL

import { normalizeAPITransaction } from '../bank-transaction-normalizer';
import type {
  BankProvider,
  BankConnectionConfig,
  BankBalance,
  BankTransaction,
  BankChargeInput,
  BankChargeResult,
  BankChargeStatus,
} from '../bank-provider.interface';

const BB_BASE_URL = process.env.BB_API_URL ?? 'https://api.sandbox.bb.com.br';
const BB_AUTH_URL = process.env.BB_AUTH_URL ?? 'https://oauth.sandbox.bb.com.br/oauth/token';

async function getAccessToken(config: BankConnectionConfig): Promise<string> {
  if (config.accessToken) return config.accessToken;

  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  const res = await fetch(`${BB_AUTH_URL}?grant_type=client_credentials&scope=extratos.read+boletos.write`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  if (!res.ok) throw new Error(`BB auth failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

async function bbFetch(
  path: string,
  config: BankConnectionConfig,
  options?: RequestInit,
): Promise<unknown> {
  const token = await getAccessToken(config);
  const appKey = config.extra?.developerApplicationKey ?? '';
  const url = `${BB_BASE_URL}${path}${path.includes('?') ? '&' : '?'}gw-dev-app-key=${appKey}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`BB API error ${res.status}: ${err}`);
  }

  return res.json();
}

export class BancoBrasilProvider implements BankProvider {
  readonly providerName = 'banco-brasil';

  async testConnection(config: BankConnectionConfig): Promise<boolean> {
    try {
      await getAccessToken(config);
      return true;
    } catch { return false; }
  }

  async getBalance(config: BankConnectionConfig): Promise<BankBalance> {
    const agencia = config.agency ?? '';
    const conta = config.account;
    const data: any = await bbFetch(`/contas/${agencia}${conta}/saldo`, config);
    return {
      available: Number(data.saldoDisponivelSaque ?? data.saldo ?? 0),
      currency: 'BRL',
      asOf: new Date(),
    };
  }

  async getTransactions(
    config: BankConnectionConfig,
    startDate: string,
    endDate: string,
  ): Promise<BankTransaction[]> {
    const params = new URLSearchParams({ dataInicio: startDate, dataFim: endDate });
    const agencia = config.agency ?? '';
    const conta = config.account;
    const data: any = await bbFetch(`/extratos/v1/${agencia}${conta}/lancamentos?${params}`, config);

    const rows: any[] = data.lancamentos ?? data.content ?? [];

    return rows.map(row => {
      const type: 'credit' | 'debit' =
        row.indicadorCredito === 'C' || Number(row.valor) > 0 ? 'credit' : 'debit';

      return normalizeAPITransaction({
        bankCode: '001', // BB COMPE
        agency: config.agency,
        account: config.account,
        externalId: row.identificador ?? `bb_${row.dataMovimento}_${row.valor}`,
        type,
        amount: Math.abs(Number(row.valor)),
        date: new Date(row.dataMovimento),
        description: row.textoDescricaoHistorico ?? row.descricao ?? 'Lançamento BB',
        documentNumber: row.numeroDocumento,
        balanceAfter: row.saldoAposBloqueio != null ? Number(row.saldoAposBloqueio) : undefined,
        raw: row,
      });
    });
  }

  async createCharge(
    config: BankConnectionConfig,
    charge: BankChargeInput,
  ): Promise<BankChargeResult> {
    const convenio = config.extra?.convenio ?? '';
    const body = {
      numeroConvenio: convenio,
      numeroCarteira: config.extra?.carteira ?? '17',
      numeroVariacaoCarteira: config.extra?.variacao ?? '35',
      codigoModalidade: 1,
      dataEmissao: new Date().toISOString().slice(0, 10),
      dataVencimento: charge.dueDate,
      valorOriginal: charge.amount,
      pagador: {
        tipoInscricao: charge.payerDocument.replace(/\D/g, '').length === 11 ? 1 : 2,
        numeroInscricao: charge.payerDocument.replace(/\D/g, ''),
        nome: charge.payerName,
      },
    };

    const data: any = await bbFetch('/boletos/v3/boletos', config, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return {
      chargeId: data.numero ?? data.nossoNumero,
      barcode: data.codigoLinhaDigitavel ?? data.linhaDigitavel,
      pdfUrl: data.linkImpressao,
      expiresAt: new Date(charge.dueDate + 'T23:59:59'),
    };
  }

  async getChargeStatus(
    config: BankConnectionConfig,
    chargeId: string,
  ): Promise<BankChargeStatus> {
    const convenio = config.extra?.convenio ?? '';
    const data: any = await bbFetch(`/boletos/v3/boletos/${chargeId}?numeroConvenio=${convenio}`, config);
    const s = String(data.codigoEstadoTituloCobranca ?? '');
    const map: Record<string, BankChargeStatus> = {
      '1': 'pending', '2': 'paid', '6': 'cancelled', '9': 'expired',
    };
    return map[s] ?? 'pending';
  }

  async refreshToken(config: BankConnectionConfig): Promise<{ accessToken: string; expiresIn: number }> {
    const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
    const res = await fetch(`${BB_AUTH_URL}?grant_type=client_credentials&scope=extratos.read+boletos.write`, {
      method: 'POST',
      headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (!res.ok) throw new Error(`BB token refresh failed`);
    const data = await res.json();
    return { accessToken: data.access_token, expiresIn: data.expires_in };
  }
}

export const bancoBrasilProvider = new BancoBrasilProvider();
