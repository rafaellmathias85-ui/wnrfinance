// Banco Inter API v2 connector
// Docs: https://developers.inter.co/references/token
// Auth: OAuth2 client_credentials + mTLS certificate
// Scopes needed: extrato.read, saldo.read, cob.write, boleto-cobranca.read

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

const INTER_BASE_URL = process.env.INTER_API_URL ?? 'https://cdpj.partners.bancointer.com.br';
const INTER_AUTH_URL = process.env.INTER_AUTH_URL ?? 'https://cdpj.partners.bancointer.com.br/oauth/v2/token';

interface InterToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

// In production, certificate-based mTLS is required.
// The cert and key are loaded from certPath (PEM format).
async function getAccessToken(config: BankConnectionConfig): Promise<string> {
  if (config.accessToken) return config.accessToken;

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId!,
    client_secret: config.clientSecret!,
    scope: 'extrato.read saldo.read cob.write boleto-cobranca.read',
  });

  const res = await fetch(INTER_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    // Note: production requires cert/key via Node.js Agent — handled at infra level
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Inter auth failed: ${res.status} ${err}`);
  }

  const data: InterToken = await res.json();
  return data.access_token;
}

async function interFetch(
  path: string,
  config: BankConnectionConfig,
  options?: RequestInit,
): Promise<unknown> {
  const token = await getAccessToken(config);
  const res = await fetch(`${INTER_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Inter API error ${res.status}: ${err}`);
  }

  return res.json();
}

export class BancoInterProvider implements BankProvider {
  readonly providerName = 'banco-inter';

  async testConnection(config: BankConnectionConfig): Promise<boolean> {
    try {
      await getAccessToken(config);
      return true;
    } catch { return false; }
  }

  async getBalance(config: BankConnectionConfig): Promise<BankBalance> {
    const data: any = await interFetch('/banking/v2/saldo', config);
    return {
      available: Number(data.disponivel ?? data.saldoDisponivelInvestimento ?? 0),
      blocked: Number(data.bloqueado ?? 0),
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
    const data: any = await interFetch(`/banking/v2/extrato?${params}`, config);

    const rows: any[] = data.transacoes ?? data.content ?? [];

    return rows.map(row => {
      const type: 'credit' | 'debit' =
        row.tipoOperacao === 'C' || row.tipo === 'CREDITO' ? 'credit' : 'debit';

      return normalizeAPITransaction({
        bankCode: '077', // Inter COMPE code
        agency: config.agency,
        account: config.account,
        externalId: row.idTransacao ?? row.id ?? `inter_${row.dataTransacao}_${row.valor}`,
        type,
        amount: Math.abs(Number(row.valor)),
        date: new Date(row.dataTransacao),
        description: row.descricao ?? row.titulo ?? 'Transação Inter',
        documentNumber: row.nsuOrigem ?? row.codigoReferencia,
        balanceAfter: row.saldoApos != null ? Number(row.saldoApos) : undefined,
        raw: row,
      });
    });
  }

  async createCharge(
    config: BankConnectionConfig,
    charge: BankChargeInput,
  ): Promise<BankChargeResult> {
    const body = {
      seuNumero: `CHG${Date.now()}`,
      valorNominal: charge.amount,
      dataVencimento: charge.dueDate,
      numDiasAgenda: charge.expiresInDays ?? 30,
      pagador: {
        cpfCnpj: charge.payerDocument.replace(/\D/g, ''),
        nome: charge.payerName,
      },
      mensagem: { linha1: charge.description ?? '' },
    };

    const data: any = await interFetch('/cobranca/v3/cobrancas', config, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return {
      chargeId: data.codigoSolicitacao,
      barcode: data.linhaDigitavel ?? data.codigoBarras,
      pixQrCode: data.pix?.qrCode,
      pixKey: data.pix?.chave,
      pdfUrl: data.linkVisualizacao,
      expiresAt: new Date(charge.dueDate + 'T23:59:59'),
    };
  }

  async getChargeStatus(
    config: BankConnectionConfig,
    chargeId: string,
  ): Promise<BankChargeStatus> {
    const data: any = await interFetch(`/cobranca/v3/cobrancas/${chargeId}`, config);
    const s = data.situacao ?? data.status ?? '';
    const map: Record<string, BankChargeStatus> = {
      EMABERTO: 'pending',
      PAGO: 'paid',
      CANCELADO: 'cancelled',
      EXPIRADO: 'expired',
      VENCIDO: 'overdue',
    };
    return map[s.toUpperCase()] ?? 'pending';
  }

  async refreshToken(config: BankConnectionConfig): Promise<{ accessToken: string; expiresIn: number }> {
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.clientId!,
      client_secret: config.clientSecret!,
      scope: 'extrato.read saldo.read cob.write boleto-cobranca.read',
    });

    const res = await fetch(INTER_AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!res.ok) throw new Error(`Inter token refresh failed: ${res.status}`);
    const data: InterToken = await res.json();
    return { accessToken: data.access_token, expiresIn: data.expires_in };
  }
}

export const bancoInterProvider = new BancoInterProvider();
