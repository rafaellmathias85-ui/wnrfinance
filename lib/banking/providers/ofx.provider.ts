import { parseStatement } from '@/lib/ofx-parser';
import { normalizeOFXTransaction } from '../bank-transaction-normalizer';
import type {
  BankProvider,
  BankConnectionConfig,
  BankBalance,
  BankTransaction,
} from '../bank-provider.interface';

// OFX/CSV manual import provider — no live API, reads file content directly.
// Used by the import dialog for both PF and PJ contexts.
export class OFXProvider implements BankProvider {
  readonly providerName = 'ofx';

  async testConnection(_config: BankConnectionConfig): Promise<boolean> {
    return true; // always valid for manual OFX — no credentials needed
  }

  async getBalance(_config: BankConnectionConfig): Promise<BankBalance> {
    throw new Error('OFX provider does not support live balance queries');
  }

  async getTransactions(
    _config: BankConnectionConfig,
    _startDate: string,
    _endDate: string,
  ): Promise<BankTransaction[]> {
    throw new Error('Use parseFile() to import OFX/CSV content directly');
  }

  // Primary entry point: parse raw OFX/CSV text and return normalised transactions.
  parseFile(
    fileContent: string,
    filename: string,
    ctx: { bankCode: string; agency?: string; account: string },
  ): { transactions: BankTransaction[]; bankId?: string; accountId?: string; period?: { start?: Date; end?: Date } } {
    const statement = parseStatement(fileContent, filename);

    const transactions = statement.transactions.map(tx =>
      normalizeOFXTransaction(tx, {
        bankCode: ctx.bankCode || statement.bankId || 'unknown',
        agency: ctx.agency,
        account: ctx.account || statement.accountId || 'unknown',
      }),
    );

    return {
      transactions,
      bankId: statement.bankId,
      accountId: statement.accountId,
      period: { start: statement.startDate, end: statement.endDate },
    };
  }
}

export const ofxProvider = new OFXProvider();
