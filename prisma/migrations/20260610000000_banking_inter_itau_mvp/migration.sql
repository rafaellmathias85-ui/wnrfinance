CREATE TABLE IF NOT EXISTS bank_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  empresa_id TEXT REFERENCES "Company"(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'PF',
  person_type TEXT NOT NULL DEFAULT 'PF',
  provider TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  connection_mode TEXT NOT NULL DEFAULT 'OFX',
  bank_name TEXT NOT NULL,
  bank_logo TEXT,
  bank_code TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING_CONFIG',
  last_sync_at TIMESTAMP(3),
  token_expires_at TIMESTAMP(3),
  account_type TEXT,
  account TEXT,
  account_digit TEXT,
  account_id TEXT,
  agency TEXT,
  opening_balance DOUBLE PRECISION DEFAULT 0,
  current_balance DOUBLE PRECISION DEFAULT 0,
  allows_payments BOOLEAN NOT NULL DEFAULT false,
  allows_receipts BOOLEAN NOT NULL DEFAULT false,
  allows_transfers BOOLEAN NOT NULL DEFAULT false,
  last_error TEXT,
  owner_tax_id_encrypted TEXT,
  client_id_encrypted TEXT,
  client_secret_encrypted TEXT,
  certificate_encrypted TEXT,
  private_key_encrypted TEXT,
  cert_path_encrypted TEXT,
  certificate_password_encrypted TEXT,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  extra_config JSONB,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS bank_connections_provider_connection_id_key
  ON bank_connections(provider, connection_id);

CREATE INDEX IF NOT EXISTS bank_connections_user_id_idx ON bank_connections(user_id);
CREATE INDEX IF NOT EXISTS bank_connections_empresa_id_idx ON bank_connections(empresa_id);
CREATE INDEX IF NOT EXISTS bank_connections_status_idx ON bank_connections(status);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  empresa_id TEXT,
  bank_connection_id TEXT REFERENCES bank_connections(id) ON DELETE SET NULL,
  person_type TEXT NOT NULL DEFAULT 'PF',
  bank_code TEXT,
  account_id TEXT,
  external_id TEXT,
  transaction_hash TEXT,
  description TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  direction TEXT NOT NULL,
  transaction_date TIMESTAMP(3) NOT NULL,
  category TEXT,
  balance_after DOUBLE PRECISION,
  document_number TEXT,
  counterparty_name TEXT,
  counterparty_tax_id TEXT,
  raw_payload JSONB,
  reconciliation_status TEXT NOT NULL DEFAULT 'PENDING',
  import_batch_id TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_user_id_external_id_key
  ON bank_transactions(user_id, external_id);

CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_empresa_connection_hash_key
  ON bank_transactions(empresa_id, bank_connection_id, transaction_hash);

CREATE INDEX IF NOT EXISTS bank_transactions_user_id_idx ON bank_transactions(user_id);
CREATE INDEX IF NOT EXISTS bank_transactions_empresa_id_idx ON bank_transactions(empresa_id);
CREATE INDEX IF NOT EXISTS bank_transactions_transaction_date_idx ON bank_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS bank_transactions_bank_connection_id_idx ON bank_transactions(bank_connection_id);
CREATE INDEX IF NOT EXISTS bank_transactions_reconciliation_status_idx ON bank_transactions(reconciliation_status);
CREATE INDEX IF NOT EXISTS bank_transactions_import_batch_id_idx ON bank_transactions(import_batch_id);
CREATE INDEX IF NOT EXISTS bank_transactions_transaction_hash_idx ON bank_transactions(transaction_hash);
