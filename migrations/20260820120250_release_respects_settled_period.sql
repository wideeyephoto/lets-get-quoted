-- A settled period's accruals are frozen.
--
-- THE INTERACTION. close_overage_period takes a snapshot of the accrual rows
-- and freezes it: that snapshot, not the live rows, is what an invoice is built
-- from. release_usage_overage decrements those same live rows. Nothing stopped
-- it doing so after the snapshot was taken.
--
-- The window is small and real. A call admitted at 23:58 that fails at 00:02
-- releases into a period that closed in between. The customer is billed the
-- snapshot amount either way -- that is what a frozen snapshot means -- but the
-- accrual table now says something different from the settlement that came from
-- it, and no one reconciling the two later can tell which is right.
--
-- So the release refuses, loudly, instead of silently rewriting the inputs to a
-- charge that has already been decided. The charge stands, the event stays open
-- as evidence that it should not have, and the error names the reason so a
-- human can issue the credit that only a human can decide on.
--
-- REFUSING ON EVERY SETTLEMENT STATE, not just the ones that reached Stripe. A
-- snapshot in 'closed' is already fixed and will be billed from as it stands; a
-- 'failed' or 'nothing_owed' one bills nothing but is still the frozen record of
-- what that period held. One rule -- a settled period does not move -- is worth
-- more than four rules about which states are safe.
--
-- Nothing calls close_overage_period yet. This lands before the invoicer rather
-- than after it, because the alternative is finding it during a month-end.

begin;

create or replace function public.release_usage_overage(
  p_account_id uuid,
  p_idempotency_key text
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_event public.workspace_overage_accrual_events%rowtype;
  v_settled boolean;
begin
  if p_account_id is null or p_idempotency_key is null then
    return 0;
  end if;

  -- Read the event before claiming it: the period to check is on the event, and
  -- claiming first would mark released something this may refuse to release.
  select * into v_event
    from public.workspace_overage_accrual_events e
   where e.account_id = p_account_id
     and e.idempotency_key = p_idempotency_key
     and e.released_at is null
   for update;

  if not found then
    return 0;
  end if;

  select exists (
    select 1
      from public.workspace_overage_settlements s
     where s.account_id = p_account_id
       and s.period_start = v_event.period_start
  ) into v_settled;

  if v_settled then
    -- Not a return of 0. Zero already means "no open event", and these two want
    -- different answers from a human: one is a duplicate release, the other is
    -- money owed back that this function is not allowed to give.
    raise exception 'overage period has already been settled; release refused'
      using errcode = '55000';
  end if;

  update public.workspace_overage_accrual_events e
     set released_at = pg_catalog.now()
   where e.account_id = p_account_id
     and e.idempotency_key = p_idempotency_key;

  update public.workspace_overage_accruals a
     set units = greatest(a.units - v_event.units, 0),
         millicents = greatest(a.millicents - v_event.millicents, 0),
         updated_at = pg_catalog.now()
   where a.account_id = p_account_id
     and a.period_start = v_event.period_start
     and a.resource_code = v_event.resource_code;

  return v_event.millicents;
end
$fn$;

revoke all on function public.release_usage_overage(uuid, text)
  from public, anon, authenticated;
grant execute on function public.release_usage_overage(uuid, text) to service_role;

do $post$
declare
  v_count integer;
  v_source text;
begin
  select count(*) into v_count from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'release_usage_overage';
  if v_count <> 1 then
    raise exception 'expected exactly one release_usage_overage, found %', v_count;
  end if;

  -- The guard has to be IN the function, not merely intended. Asserting the
  -- table is named in the body is what catches a replace that lost it.
  select p.prosrc into v_source from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'release_usage_overage';
  if v_source is null then
    raise exception 'release_usage_overage has no body to check';
  end if;
  if position('workspace_overage_settlements' in v_source) = 0 then
    raise exception 'release_usage_overage does not check for a settled period';
  end if;

  if to_regclass('public.workspace_overage_settlements') is null then
    raise exception 'workspace_overage_settlements is missing; apply 20260819260000 first';
  end if;
end
$post$;

commit;
