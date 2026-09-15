-- Operational circuit breakers / emergency kill switches.
-- Allows staff with ops.manage / account.enforce to immediately halt rogue
-- or degraded subsystem traffic (AI, SMS, Voice, Payments) without a deploy.
-- Only the server service role can read or write this table.

begin;

create table if not exists public.platform_circuit_breakers (
  id uuid primary key default gen_random_uuid(),
  service text not null check (service in ('ai_intake', 'sms_outbound', 'voice_routing', 'payments_checkout')),
  scope text not null check (scope in ('global', 'account')),
  account_id uuid references public.accounts(id) on delete cascade,
  is_tripped boolean not null default true,
  reason text not null check (length(btrim(reason)) >= 4 and length(reason) <= 1000),
  tripped_by text not null check (length(btrim(tripped_by)) >= 3),
  tripped_at timestamptz not null default now(),
  cleared_by text,
  cleared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_circuit_breakers_scope_shape check (
    (scope = 'global' and account_id is null) or
    (scope = 'account' and account_id is not null)
  )
);

create unique index if not exists platform_circuit_breakers_active_uniq
  on public.platform_circuit_breakers (service, scope, coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_tripped = true;

create index if not exists platform_circuit_breakers_tripped_lookup
  on public.platform_circuit_breakers (is_tripped, service, scope);

create index if not exists platform_circuit_breakers_account_idx
  on public.platform_circuit_breakers (account_id)
  where account_id is not null;

alter table public.platform_circuit_breakers enable row level security;
revoke all on public.platform_circuit_breakers from public, anon, authenticated;
grant select, insert, update, delete on public.platform_circuit_breakers to service_role;

commit;
