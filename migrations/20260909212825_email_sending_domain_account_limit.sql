-- Verified target: the user's staging-db project in the same LGQ organization.
-- Preflight on 2026-09-09 found zero email_sending_domains rows.
-- This enforces the existing v1 one-domain-per-workspace rule for the authorized contractor-domain lifecycle rehearsal.
-- No rows are modified; 17 isolated PostgreSQL 17 contract checks passed, including concurrent reservations.
create unique index if not exists email_sending_domains_one_per_account on public.email_sending_domains(account_id);;
