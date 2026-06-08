declare module 'otplib' {
  export function generateSecret(): string;
  export function generateURI(opts: { issuer: string; label: string; secret: string; algorithm?: string; digits?: number; period?: number; counter?: number }): string;
  export function verifySync(opts: { token: string; secret: string }): { valid: boolean };
}
