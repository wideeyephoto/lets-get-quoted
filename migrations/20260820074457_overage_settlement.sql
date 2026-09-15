-- Turn accrued overage into something that can be charged.
--
-- THE GAP. `workspace_overage_accruals` has been written since 20260819080000
-- and read by nothing at all. A workspace can authorize overage, incur it, and
-- LGQ has no way to bill for it. That is the "failing to take money it should"
-- half of the money path, and it has no code anywhere.
--
-- WHY A SNAPSHOT AND NOT A DIRECT READ. The accrual row is mutable: it is
-- updated on every overrun for the whole period, and `release_usage_overage`
-- decrements it when work fails after being charged for. Billing from a row that
-- can still move means the amount charged and the amount stored can differ by
-- the time anybody looks, and neither is reproducible. So a period is CLOSED
-- into an immutable settlement row, and only that row is ever charged. Same rule
-- the voice rail follows: an immutable record is authoritative, a mutable one is
-- a report.
--
-- WHY AN OPERATION LEDGER RATHER THAN A BOOLEAN. Creating a Stripe invoice item
-- is a network call that can succeed while the response is lost. Without a
-- durable "we are about to ask" state, a retry cannot tell "never tried" from
-- "tried, and it may have worked" -- and charging a contractor twice for the
-- same period is the failure this whole shape exists to prevent. The states
-- mirror billing_top_up_purchase_operations, which exists for the same reason.
--
-- ROUNDING IS DOWN, ALWAYS. Accruals are in millicents and an invoice is in
-- cents. Flooring discards at most 0.999 of a cent per period and can never
-- charge more than was incurred; rounding up could bill a cent nobody used, and
-- "we rounded in our favour" is not a sentence worth the fraction. The discarded
-- remainder is stored rather than dropped, so the arithmetic reconciles exactly.

begin;

create table if not exists public.workspace_overage_settlements (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,

  -- The period this settles, copied from the accruals it closes.
  period_start timestamptz not null,
  period_end timestamptz not null,

  -- THE SNAPSHOT. What the accrual table said at the moment of closing, per
  -- resource, so an invoice line can be itemised and argued with.
  lines jsonb not null check (pg_catalog.jsonb_typeof(lines) = 'array'),

  total_millicents bigint not null check (total_millicents >= 0),
  -- floor(total_millicents / 1000). What is actually billable.
  chargeable_cents bigint not null check (chargeable_cents >= 0),
  -- total_millicents - chargeable_cents * 1000. Kept so the sum reconciles.
  residual_millicents bigint not null check (residual_millicents between 0 and 999),

  -- The cap in force when the period closed. Evidence, not a control: the cap
  -- was already enforced at accrual time, and recording it here is what lets
  -- somebody answer "why did it stop at this number" a month later.
  cap_cents_at_close bigint,

  state text not null default 'closed'
    check (state in ('closed', 'submitted', 'charged', 'indeterminate', 'failed', 'nothing_owed')),

  -- Stripe's side. Null until there is one.
  stripe_customer_id text check (
    stripe_customer_id is null or stripe_customer_id ~ '^cus_[A-Za-z0-9]{8,}$'
  ),
  stripe_invoice_item_id text check (
    stripe_invoice_item_id is null or stripe_invoice_item_id ~ '^ii_[A-Za-z0-9]{8,}$'
  ),
  livemode boolean,
  stripe_idempotency_key text check (
    stripe_idempotency_key is null
    or stripe_idempotency_key ~ '^lgq:billing:v1:overage[.]settle:[0-9a-f]{64}$'
  ),

  claim_token uuid,
  lease_expires_at timestamptz,
  submitted_at timestamptz,
  resolved_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text check (last_error is null or last_error ~ '^[a-z][a-z0-9_]{2,63}$'),

  closed_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),

  -- ONE SETTLEMENT PER WORKSPACE PER PERIOD. The constraint that makes double
  -- billing impossible rather than merely unlikely.
  constraint workspace_overage_settlements_period_unique unique (account_id, period_start),
  constraint workspace_overage_settlements_period_check check (period_end > period_start),

  -- The arithmetic must close. A row where these disagree is a row nobody can
  -- reconcile against the accruals it came from.
  constraint workspace_overage_settlements_amount_check check (
    total_millicents = chargeable_cents * 1000 + residual_millicents
  ),

  -- Each state carries exactly the evidence it has earned.
  constraint workspace_overage_settlements_state_shape_check check (
    (state = 'closed' and stripe_invoice_item_id is null and resolved_at is null)
    or (state = 'submitted' and submitted_at is not null and stripe_invoice_item_id is null)
    or (state = 'charged' and stripe_invoice_item_id is not null and resolved_at is not null)
    or (state = 'indeterminate' and submitted_at is not null and last_error is not null)
    or (state = 'failed' and resolved_at is not null and last_error is not null)
    or (state = 'nothing_owed' and chargeable_cents = 0 and resolved_at is not null)
  )
);

