-- A homeowner's own way back in.
--
-- Today a customer only reaches their job through a per-job link somebody
-- emailed them once. Two years and three jobs later that link is buried, and
-- there is no way for them to look up their own warranty without phoning.
--
-- This is a CLIENT-level door: one link, every job that client has had done.
--
-- Deliberately not a password. A homeowner does not want another password for a
-- contractor they use twice a decade, and a password is a credential we would
-- then be responsible for storing and losing. Email magic link, hashed like the
-- per-job tokens, with the same expiry and revocation.

create table if not exists client_portal_access (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,

  -- Only ever the hash. A database read must not be able to reconstruct a live
  -- link into somebody's home-improvement history — same rule as job_tracking.
  token_hash text not null unique,
  -- The address it was sent to, so a client who changes email doesn't keep a
  -- working link at the old one.
  sent_to text not null,

  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists client_portal_access_client_idx on client_portal_access (account_id, client_id, created_at desc);
create index if not exists client_portal_access_expiry_idx on client_portal_access (expires_at) where revoked_at is null;

alter table client_portal_access enable row level security;
drop policy if exists client_portal_access_owner on client_portal_access;
create policy client_portal_access_owner on client_portal_access
  for all using (is_owner(account_id)) with check (is_owner(account_id));

-- Owner switch. Off by default: turning on a public page that emails links to
-- anyone who types a matching address is a decision a contractor should make on
-- purpose, not one they discover has already happened.
alter table accounts
  add column if not exists client_portal_enabled boolean not null default false;
