-- Payout restriction (admin-driven, Trust & Safety) — mirrors the
-- suspended_at/_reason/_by triple exactly, but narrower: a restricted account
-- keeps dashboard access, it just can't move homeowner money through Connect
-- until staff lift it. Enforced alongside the existing connect_onboarded /
-- stripe_connect_id guard at every Connect charge-creation call site
-- (src/lib/payments.ts, src/lib/recurring.ts, src/lib/payment-plans.ts).
alter table accounts add column if not exists payouts_restricted_at timestamptz;
alter table accounts add column if not exists payouts_restricted_reason text;
alter table accounts add column if not exists payouts_restricted_by text;
