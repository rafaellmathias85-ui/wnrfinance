-- FASE 1 — Núcleo de faturamento e conciliação v2 (mudanças ADITIVAS)

-- Lotes de importação de extrato
CREATE TABLE IF NOT EXISTS "import_batches" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "user_id" TEXT NOT NULL,
    "bank_connection_id" TEXT,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'AUTOMATICO',
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "reconciled_count" INTEGER NOT NULL DEFAULT 0,
    "ignored_count" INTEGER NOT NULL DEFAULT 0,
    "pending_count" INTEGER NOT NULL DEFAULT 0,
    "file_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "import_batches_company_id_created_at_idx" ON "import_batches"("company_id", "created_at");
CREATE INDEX IF NOT EXISTS "import_batches_user_id_created_at_idx" ON "import_batches"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "import_batches_bank_connection_id_idx" ON "import_batches"("bank_connection_id");
CREATE INDEX IF NOT EXISTS "import_batches_status_idx" ON "import_batches"("status");

-- FK do extrato para o lote (coluna import_batch_id já existe em bank_transactions)
ALTER TABLE "bank_transactions"
  ADD CONSTRAINT "bank_transactions_import_batch_id_fkey"
  FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Regras de conciliação por conta
CREATE TABLE IF NOT EXISTS "bank_reconciliation_rules" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "user_id" TEXT NOT NULL,
    "bank_connection_id" TEXT,
    "type" TEXT NOT NULL,
    "match_text" TEXT NOT NULL,
    "exact_match" BOOLEAN NOT NULL DEFAULT false,
    "category_id" TEXT,
    "client_id" TEXT,
    "supplier_id" TEXT,
    "cost_center_id" TEXT,
    "payment_method" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bank_reconciliation_rules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "bank_reconciliation_rules_company_id_is_active_idx" ON "bank_reconciliation_rules"("company_id", "is_active");
CREATE INDEX IF NOT EXISTS "bank_reconciliation_rules_bank_connection_id_idx" ON "bank_reconciliation_rules"("bank_connection_id");

-- Anexos categorizados
CREATE TABLE IF NOT EXISTS "attachments" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "user_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OUTROS',
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_size" INTEGER,
    "mime_type" TEXT,
    "applied_to_all_installments" BOOLEAN NOT NULL DEFAULT false,
    "uploaded_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "attachments_entity_type_entity_id_idx" ON "attachments"("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "attachments_company_id_idx" ON "attachments"("company_id");

-- Log de reajuste de contrato
CREATE TABLE IF NOT EXISTS "contract_adjustment_logs" (
    "id" TEXT NOT NULL,
    "contract_id" TEXT NOT NULL,
    "applied_by" TEXT,
    "index_used" TEXT NOT NULL,
    "percent_applied" DOUBLE PRECISION NOT NULL,
    "value_before" DOUBLE PRECISION NOT NULL,
    "value_after" DOUBLE PRECISION NOT NULL,
    "installments_affected" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contract_adjustment_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contract_adjustment_logs_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "contract_adjustment_logs_contract_id_idx" ON "contract_adjustment_logs"("contract_id");

-- AccountsReceivable: pipeline de faturamento
ALTER TABLE "AccountsReceivable" ADD COLUMN IF NOT EXISTS "billing_status" TEXT NOT NULL DEFAULT 'FATURADA';
ALTER TABLE "AccountsReceivable" ADD COLUMN IF NOT EXISTS "billing_date" TIMESTAMP(3);
ALTER TABLE "AccountsReceivable" ADD COLUMN IF NOT EXISTS "billed_at" TIMESTAMP(3);
ALTER TABLE "AccountsReceivable" ADD COLUMN IF NOT EXISTS "invoice_sent_at" TIMESTAMP(3);
ALTER TABLE "AccountsReceivable" ADD COLUMN IF NOT EXISTS "reconciled_at" TIMESTAMP(3);
ALTER TABLE "AccountsReceivable" ADD COLUMN IF NOT EXISTS "nfe_status" TEXT;
ALTER TABLE "AccountsReceivable" ADD COLUMN IF NOT EXISTS "boleto_status" TEXT;
ALTER TABLE "AccountsReceivable" ADD COLUMN IF NOT EXISTS "email_status" TEXT;
CREATE INDEX IF NOT EXISTS "AccountsReceivable_billing_status_idx" ON "AccountsReceivable"("billing_status");
CREATE INDEX IF NOT EXISTS "AccountsReceivable_billing_date_idx" ON "AccountsReceivable"("billing_date");

-- Backfill do estado de pipeline a partir do status financeiro legado
UPDATE "AccountsReceivable" SET "billing_status" = 'QUITADA'   WHERE "status" = 'recebido';
UPDATE "AccountsReceivable" SET "billing_status" = 'CANCELADA' WHERE "status" = 'cancelado';
UPDATE "AccountsReceivable" SET "billing_status" = 'VENCIDA'   WHERE "status" = 'vencido';

-- BankConnection: defaults de cobrança + taxas
ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "fine_percent" DOUBLE PRECISION;
ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "monthly_interest_percent" DOUBLE PRECISION;
ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "discount_value" DOUBLE PRECISION;
ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "discount_percent" DOUBLE PRECISION;
ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "discount_days_before" INTEGER;
ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "settlement_business_days" INTEGER;
ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "min_payment_value" DOUBLE PRECISION;
ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "write_off_days" INTEGER;
ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "boleto_instructions" TEXT;
ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "pix_key" TEXT;
ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "boleto_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "pix_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "auto_fee_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "fee_issue_amount" DOUBLE PRECISION;
ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "fee_settle_amount" DOUBLE PRECISION;
ALTER TABLE "bank_connections" ADD COLUMN IF NOT EXISTS "fee_pix_amount" DOUBLE PRECISION;

-- Contract: lead de faturamento + reajuste
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "billingLeadDays" INTEGER NOT NULL DEFAULT 4;
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "adjustmentIndex" TEXT DEFAULT 'NENHUM';
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "adjustmentPeriod" TEXT DEFAULT 'ANUAL';
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "nextAdjustmentDate" TIMESTAMP(3);

-- NFe: rastreio de RPS
ALTER TABLE "NFe" ADD COLUMN IF NOT EXISTS "rps_number" TEXT;
ALTER TABLE "NFe" ADD COLUMN IF NOT EXISTS "rps_series" TEXT;
