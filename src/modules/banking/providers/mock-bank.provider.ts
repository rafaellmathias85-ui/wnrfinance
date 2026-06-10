import { normalizeCanonicalTransaction } from '../bank-transaction-normalizer';
import type { BankBalance, BankConnectionTestResult, BankProvider, CanonicalTransaction } from '../bank-provider.interface';

export class MockBankProvider implements BankProvider {
  providerName = 'Mock Bank';
  bankCode = 'MOCK';
  personType = 'PJ' as const;

  async testConnection(): Promise<BankConnectionTestResult> {
    return { success: true, message: 'Conexão mock ativa.' };
  }

  async getBalance(): Promise<BankBalance> {
    return {
      available: 1000,
      current: 1000,
      currency: 'BRL',
      importedAt: new Date(),
    };
  }

  async getTransactions(startDate: Date, _endDate: Date): Promise<CanonicalTransaction[]> {
    return [
      normalizeCanonicalTransaction({
        bank: 'Mock Bank',
        bankCode: this.bankCode,
        accountId: 'mock-account',
        personType: this.personType,
        externalId: `mock-${startDate.toISOString().slice(0, 10)}`,
        date: startDate,
        amount: 125.45,
        direction: 'CREDIT',
        description: 'Recebimento mock',
        status: 'SETTLED',
        rawData: { mock: true },
      }),
    ];
  }
}

export const mockBankProvider = new MockBankProvider();
