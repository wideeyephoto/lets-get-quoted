-- Operational monitor durable state ledger.
-- Coordinates state between the authenticated Vercel cron and independent GitHub watchdog.
-- Non-destructive and isolated to operational evidence. Never touches business data.

create table if not exists public.operational_monitor_state (
  id text primary key default 'primary',
  monitor_state text not null default 'healthy' check (monitor_state in ('healthy', 'degraded', 'outage', 'recovered')),
  first_failure_at timestamptz,
  last_complete_success_at timestamptz,
  consecutive_failures integer not null default 0,
  last_failed_stage text,
  last_error text,
  last_error_details jsonb,
  last_interruption_at timestamptz,
  last_interruption_recovered_at timestamptz,
  last_notification_at timestamptz,
  last_notification_state text not null default 'none' check (last_notification_state in ('none', 'outage_sent', 'reminder_sent', 'recovery_sent')),
  outage_id text,
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.operational_monitor_state enable row level security;
revoke all on public.operational_monitor_state from public, anon, authenticated;
grant select, insert, update on public.operational_monitor_state to service_role;

insert into public.operational_monitor_state (id, monitor_state, last_complete_success_at, updated_at)
values ('primary', 'healthy', clock_timestamp(), clock_timestamp())
on conflict (id) do nothing;

comment on table public.operational_monitor_state is
  'Durable operational monitoring state ledger coordinating Vercel cron and GitHub watchdog.';

-- Atomically record a complete successful monitor execution.
-- Returns the transition information (e.g. was_outage) so caller knows if a recovery notification is due.
create or replace function public.record_monitor_success(
  p_source text default 'vercel'
)
returns table (
  monitor_state text,
  was_outage boolean,
  outage_id text,
  first_failure_at timestamptz,
  recovery_at timestamptz,
  last_complete_success_at timestamptz
)
language plpgsql security invoker set search_path = '' as $$
declare
  v_rec record;
  v_now timestamptz := clock_timestamp();
  v_was_outage boolean := false;
  v_outage_id text := null;
  v_first_failure timestamptz := null;
begin
  perform pg_advisory_xact_lock(782321906);

  select * into v_rec from public.operational_monitor_state where id = 'primary' for update;
  if not found then
    insert into public.operational_monitor_state (id, monitor_state, last_complete_success_at, updated_at)
    values ('primary', 'healthy', v_now, v_now)
    returning * into v_rec;
  end if;

  if v_rec.monitor_state = 'outage' or v_rec.last_notification_state in ('outage_sent', 'reminder_sent') then
    v_was_outage := true;
    v_outage_id := v_rec.outage_id;
    v_first_failure := v_rec.first_failure_at;

    update public.operational_monitor_state set
      monitor_state = 'recovered',
      last_complete_success_at = v_now,
      consecutive_failures = 0,
      last_interruption_recovered_at = v_now,
      updated_at = v_now
    where id = 'primary';
  elsif v_rec.monitor_state = 'degraded' or v_rec.consecutive_failures > 0 then
    update public.operational_monitor_state set
      monitor_state = 'healthy',
      last_complete_success_at = v_now,
      consecutive_failures = 0,
      last_interruption_recovered_at = v_now,
      first_failure_at = null,
      last_failed_stage = null,
      last_error = null,
      outage_id = null,
      updated_at = v_now
    where id = 'primary';
  else
    update public.operational_monitor_state set
      monitor_state = 'healthy',
      last_complete_success_at = v_now,
      consecutive_failures = 0,
      updated_at = v_now
    where id = 'primary';
  end if;

  return query select
    case when v_was_outage then 'recovered' else 'healthy' end,
    v_was_outage,
    v_outage_id,
    v_first_failure,
    v_now,
    v_now;
end $$;

-- Atomically record a monitor interruption or failure.
-- Evaluates transition between degraded and outage based on recent success and failure count.
create or replace function public.record_monitor_failure(
  p_stage text,
  p_error text,
  p_details jsonb default '{}'::jsonb,
  p_source text default 'vercel'
)
returns table (
  monitor_state text,
  consecutive_failures integer,
  first_failure_at timestamptz,
  last_complete_success_at timestamptz,
  outage_id text,
  should_alert boolean,
  is_first_outage_alert boolean
)
language plpgsql security invoker set search_path = '' as $$
declare
  v_rec record;
  v_now timestamptz := clock_timestamp();
  v_is_fatal boolean := false;
  v_is_stale boolean := false;
  v_new_state text;
  v_new_outage_id text;
  v_should_alert boolean := false;
  v_is_first boolean := false;
  v_first_fail timestamptz;
  v_consec integer;
begin
  perform pg_advisory_xact_lock(782321906);

  select * into v_rec from public.operational_monitor_state where id = 'primary' for update;
  if not found then
    insert into public.operational_monitor_state (id, monitor_state, updated_at)
    values ('primary', 'degraded', v_now)
    returning * into v_rec;
  end if;

  v_is_fatal := coalesce((p_details->>'isFatal')::boolean, false);
  v_is_stale := v_rec.last_complete_success_at is not null and v_rec.last_complete_success_at < v_now - interval '10 minutes';
  v_first_fail := coalesce(v_rec.first_failure_at, v_now);
  v_consec := v_rec.consecutive_failures + 1;

  -- Outage if:
  -- 1. Fatal permission/config error
  -- 2. Two or more consecutive failures
  -- 3. Stale success (>= 10 minutes since last complete success)
  -- Degraded if:
  -- Single failure with recent success within 10 minutes
  if v_is_fatal or v_consec >= 2 or v_is_stale then
    v_new_state := 'outage';
    v_new_outage_id := coalesce(v_rec.outage_id, 'outage-' || to_char(v_first_fail at time zone 'UTC', 'YYYYMMDD-HH24MISS'));

    if v_rec.monitor_state <> 'outage' or v_rec.last_notification_state = 'none' then
      v_should_alert := true;
      v_is_first := true;
    elsif v_rec.last_notification_at < v_now - interval '1 hour' then
      -- Hourly reminder during sustained outage
      v_should_alert := true;
      v_is_first := false;
    end if;
  else
    v_new_state := 'degraded';
    v_new_outage_id := null;
    v_should_alert := false;
    v_is_first := false;
  end if;

  update public.operational_monitor_state set
    monitor_state = v_new_state,
    first_failure_at = v_first_fail,
    consecutive_failures = v_consec,
    last_failed_stage = p_stage,
    last_error = p_error,
    last_error_details = p_details,
    last_interruption_at = v_now,
    outage_id = v_new_outage_id,
    updated_at = v_now
  where id = 'primary';

  return query select
    v_new_state,
    v_consec,
    v_first_fail,
    v_rec.last_complete_success_at,
    v_new_outage_id,
    v_should_alert,
    v_is_first;
end $$;

-- Atomically claim dispatch of an outage or recovery notification so Vercel and GitHub cannot duplicate.
create or replace function public.claim_monitor_notification_dispatch(
  p_outage_id text,
  p_notification_type text -- 'outage' | 'reminder' | 'recovery'
)
returns boolean
language plpgsql security invoker set search_path = '' as $$
declare
  v_rec record;
  v_now timestamptz := clock_timestamp();
  v_target_state text;
begin
  perform pg_advisory_xact_lock(782321906);

  select * into v_rec from public.operational_monitor_state where id = 'primary' for update;
  if not found then return false; end if;

  if p_notification_type = 'recovery' then
    if v_rec.last_notification_state in ('outage_sent', 'reminder_sent') then
      update public.operational_monitor_state set
        last_notification_state = 'recovery_sent',
        last_notification_at = v_now,
        monitor_state = 'healthy',
        outage_id = null,
        first_failure_at = null,
        updated_at = v_now
      where id = 'primary';
      return true;
    end if;
    return false;
  elsif p_notification_type = 'outage' then
    if v_rec.last_notification_state = 'none' or v_rec.outage_id <> p_outage_id then
      update public.operational_monitor_state set
        last_notification_state = 'outage_sent',
        last_notification_at = v_now,
        updated_at = v_now
      where id = 'primary';
      return true;
    end if;
    return false;
  elsif p_notification_type = 'reminder' then
    if v_rec.last_notification_state in ('outage_sent', 'reminder_sent') and v_rec.last_notification_at < v_now - interval '55 minutes' then
      update public.operational_monitor_state set
        last_notification_state = 'reminder_sent',
        last_notification_at = v_now,
        updated_at = v_now
      where id = 'primary';
      return true;
    end if;
    return false;
  end if;

  return false;
end $$;

revoke all on function public.record_monitor_success(text),
                       public.record_monitor_failure(text, text, jsonb, text),
                       public.claim_monitor_notification_dispatch(text, text) from public, anon, authenticated;

grant execute on function public.record_monitor_success(text),
                          public.record_monitor_failure(text, text, jsonb, text),
                          public.claim_monitor_notification_dispatch(text, text) to service_role;

notify pgrst, 'reload schema';
