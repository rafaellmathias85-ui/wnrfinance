import { createAuditLog } from '@/lib/audit-log';
import { prisma } from '@/lib/prisma';
import { reconciliationService } from '@/src/modules/reconciliation/reconciliation.service';
import { bankCredentialsVault } from './bank-credentials-vault.service';
import { createBankProvider } from './bank-provider.factory';
import type {
  BankCode,
  BankConnection,
  BankConnectionMode,
  BankConnectionStatus,
  CanonicalTransaction,
  PersonType,
  StatementImportPreview,
  StatementImportResult,
} from './bank-provider.interface';
import { OfxProvider, type StatementFileInput } from './providers/ofx.provider';

export const BANK_STATUS_MESSAGES = {
  CONNECTED: 'Conexão ativa.',
  PENDING_CONFIG: 'Faltam informações para concluir a conexão.',
  ERROR: 'A conexão apresentou erro. Verifique as credenciais ou tente importar OFX.',
  OFX_ONLY: 'Esta conta está configurada para importação manual de extrato.',
  API_NOT_AVAILABLE: 'API automática ainda não disponível para esta modalidade. Use OFX/CSV como alternativa.',
} as const;

interface CreateBankConnectionInput {
  userId: string;
  companyId?: string | null;
  name: string;
  bankCode: BankCode;
  personType: PersonType;
  connectionMode: BankConnectionMode;
  agency?: string | null;
  account?: string | null;
  accountDigit?: string | null;
  accountId?: string | null;
  ownerTaxId?: string | null;
  clientId?: string | null;
  clientSecret?: string | null;
  certificate?: string | null;
  privateKey?: string | null;
  certificatePassword?: string | null;
  request?: Request;
}

interface SyncConnectionOptions {
  userId: string;
  companyId?: string | null;
  connectionId: string;
  startDate?: Date;
  endDate?: Date;
  automatic?: boolean;
  request?: Request;
}

