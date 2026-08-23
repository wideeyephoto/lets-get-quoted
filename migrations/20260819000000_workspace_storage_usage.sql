-- Measure what a workspace is actually storing.
--
-- WHY THIS EXISTS. storage_gb has been a plan allowance since 20260815213142 --
-- Flex 5, Solo 10, Growth 100, Scale 250 -- and nothing has ever read it. No
-- upload path checks it, no surface shows it, and 20260818210000 binds
-- storage_100gb into the purchased-capacity ledger with no limit for it to
-- raise. That is precisely why the SKU is withheld: selling 100 GB while not one
-- byte is counted takes money for a number that means nothing.
--
-- WHERE THE BYTES COME FROM, AND WHY NOT FROM US. Supabase Storage already
-- keeps one row per object in storage.objects carrying its size in metadata,
-- and every bucket this app writes shares one path convention -- the account id
-- is the first segment, minted server-side in all seven upload paths. The ledger
-- therefore already exists and is already authoritative. The alternative, our
-- own row written at each of seven upload sites and removed at each of seven
-- delete sites, is fourteen places to forget; and it would miss entirely the one
-- upload that never touches our server, since site-videos is PUT straight to
-- Supabase from the browser under a signed URL because a video does not fit
-- through a server action's 4.5 MB body cap.
--
-- WHY A CACHE AND NOT A LIVE SUM. Counting is a grouped aggregate over every
-- object in the project. Run once for every workspace at a time it is one cheap
-- pass; run on every photo upload it is that same pass per upload. So the sweep
-- computes all workspaces together and writes the answer here, and the hot paths
-- -- the upload guard and the Plan & usage surface -- read one row by primary
-- key.
--
-- WHAT THAT COSTS, STATED PLAINLY. Usage is stale by up to one sweep interval,
-- so a workspace can finish a window above its cap. That is the right trade for
-- a storage cap, which is a billing boundary and not a security one. It would be
-- the wrong trade for anything that must never be exceeded.
--
-- NEVER MEASURED IS NOT ZERO. A workspace with no row here has not been swept,
-- which is not the same as storing nothing, and collapsing the two would be a
-- lie in both directions: the guard fails OPEN on a missing row rather than
-- blocking every upload in a workspace the sweep has not reached, and the
-- surface says "not measured yet" rather than drawing an empty bar.

begin;

-- `if not exists` throughout so a re-apply is a no-op, matching 20260818210000
-- rather than 20260818190000, which creates its table unguarded and fails a
-- second apply.
--
-- ON DELETE CASCADE, unlike the capacity ledger's RESTRICT. That ledger is
-- billing evidence and must outlive nothing; this table is a derived
-- measurement whose only meaning is the account it describes. When the account
-- goes there is nothing here worth keeping, and a RESTRICT would make this cache
-- the reason an account cannot be deleted.
create table if not exists public.workspace_storage_usage (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  bytes_used bigint not null check (bytes_used >= 0),
  object_count bigint not null check (object_count >= 0),
  measured_at timestamptz not null default pg_catalog.now()
);

alter table public.workspace_storage_usage enable row level security;

-- Unlike workspace_purchased_capacity, this one IS owner-readable. It is the
-- workspace's own number, shown to the workspace on its own Plan & usage page,
-- and carries no billing evidence -- no price, no subscription, no receipt.
drop policy if exists workspace_storage_usage_owner_read on public.workspace_storage_usage;
create policy workspace_storage_usage_owner_read
on public.workspace_storage_usage
for select
to authenticated
using ((select public.is_owner(account_id)));

comment on table public.workspace_storage_usage is
  'Per-workspace storage measurement, recomputed wholesale by reconcile_workspace_storage_usage_v1. A missing row means never swept, which is not zero.';

-- ONE LIST OF METERED BUCKETS, in the database and mirrored in
-- lib/billing/storage-usage.ts, where a test asserts the two agree. A bucket
-- missing from this list is storage the workspace is never charged for and never
-- warned about, so adding a bucket to the app has to be a deliberate decision
-- here rather than an omission nobody notices.
create or replace function public.workspace_storage_metered_buckets()
returns text[]
language sql
immutable
set search_path = ''
as $fn$
  select array[
    'job-photos',
    'lead-photos',
    'crew-photos',
    'insurance-proof',
    'site-images',
    'site-videos',
    'account-attachments'
  ]::text[];
$fn$;

comment on function public.workspace_storage_metered_buckets() is
  'Buckets counted against a workspace storage allowance. Mirrored in lib/billing/storage-usage.ts.';

