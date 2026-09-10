-- Deployed Halo tables predate the wallet column in the baseline CREATE TABLE.
-- CREATE TABLE IF NOT EXISTS does not add it to those existing tables.
begin;

alter table public.neighborhood_halo_campaigns
  add column if not exists wallet_deducted_cents integer not null default 0;

-- Zero is intentional for older rows: an unproven debit cannot earn a refund.
commit;
