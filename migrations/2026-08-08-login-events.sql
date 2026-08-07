-- Login/security history for the admin account profile (Phase 4). Written by
-- src/lib/login-events.ts, one row per successful sign-in from an owner-facing
-- auth entry point (OAuth callback, magic-link callback, phone verify). The
-- crew callback is deliberately excluded — this is scoped to the account
-- owner's own security history, not their crew's.
create table if not exists login_events (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  method        text not null check (method in ('oauth', 'magic_link', 'phone')),
  ip            text,
  user_agent    text,
  created_at    timestamptz not null default now()
);

create index if not exists login_events_account_idx on login_events (account_id, created_at desc);

alter table login_events enable row level security;
