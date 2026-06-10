-- Add supplierType, position, salary, hiredAt to Supplier
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "supplierType" TEXT NOT NULL DEFAULT 'supplier';
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "position"     TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "salary"       DOUBLE PRECISION;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "hiredAt"      TIMESTAMP(3);

-- Index for fast filtering by company + type
CREATE INDEX IF NOT EXISTS "Supplier_companyId_supplierType_idx" ON "Supplier"("companyId", "supplierType");
