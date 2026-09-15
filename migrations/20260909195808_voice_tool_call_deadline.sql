-- New actions expire at the admitted allowance, including the provider's
-- two-second hangup margin. Legacy rows without a policy snapshot are bounded
-- to ten minutes, never the retired sixty-minute window.
-- Read-only recovery of an already committed outcome retains its existing
-- identity/terminal checks and does not authorize another mutation.
begin;

create or replace function public.authorize_voice_tool_invocation(
  p_account_id uuid, p_call_id text, p_caller text
) returns boolean language plpgsql
set search_path = pg_catalog, public
as $fn$
begin
  update public.voice_call_admissions a set tool_invocations = a.tool_invocations + 1
   where a.account_id = p_account_id and a.provider = 'signalwire'
     and a.provider_call_id = p_call_id
     and a.caller_number is not distinct from p_caller
     and a.admission_state = 'admitted' and a.provider_terminal_at is null
     and a.admitted_at <= pg_catalog.clock_timestamp()
     and coalesce(a.allowed_minutes, 10) between 1 and 10
     and a.admitted_at + pg_catalog.make_interval(
       secs => coalesce(a.allowed_minutes, 10) * 60 - 2
     ) > pg_catalog.clock_timestamp()
     and a.tool_invocations < 100
     and not exists (select 1 from public.voice_events e
       where e.provider = a.provider and e.provider_call_id = a.provider_call_id);
  return found;
end
$fn$;

CREATE OR REPLACE FUNCTION public.apply_voice_contractor_action(p_account_id uuid, p_provider_call_id text, p_caller_number text, p_function_name text, p_target_job_id uuid, p_target_lead_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
 SET "TimeZone" TO 'UTC'
AS $function$
declare
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
     and not exists (
       select 1 from public.voice_events e
        where e.provider = a.provider
          and e.provider_call_id = a.provider_call_id
     )
   for share;
  -- Check time after acquiring the admission lock; waiting cannot extend a call.
  if not found
     or v_admission.admitted_at > pg_catalog.clock_timestamp()
     or coalesce(v_admission.allowed_minutes, 10) not between 1 and 10
     or v_admission.admitted_at + pg_catalog.make_interval(
       secs => coalesce(v_admission.allowed_minutes, 10) * 60 - 2
     ) <= pg_catalog.clock_timestamp() then
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
$function$;

revoke all on function public.authorize_voice_tool_invocation(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.authorize_voice_tool_invocation(uuid,text,text)
  to service_role;
revoke all on function public.apply_voice_contractor_action(uuid,text,text,text,uuid,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_voice_contractor_action(uuid,text,text,text,uuid,uuid,jsonb)
  to service_role;

commit;

