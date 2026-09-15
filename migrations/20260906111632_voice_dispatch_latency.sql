-- One bounded round trip, with uniqueness determined before LIMIT. References
-- use an account-scoped index; names/addresses stay server-side even on large accounts.
set local lock_timeout = '5s';
create or replace function public.voice_job_search_key(p_value text)
returns text language sql immutable parallel safe
set search_path = pg_catalog, pg_temp
as $fn$
  select btrim(regexp_replace(regexp_replace(
    regexp_replace(lower(regexp_replace(normalize(coalesce(p_value, ''), NFKD), U&'[\0300-\036f]', '', 'g')), '[^a-z0-9]+', ' ', 'g'),
    '\m(job|project|customer|client)\M', ' ', 'g'), '\s+', ' ', 'g'));
$fn$;

create index if not exists jobs_voice_account_ref_idx
  on public.jobs (account_id, public.voice_job_search_key(ref)) where deleted_at is null;

create or replace function public.search_voice_jobs(
  p_account_id uuid, p_query text, p_phone_candidates text[] default null
)
returns jsonb language plpgsql stable security invoker
set search_path = pg_catalog, pg_temp
set statement_timeout = '3s'
as $fn$
declare
  v_key text := public.voice_job_search_key(p_query);
  v_id uuid;
  v_result jsonb;
begin
  if p_account_id is null or length(coalesce(p_query, '')) > 500 then
    raise exception 'Invalid job search' using errcode = '22023';
  end if;
  if btrim(p_query) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_id := btrim(p_query)::uuid;
  end if;

  -- Fast reference/UUID branch. An empty exact UUID must never fall back to a name.
  with exact as (
    select j.id, j.ref, j.client_name, j.client_phone, j.address, left(j.scope, 4000) as scope,
           j.status, j.scheduled_for, j.scheduled_time, j.quoted_amount, j.created_at
      from public.jobs j
     where j.account_id = p_account_id and j.deleted_at is null
       and (p_phone_candidates is null or j.client_phone = any(p_phone_candidates))
       and ((v_id is not null and j.id = v_id)
         or (v_id is null and v_key <> '' and public.voice_job_search_key(j.ref) = v_key))
  ), limited as (select * from exact order by created_at desc, id desc limit 6)
  select jsonb_build_object('total_count', (select count(*) from exact),
    'jobs', coalesce((select jsonb_agg(to_jsonb(l) - 'created_at') from limited l), '[]'::jsonb)) into v_result;
  if v_id is not null or (v_result->>'total_count')::int > 0 then return v_result; end if;

  with candidates as (
    select j.id, j.ref, j.client_name, j.client_phone, j.address, left(j.scope, 4000) as scope,
           j.status, j.scheduled_for, j.scheduled_time, j.quoted_amount, j.created_at,
      case
        when p_query is null and j.status is distinct from 'complete' and j.status is distinct from 'archived' then 0
        when v_key ~ '^[0-9]+$' and public.voice_job_search_key(j.ref) like '% ' || v_key then 1
        when v_key <> '' and (public.voice_job_search_key(j.client_name) = v_key or public.voice_job_search_key(j.address) = v_key) then 2
        when length(v_key) >= 4 and (
          (public.voice_job_search_key(j.client_name) <> '' and (strpos(public.voice_job_search_key(j.client_name), v_key) > 0 or strpos(v_key, public.voice_job_search_key(j.client_name)) > 0))
          or (public.voice_job_search_key(j.address) <> '' and (strpos(public.voice_job_search_key(j.address), v_key) > 0 or strpos(v_key, public.voice_job_search_key(j.address)) > 0))
        ) then 3
      end as priority
      from public.jobs j
     where j.account_id = p_account_id and j.deleted_at is null
       and (p_phone_candidates is null or j.client_phone = any(p_phone_candidates))
  ), matches as (
    select * from candidates where priority = (select min(priority) from candidates)
  ), limited as (select * from matches order by created_at desc, id desc limit 6)
  select jsonb_build_object('total_count', (select count(*) from matches),
    'jobs', coalesce((select jsonb_agg(to_jsonb(l) - 'priority' - 'created_at') from limited l), '[]'::jsonb)) into v_result;
  return v_result;
end;
$fn$;

