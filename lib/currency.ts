// Multi-currency engine
// Fetches exchange rates from AwesomeAPI (free, no key needed for basic usage)
// Falls back to cached rates in DB

import { prisma } from '@/lib/prisma';

export const SUPPORTED_CURRENCIES = [
  { code: 'BRL', name: 'Real Brasileiro', symbol: 'R$' },
  { code: 'USD', name: 'Dólar Americano', symbol: 'US$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'Libra Esterlina', symbol: '£' },
  { code: 'ARS', name: 'Peso Argentino', symbol: '$' },
  { code: 'UYU', name: 'Peso Uruguaio', symbol: '$U' },
  { code: 'PYG', name: 'Guarani Paraguaio', symbol: '₲' },
  { code: 'CLP', name: 'Peso Chileno', symbol: '$' },
  { code: 'COP', name: 'Peso Colombiano', symbol: '$' },
  { code: 'JPY', name: 'Iene Japonês', symbol: '¥' },
  { code: 'CNY', name: 'Yuan Chinês', symbol: '¥' },
  { code: 'CAD', name: 'Dólar Canadense', symbol: 'CA$' },
  { code: 'AUD', name: 'Dólar Australiano', symbol: 'A$' },
  { code: 'CHF', name: 'Franco Suíço', symbol: 'Fr' },
  { code: 'BTC', name: 'Bitcoin', symbol: '₿' },
  { code: 'ETH', name: 'Ethereum', symbol: 'Ξ' },
];

export interface ExchangeRateResult {
  from: string;
  to: string;
  rate: number;
  timestamp: Date;
  source: string;
  cached: boolean;
}

// Fetch from AwesomeAPI (moeda=USD,EUR etc. to BRL)
async function fetchFromAwesomeAPI(currencies: string[]): Promise<Record<string, number>> {
  const pairs = currencies.filter((c) => c !== 'BRL').map((c) => `${c}-BRL`).join(',');
  if (!pairs) return {};

  try {
    const res = await fetch(`https://economia.awesomeapi.com.br/json/last/${pairs}`, {
      next: { revalidate: 3600 }, // cache for 1 hour in Next.js
    });

    if (!res.ok) throw new Error(`AwesomeAPI HTTP ${res.status}`);

    const data = await res.json();
    const rates: Record<string, number> = {};

    for (const key of Object.keys(data)) {
      const code = key.slice(0, 3); // e.g. "USD" from "USDBRL"
      rates[code] = parseFloat(data[key].bid) || parseFloat(data[key].ask);
    }

    return rates;
  } catch (err) {
    console.error('[currency] AwesomeAPI failed:', err);
    return {};
  }
}

// Get cached rate from DB (max 24h old)
async function getCachedRate(from: string, to = 'BRL'): Promise<number | null> {
  const since = new Date();
  since.setHours(since.getHours() - 24);

  const rate = await prisma.exchangeRate.findFirst({
    where: { fromCurrency: from, toCurrency: to, date: { gte: since } },
    orderBy: { date: 'desc' },
  });

  return rate?.rate || null;
}

// Save rates to DB
async function saveRates(rates: Record<string, number>, source: string): Promise<void> {
  const now = new Date();
  const creates = Object.entries(rates).map(([from, rate]) => ({
    fromCurrency: from,
    toCurrency: 'BRL',
    rate,
    source,
    date: now,
  }));

  if (!creates.length) return;

  await prisma.exchangeRate.createMany({ data: creates, skipDuplicates: false }).catch(() => {});

  // Clean old rates (keep last 30 days)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  await prisma.exchangeRate.deleteMany({ where: { date: { lt: cutoff } } }).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// Main function: get exchange rate for a currency pair
// ─────────────────────────────────────────────────────────────────────────────
export async function getExchangeRate(from: string, to = 'BRL'): Promise<ExchangeRateResult> {
  if (from === to) {
    return { from, to, rate: 1, timestamp: new Date(), source: 'identity', cached: true };
  }

  // Check DB cache
  const cached = await getCachedRate(from, to);
  if (cached) {
    return { from, to, rate: cached, timestamp: new Date(), source: 'cache', cached: true };
  }

  // Fetch fresh rates
  const fresh = await fetchFromAwesomeAPI([from]);
  if (fresh[from]) {
    await saveRates({ [from]: fresh[from] }, 'awesomeapi');
    return { from, to, rate: fresh[from], timestamp: new Date(), source: 'awesomeapi', cached: false };
  }

  // Fallback — return cached even if stale
  const stale = await prisma.exchangeRate.findFirst({
    where: { fromCurrency: from, toCurrency: to },
    orderBy: { date: 'desc' },
  });

  return {
    from, to,
    rate: stale?.rate || 1,
    timestamp: stale?.date || new Date(),
    source: stale ? 'stale_cache' : 'fallback',
    cached: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk fetch all supported currencies
// ─────────────────────────────────────────────────────────────────────────────
export async function refreshAllRates(): Promise<Record<string, number>> {
  const codes = SUPPORTED_CURRENCIES.filter((c) => c.code !== 'BRL').map((c) => c.code);
  const rates = await fetchFromAwesomeAPI(codes);
  if (Object.keys(rates).length > 0) {
    await saveRates(rates, 'awesomeapi');
  }
  rates['BRL'] = 1;
  return rates;
}

// ─────────────────────────────────────────────────────────────────────────────
// Convert amount between currencies
// ─────────────────────────────────────────────────────────────────────────────
export async function convertCurrency(amount: number, from: string, to: string): Promise<number> {
  if (from === to) return amount;

  // Convert via BRL as intermediary
  if (from === 'BRL') {
    const { rate } = await getExchangeRate(to);
    return amount / rate; // BRL → foreign
  }

  if (to === 'BRL') {
    const { rate } = await getExchangeRate(from);
    return amount * rate; // foreign → BRL
  }

  // Cross rate: from → BRL → to
  const fromRate = await getExchangeRate(from);
  const toRate = await getExchangeRate(to);
  const inBRL = amount * fromRate.rate;
  return inBRL / toRate.rate;
}

// Format currency amount
export function formatCurrency(amount: number, code: string): string {
  const curr = SUPPORTED_CURRENCIES.find((c) => c.code === code);
  if (!curr) return `${amount.toFixed(2)} ${code}`;

  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: code }).format(amount);
  } catch {
    return `${curr.symbol} ${amount.toFixed(2)}`;
  }
}
