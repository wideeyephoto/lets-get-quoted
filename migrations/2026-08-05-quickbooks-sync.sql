-- QuickBooks Online sync: one-way push of invoices and payments.
--
-- Everything here is provenance. The rule the whole feature rests on is that a
-- row we have already created in QuickBooks must never be created again — a
-- duplicate invoice in somebody's real books is not a bug you can fix from this
-- side, it is a phone call with their bookkeeper.

-- Where this invoice lives in QuickBooks, when it got there, and why it didn't.
-- qbo_error is deliberately kept alongside qbo_id rather than in a log table:
-- the owner needs to see "this one didn't go, here's why" next to the invoice.
alter table invoices add column if not exists qbo_id text;
alter table invoices add column if not exists qbo_synced_at timestamptz;
alter table invoices add column if not exists qbo_error text;

alter table payments add column if not exists qbo_id text;
alter table payments add column if not exists qbo_synced_at timestamptz;
alter table payments add column if not exists qbo_error text;

-- A QuickBooks Customer is matched on DisplayName, which is unique per company.
-- Caching the id means a rename on our side doesn't silently create a second
-- customer, and a book of 400 clients doesn't cost 400 lookups per sweep.
alter table clients add column if not exists qbo_customer_id text;

-- Belt and braces on the no-duplicates rule. Partial, because almost every row
-- is null: only synced rows are constrained.
create unique index if not exists invoices_qbo_id_idx
  on invoices (account_id, qbo_id) where qbo_id is not null;
create unique index if not exists payments_qbo_id_idx
  on payments (account_id, qbo_id) where qbo_id is not null;
create index if not exists invoices_qbo_pending_idx
  on invoices (account_id) where qbo_id is null;

-- Per-connection cache and run state.
--
-- automated_sales_tax decides whether we may send a tax total at all. QuickBooks
-- companies with Automated Sales Tax compute tax themselves and ignore what we
-- send, so an invoice carrying tax would post with the wrong total and nobody
-- would be told. Read once from Preferences and stored; null means "not asked
-- yet", which is treated as unsafe.
alter table quickbooks_connections add column if not exists qbo_item_id text;
alter table quickbooks_connections add column if not exists automated_sales_tax boolean;
alter table quickbooks_connections add column if not exists last_sync_at timestamptz;
alter table quickbooks_connections add column if not exists last_sync_summary text;
