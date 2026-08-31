-- Revoke anonymous access and enforce authorization on information oracle functions
-- 1. job_account_id(uuid)
-- 2. voice_transcript_retention_interval(uuid)

begin;

-- Harden job_account_id: prevent anonymous caller information oracle
create or replace function public.job_account_id(j uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  v_account_id uuid;
begin
  select account_id into v_account_id from public.jobs where id = j;
  if v_account_id is null then
    return null;
  end if;

  -- Ensure authenticated callers only resolve account_id if they are the owner or crew on the job
  if auth.role() = 'authenticated' then
    if not (public.is_owner(v_account_id) or public.crew_on_job(j)) then
      return null;
    end if;
  elsif auth.role() = 'anon' then
    return null;
  end if;

  return v_account_id;
end;
$$;

revoke execute on function public.job_account_id(uuid) from public, anon;
grant execute on function public.job_account_id(uuid) to authenticated, service_role;

-- Harden voice_transcript_retention_interval: prevent anonymous caller information oracle
create or replace function public.voice_transcript_retention_interval(
  p_account_id uuid
)
returns interval
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_days integer;
begin
  -- Block anonymous execution oracle
  if auth.role() = 'anon' then
    return pg_catalog.make_interval(days => 30);
  end if;

  select public.voice_history_retention_days(w.feature_limits)
    into v_days
    from public.workspace_entitlements w
   where w.account_id = p_account_id;

  return pg_catalog.make_interval(days => coalesce(v_days, 30));
end;
$$;

revoke execute on function public.voice_transcript_retention_interval(uuid) from public, anon;
grant execute on function public.voice_transcript_retention_interval(uuid) to authenticated, service_role;

commit;
