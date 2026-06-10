import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const VERSION = 'v1';

function getEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('ENCRYPTION_KEY is required to encrypt banking credentials');
  }

  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return Buffer.from(raw, 'hex');
  }

  const base64 = Buffer.from(raw, 'base64');
  if (base64.length === 32) {
    return base64;
  }

  return crypto.createHash('sha256').update(raw).digest();
}

export class BankCredentialsVaultService {
  encrypt(value: string): string {
    if (!value) return value;
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [
      VERSION,
      iv.toString('base64url'),
      tag.toString('base64url'),
      encrypted.toString('base64url'),
    ].join(':');
  }

  decrypt(value?: string | null): string | undefined {
    if (!value) return undefined;
    const [version, iv, tag, encrypted] = value.split(':');
    if (version !== VERSION || !iv || !tag || !encrypted) {
      throw new Error('Invalid encrypted banking credential format');
    }

    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      getEncryptionKey(),
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  encryptOptional(value?: string | null): string | null {
    return value ? this.encrypt(value) : null;
  }

  mask(value?: string | null): string | null {
    if (!value) return null;
    if (value.length <= 8) return '********';
    return `${value.slice(0, 3)}${'*'.repeat(Math.min(value.length - 6, 16))}${value.slice(-3)}`;
  }

  sanitizeForLog<T>(payload: T): T {
    return sanitize(payload) as T;
  }
}

const SENSITIVE_KEYS = [
  'accessToken',
  'refreshToken',
  'token',
  'clientSecret',
  'client_secret',
  'certificate',
  'certificado',
  'privateKey',
  'private_key',
  'key',
  'password',
  'senha',
];

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
      const sensitive = SENSITIVE_KEYS.some((item) => key.toLowerCase().includes(item.toLowerCase()));
      return [key, sensitive ? '[REDACTED]' : sanitize(entry)];
    }),
  );
}

export const bankCredentialsVault = new BankCredentialsVaultService();
