import type { BankBalance, BankConnection, BankConnectionTestResult, CanonicalTransaction } from '../bank-provider.interface';
import { OfxProvider } from './ofx.provider';

export class ItauPFOfxProvider extends OfxProvider {
  providerName = 'Itaú PF OFX/CSV';
  bankCode = 'ITAU';
  personType = 'PF' as const;

  constructor(connection?: BankConnection | null) {
    super(connection);
  }

  async testConnection(): Promise<BankConnectionTestResult> {
    return {
      success: true,
      message: 'Por segurança, o sistema não solicita senha bancária nem acessa seu Internet Banking. Para conta PF, utilize OFX/CSV ou futuramente Open Finance.',
      errorCode: 'API_NOT_AVAILABLE',
    };
  }

  async getBalance(): Promise<BankBalance> {
    throw new Error('API automática ainda não disponível para esta modalidade. Use OFX/CSV como alternativa.');
  }

  async getTransactions(_startDate: Date, _endDate: Date): Promise<CanonicalTransaction[]> {
    throw new Error('API automática ainda não disponível para esta modalidade. Use OFX/CSV como alternativa.');
  }
}