export class BankingService {
  async listConnections(params: {
    userId: string;
    companyId?: string | null;
    personType?: PersonType;
  }) {
    const where: any = { userId: params.userId };
    if (params.companyId !== undefined) where.companyId = params.companyId;
    if (params.personType) where.personType = params.personType;

    where.status = { not: 'DISABLED' };
    return prisma.bankConnection.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createConnection(input: CreateBankConnectionInput) {
    const connectionMode = normalizeConnectionMode(input.personType, input.connectionMode);
    const provider = resolveProvider(input.bankCode, input.personType, connectionMode);
    const status = resolveInitialStatus(input.bankCode, input.personType, connectionMode, input);
    const bankName = bankDisplayName(input.bankCode);
    const bankLogo = input.bankCode === 'INTER' ? '/banks/inter.png' : '/banks/itau.png';
    const connectionId = `${provider}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    const connection = await prisma.bankConnection.create({
      data: {
        userId: input.userId,
        companyId: input.personType === 'PJ' ? input.companyId || null : null,
        scope: input.personType,
        personType: input.personType,
        provider,
        connectionId,
        connectionMode,
        bankName: input.name || bankName,
        bankLogo,
        bankCode: input.bankCode,
        status,
        accountType: 'checking',
        agency: input.agency || null,
        accountNumber: input.account || null,
        accountDigit: input.accountDigit || null,
        accountId: input.accountId || buildAccountId(input.agency, input.account, input.accountDigit),
        allowsPayments: false,
        allowsReceipts: false,
        allowsTransfers: false,
        ownerTaxIdEnc: bankCredentialsVault.encryptOptional(input.ownerTaxId),
        clientIdEnc: bankCredentialsVault.encryptOptional(input.clientId),
        clientSecretEnc: bankCredentialsVault.encryptOptional(input.clientSecret),
        certificateEnc: bankCredentialsVault.encryptOptional(input.certificate),
        privateKeyEnc: bankCredentialsVault.encryptOptional(input.privateKey),
        certPasswordEnc: bankCredentialsVault.encryptOptional(input.certificatePassword),
        extraConfig: {
          bankCode: input.bankCode,
          personType: input.personType,
          connectionMode,
        },
      },
    });

    await createAuditLog({
      userId: input.userId,
      companyId: input.personType === 'PJ' ? input.companyId || null : null,
      action: 'BANK_CONNECTION_CREATE',
      entity: 'bank_connection',
      entityId: connection.id,
      metadata: {
        bankCode: input.bankCode,
        personType: input.personType,
        connectionMode,
        provider,
        status,
      },
      request: input.request,
    });

    return connection;
  }

  async testConnection(params: {
    userId: string;
    companyId?: string | null;
    connectionId: string;
    request?: Request;
  }) {
    const connectionRow = await this.getConnectionForUser(params);
    const connection = toBankConnection(connectionRow);
    const provider = createBankProvider(connection);
    const result = await provider.testConnection();
    const nextStatus = result.success ? 'ACTIVE'
      : (result.errorCode === 'API_NOT_AVAILABLE' || result.errorCode === 'PENDING_CONFIG') ? 'PENDING_CONFIG'
      : 'ERROR';

    await prisma.bankConnection.update({
      where: { id: connection.id },
      data: {
        status: nextStatus,
        syncError: result.success ? null : result.message,
      },
    });

    await createAuditLog({
      userId: params.userId,
      companyId: connection.companyId || null,
      action: 'BANK_CONNECTION_TEST',
      entity: 'bank_connection',
      entityId: connection.id,
      metadata: {
        bankCode: connection.bankCode,
        provider: connection.provider,
        success: result.success,
        errorCode: result.errorCode,
      },
      request: params.request,
    });

    return result;
  }

  async syncConnection(options: SyncConnectionOptions) {
    const connectionRow = await this.getConnectionForUser(options);
    const connection = toBankConnection(connectionRow);

    if (connection.personType === 'PF' || connection.connectionMode !== 'API') {
      return {
        imported: 0,
        skipped: 0,
        reconciliation: { processed: 0, reconciled: 0, suggested: 0, pending: 0 },
        message: BANK_STATUS_MESSAGES.OFX_ONLY,
      };
    }

    const provider = createBankProvider(connection);

    // endDate = fim do dia de hoje
    const endDate = options.endDate || (() => {
      const d = new Date();
      d.setHours(23, 59, 59, 999);
      return d;
    })();

    // startDate: sempre início do dia atual para sincronizações rotineiras.
    // Quem precisar de histórico passa options.startDate explicitamente.
    // O dedup por hash/externalId evita duplicatas em qualquer caso.
    let startDate: Date;
    if (options.startDate) {
      startDate = options.startDate;
    } else {
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
    }

    try {
      const [balance, transactions] = await Promise.all([
        provider.getBalance(),
        provider.getTransactions(startDate, endDate),
      ]);
      const saved = await this.saveCanonicalTransactions(transactions, connection, {
        automatic: options.automatic,
      });
      const reconciliation = await reconciliationService.reconcileBankTransactions({
        userId: connection.userId,
        companyId: connection.companyId || null,
        bankConnectionId: connection.id,
        bankTransactionIds: saved.createdIds,
      });

      // Contadores do lote refletem o resultado do auto-match
      if (saved.importBatchId) {
        const { importBatchService } = await import('@/src/modules/reconciliation/import-batch.service');
        await importBatchService.refreshCounters(saved.importBatchId);
      }

      await prisma.bankConnection.update({
        where: { id: connection.id },
        data: {
          status: 'ACTIVE',
          currentBalance: balance.current,
          lastSyncAt: new Date(),
          syncError: null,
        },
      });

      await createAuditLog({
        userId: connection.userId,
        companyId: connection.companyId || null,
        action: options.automatic ? 'BANK_SYNC_AUTO' : 'BANK_SYNC_MANUAL',
        entity: 'bank_connection',
        entityId: connection.id,
        metadata: {
          bankCode: connection.bankCode,
          imported: saved.imported,
          skipped: saved.skipped,
          startDate,
          endDate,
        },
        request: options.request,
      });

      return {
        imported: saved.imported,
        skipped: saved.skipped,
        reconciliation,
        balance,
        syncRange: { startDate, endDate },
      };
    } catch (error: any) {
      const message = error?.message || 'Erro de conexão bancária';
      await prisma.bankConnection.update({
        where: { id: connection.id },
        data: { status: 'ERROR', syncError: message },
      });
      await createAuditLog({
        userId: connection.userId,
        companyId: connection.companyId || null,
        action: 'BANK_CONNECTION_ERROR',
        entity: 'bank_connection',
        entityId: connection.id,
        metadata: {
          bankCode: connection.bankCode,
          provider: connection.provider,
          error: message,
        },
        request: options.request,
      });
      throw error;
    }
  }

  async previewStatementImport(params: {
    userId: string;
    companyId?: string | null;
    connectionId?: string | null;
    file: StatementFileInput;
    bankCode?: string;
    personType?: PersonType;
    accountId?: string;
  }): Promise<StatementImportPreview> {
    const connectionRow = params.connectionId
      ? await this.getConnectionForUser({
          userId: params.userId,
          companyId: params.companyId,
          connectionId: params.connectionId,
        })
      : null;
    const connection = connectionRow ? toBankConnection(connectionRow) : null;
    const provider = new OfxProvider(connection);

    return provider.previewImport(params.file, {
      userId: params.userId,
      companyId: connection?.companyId || params.companyId || null,
      connection,
      bankCode: connection?.bankCode || params.bankCode,
      personType: connection?.personType || params.personType,
      accountId: connection?.accountId || params.accountId,
    });
  }

  async confirmStatementImport(params: {
    userId: string;
    companyId?: string | null;
    connectionId?: string | null;
    transactions: CanonicalTransaction[];
    request?: Request;
  }): Promise<StatementImportResult> {
    const connectionRow = params.connectionId
      ? await this.getConnectionForUser({
          userId: params.userId,
          companyId: params.companyId,
          connectionId: params.connectionId,
        })
      : null;
    const connection = connectionRow ? toBankConnection(connectionRow) : null;
    const provider = new OfxProvider(connection);
    const rehydrated = params.transactions.map(rehydrateCanonicalTransaction);
    const result = await provider.confirmImport(rehydrated, {
      userId: params.userId,
      companyId: connection?.companyId || params.companyId || null,
      connection,
    });

    const reconciliation = await reconciliationService.reconcileBankTransactions({
      userId: params.userId,
      companyId: connection?.companyId || params.companyId || null,
      bankConnectionId: connection?.id || null,
    });

    await createAuditLog({
      userId: params.userId,
      companyId: connection?.companyId || params.companyId || null,
      action: 'IMPORT',
      entity: 'statement',
      entityId: connection?.id || null,
      metadata: {
        imported: result.imported,
        skipped: result.skipped,
        total: result.total,
        bankConnectionId: connection?.id || null,
      },
      request: params.request,
    });

    return { ...result, reconciliation };
  }

  async removeConnection(params: {
    userId: string;
    companyId?: string | null;
    connectionId: string;
    request?: Request;
  }) {
    const connection = await this.getConnectionForUser(params);
    await prisma.bankConnection.update({
      where: { id: connection.id },
      data: { status: 'DISABLED' },
    });
    await createAuditLog({
      userId: params.userId,
      companyId: connection.companyId || null,
      action: 'BANK_CONNECTION_REVOKE',
      entity: 'bank_connection',
      entityId: connection.id,
      metadata: { bankCode: connection.bankCode, provider: connection.provider },
      request: params.request,
    });
  }

  private async saveCanonicalTransactions(
    transactions: CanonicalTransaction[],
    connection: BankConnection,
    options?: { automatic?: boolean },
  ) {
    let imported = 0;
    let skipped = 0;
    const createdIds: string[] = [];

    // Lote real de conciliação (paridade BomControle: "Arquivos de conciliação")
    const { importBatchService } = await import('@/src/modules/reconciliation/import-batch.service');
    const batch = await importBatchService.createBatch({
      userId: connection.userId,
      companyId: connection.companyId || null,
      bankConnectionId: connection.id,
      source: `API_${connection.bankCode || connection.provider || 'BANK'}`.toUpperCase(),
      type: options?.automatic ? 'AUTOMATICO' : 'MANUAL',
    });
    const importBatchId = batch.id;

    for (const tx of transactions) {
      const dbExternalId = buildDatabaseExternalId(tx);

      // Check both same-connection hash and cross-connection externalId to avoid
      // unique constraint violations when OFX and API share the same externalId format.
      const duplicate = await prisma.bankTransaction.findFirst({
        where: {
          userId: connection.userId,
          OR: [
            { bankConnectionId: connection.id, transactionHash: tx.checksum },
            { externalId: dbExternalId },
          ],
        },
        select: { id: true },
      });

      if (duplicate) {
        skipped++;
        continue;
      }

      try {
        const created = await prisma.bankTransaction.create({
          data: {
            userId: connection.userId,
            companyId: connection.companyId || null,
            bankConnectionId: connection.id,
            personType: tx.personType,
            bankCode: tx.bankCode,
            accountId: tx.accountId,
            externalId: dbExternalId,
            transactionHash: tx.checksum,
            description: tx.description,
            amount: tx.amount,
            type: tx.direction === 'CREDIT' ? 'credit' : 'debit',
            date: tx.date,
            balanceAfter: tx.balanceAfter ?? null,
            documentNumber: tx.documentNumber ?? null,
            payerName: tx.counterpartyName ?? null,
            payerDocument: tx.counterpartyTaxId ?? null,
            rawData: tx.rawData as any,
            status: 'PENDING',
            importBatchId,
          },
          select: { id: true },
        });

        createdIds.push(created.id);
        imported++;
      } catch (err: any) {
        // P2002 = unique constraint violation — transaction already exists under a different
        // connection (e.g., previously imported via OFX with the same externalId).
        if (err?.code === 'P2002') {
          skipped++;
        } else {
          throw err;
        }
      }
    }

    // Período real + contadores iniciais do lote
    await importBatchService.refreshPeriod(importBatchId);
    await importBatchService.refreshCounters(importBatchId);

    return { imported, skipped, createdIds, importBatchId };
  }

  private async getConnectionForUser(params: {
    userId: string;
    companyId?: string | null;
    connectionId: string;
  }) {
    const where: any = { id: params.connectionId, userId: params.userId };
    if (params.companyId !== undefined) where.companyId = params.companyId;
    const connection = await prisma.bankConnection.findFirst({ where });
    if (!connection) throw new Error('Conexão bancária não encontrada.');
    return connection;
  }
}

function normalizeConnectionMode(personType: PersonType, mode: BankConnectionMode): BankConnectionMode {
  if (personType === 'PF' && mode === 'API') return 'OFX';
  return mode;
}

function resolveProvider(bankCode: BankCode, personType: PersonType, mode: BankConnectionMode): string {
  if (bankCode === 'INTER' && personType === 'PJ' && mode === 'API') return 'inter_pj';
  if (bankCode === 'INTER' && personType === 'PF') return 'inter_pf_ofx';
  if (bankCode === 'ITAU' && personType === 'PJ' && mode === 'API') return 'itau_pj';
  if (bankCode === 'ITAU' && personType === 'PF') return 'itau_pf_ofx';
  if (mode === 'CSV') return 'csv';
  return 'ofx';
}

function resolveInitialStatus(
  bankCode: BankCode,
  personType: PersonType,
  mode: BankConnectionMode,
  input: CreateBankConnectionInput,
): BankConnectionStatus {
  if (mode === 'OPEN_FINANCE_FUTURE') return 'PENDING_CONFIG';
  if (mode === 'OFX' || mode === 'CSV') return 'ACTIVE';
  if (bankCode === 'ITAU' && personType === 'PJ') return 'PENDING_CONFIG';

  const hasApiFields = Boolean(
    input.clientId &&
      input.clientSecret &&
      input.certificate &&
      input.privateKey &&
      input.ownerTaxId &&
      (input.account || input.accountId),
  );

  return hasApiFields ? 'PENDING_CONFIG' : 'PENDING_CONFIG';
}

function bankDisplayName(bankCode: BankCode): string {
  return bankCode === 'INTER' ? 'Banco Inter' : 'Itaú';
}

function buildAccountId(agency?: string | null, account?: string | null, digit?: string | null): string | null {
  const parts = [agency, account, digit].filter(Boolean);
  return parts.length ? parts.join('-') : null;
}

function toBankConnection(row: any): BankConnection {
  return {
    id: row.id,
    userId: row.userId,
    companyId: row.companyId,
    scope: row.scope,
    personType: row.personType || row.scope || 'PF',
    bankCode: row.bankCode,
    bankName: row.bankName,
    provider: row.provider,
    connectionMode: row.connectionMode,
    agency: row.agency,
    accountNumber: row.accountNumber,
    accountDigit: row.accountDigit,
    accountId: row.accountId,
    ownerTaxIdEnc: row.ownerTaxIdEnc,
    clientIdEnc: row.clientIdEnc,
    clientSecretEnc: row.clientSecretEnc,
    certificateEnc: row.certificateEnc,
    privateKeyEnc: row.privateKeyEnc,
    certPasswordEnc: row.certPasswordEnc,
    extraConfig: row.extraConfig,
  };
}

function rehydrateCanonicalTransaction(tx: CanonicalTransaction): CanonicalTransaction {
  return {
    ...tx,
    date: new Date(tx.date),
    importedAt: new Date(tx.importedAt || new Date()),
    rawData: tx.rawData || {},
  };
}

function buildDatabaseExternalId(tx: CanonicalTransaction): string {
  return [tx.bankCode, tx.accountId, tx.externalId || tx.id].filter(Boolean).join(':');
}

export const bankingService = new BankingService();
