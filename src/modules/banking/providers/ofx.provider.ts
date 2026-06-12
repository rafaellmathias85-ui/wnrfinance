import { prisma } from '@/lib/prisma';
import { parseStatement, type ParsedStatement } from '@/lib/ofx-parser';
import { normalizeParsedStatementTransaction } from '../bank-transaction-normalizer';
import type {
  BankBalance,
  BankConnection,
  BankConnectionTestResult,
  BankProvider,
  CanonicalTransaction,
  PersonType,
  StatementImportPreview,
  StatementImportResult,
} from '../bank-provider.interface';

export interface StatementFileInput {
  content: string;
  filename: string;
}

export interface StatementImportContext {
  userId: string;
  companyId?: string | null;
  connection?: BankConnection | null;
  bankCode?: string;
  bankName?: string;
  accountId?: string;
  personType?: PersonType;
}

export class OfxProvider implements BankProvider {
  providerName = 'OFX/CSV manual';
  bankCode = 'OFX';
  personType: PersonType = 'PF';

  constructor(private readonly connection?: BankConnection | null) {
    if (connection?.bankCode) this.bankCode = connection.bankCode;
    if (connection?.personType) this.personType = connection.personType;
  }

  async testConnection(): Promise<BankConnectionTestResult> {
    return {
      success: true,
      message: 'Esta conta está configurada para importação manual de extrato.',
      errorCode: 'API_NOT_AVAILABLE',
    };
  }

  async getBalance(): Promise<BankBalance> {
    throw new Error('OFX/CSV não suporta consulta automática de saldo.');
  }

  async getTransactions(_startDate: Date, _endDate: Date): Promise<CanonicalTransaction[]> {
    throw new Error('Use previewImport() e confirmImport() para importar OFX/CSV.');
  }

  parseOfx(file: StatementFileInput): ParsedStatement {
    return parseStatement(file.content, file.filename);
  }

  detectBank(statement: ParsedStatement, fallback?: { bankCode?: string; bankName?: string }) {
    const raw = `${statement.bankId || ''} ${fallback?.bankCode || ''} ${fallback?.bankName || ''}`.toUpperCase();
    if (raw.includes('077') || raw.includes('77') || raw.includes('INTER')) {
      return { bankCode: 'INTER', bankName: 'Banco Inter' };
    }
    if (raw.includes('341') || raw.includes('ITAÚ') || raw.includes('ITAU')) {
      return { bankCode: 'ITAU', bankName: 'Itaú' };
    }
    return {
      bankCode: fallback?.bankCode || statement.bankId || 'UNKNOWN',
      bankName: fallback?.bankName || 'Banco',
    };
  }

  normalizeTransactions(
    statement: ParsedStatement,
    context: StatementImportContext,
  ): CanonicalTransaction[] {
    const detected = this.detectBank(statement, {
      bankCode: context.connection?.bankCode || context.bankCode,
      bankName: context.connection?.bankName || context.bankName,
    });
    const accountId =
      context.accountId ||
      context.connection?.accountId ||
      context.connection?.accountNumber ||
      statement.accountId ||
      'UNKNOWN';
    const personType = context.personType || context.connection?.personType || this.personType;

    return statement.transactions.map((tx) =>
      normalizeParsedStatementTransaction(tx, {
        bank: detected.bankName,
        bankCode: detected.bankCode,
        accountId,
        personType,
      }),
    );
  }

