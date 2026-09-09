-- Overage settlement reaper and starvation-prevention candidate scan.
--
-- Bug 1a & 1b: reap_overage_settlement_leases() moves expired-lease 'submitted' rows
-- to 'indeterminate' with last_error = 'lease_expired'. Stamping last_error satisfies
-- workspace_overage_settlements_state_shape_check. Retains claim_token,
-- stripe_idempotency_key and submitted_at matching fail_overage_settlement indeterminate contract.
-- Supported by partial index on (state, lease_expires_at) where state = 'submitted'.
--
-- Bug 2a & 2b: list_unclosed_overage_periods(p_limit) returns unclosed periods by
-- anti-joining workspace_overage_accruals against workspace_overage_settlements on
-- (account_id, period_start). This prevents period-close starvation when >100 already-closed
-- accruals exist. Supported by index on workspace_overage_accruals (period_end).

begin;

-- 1. Reaper for expired submitted leases
create or replace function public.reap_overage_settlement_leases(
  p_limit integer default 50
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $reap$
declare
  v_count integer;
begin
  with expired as (
    select id
    from public.workspace_overage_settlements
    where state = 'submitted'
      and lease_expires_at <= pg_catalog.now()
    order by lease_expires_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 500))
  ),
  updated as (
    update public.workspace_overage_settlements s
       set state = 'indeterminate',
           last_error = 'lease_expired',
           updated_at = pg_catalog.now()
      from expired
     where s.id = expired.id
    returning s.id
  )
  select count(*) into v_count from updated;

  return coalesce(v_count, 0);
end;
$reap$;

-- 2. Partial index supporting the reaper
create index if not exists workspace_overage_settlements_reaper_idx
  on public.workspace_overage_settlements (state, lease_expires_at)
  where state = 'submitted';

-- 3. Anti-join candidate reader for period-close
create or replace function public.list_unclosed_overage_periods(
  p_limit integer default 100
)
returns table (
  account_id uuid,
  period_start timestamptz,
  period_end timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $unclosed$
begin
  return query
  select distinct
    a.account_id,
    a.period_start,
    a.period_end
  from public.workspace_overage_accruals a
  where a.period_end <= pg_catalog.now()
    and not exists (
      select 1
      from public.workspace_overage_settlements s
      where s.account_id = a.account_id
        and s.period_start = a.period_start
    )
  order by a.period_end asc
  limit greatest(1, least(coalesce(p_limit, 100), 1000));
end;
$unclosed$;

-- 4. Index supporting the candidate scan
create index if not exists workspace_overage_accruals_period_end_idx
  on public.workspace_overage_accruals (period_end);

-- 5. Revoke from client roles and grant strictly to service_role
revoke all on function public.reap_overage_settlement_leases(integer)
  from public, anon, authenticated;
revoke all on function public.list_unclosed_overage_periods(integer)
  from public, anon, authenticated;

grant execute on function public.reap_overage_settlement_leases(integer) to service_role;
grant execute on function public.list_unclosed_overage_periods(integer) to service_role;

notify pgrst, 'reload schema';

commit;
