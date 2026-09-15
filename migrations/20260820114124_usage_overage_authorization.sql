-- Overage a contractor asked for, capped at a number they chose.
--
-- WHY THE SHAPE IS WHAT IT IS. The price book's rule is absolute: LGQ never
-- charges an automatic overage without affirmative approval AND a spending cap.
-- That single sentence decides most of this file.
--
--  - Default is OFF. A workspace with no row here cannot accrue a cent. The
--    failure mode is refusal, never a silent charge, so "no settings" and
--    "disabled" and "cap reached" all end the same way.
--  - The approval is EVIDENCE, not a boolean. workspace_overage_authorizations
--    is append-only and records which text was agreed to, by whom, and when --
--    the same discipline as billing_subscription_consent_acceptances. Turning
--    overage off writes a row too; the history of a money-affecting switch is
--    the point.
--  - The cap is checked and the accrual is written in ONE statement under one
--    lock. Two concurrent sends that each fit under the cap but together exceed
--    it must not both be admitted, and that is not expressible from application
--    code holding two round trips.
--
-- WHY MILLICENTS. Two of the five overage rates are fractions of a cent:
-- marketing email is 0.34c per send and AI writing 7.6c per draft. Accruing in
-- whole cents would round every marketing email to zero or to a cent, which
-- over five thousand sends is the difference between $17 and $50. Accruals are
-- therefore in millicents (1/1000 of a cent) and only become money at invoice
-- time. The cap stays in whole cents, because that is what a contractor types.
--
-- WHY A HARD REFUSAL RATHER THAN A PARTIAL ONE. A send that would cross the cap
-- is refused entirely rather than partly billed. Partial billing means a text
-- that went out half-charged and a cap that was quietly exceeded, and neither is
-- something anybody wants to explain.
--
-- WHAT THIS DOES NOT DO. It does not invoice. Accruals sit here until something
-- turns them into a Stripe line, and that something needs live metered Prices
-- which do not exist yet. Nothing here can move money.

begin;

-- The evidence. Append-only: a row per change, never updated.
create table if not exists public.workspace_overage_authorizations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,

  -- What the contractor did. 'disabled' carries no cap, which the check below
  -- enforces rather than trusting the writer.
  action text not null check (action in ('enabled', 'cap_changed', 'disabled')),

  -- The ceiling they chose, in whole cents, for one billing period.
  cap_cents bigint check (cap_cents is null or cap_cents > 0),

  -- Exactly which words were agreed to. A cap accepted against different text
  -- is different evidence, and pinning the digest is what makes that provable.
  terms_version text not null check (pg_catalog.length(pg_catalog.btrim(terms_version)) > 0),
  terms_sha256 text not null check (terms_sha256 ~ '^[0-9a-f]{64}$'),

  -- Deliberately no auth.users FK: deleting an identity must not erase evidence
  -- of who authorized a charge.
  authorized_by uuid not null,
  authorized_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),

  constraint workspace_overage_authorization_cap_shape_check check (
    (action in ('enabled', 'cap_changed') and cap_cents is not null)
    or (action = 'disabled' and cap_cents is null)
  )
);

create index if not exists workspace_overage_authorizations_account_idx
  on public.workspace_overage_authorizations (account_id, authorized_at desc);

-- The current state. One row per workspace, pointing at the evidence that put
-- it here, so "why is this on" is always answerable.
create table if not exists public.workspace_overage_settings (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  enabled boolean not null default false,
  cap_cents bigint check (cap_cents is null or cap_cents > 0),
  authorization_id uuid not null references public.workspace_overage_authorizations(id),
  updated_at timestamptz not null default pg_catalog.now(),

  -- Enabled without a cap is the exact thing the price book forbids. It is
  -- unrepresentable rather than merely discouraged.
  constraint workspace_overage_settings_cap_required_check check (
    (enabled and cap_cents is not null) or (not enabled and cap_cents is null)
  )
);

