import crypto from 'crypto';

// AES-256-GCM symmetric encryption for banking credentials.
// Requires BANKING_ENCRYPTION_KEY env var — 64 hex chars (32 bytes).
// Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

function getKey(): Buffer {
  const keyHex = process.env.BANKING_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error('BANKING_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)');
  }
  return Buffer.from(keyHex, 'hex');
}

export function encryptCredential(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptCredential(data: string): string {
  const parts = data.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted credential format');
  const [ivHex, authTagHex, encHex] = parts;
  const key = getKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function maskAccount(account: string): string {
  if (account.length <= 4) return '****';
  return `${'*'.repeat(account.length - 4)}${account.slice(-4)}`;
}

export function maskDocument(doc: string): string {
  const d = doc.replace(/\D/g, '');
  if (d.length === 11) return `***.***.${d.slice(6, 9)}-**`; // CPF
  if (d.length === 14) return `**.***.***/****-${d.slice(12)}`; // CNPJ
  return '****';
}
