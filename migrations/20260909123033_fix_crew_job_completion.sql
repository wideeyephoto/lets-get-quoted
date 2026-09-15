-- Restore the original field-app status contract after the security-advisor
-- migration added a write to jobs.completed_at, which is not a jobs column.
-- This changes one RPC and its anonymous grant; it does not backfill job data.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.crew_set_job_status(j uuid, new_status text)
returns table (id uuid, status text, started_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare current_status text;
begin
  if new_status is null or new_status not in ('in_progress', 'complete') then
    raise exception 'unsupported status %', new_status using errcode = 'check_violation';
  end if;
  if not crew_on_job(j) then
    raise exception 'you are not assigned to this job' using errcode = 'insufficient_privilege';
  end if;

  select jobs.status into current_status from jobs where jobs.id = j;
  if current_status is null then
    raise exception 'job not found' using errcode = 'no_data_found';
  end if;
  if current_status = 'archived' then
    raise exception 'that job has been archived' using errcode = 'check_violation';
  end if;

  perform set_config('app.crew_job_write', 'on', true);

  return query
    update jobs
       set status = new_status::public.job_status,
           started_at = coalesce(jobs.started_at, now())
     where jobs.id = j
    returning jobs.id, jobs.status::text, jobs.started_at;
end;
$$;

-- Supabase's schema defaults may grant anon separately from PUBLIC.
revoke all on function public.crew_set_job_status(uuid, text) from public;
revoke all on function public.crew_set_job_status(uuid, text) from anon;
grant execute on function public.crew_set_job_status(uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;
