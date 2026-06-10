-- Add bank identification and import batch grouping to PJReconciliation
ALTER TABLE "PJReconciliation" ADD COLUMN IF NOT EXISTS "bankConnectionId" TEXT;
ALTER TABLE "PJReconciliation" ADD COLUMN IF NOT EXISTS "bankName"         TEXT;
ALTER TABLE "PJReconciliation" ADD COLUMN IF NOT EXISTS "importBatchId"    TEXT;

CREATE INDEX IF NOT EXISTS "PJReconciliation_importBatchId_idx" ON "PJReconciliation"("importBatchId");
