-- Data-consent / privacy-request history (Phase 4). Same shape as
-- support_cases minus SLA/priority — a lightweight internal log of access,
-- deletion, correction and other privacy requests staff field on an account's
-- behalf, plus when/who resolved them.
create table if not exists privacy_requests (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  kind          text not null check (kind in ('access', 'deletion', 'correction', 'other')),
  status        text not null default 'open' check (status in ('open', 'resolved')),
  details       text,
  created_by    text not null,
  resolved_at   timestamptz,
  resolved_by   text,
  created_at    timestamptz not null default now()
);

create index if not exists privacy_requests_account_idx on privacy_requests (account_id, created_at desc);
create index if not exists privacy_requests_open_idx on privacy_requests (status) where status = 'open';

alter table privacy_requests enable row level security;
