import { bankingService } from './banking.service';
import type { BankCode, BankConnectionMode, PersonType } from './bank-provider.interface';

export class BankingController {
  listConnections(params: { userId: string; companyId?: string | null; personType?: PersonType }) {
    return bankingService.listConnections(params);
  }

  createConnection(input: {
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
  }) {
    return bankingService.createConnection(input);
  }

  testConnection(params: { userId: string; companyId?: string | null; connectionId: string; request?: Request }) {
    return bankingService.testConnection(params);
  }

  syncConnection(params: {
    userId: string;
    companyId?: string | null;
    connectionId: string;
    startDate?: Date;
    endDate?: Date;
    automatic?: boolean;
    request?: Request;
  }) {
    return bankingService.syncConnection(params);
  }

  removeConnection(params: { userId: string; companyId?: string | null; connectionId: string; request?: Request }) {
    return bankingService.removeConnection(params);
  }
}

export const bankingController = new BankingController();
