// Open Finance placeholder — future module
// BANK_CONNECTION_MODE=open_finance
// OPEN_FINANCE_PROVIDER=custom
//
// Not backed by any aggregator (Pluggy, Belvo, Quanto).
// Kept as an interface stub so the UI can show "Em breve" without dead code.

import type { BankProvider, BankConnectionConfig, BankBalance, BankTransaction } from '../bank-provider.interface';

export class OpenFinancePlaceholderProvider implements BankProvider {
  readonly providerName = 'open-finance';

  private notReady(): never {
    throw new Error(
      'Open Finance não está disponível neste plano. ' +
      'Configure BANK_CONNECTION_MODE=open_finance e OPEN_FINANCE_PROVIDER=custom quando pronto.',
    );
  }

  async testConnection(_config: BankConnectionConfig): Promise<boolean> {
    return false;
  }

  async getBalance(_config: BankConnectionConfig): Promise<BankBalance> {
    this.notReady();
  }

  async getTransactions(
    _config: BankConnectionConfig,
    _startDate: string,
    _endDate: string,
  ): Promise<BankTransaction[]> {
    this.notReady();
  }
}

export const openFinancePlaceholderProvider = new OpenFinancePlaceholderProvider();
