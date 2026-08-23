-- Let a lapsed capacity subscription stop granting capacity.
--
-- WHY. 20260819010000 made a paid purchase write a row, and both crew seat gates
-- and the storage limit read it. Nothing has ever moved that row afterwards, so
-- a workspace that cancels keeps its seats and its 100 GB for ever. That is the
-- second of the two reasons every recurring-capacity SKU is withheld, and this
-- is the half that closes it.
--
-- RECONCILED, NOT EVENT-DRIVEN, and the reason is ordering. Stripe redelivers
-- and reorders; active <-> past_due is legal in both directions and the ledger
-- carries no provider sequence column to arbitrate with, so a late past_due
-- arriving after a recovery would silently downgrade a healthy row and no
-- constraint here would object. A sweep does not have that problem because it
-- asks Stripe for the CURRENT state rather than replaying a history: the last
-- writer is always the freshest read. The cost is that a cancellation is
-- honoured within one sweep interval rather than instantly, which is the right
-- trade for a limit that only ever costs us money while it is stale.
--
-- STRIPE'S VOCABULARY STAYS OUT OF THE DATABASE. Stripe has nine subscription
-- statuses and this ledger has three. The mapping is a judgement -- unpaid is
-- grace, incomplete_expired is death -- and judgements belong where they can be
-- unit-tested and reviewed, not in a CHECK constraint. So this RPC accepts only
-- 'active', 'past_due' and 'canceled', and lib/billing/capacity-lifecycle maps
-- to them. A status it does not recognise is never guessed at: the caller
-- reports it and leaves the row alone.

begin;

-- Apply a provider status to one capacity row.
--
-- Returns what it did rather than raising, because every one of these outcomes
-- is normal during a sweep and none of them is an error an operator should be
-- paged for.
create or replace function public.apply_purchased_capacity_provider_state(
  p_livemode boolean,
  p_stripe_subscription_id text,
  p_status text,
  p_current_period_end timestamptz default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_row public.workspace_purchased_capacity%rowtype;
begin
  if p_livemode is null
     or p_stripe_subscription_id is null
     or p_status is null
     or p_status not in ('active', 'past_due', 'canceled') then
    raise exception 'purchased capacity provider state input is invalid'
      using errcode = '22023';
  end if;

  select c.* into v_row
    from public.workspace_purchased_capacity c
   where c.livemode = p_livemode
     and c.stripe_subscription_id = p_stripe_subscription_id
   for update;

  if not found then
    return 'not_found';
  end if;

  -- SERIALISE WITH THE SEAT GATES. create_crew_member_with_seat_entitlement and
  -- its reactivate twin take this row FOR UPDATE and then read
  -- workspace_purchased_capacity_units inside the same transaction, trusting the
  -- number to hold. Taking the same lock here means a cancellation cannot land
  -- between a gate's read and its insert and let a roster past a limit that had
  -- already dropped. Taken AFTER the capacity row so both callers acquire in one
  -- order and cannot deadlock.
  perform 1
    from public.workspace_entitlements e
   where e.account_id = v_row.account_id
   for update;

  -- Terminal. A resumed subscription is a NEW subscription with a new id and
  -- gets its own row, so there is nothing here to revive and nothing to correct.
  if v_row.status = 'canceled' then
    return 'already_canceled';
  end if;

  if v_row.status = p_status then
    -- A legal self-edge: the trigger only inspects status when it actually
    -- changes. Refresh the period, which is the one fact that moves on every
    -- renewal, and report that the status itself did not.
    update public.workspace_purchased_capacity c
       set current_period_end = coalesce(p_current_period_end, c.current_period_end)
     where c.id = v_row.id;
    return 'unchanged';
  end if;

  if p_status = 'canceled' then
    -- status and canceled_at MUST move in one statement: the shape check is a
    -- plain per-statement CHECK, so setting status first and the timestamp
    -- second fails on the first write.
    --
    -- coalesce, so a second sweep that sees the same cancellation does not
    -- rewrite when it happened. canceled_at is not in the immutable set, which
    -- means nothing but this would stop it drifting forward for ever.
    update public.workspace_purchased_capacity c
       set status = 'canceled',
           canceled_at = coalesce(c.canceled_at, pg_catalog.now()),
           current_period_end = coalesce(p_current_period_end, c.current_period_end)
     where c.id = v_row.id;
    return 'canceled';
  end if;

  -- The remaining edges are active <-> past_due. canceled_at stays null on both
  -- sides, which the shape check requires and which is already true here because
  -- a canceled row returned above.
  update public.workspace_purchased_capacity c
     set status = p_status,
         current_period_end = coalesce(p_current_period_end, c.current_period_end)
   where c.id = v_row.id;
  return p_status;
end;
$fn$;

comment on function public.apply_purchased_capacity_provider_state(boolean, text, text, timestamptz) is
  'Applies a mapped provider status to one purchased-capacity row. Accepts only active/past_due/canceled; canceled is terminal and idempotent. Returns what it did.';

-- What the sweep reads: every row whose subscription still needs checking.
--
-- Canceled rows are excluded because they are terminal -- re-reading them from
-- Stripe for ever would be provider egress that can never change an answer.
create or replace function public.purchased_capacity_pending_reconciliation(
  p_livemode boolean,
  p_limit integer default 100
)
returns table (
  stripe_subscription_id text,
  account_id uuid,
  status text,
  current_period_end timestamptz
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select c.stripe_subscription_id, c.account_id, c.status, c.current_period_end
    from public.workspace_purchased_capacity c
   where c.livemode = p_livemode
     and c.status <> 'canceled'
   -- Oldest first so a bounded batch cannot starve the same tail for ever.
   order by c.updated_at asc
   limit greatest(1, least(coalesce(p_limit, 100), 500));
$fn$;

comment on function public.purchased_capacity_pending_reconciliation(boolean, integer) is
  'Capacity rows whose Stripe subscription still needs a status read. Excludes canceled, which is terminal.';

revoke all on function public.apply_purchased_capacity_provider_state(boolean, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.purchased_capacity_pending_reconciliation(boolean, integer)
  from public, anon, authenticated;
grant execute on function public.apply_purchased_capacity_provider_state(boolean, text, text, timestamptz)
  to service_role;
grant execute on function public.purchased_capacity_pending_reconciliation(boolean, integer)
  to service_role;

commit;