create index if not exists workspace_overage_settlements_work_idx
  on public.workspace_overage_settlements (state, closed_at)
  where state in ('closed', 'indeterminate');

create index if not exists workspace_overage_settlements_account_idx
  on public.workspace_overage_settlements (account_id, period_start desc);

alter table public.workspace_overage_settlements enable row level security;

-- An owner may read what they were charged and nothing else. Every write is
-- service-role, because a settlement a contractor could edit is not evidence.
drop policy if exists workspace_overage_settlements_read on public.workspace_overage_settlements;
create policy workspace_overage_settlements_read on public.workspace_overage_settlements
  for select to authenticated
  using ((select public.is_owner(account_id)));

revoke all on table public.workspace_overage_settlements from public, anon, authenticated;
grant select on table public.workspace_overage_settlements to authenticated;

-- ---------------------------------------------------------------------------
-- Close a period
-- ---------------------------------------------------------------------------
create or replace function public.close_overage_period(
  p_account_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $close$
declare
  v_existing public.workspace_overage_settlements%rowtype;
  v_lines jsonb;
  v_total bigint := 0;
  v_cents bigint;
  v_residual bigint;
  v_cap bigint;
  v_row public.workspace_overage_settlements%rowtype;
begin
  if p_account_id is null or p_period_start is null or p_period_end is null
     or p_period_end <= p_period_start then
    raise exception 'overage settlement period is invalid' using errcode = '22023';
  end if;

  -- A period may only be closed once. Reporting the existing row rather than
  -- raising makes this safe to call from a sweep that overlaps itself.
  select * into v_existing
  from public.workspace_overage_settlements s
  where s.account_id = p_account_id and s.period_start = p_period_start
  for update;

  if found then
    return pg_catalog.to_jsonb(v_existing) || pg_catalog.jsonb_build_object('already_closed', true);
  end if;

  -- Lock every accrual for the period before reading it, so a charge cannot be
  -- computed while an overrun is still being written into the same rows.
  perform 1
  from public.workspace_overage_accruals a
  where a.account_id = p_account_id and a.period_start = p_period_start
  for update;

  select
    coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'resource_code', a.resource_code,
        'units', a.units,
        'millicents', a.millicents
      ) order by a.millicents desc, a.resource_code
    ), '[]'::jsonb),
    coalesce(pg_catalog.sum(a.millicents), 0)
    into v_lines, v_total
  from public.workspace_overage_accruals a
  where a.account_id = p_account_id
    and a.period_start = p_period_start
    and a.millicents > 0;

  -- Down, always. See the header.
  v_cents := v_total / 1000;
  v_residual := v_total - v_cents * 1000;

  select s.cap_cents into v_cap
  from public.workspace_overage_settings s
  where s.account_id = p_account_id;

  insert into public.workspace_overage_settlements (
    account_id, period_start, period_end, lines,
    total_millicents, chargeable_cents, residual_millicents,
    cap_cents_at_close, state, resolved_at
  ) values (
    p_account_id, p_period_start, p_period_end, v_lines,
    v_total, v_cents, v_residual,
    v_cap,
    -- Nothing owed is a terminal state on arrival. A period where the accruals
    -- rounded to zero cents must not sit in a work queue for ever waiting for a
    -- Stripe call that would be for $0.00.
    case when v_cents = 0 then 'nothing_owed' else 'closed' end,
    case when v_cents = 0 then pg_catalog.now() else null end
  )
  returning * into v_row;

  return pg_catalog.to_jsonb(v_row) || pg_catalog.jsonb_build_object('already_closed', false);
end;
$close$;

