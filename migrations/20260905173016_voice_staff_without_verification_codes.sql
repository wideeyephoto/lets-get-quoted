-- AI Voice uses the registered staff phone and current role permissions.
-- Remove the SMS challenge requirement while preserving the same-call lock,
-- live admission, completed-call guard, and private mutation implementation.
-- The historical helper name is retained to avoid altering its grants or logic.

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

  return public.apply_voice_contractor_action_after_step_up(
    p_account_id,
    p_provider_call_id,
    p_caller_number,
    p_function_name,
    p_target_job_id,
    p_target_lead_id,
    p_payload
  );
end;
$fn$;

revoke all on function public.apply_voice_contractor_action(uuid,text,text,text,uuid,uuid,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_voice_contractor_action(uuid,text,text,text,uuid,uuid,jsonb)
  to service_role;
revoke all on function public.apply_voice_contractor_action_after_step_up(uuid,text,text,text,uuid,uuid,jsonb)
  from public, anon, authenticated, service_role;
