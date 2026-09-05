-- Referrals Performance Indexes
--
-- WHY: The referrals dashboard (/dashboard/marketing/referrals) scans leads
-- and extra_stop_requests looking for referredBy keys in the triage/intake jsonb
-- blobs. Without indexes, every page visit performs a full table scan of leads.
--
-- ADDITIVE, IDEMPOTENT, AND CONCURRENTLY-FRIENDLY:
-- Uses CREATE INDEX IF NOT EXISTS with partial filters matching the query predicates.

begin;

-- Fast index for finding referred leads per account
create index if not exists idx_leads_referral_triage
  on leads (account_id, (triage->>'referredBy'))
  where (triage->>'referredBy') is not null and deleted_at is null;

-- Index for settlement state queries and joins
create index if not exists idx_leads_referral_settled
  on leads (account_id, referral_settled_at);

-- Fast index for finding referred Quick Stops per account
create index if not exists idx_extra_stops_referral_intake
  on extra_stop_requests (account_id, (intake->>'referredBy'))
  where (intake->>'referredBy') is not null;

-- Index for settlement state on Quick Stops
create index if not exists idx_extra_stops_referral_settled
  on extra_stop_requests (account_id, referral_settled_at);

commit;
