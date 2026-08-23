-- Give a workspace that has stored nothing a measurement of nothing.
--
-- WHY. 20260819000000 claims "a workspace with no row here has not been swept,
-- which is not the same as storing nothing" and the Plan & usage card says
-- "Storage has not been measured yet" on that basis. But the sweep only writes
-- rows for accounts that APPEAR in storage.objects, and a workspace that has
-- never uploaded a file produces no group, so it never gets a row -- and reads
-- as unmeasured for ever. Production showed it immediately: six accounts, four
-- measured. The two are not unswept, they are empty, and the card told them the
-- wrong thing.
--
-- So the invariant the original migration asserts is now actually true: after a
-- sweep, every account has a row, and a missing row really does mean the sweep
-- has not reached this workspace yet. That state still exists -- an account
-- created between sweeps has no row -- which is why the guard still fails open
-- on null and the card still has the wording for it.
--
-- WHY NOT COUNTED IN workspaces_measured. That number means "workspaces with
-- objects", it is what the worker summary and its tests already encode, and
-- changing its meaning to fold in a backfill that converges to zero after the
-- first sweep would make the metric less useful, not more. The seeding is
-- idempotent and self-limiting: once an account has a row it is never seeded
-- again.

begin;

create or replace function public.reconcile_workspace_storage_usage_v1()
returns table (
  workspaces_measured bigint,
  workspaces_zeroed bigint,
  bytes_total bigint
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_measured bigint := 0;
  v_zeroed bigint := 0;
  v_bytes bigint := 0;
begin
  -- now() is transaction_timestamp and therefore FIXED for this whole function.
  -- Both passes below depend on that: every row either pass touches ends up
  -- stamped with exactly this value, so anything still carrying an older stamp
  -- provably had no objects in this pass.
  with measured as (
    select
      (pg_catalog.split_part(o.name, '/', 1))::uuid as account_id,
      pg_catalog.sum(coalesce(nullif(o.metadata ->> 'size', '')::bigint, 0))::bigint as bytes_used,
      pg_catalog.count(*)::bigint as object_count
    from storage.objects o
    where o.bucket_id = any (public.workspace_storage_metered_buckets())
      and o.name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    group by 1
  ), owned as (
    select m.account_id, m.bytes_used, m.object_count
      from measured m
      join public.accounts a on a.id = m.account_id
  )
  insert into public.workspace_storage_usage (account_id, bytes_used, object_count, measured_at)
  select o.account_id, o.bytes_used, o.object_count, pg_catalog.now()
    from owned o
  on conflict (account_id) do update
    set bytes_used = excluded.bytes_used,
        object_count = excluded.object_count,
        measured_at = excluded.measured_at;

  get diagnostics v_measured = row_count;

  -- A workspace that has never uploaded anything. It is empty, not unmeasured,
  -- and saying so is the whole point of this revision. Stamped with the same
  -- now() as the pass above so the zeroing pass below cannot mistake a row it
  -- just created for a stale one.
  insert into public.workspace_storage_usage (account_id, bytes_used, object_count, measured_at)
  select a.id, 0, 0, pg_catalog.now()
    from public.accounts a
   where not exists (
     select 1 from public.workspace_storage_usage u where u.account_id = a.id
   )
  on conflict (account_id) do nothing;

  -- A workspace that deleted its last file stops appearing in storage.objects
  -- altogether. Without this it would keep reporting the last number it ever
  -- had, and would stay over its cap forever having actually emptied the bucket.
  update public.workspace_storage_usage u
     set bytes_used = 0,
         object_count = 0,
         measured_at = pg_catalog.now()
   where u.measured_at < pg_catalog.now();

  get diagnostics v_zeroed = row_count;

  select coalesce(pg_catalog.sum(u.bytes_used), 0)::bigint
    into v_bytes
    from public.workspace_storage_usage u;

  return query select v_measured, v_zeroed, v_bytes;
end;
$fn$;

comment on function public.reconcile_workspace_storage_usage_v1() is
  'Recomputes every workspace storage measurement from storage.objects in one pass. Seeds zero for accounts with no objects, and zeroes workspaces whose objects are all gone.';

do $verify$
begin
  if pg_catalog.pg_get_functiondef(
       'public.reconcile_workspace_storage_usage_v1()'::pg_catalog.regprocedure
     ) not like '%where not exists%' then
    raise exception 'storage sweep does not seed empty workspaces';
  end if;
end;
$verify$;

commit;