  async previewImport(
    file: StatementFileInput,
    context: StatementImportContext,
  ): Promise<StatementImportPreview> {
    const statement = this.parseOfx(file);
    const transactions = this.normalizeTransactions(statement, context);
    const duplicateHashes = await this.findDuplicateHashes(transactions, context);
    const errors: Array<{ row: number; message: string }> = [];

    const bank = this.detectBank(statement, {
      bankCode: context.connection?.bankCode || context.bankCode,
      bankName: context.connection?.bankName || context.bankName,
    });

    return {
      importId: `preview_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      bankCode: bank.bankCode,
      accountId:
        context.accountId ||
        context.connection?.accountId ||
        context.connection?.accountNumber ||
        statement.accountId ||
        'UNKNOWN',
      total: transactions.length,
      duplicates: duplicateHashes.size,
      errors,
      transactions: transactions.map((tx) => ({
        ...tx,
        duplicate: duplicateHashes.has(tx.checksum),
      })),
    };
  }

  async confirmImport(
    transactions: CanonicalTransaction[],
    context: StatementImportContext,
  ): Promise<StatementImportResult> {
    let imported = 0;
    let skipped = 0;

    // Lote real de conciliação (FK em import_batches) — paridade BomControle
    const { importBatchService } = await import('@/src/modules/reconciliation/import-batch.service');
    const batch = await importBatchService.createBatch({
      userId: context.userId,
      companyId: context.companyId || null,
      bankConnectionId: context.connection?.id || null,
      source: 'OFX',
      type: 'MANUAL',
    });
    const batchId = batch.id;

    for (const tx of transactions) {
      const duplicate = await this.isDuplicate(tx, context);
      if (duplicate) {
        skipped++;
        continue;
      }

      try {
        await prisma.bankTransaction.create({
          data: {
            userId: context.userId,
            companyId: context.companyId || null,
            bankConnectionId: context.connection?.id || null,
            personType: tx.personType,
            bankCode: tx.bankCode,
            accountId: tx.accountId,
            externalId: buildDatabaseExternalId(tx),
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
            importBatchId: batchId,
          },
        });
        imported++;
      } catch (err: any) {
        // P2002 = unique constraint (externalId duplicado) — conta como já existente
        if (err?.code === 'P2002') {
          skipped++;
        } else {
          throw err;
        }
      }
    }

    await importBatchService.refreshPeriod(batchId);
    await importBatchService.refreshCounters(batchId);

    return {
      imported,
      skipped,
      total: transactions.length,
      reconciliation: {
        processed: imported,
        reconciled: 0,
        suggested: 0,
        pending: imported,
      },
    };
  }

  private async findDuplicateHashes(
    transactions: CanonicalTransaction[],
    context: StatementImportContext,
  ): Promise<Set<string>> {
    const hashes = transactions.map((tx) => tx.checksum);
    const externalIds = transactions.map((tx) => buildDatabaseExternalId(tx));
    if (!hashes.length) return new Set();

    // Sem filtro de bankConnectionId: detecta duplicatas entre conexões diferentes
    // para a mesma conta física (ex: OFX importado via conciliação vs via conexão).
    const existing = await prisma.bankTransaction.findMany({
      where: {
        userId: context.userId,
        OR: [
          { transactionHash: { in: hashes } },
          { externalId: { in: externalIds } },
        ],
      },
      select: { transactionHash: true, externalId: true },
    });

    // externalId → checksum: marca como duplicata pelo FITID mesmo com accountId diferente
    const extIdToHash = new Map(
      transactions.map(tx => [buildDatabaseExternalId(tx), tx.checksum]),
    );

    const duplicates = new Set<string>();
    for (const row of existing) {
      if (row.transactionHash) duplicates.add(row.transactionHash);
      if (row.externalId) {
        const hash = extIdToHash.get(row.externalId);
        if (hash) duplicates.add(hash);
      }
    }

    // Fallback: detecta duplicata por FITID bruto quando o accountId foi formatado
    // de forma diferente entre importações (ex: "0050212" vs "0263-502122-2").
    const notYetDetected = transactions.filter(tx => !duplicates.has(tx.checksum) && tx.externalId);
    if (notYetDetected.length > 0) {
      const fitidConditions = notYetDetected.map(tx => ({
        externalId: { endsWith: `:${tx.externalId}` },
      }));
      const fitidMatches = await prisma.bankTransaction.findMany({
        where: { userId: context.userId, OR: fitidConditions },
        select: { externalId: true },
      });
      for (const match of fitidMatches) {
        for (const tx of notYetDetected) {
          if (tx.externalId && match.externalId?.endsWith(`:${tx.externalId}`)) {
            duplicates.add(tx.checksum);
          }
        }
      }
    }

    return duplicates;
  }

  private async isDuplicate(
    tx: CanonicalTransaction,
    context: StatementImportContext,
  ): Promise<boolean> {
    const dbExternalId = buildDatabaseExternalId(tx);
    // Fallback endsWith: detecta o mesmo FITID mesmo quando o accountId está
    // formatado diferente entre importações (ex: "0050212" vs "0263-502122-2").
    const rawFitid = tx.externalId;

    const existing = await prisma.bankTransaction.findFirst({
      where: {
        userId: context.userId,
        OR: [
          { transactionHash: tx.checksum },
          { externalId: dbExternalId },
          ...(rawFitid ? [{ externalId: { endsWith: `:${rawFitid}` } }] : []),
        ],
      },
      select: { id: true },
    });

    return Boolean(existing);
  }
}

function buildDatabaseExternalId(tx: CanonicalTransaction): string {
  return [tx.bankCode, tx.accountId, tx.externalId || tx.id].filter(Boolean).join(':');
}

export const ofxProvider = new OfxProvider();
