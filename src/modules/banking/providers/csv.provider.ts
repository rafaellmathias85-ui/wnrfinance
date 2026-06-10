import { OfxProvider } from './ofx.provider';

export class CsvProvider extends OfxProvider {
  providerName = 'CSV manual';
}

export const csvProvider = new CsvProvider();
