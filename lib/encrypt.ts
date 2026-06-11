// AES-256-GCM encryption for sensitive data stored in DB (API keys, tokens)
// Requires ENCRYPTION_KEY env var (32-byte base64)

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

let warnedFallback = false;

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    // Fallback: deriva do NEXTAUTH_SECRET. Mantido para não inviabilizar a
    // descriptografia de dados legados, mas em produção isso é um risco:
    // rotacionar o NEXTAUTH_SECRET tornaria os dados ilegíveis.
    if (process.env.NODE_ENV === 'production' && !warnedFallback) {
      warnedFallback = true;
      console.error(
        '[Encrypt] CRÍTICO: ENCRYPTION_KEY não configurada em produção — usando fallback derivado de NEXTAUTH_SECRET. ' +
        'Configure ENCRYPTION_KEY (32 bytes base64) e re-criptografe os segredos armazenados.',
      );
    }
    const secret = process.env.NEXTAUTH_SECRET || 'dev-secret-not-for-production';
    return crypto.createHash('sha256').update(secret).digest();
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY inválida: esperado 32 bytes em base64 (openssl rand -base64 32)');
  }
  return key;
}

/**
 * Encrypts a string. Returns a base64 string: iv + tag + ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/**
 * Decrypts a base64 string produced by encrypt().
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  const buf = Buffer.from(ciphertext, 'base64');
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const encrypted = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

/**
 * Safe decrypt — returns null on failure instead of throwing.
 */
export function safeDecrypt(ciphertext: string): string | null {
  try {
    return decrypt(ciphertext);
  } catch {
    return null;
  }
}

/**
 * Masks a sensitive string for display: shows first 4 + last 4 chars.
 */
export function maskSecret(value: string): string {
  if (!value || value.length < 12) return '••••••••';
  return `${value.slice(0, 4)}${'•'.repeat(Math.min(value.length - 8, 20))}${value.slice(-4)}`;
}
