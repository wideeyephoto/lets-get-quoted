-- ============================================================================
-- ENFORCE ACCOUNT SUSPENSION IN ROW LEVEL SECURITY PREDICATES
--
-- Security fix: Ensures active JWTs cannot query or mutate data for suspended
-- accounts directly via Supabase PostgREST / Data API.
--
-- Updates is_member, is_owner, is_crew, is_office, has_office_access,
-- crew_on_job, and crew_owns_crew_row to verify accounts.suspended_at is null.
-- ============================================================================

create or replace function public.is_member(acc uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    join public.accounts a on a.id = m.account_id
    where m.account_id = acc
      and m.user_id = auth.uid()
      and a.suspended_at is null
  );
$$;

create or replace function public.is_owner(acc uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    join public.accounts a on a.id = m.account_id
    where m.account_id = acc
      and m.user_id = auth.uid()
      and m.role = 'owner'
      and a.suspended_at is null
  );
$$;

create or replace function public.is_crew(acc uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    join public.accounts a on a.id = m.account_id
    where m.account_id = acc
      and m.user_id = auth.uid()
      and m.role = 'crew'
      and a.suspended_at is null
  );
$$;

create or replace function public.is_office(acc uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    join public.accounts a on a.id = m.account_id
    where m.account_id = acc
      and m.user_id = auth.uid()
      and m.role = 'office'
      and a.suspended_at is null
  );
$$;

create or replace function public.has_office_access(acc uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    join public.accounts a on a.id = m.account_id
    where m.account_id = acc
      and m.user_id = auth.uid()
      and m.role in ('owner', 'office')
      and a.suspended_at is null
  );
$$;

create or replace function public.crew_on_job(j uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.crew_assignments ca
    join public.crew c on c.id = ca.crew_id
    join public.jobs jb on jb.id = ca.job_id
    join public.accounts a on a.id = jb.account_id
    where ca.job_id = j
      and c.user_id = auth.uid()
      and a.suspended_at is null
  );
$$;

create or replace function public.crew_owns_crew_row(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.crew c
    join public.accounts a on a.id = c.account_id
    where c.id = cid
      and c.user_id = auth.uid()
      and a.suspended_at is null
  );
$$;

grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.is_owner(uuid) to authenticated;
grant execute on function public.is_crew(uuid) to authenticated;
grant execute on function public.is_office(uuid) to authenticated;
grant execute on function public.has_office_access(uuid) to authenticated;
grant execute on function public.crew_on_job(uuid) to authenticated;
grant execute on function public.crew_owns_crew_row(uuid) to authenticated;
