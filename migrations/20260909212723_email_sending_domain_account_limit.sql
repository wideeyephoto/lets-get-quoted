-- Enforce the v1 workspace limit for pending/failed/disabled rows as well.
-- Fail on pre-existing duplicates; never silently discard ownership/cleanup state.
create unique index if not exists email_sending_domains_one_per_account
  on public.email_sending_domains (account_id);