-- What has actually been incurred, per workspace per period per resource.
create table if not exists public.workspace_overage_accruals (
  account_id uuid not null references public.accounts(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  resource_code text not null check (resource_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  units bigint not null default 0 check (units >= 0),
  millicents bigint not null default 0 check (millicents >= 0),
  first_accrued_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (account_id, period_start, resource_code),
  constraint workspace_overage_accruals_period_check check (period_end > period_start)
);

create index if not exists workspace_overage_accruals_period_idx
  on public.workspace_overage_accruals (account_id, period_start);

alter table public.workspace_overage_authorizations enable row level security;
alter table public.workspace_overage_settings enable row level security;
alter table public.workspace_overage_accruals enable row level security;

-- Owner-readable, service-role-writable. An owner who could write their own
-- settings row could raise their own cap without leaving evidence, which is the
-- one thing this table exists to prevent.
drop policy if exists workspace_overage_authorizations_read on public.workspace_overage_authorizations;
create policy workspace_overage_authorizations_read on public.workspace_overage_authorizations
  for select using ( public.is_owner(account_id) );

drop policy if exists workspace_overage_settings_read on public.workspace_overage_settings;
create policy workspace_overage_settings_read on public.workspace_overage_settings
  for select using ( public.is_owner(account_id) );

drop policy if exists workspace_overage_accruals_read on public.workspace_overage_accruals;
create policy workspace_overage_accruals_read on public.workspace_overage_accruals
  for select using ( public.is_owner(account_id) );

/**
 * Decide whether this overrun may be charged, and record it if so.
 *
 * One statement, one lock, one answer. The settings row is taken FOR UPDATE
 * before the accrued total is read, so two concurrent sends that each fit under
 * the cap but together exceed it cannot both be admitted.
 *
 * Returns exactly one row:
 *   decision  'accrued' | 'not_authorized' | 'cap_reached'
 * plus the numbers behind it, so a caller can say "you have $3.40 of your $50
 * left" rather than only "no".
 */
create or replace function public.authorize_usage_overage(
  p_account_id uuid,
  p_resource_code text,
  p_units bigint,
  p_rate_millicents bigint,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns table (
  decision text,
  accrued_millicents bigint,
  cap_millicents bigint,
  charged_millicents bigint
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_settings public.workspace_overage_settings%rowtype;
  v_accrued bigint;
  v_charge bigint;
  v_cap_millicents bigint;
begin
  if p_units is null or p_units <= 0 then
    raise exception 'overage units must be positive' using errcode = '22023';
  end if;
  if p_rate_millicents is null or p_rate_millicents <= 0 then
    raise exception 'overage rate must be positive' using errcode = '22023';
  end if;
  if p_resource_code is null or p_resource_code !~ '^[a-z][a-z0-9_]{1,63}$' then
    raise exception 'invalid overage resource code' using errcode = '22023';
  end if;
  if p_period_start is null or p_period_end is null or p_period_end <= p_period_start then
    raise exception 'overage period is not a period' using errcode = '22023';
  end if;

  -- The lock. Everything after this is serialized per workspace.
  select * into v_settings
    from public.workspace_overage_settings s
   where s.account_id = p_account_id
   for update;

  -- No row, disabled, or somehow capless: all the same answer. A workspace that
  -- never opted in is indistinguishable from one that opted out, deliberately.
  if not found or not v_settings.enabled or v_settings.cap_cents is null then
    return query select 'not_authorized'::text, 0::bigint, 0::bigint, 0::bigint;
    return;
  end if;

  v_cap_millicents := v_settings.cap_cents * 1000;
  v_charge := p_units * p_rate_millicents;

  select coalesce(pg_catalog.sum(a.millicents), 0) into v_accrued
    from public.workspace_overage_accruals a
   where a.account_id = p_account_id
     and a.period_start = p_period_start;

  -- Hard stop. A charge that would cross the cap is refused whole rather than
  -- billed in part.
  if v_accrued + v_charge > v_cap_millicents then
    return query select 'cap_reached'::text, v_accrued, v_cap_millicents, 0::bigint;
    return;
  end if;

  insert into public.workspace_overage_accruals as a (
    account_id, period_start, period_end, resource_code, units, millicents
  )
  values (p_account_id, p_period_start, p_period_end, p_resource_code, p_units, v_charge)
  on conflict (account_id, period_start, resource_code) do update
    set units = a.units + excluded.units,
        millicents = a.millicents + excluded.millicents,
        updated_at = pg_catalog.now();

  return query select 'accrued'::text, v_accrued + v_charge, v_cap_millicents, v_charge;
end
$$;

revoke all on function public.authorize_usage_overage(uuid, text, bigint, bigint, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.authorize_usage_overage(uuid, text, bigint, bigint, timestamptz, timestamptz)
  to service_role;

/**
 * Give back an overage that was authorized for work which then failed.
 *
 * The cap check and the accrual have to happen together, before the work, or
 * two concurrent charges could each pass a cap they jointly exceed. That means
 * an overage is charged a moment before anyone knows the send succeeded -- so
 * there has to be a way back, exactly as release_usage_reservation is the way
 * back from a reservation.
 *
 * Only ever decreases, and floors at zero: a double release cannot mint credit,
 * and a release for more than was accrued cannot drive the ledger negative.
 * Returns the millicents actually given back.
 */
create or replace function public.release_usage_overage(
  p_account_id uuid,
  p_resource_code text,
  p_period_start timestamptz,
  p_units bigint,
  p_millicents bigint
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_row public.workspace_overage_accruals%rowtype;
  v_units bigint;
  v_millicents bigint;
begin
  if p_units is null or p_units < 0 or p_millicents is null or p_millicents < 0 then
    raise exception 'overage release must not be negative' using errcode = '22023';
  end if;

  select * into v_row
    from public.workspace_overage_accruals a
   where a.account_id = p_account_id
     and a.period_start = p_period_start
     and a.resource_code = p_resource_code
   for update;
  if not found then
    return 0;
  end if;

  -- Floored, so a duplicate release is a no-op rather than a credit.
  v_units := greatest(v_row.units - p_units, 0);
  v_millicents := greatest(v_row.millicents - p_millicents, 0);

  update public.workspace_overage_accruals a
     set units = v_units,
         millicents = v_millicents,
         updated_at = pg_catalog.now()
   where a.account_id = p_account_id
     and a.period_start = p_period_start
     and a.resource_code = p_resource_code;

  return v_row.millicents - v_millicents;
end
$$;

revoke all on function public.release_usage_overage(uuid, text, timestamptz, bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.release_usage_overage(uuid, text, timestamptz, bigint, bigint)
  to service_role;

comment on function public.authorize_usage_overage(uuid, text, bigint, bigint, timestamptz, timestamptz) is
  'Decides and records one overage charge under the workspace cap. Refuses when '
  'no authorization exists, when overage is disabled, or when the charge would '
  'cross the cap. Never partially charges.';

commit;
