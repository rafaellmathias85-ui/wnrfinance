-- AlterTable: add email tracking fields to EmailLog
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "tracking_token" TEXT;
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "opened_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "EmailLog_tracking_token_key" ON "EmailLog"("tracking_token");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmailLog_tracking_token_idx" ON "EmailLog"("tracking_token");