-- A failed transport response is not proof of rollback. This function can only
-- return a previously applied action for the exact admitted call and payload.
create or replace function public.get_voice_contractor_action_status(
  p_account_id uuid, p_provider_call_id text, p_caller_number text,
  p_function_name text, p_target_job_id uuid, p_target_lead_id uuid, p_payload jsonb
)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, pg_temp
set statement_timeout = '2s'
as $fn$
begin
  if not exists (
    select 1 from public.voice_call_admissions a
     where a.account_id = p_account_id and a.provider = 'signalwire'
       and a.provider_call_id = p_provider_call_id and a.caller_number = p_caller_number
       and a.caller_kind in ('owner', 'office', 'crew')
       and a.admission_state = 'admitted' and a.provider_terminal_at is null
       and a.admitted_at >= now() - interval '60 minutes'
       and not exists (select 1 from public.voice_events e
                        where e.provider = a.provider and e.provider_call_id = a.provider_call_id)
  ) then raise exception 'Same live admitted staff call required' using errcode = '42501'; end if;

  return (select t.outcome || jsonb_build_object('replayed', true)
    from public.voice_tool_actions t
   where t.account_id = p_account_id and t.provider = 'signalwire'
     and t.provider_call_id = p_provider_call_id and t.caller_number = p_caller_number
     and t.function_name = p_function_name and t.request_payload = p_payload
     and t.target_job_id is not distinct from p_target_job_id
     and (t.target_lead_id is not distinct from p_target_lead_id
       or (p_target_lead_id is null and p_function_name = 'create_or_update_lead' and p_payload->>'operation' = 'create'))
     and t.action_state = 'applied'
   order by t.created_at desc limit 1);
end;
$fn$;

revoke all on function public.voice_job_search_key(text) from public, anon, authenticated, service_role;
-- Pure string normalization reads no records. Index maintenance also runs on
-- ordinary dashboard writes, so those roles must be able to evaluate it.
grant execute on function public.voice_job_search_key(text) to anon, authenticated, service_role;
revoke all on function public.search_voice_jobs(uuid,text,text[]) from public, anon, authenticated, service_role;
grant execute on function public.search_voice_jobs(uuid,text,text[]) to service_role;
revoke all on function public.get_voice_contractor_action_status(uuid,text,text,text,uuid,uuid,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.get_voice_contractor_action_status(uuid,text,text,text,uuid,uuid,jsonb) to service_role;

-- Capture the saved fields in the same transaction, including for later replay.
create or replace function public.apply_voice_contractor_action(
  p_account_id uuid,
  p_provider_call_id text,
  p_caller_number text,
  p_function_name text,
  p_target_job_id uuid,
  p_target_lead_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_admission public.voice_call_admissions%rowtype;
  v_outcome jsonb;
  v_saved jsonb;
begin
  if p_account_id is null
     or p_provider_call_id is null
     or pg_catalog.length(pg_catalog.btrim(p_provider_call_id)) not between 1 and 255
     or p_caller_number is null
     or p_caller_number !~ '^\+1[2-9][0-9]{9}$' then
    raise exception 'Voice privileged action call identity is invalid'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_account_id::text || ':signalwire:' || p_provider_call_id,
      63190217
    )
  );

  select a.* into v_admission
    from public.voice_call_admissions a
   where a.account_id = p_account_id
     and a.provider = 'signalwire'
     and a.provider_call_id = p_provider_call_id
     and a.admission_state = 'admitted'
     and a.provider_terminal_at is null
     and a.caller_number = p_caller_number
     and a.caller_kind in ('owner', 'office', 'crew')
     and a.admitted_at >= v_now - interval '60 minutes'
     and not exists (
       select 1 from public.voice_events e
        where e.provider = a.provider
          and e.provider_call_id = a.provider_call_id
     )
   for share;
  if not found then
    raise exception 'voice privileged action requires the same live admitted staff call'
      using errcode = '42501';
  end if;

  v_outcome := public.apply_voice_contractor_action_after_step_up(
    p_account_id,
    p_provider_call_id,
    p_caller_number,
    p_function_name,
    p_target_job_id,
    p_target_lead_id,
    p_payload
  );
  if p_function_name in ('update_job_details', 'update_job_scope')
     and not coalesce((v_outcome->>'replayed')::boolean, false) then
    select jsonb_strip_nulls(jsonb_build_object(
      'scope_append', p_payload->>'scope_append',
      'status', case when p_payload ? 'status' then j.status::text end,
      'scheduled_date', case when p_payload ? 'scheduled_date' then j.scheduled_for::text end,
      'scheduled_time', case when p_payload ? 'scheduled_time' then j.scheduled_time::text end
    )) into v_saved from public.jobs j
     where j.account_id = p_account_id and j.id = p_target_job_id;
    v_outcome := v_outcome || jsonb_build_object('saved', v_saved);
    update public.voice_tool_actions set outcome = v_outcome
     where id = (v_outcome->>'action_id')::uuid and account_id = p_account_id
       and provider_call_id = p_provider_call_id and action_state = 'applied';
  end if;
  return v_outcome;
end;
$fn$;

revoke all on function public.apply_voice_contractor_action(uuid,text,text,text,uuid,uuid,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_voice_contractor_action(uuid,text,text,text,uuid,uuid,jsonb)
  to service_role;
revoke all on function public.apply_voice_contractor_action_after_step_up(uuid,text,text,text,uuid,uuid,jsonb)
  from public, anon, authenticated, service_role;