-- The sweep. Recomputes every workspace from storage.objects in one pass.
--
-- SECURITY DEFINER because storage.objects belongs to the storage schema and is
-- not readable by service_role directly. Reading it here, behind a function that
-- takes no arguments and returns only aggregates, exposes no object name or
-- path to the caller.
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
  -- The zeroing pass below depends on that: every row this insert touches ends
  -- up stamped with exactly this value, so anything still carrying an older
  -- stamp provably had no objects in this pass.
  with measured as (
    select
      (pg_catalog.split_part(o.name, '/', 1))::uuid as account_id,
      -- nullif before the cast: an object written by a path that recorded no
      -- size leaves an empty string here, and ''::bigint is an error, not a
      -- zero. Bare nullif and coalesce on purpose -- both are grammar
      -- constructs, so pg_catalog.nullif(...) does not exist and would fail at
      -- runtime rather than at parse time.
      pg_catalog.sum(coalesce(nullif(o.metadata ->> 'size', '')::bigint, 0))::bigint as bytes_used,
      pg_catalog.count(*)::bigint as object_count
    from storage.objects o
    where o.bucket_id = any (public.workspace_storage_metered_buckets())
      -- Guards the uuid cast above. An object whose first segment is not a uuid
      -- was not written by any path in this app, and casting it would abort the
      -- entire sweep for every workspace rather than skip one stray file.
      and o.name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    group by 1
  ), owned as (
    -- An object under a folder that is a well-formed uuid but not an account --
    -- a deleted workspace whose files outlived it -- is counted against nobody.
    -- The FK would refuse it anyway; joining here makes that a skip rather than
    -- a failed sweep.
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
  'Recomputes every workspace storage measurement from storage.objects in one pass. Zeroes workspaces whose objects are all gone.';

-- What the workspace is allowed, in bytes: the plan allowance plus everything it
-- has bought, exactly as the crew seat gate does it.
--
-- The purchased sum is ADDED HERE and never merged into feature_limits, which
-- the subscription projector recomputes wholesale from the plan and would erase
-- on the next subscription event. Same reasoning as 20260818220000.
--
-- NULL, NOT ZERO, when the workspace has no entitlement row. A missing
-- entitlement is an unknown limit; returning 0 would mean "allowed nothing" and
-- would block every upload in a workspace that has simply not been provisioned.
--
-- 1 GB = 1073741824 bytes. The binary reading, deliberately: it is the larger
-- of the two, so a workspace that bought 100 GB is never cut off before the
-- number it was sold, and it is what the file managers a contractor uses report.
create or replace function public.workspace_storage_limit_bytes(p_account_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $fn$
  select (
    case
      when pg_catalog.jsonb_typeof(e.feature_limits -> 'storage_gb') = 'number'
        -- floor, not round: never grant more than the catalog published.
        then pg_catalog.floor((e.feature_limits ->> 'storage_gb')::numeric)::bigint
      else 0
    end
    + public.workspace_purchased_capacity_units(p_account_id, 'storage_gb')
  ) * 1073741824::bigint
  from public.workspace_entitlements e
  where e.account_id = p_account_id;
$fn$;

comment on function public.workspace_storage_limit_bytes(uuid) is
  'Plan storage allowance plus purchased storage capacity, in bytes. NULL when the workspace has no entitlement row, which is an unknown limit and not a zero one.';

-- One round trip for the two hot callers: the upload guard, which needs both
-- numbers before it can allow a byte, and the Plan & usage surface, which draws
-- both. Splitting them would be two round trips for one decision.
--
-- LEFT JOIN from a one-row scalar so this ALWAYS returns exactly one row. A
-- workspace the sweep has not reached must come back as a null measurement with
-- a real limit, not as an empty result the caller has to interpret.
create or replace function public.workspace_storage_state_v1(p_account_id uuid)
returns table (
  bytes_used bigint,
  object_count bigint,
  measured_at timestamptz,
  limit_bytes bigint
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    u.bytes_used,
    u.object_count,
    u.measured_at,
    public.workspace_storage_limit_bytes(p_account_id)
  from (select p_account_id as account_id) k
  left join public.workspace_storage_usage u on u.account_id = k.account_id;
$fn$;

comment on function public.workspace_storage_state_v1(uuid) is
  'Measured usage and effective limit for one workspace, in one row. Null bytes_used means never swept.';

-- Service-role only, all four. These read across every workspace or take an
-- account id as an argument, so an authenticated caller holding one could read
-- another workspace's numbers. Owners reach their own row through the RLS policy
-- on the table above.
revoke all on function public.workspace_storage_metered_buckets()
  from public, anon, authenticated;
revoke all on function public.reconcile_workspace_storage_usage_v1()
  from public, anon, authenticated;
revoke all on function public.workspace_storage_limit_bytes(uuid)
  from public, anon, authenticated;
revoke all on function public.workspace_storage_state_v1(uuid)
  from public, anon, authenticated;

grant execute on function public.workspace_storage_metered_buckets() to service_role;
grant execute on function public.reconcile_workspace_storage_usage_v1() to service_role;
grant execute on function public.workspace_storage_limit_bytes(uuid) to service_role;
grant execute on function public.workspace_storage_state_v1(uuid) to service_role;

revoke all on table public.workspace_storage_usage from public, anon, authenticated, service_role;
grant select on table public.workspace_storage_usage to authenticated;
grant select, insert, update on table public.workspace_storage_usage to service_role;

commit;