-- ---------------------------------------------------------------------------
-- The operation states
-- ---------------------------------------------------------------------------
create or replace function public.claim_overage_settlement(
  p_settlement_id uuid,
  p_stripe_idempotency_key text,
  p_livemode boolean,
  p_stripe_customer_id text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $claim$
declare
  v_row public.workspace_overage_settlements%rowtype;
  v_token uuid := pg_catalog.gen_random_uuid();
begin
  select * into v_row
  from public.workspace_overage_settlements s
  where s.id = p_settlement_id
  for update;

  if not found then
    raise exception 'overage settlement not found' using errcode = 'P0002';
  end if;
  -- `indeterminate` is claimable again on purpose: Stripe may or may not have
  -- created the item, and the idempotency key is what makes asking again safe.
  if v_row.state not in ('closed', 'indeterminate') then
    raise exception 'overage settlement is not claimable in state %', v_row.state
      using errcode = '55000';
  end if;

  update public.workspace_overage_settlements s
     set state = 'submitted',
         claim_token = v_token,
         lease_expires_at = pg_catalog.now() + interval '5 minutes',
         submitted_at = pg_catalog.now(),
         stripe_idempotency_key = p_stripe_idempotency_key,
         livemode = p_livemode,
         stripe_customer_id = p_stripe_customer_id,
         attempt_count = s.attempt_count + 1,
         last_error = null
   where s.id = p_settlement_id;

  return v_token;
end;
$claim$;

create or replace function public.complete_overage_settlement(
  p_settlement_id uuid,
  p_claim_token uuid,
  p_invoice_item_id text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $done$
declare
  v_row public.workspace_overage_settlements%rowtype;
begin
  select * into v_row from public.workspace_overage_settlements s
  where s.id = p_settlement_id for update;

  if not found or v_row.claim_token is distinct from p_claim_token
     or v_row.state not in ('submitted', 'indeterminate') then
    raise exception 'overage settlement claim is not owned' using errcode = '55000';
  end if;

  update public.workspace_overage_settlements s
     set state = 'charged',
         stripe_invoice_item_id = p_invoice_item_id,
         resolved_at = pg_catalog.now(),
         claim_token = null,
         lease_expires_at = null,
         last_error = null
   where s.id = p_settlement_id;
  return true;
end;
$done$;

create or replace function public.fail_overage_settlement(
  p_settlement_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_indeterminate boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fail$
declare
  v_row public.workspace_overage_settlements%rowtype;
begin
  if p_error_code is null or p_error_code !~ '^[a-z][a-z0-9_]{2,63}$' then
    raise exception 'overage settlement error code is invalid' using errcode = '22023';
  end if;

  select * into v_row from public.workspace_overage_settlements s
  where s.id = p_settlement_id for update;

  if not found or v_row.claim_token is distinct from p_claim_token then
    raise exception 'overage settlement claim is not owned' using errcode = '55000';
  end if;

  -- INDETERMINATE KEEPS THE CLAIM. Stripe was asked and the answer never
  -- arrived, so an item may exist; the next attempt reuses the same idempotency
  -- key rather than creating a second one.
  if p_indeterminate then
    update public.workspace_overage_settlements s
       set state = 'indeterminate', last_error = p_error_code
     where s.id = p_settlement_id;
    return true;
  end if;

  update public.workspace_overage_settlements s
     set state = 'failed',
         resolved_at = pg_catalog.now(),
         claim_token = null,
         lease_expires_at = null,
         last_error = p_error_code
   where s.id = p_settlement_id;
  return true;
end;
$fail$;

revoke all on function public.close_overage_period(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.claim_overage_settlement(uuid, text, boolean, text)
  from public, anon, authenticated;
revoke all on function public.complete_overage_settlement(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.fail_overage_settlement(uuid, uuid, text, boolean)
  from public, anon, authenticated;

grant execute on function public.close_overage_period(uuid, timestamptz, timestamptz) to service_role;
grant execute on function public.claim_overage_settlement(uuid, text, boolean, text) to service_role;
grant execute on function public.complete_overage_settlement(uuid, uuid, text) to service_role;
grant execute on function public.fail_overage_settlement(uuid, uuid, text, boolean) to service_role;

do $post$
declare
  v_bad text;
begin
  if not exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'workspace_overage_settlements' and c.relrowsecurity
  ) then
    raise exception 'row level security is not enabled on workspace_overage_settlements';
  end if;

  -- A settlement a contractor could edit is not evidence of anything.
  select pg_catalog.string_agg(distinct g.who || ':' || g.priv, ', ') into v_bad
  from (
    select pg_catalog.pg_get_userbyid(x.grantee) as who, x.privilege_type as priv
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, '{}'::aclitem[])) x
    where n.nspname = 'public' and c.relname = 'workspace_overage_settlements'
  ) g
  where g.who in ('anon', 'authenticated', 'public') and g.priv <> 'SELECT';

  if v_bad is not null then
    raise exception 'workspace_overage_settlements is writable by: %', v_bad;
  end if;
end $post$;

commit;
