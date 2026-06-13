-- AddColumn bankConnectionId to AccountsPayable
ALTER TABLE "AccountsPayable" ADD COLUMN IF NOT EXISTS "bankConnectionId" TEXT;

-- AddColumn bankConnectionId to AccountsReceivable
ALTER TABLE "AccountsReceivable" ADD COLUMN IF NOT EXISTS "bankConnectionId" TEXT;

-- AddIndex
CREATE INDEX IF NOT EXISTS "AccountsPayable_bankConnectionId_idx" ON "AccountsPayable"("bankConnectionId");
CREATE INDEX IF NOT EXISTS "AccountsReceivable_bankConnectionId_idx" ON "AccountsReceivable"("bankConnectionId");
