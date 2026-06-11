// Asaas — boleto, PIX e cartão para PJ
// Docs: https://docs.asaas.com/reference

const ASAAS_BASE = process.env.ASAAS_SANDBOX === 'true'
  ? 'https://sandbox.asaas.com/api/v3'
  : 'https://api.asaas.com/v3';

function headers(apiKey: string) {
  return {
    'Content-Type': 'application/json',
    'access_token': apiKey,
  };
}

// Timeout padrão para chamadas ao Asaas — evita requisição pendurada
// e janela de cobrança órfã (criada no provedor sem registro local).
const ASAAS_TIMEOUT_MS = 30_000;

async function asaasRequest<T>(
  apiKey: string,
  method: string,
  path: string,
  body?: object
): Promise<T> {
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    method,
    headers: headers(apiKey),
    signal: AbortSignal.timeout(ASAAS_TIMEOUT_MS),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.errors?.[0]?.description || data?.error || `Asaas error ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

// ── Customers ──────────────────────────────────────────────────────────────

export interface AsaasCustomer {
  id: string;
  name: string;
  cpfCnpj: string;
  email?: string;
  phone?: string;
  mobilePhone?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  province?: string;
  postalCode?: string;
}

export async function findOrCreateCustomer(
  apiKey: string,
  data: { name: string; cpfCnpj: string; email?: string; phone?: string }
): Promise<AsaasCustomer> {
  // Try to find existing customer
  const search = await asaasRequest<{ data: AsaasCustomer[] }>(
    apiKey, 'GET', `/customers?cpfCnpj=${encodeURIComponent(data.cpfCnpj)}`
  );
  if (search.data.length > 0) return search.data[0];

  // Create new
  return asaasRequest<AsaasCustomer>(apiKey, 'POST', '/customers', {
    name: data.name,
    cpfCnpj: data.cpfCnpj,
    email: data.email,
    phone: data.phone,
  });
}

// ── Payments ───────────────────────────────────────────────────────────────

export type AsaasBillingType = 'BOLETO' | 'CREDIT_CARD' | 'PIX' | 'UNDEFINED';

export interface AsaasPaymentInput {
  customer: string;         // Asaas customer ID
  billingType: AsaasBillingType;
  value: number;
  dueDate: string;          // YYYY-MM-DD
  description?: string;
  externalReference?: string;  // our BoletoCharge.id
  installmentCount?: number;
  installmentValue?: number;
  discount?: { value: number; dueDateLimitDays: number; type: 'FIXED' | 'PERCENTAGE' };
  interest?: { value: number };
  fine?: { value: number };
  postalService?: boolean;
  notificationDisabled?: boolean;
}

export interface AsaasPayment {
  id: string;
  status: string;
  billingType: AsaasBillingType;
  value: number;
  dueDate: string;
  invoiceUrl: string;
  bankSlipUrl?: string;
  pixQrCodeUrl?: string;
  pixCopiaECola?: string;
  externalReference?: string;
  nossoNumero?: string;
  barCode?: string;
}

export async function createPayment(apiKey: string, input: AsaasPaymentInput): Promise<AsaasPayment> {
  return asaasRequest<AsaasPayment>(apiKey, 'POST', '/payments', input);
}

export async function getPayment(apiKey: string, paymentId: string): Promise<AsaasPayment> {
  return asaasRequest<AsaasPayment>(apiKey, 'GET', `/payments/${paymentId}`);
}

export async function cancelPayment(apiKey: string, paymentId: string): Promise<{ deleted: boolean }> {
  return asaasRequest(apiKey, 'DELETE', `/payments/${paymentId}`);
}

export async function getPixQrCode(apiKey: string, paymentId: string): Promise<{ encodedImage: string; payload: string; expirationDate: string }> {
  return asaasRequest(apiKey, 'GET', `/payments/${paymentId}/pixQrCode`);
}

export async function listPayments(
  apiKey: string,
  params: { status?: string; billingType?: string; offset?: number; limit?: number }
): Promise<{ data: AsaasPayment[]; totalCount: number }> {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.billingType) qs.set('billingType', params.billingType);
  if (params.offset != null) qs.set('offset', String(params.offset));
  if (params.limit != null) qs.set('limit', String(params.limit));
  return asaasRequest(apiKey, 'GET', `/payments?${qs}`);
}

// ── Subscriptions (recurring charges) ────────────────────────────────────

export interface AsaasSubscriptionInput {
  customer: string;
  billingType: AsaasBillingType;
  value: number;
  nextDueDate: string;
  cycle: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUALLY' | 'YEARLY';
  description?: string;
  externalReference?: string;
  endDate?: string;
}

export async function createSubscription(apiKey: string, input: AsaasSubscriptionInput) {
  return asaasRequest(apiKey, 'POST', '/subscriptions', input);
}

// ── Balance ────────────────────────────────────────────────────────────────

export async function getBalance(apiKey: string): Promise<{ balance: number }> {
  return asaasRequest(apiKey, 'GET', '/finance/balance');
}

// ── Transfers ──────────────────────────────────────────────────────────────

export async function createTransfer(
  apiKey: string,
  data: { value: number; pixAddressKey?: string; bankAccount?: { ispb: string; agency: string; account: string; accountDigit: string; accountType: string } }
) {
  return asaasRequest(apiKey, 'POST', '/transfers', data);
}
