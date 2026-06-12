-- Bloqueio de conta e obrigatoriedade de MFA por usuário
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isBlocked"   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaRequired" BOOLEAN NOT NULL DEFAULT false;
