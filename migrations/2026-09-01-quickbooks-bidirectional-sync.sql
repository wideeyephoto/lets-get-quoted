-- QuickBooks Online 2-Way Bidirectional Synchronization
--
-- Enables two-way synchronization between Let's Get Quoted and QuickBooks Online:
-- 1. Inbound customer pull with deduplication index
-- 2. Inbound payment & invoice status reconciliation tracking
-- 3. Connection-level pull execution metadata

alter table quickbooks_connections add column if not exists last_pull_at timestamptz;
alter table quickbooks_connections add column if not exists last_pull_summary text;

-- Fast index for inbound customer matching and deduplication
create index if not exists clients_qbo_customer_idx
  on clients (account_id, qbo_customer_id) where qbo_customer_id is not null;
