import type { BankConnection, BankProvider } from './bank-provider.interface';
import { CsvProvider } from './providers/csv.provider';
import { InterPFOfxProvider } from './providers/inter-pf-ofx.provider';
import { InterPJProvider } from './providers/inter-pj.provider';
import { ItauPFOfxProvider } from './providers/itau-pf-ofx.provider';
import { ItauPJProvider } from './providers/itau-pj.provider';
import { MockBankProvider } from './providers/mock-bank.provider';
import { OfxProvider } from './providers/ofx.provider';

export function createBankProvider(connection: BankConnection): BankProvider {
  const bankCode = connection.bankCode?.toUpperCase();
  const personType = connection.personType;
  const connectionMode = connection.connectionMode?.toUpperCase();

  if (bankCode === 'INTER' && personType === 'PJ' && connectionMode === 'API') {
    return new InterPJProvider(connection);
  }

  if (bankCode === 'INTER' && personType === 'PF') {
    return new InterPFOfxProvider(connection);
  }

  if (bankCode === 'ITAU' && personType === 'PJ' && connectionMode === 'API') {
    return new ItauPJProvider(connection);
  }

  if (bankCode === 'ITAU' && personType === 'PF') {
    return new ItauPFOfxProvider(connection);
  }

  if (connectionMode === 'OFX') {
    return new OfxProvider(connection);
  }

  if (connectionMode === 'CSV') {
    return new CsvProvider(connection);
  }

  if (bankCode === 'MOCK') {
    return new MockBankProvider();
  }

  throw new Error('Provider bancário não suportado');
}
