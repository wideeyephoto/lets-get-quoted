-- QuickBooks Online connection, one per account.
--
-- Run this against the production database (Supabase SQL editor) BEFORE the
-- feature will appear. Until it runs, every read catches the missing table and
-- reports "not connected", so Settings shows the Connect button and nothing
-- throws.
--
-- Additive only: one new table. Safe to run twice.
--
-- Do NOT apply this with scripts/deploy-schema.mjs — that replays all of
-- schema.sql, including drop policy / create policy pairs, against a live
-- database. This file is the whole change.

begin;

-- WHAT IS IN HERE IS A CREDENTIAL, not a setting.
--
-- The refresh token is a bearer credential for a contractor's accounting
-- system: anyone holding it can read and write their books until it is revoked.
-- That is a higher grade of secret than anything else this product stores, so
-- the table is treated differently from the rest — see the RLS block below.
create table if not exists quickbooks_connections (
  account_id      uuid primary key references accounts(id) on delete cascade,

  -- Intuit's id for the connected COMPANY. A contractor with two companies gets
  -- one row per account here, not per company, so this also records which of
  -- their companies we are pointed at. Needed on every API call.
  realm_id        text not null,
  company_name    text,

  access_token    text not null,
  refresh_token   text not null,

  -- Access tokens last an hour. Refresh tokens last 100 DAYS and Intuit rotates
  -- them on every refresh — the new one must be written back or the connection
  -- dies at the next call. Both expiries are stored because they fail
  -- differently: an expired access token is refreshed silently, an expired
  -- refresh token can only be fixed by the owner re-authorising, and the UI has
  -- to be able to tell those apart instead of showing one confusing error.
  access_expires_at   timestamptz not null,
  refresh_expires_at  timestamptz not null,

  -- Sandbox connections cannot be used against production and vice versa. Stored
  -- so a leftover sandbox row from testing is recognised as unusable rather than
  -- producing authentication errors nobody can explain.
  environment     text not null default 'sandbox' check (environment in ('sandbox', 'production')),

  connected_at    timestamptz not null default now(),
  connected_by    text,
  -- Set when a refresh fails in a way the owner has to fix. Null while healthy.
  disconnected_at timestamptz,
  last_error      text,

  updated_at      timestamptz not null default now()
);

create index if not exists quickbooks_connections_realm_idx
  on quickbooks_connections (realm_id);

-- RLS on, and NO policy granting access to anyone.
--
-- Deliberate, and different from every other table here. Elsewhere an owner
-- policy lets the session-scoped client read its own rows; here there is no
-- reason for a browser session to ever hold these tokens, and a policy that
-- allows it is a policy that can be got at through any future query bug. Only
-- the service-role client — which bypasses RLS — touches this table, and it
-- lives entirely in server code that never returns the token columns.
alter table quickbooks_connections enable row level security;

commit;
