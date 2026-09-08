-- Keep the provider duration independent of the customer's credit hold.
-- Additive rollout: install before the application. Legacy admissions retain
-- their historical limit; never backfill an unknown mode from today's flags.
begin;

alter table public.voice_call_admissions
  add column allowed_minutes integer,
  add column minute_mode text,
  add column unmetered_reason text,
  add constraint voice_admission_duration_policy_check check (
    (allowed_minutes is null and minute_mode is null and unmetered_reason is null)
    or (allowed_minutes is not null and allowed_minutes between 1 and 10
        and minute_mode is not null and minute_mode in ('off', 'measure', 'enforce')
        and reserved_minutes <= allowed_minutes)
  );

comment on column public.voice_call_admissions.allowed_minutes is
  'Provider duration chosen at admission, independent of reserved credit in measurement mode. Null means a legacy admission.';
comment on column public.voice_call_admissions.minute_mode is
  'Metering policy captured at admission; flag changes do not change an in-flight call.';

alter table public.voice_calls
  add column measured_minutes bigint,
  add column absorbed_minutes bigint,
  add column absorption_reason text,
  add constraint voice_calls_absorbed_usage_check check (
    (measured_minutes is null or measured_minutes >= 0)
    and (absorbed_minutes is null or (
      measured_minutes is not null and absorbed_minutes >= 0
      and measured_minutes = coalesce(billed_minutes, 0) + absorbed_minutes
    ))
    and (
      (coalesce(absorbed_minutes, 0) = 0 and absorption_reason is null)
      or (absorbed_minutes is not null and absorbed_minutes > 0 and absorption_reason is not null
          and length(btrim(absorption_reason)) > 0)
    )
  );

comment on column public.voice_calls.measured_minutes is
  'Full rounded AI-connected duration from the receipt, before admission/credit caps. Null means not measured.';
comment on column public.voice_calls.absorbed_minutes is
  'Measured minutes not debited to the customer. Null means unresolved or legacy accounting, never assume zero.';

-- Keep the original finalizer and its tombstone/locking behavior for old app
-- instances and rollback. The snapshot and finalization commit together.
create or replace function public.finalize_voice_call_admission_v2(
  p_admission_id uuid,
  p_account_id uuid,
  p_provider_call_id text,
  p_reservation_id uuid,
  p_reserved_minutes integer,
  p_overage_key text,
  p_allowed_minutes integer,
  p_minute_mode text,
  p_unmetered_reason text
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
begin
  if p_allowed_minutes is null or p_allowed_minutes not between 1 and 10
     or p_minute_mode is null or p_minute_mode not in ('off', 'measure', 'enforce')
     or p_reserved_minutes is null or p_reserved_minutes not between 0 and p_allowed_minutes
     or (p_minute_mode = 'enforce' and (
       p_reserved_minutes <> p_allowed_minutes or p_unmetered_reason is not null))
     or (p_overage_key is not null and p_minute_mode <> 'enforce')
     or (p_minute_mode = 'off' and (
       p_reserved_minutes <> 0 or p_unmetered_reason is distinct from 'not_metered'))
     or (p_minute_mode = 'measure' and p_reserved_minutes = 0 and (
       p_unmetered_reason is null
       or p_unmetered_reason not in ('ledger_unavailable', 'exhausted_not_enforced')))
     or (p_reserved_minutes > 0 and p_unmetered_reason is not null) then
    raise exception 'voice admission duration policy is invalid' using errcode = '22023';
  end if;

  if p_reservation_id is not null and not exists (
    select 1 from public.usage_reservations r
     where r.id = p_reservation_id and r.account_id = p_account_id
       and r.resource_code = 'voice_minutes' and r.units = p_reserved_minutes
  ) then
    raise exception 'voice admission reservation does not match its hold' using errcode = '22023';
  end if;

  if not public.finalize_voice_call_admission(
    p_admission_id, p_account_id, p_provider_call_id,
    p_reservation_id, p_reserved_minutes, p_overage_key
  ) then
    return false;
  end if;

  update public.voice_call_admissions a
     set allowed_minutes = p_allowed_minutes,
         minute_mode = p_minute_mode,
         unmetered_reason = p_unmetered_reason
   where a.id = p_admission_id and a.account_id = p_account_id
     and a.provider = 'signalwire' and a.provider_call_id = p_provider_call_id
     and a.allowed_minutes is null;

  return exists (
    select 1 from public.voice_call_admissions a
     where a.id = p_admission_id and a.account_id = p_account_id
       and a.provider = 'signalwire' and a.provider_call_id = p_provider_call_id
       and a.allowed_minutes = p_allowed_minutes and a.minute_mode = p_minute_mode
       and a.unmetered_reason is not distinct from p_unmetered_reason
  );
end;
$fn$;

revoke all on function public.finalize_voice_call_admission_v2(uuid,uuid,text,uuid,integer,text,integer,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_voice_call_admission_v2(uuid,uuid,text,uuid,integer,text,integer,text,text)
  to service_role;

commit;
