import { bankCredentialsVault } from '../bank-credentials-vault.service';
import type {
  BankBalance,
  BankConnection,
  BankConnectionTestResult,
  BankProvider,
  CanonicalTransaction,
} from '../bank-provider.interface';

const ITAU_NOT_CONFIGURED =
  'API Itaú PJ ainda não configurada. Use importação OFX como contingência.';

export class ItauPJProvider implements BankProvider {
  providerName = 'Itaú PJ';
  bankCode = 'ITAU';
  personType = 'PJ' as const;

  constructor(private readonly connection: BankConnection) {}

  async testConnection(): Promise<BankConnectionTestResult> {
    if (!this.hasApiConfiguration()) {
      return {
        success: false,
        message: ITAU_NOT_CONFIGURED,
        errorCode: 'API_NOT_AVAILABLE',
      };
    }

    return {
      success: false,
      message:
        'A integração automática Itaú PJ depende de habilitação junto ao Itaú. Enquanto isso, use OFX para importar extratos.',
      errorCode: 'API_NOT_AVAILABLE',
    };
  }

  async getBalance(): Promise<BankBalance> {
    if (!this.hasApiConfiguration()) {
      throw new Error(ITAU_NOT_CONFIGURED);
    }

    throw new Error(
      'API Itaú PJ preparada, mas os endpoints oficiais de saldo/extrato dependem da habilitação do banco.',
    );
  }

  async getTransactions(_startDate: Date, _endDate: Date): Promise<CanonicalTransaction[]> {
    if (!this.hasApiConfiguration()) {
      throw new Error(ITAU_NOT_CONFIGURED);
    }

    throw new Error(
      'API Itaú PJ preparada, mas os endpoints oficiais de saldo/extrato dependem da habilitação do banco.',
    );
  }

  private hasApiConfiguration(): boolean {
    const hasUrls = Boolean(process.env.ITAU_PJ_BASE_URL && process.env.ITAU_PJ_TOKEN_URL);
    const clientId = bankCredentialsVault.decrypt(this.connection.clientIdEnc);
    const clientSecret = bankCredentialsVault.decrypt(this.connection.clientSecretEnc);
    return hasUrls && Boolean(clientId && clientSecret);
  }
}
