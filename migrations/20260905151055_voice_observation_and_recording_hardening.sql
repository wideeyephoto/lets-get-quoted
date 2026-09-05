begin;

-- Provider durations are operational measurements, never AI billing authority.
alter table public.voice_calls
  add column if not exists forwarding_seconds integer check (forwarding_seconds >= 0),
  add column if not exists forwarding_connected_at timestamptz,
  add column if not exists forwarding_ended_at timestamptz;

-- Keep early recording callbacks until the canonical call arrives. No browser
-- role may write or read provider payloads or recording URLs through this table.
create table if not exists public.voice_recording_observations (
  provider_call_id text primary key,
  recording_status text not null check (recording_status in ('pending','ready','failed')),
  storage_path text,
  duration_seconds integer check (duration_seconds >= 0),
  size_bytes bigint check (size_bytes >= 0),
  created_at timestamptz not null default now(),
  check (recording_status <> 'ready' or storage_path is not null)
);
create table if not exists public.voice_recording_deletions (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);
alter table public.voice_recording_observations enable row level security;
alter table public.voice_recording_observations force row level security;
alter table public.voice_recording_deletions enable row level security;
alter table public.voice_recording_deletions force row level security;
revoke all on public.voice_recording_observations, public.voice_recording_deletions from public, anon, authenticated;
grant all on public.voice_recording_observations, public.voice_recording_deletions to service_role;

create or replace function public.apply_voice_recording_observation(
  p_call_id text, p_status text, p_url text, p_duration integer, p_size bigint,
  p_to_number text default null, p_caller text default null
) returns void language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_account uuid; v_admitted boolean := false; v_observation public.voice_recording_observations;
begin
  if nullif(btrim(p_call_id),'') is null then raise exception 'Missing call identity'; end if;
  -- Serialize early callback and call creation, and monotonically preserve ready.
  perform pg_advisory_xact_lock(hashtextextended(p_call_id, 7261));
  insert into public.voice_recording_observations(provider_call_id,recording_status,storage_path,duration_seconds,size_bytes)
    values(p_call_id,p_status,p_url,p_duration,p_size)
    on conflict(provider_call_id) do update set
      recording_status=excluded.recording_status,storage_path=excluded.storage_path,
      duration_seconds=excluded.duration_seconds,size_bytes=excluded.size_bytes
    where voice_recording_observations.recording_status <> 'ready'
      and (excluded.recording_status <> 'pending' or voice_recording_observations.recording_status = 'pending');
  select * into v_observation from public.voice_recording_observations where provider_call_id=p_call_id;
  select account_id into v_account from public.voice_call_admissions where provider='signalwire' and provider_call_id=p_call_id;
  v_admitted := found;
  if v_account is null and p_to_number is not null then
    select account_id into v_account from public.voice_number_inventory
      where provider='signalwire' and e164_number=p_to_number and lifecycle_state='active';
  end if;
  if v_account is not null then
    insert into public.voice_calls(account_id,provider,provider_call_id,caller_number,started_at,outcome,settlement,is_provisional)
      values(v_account,'signalwire',p_call_id,p_caller,now(),case when v_admitted then 'in_progress' else 'voicemail' end,case when v_admitted then 'unsettled' else 'unmetered' end,v_admitted)
      on conflict(provider,provider_call_id) do nothing;
  end if;
  update public.voice_calls set outcome=case when not v_admitted and p_to_number is not null and p_status='ready' then 'voicemail' else outcome end,recording_status=v_observation.recording_status,
    recording_storage_path=v_observation.storage_path,recording_duration_seconds=v_observation.duration_seconds,
    recording_size_bytes=v_observation.size_bytes,recording_content_type='audio/mpeg',recording_captured_at=now()
    where provider='signalwire' and provider_call_id=p_call_id and recording_status <> 'expired';
end $$;

create or replace function public.project_early_voice_recording() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare r public.voice_recording_observations;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.provider_call_id,7261));
  select * into r from public.voice_recording_observations where provider_call_id=new.provider_call_id;
  if found then
    new.recording_status=r.recording_status; new.recording_storage_path=r.storage_path;
    new.recording_duration_seconds=r.duration_seconds; new.recording_size_bytes=r.size_bytes;
    new.recording_content_type='audio/mpeg'; new.recording_captured_at=now();
  end if;
  return new;
end $$;
drop trigger if exists project_early_voice_recording on public.voice_calls;
create trigger project_early_voice_recording before insert on public.voice_calls
  for each row execute function public.project_early_voice_recording();

-- Enqueue provider deletion in the same transaction that removes caller history.
create or replace function public.queue_deleted_voice_recording() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if old.recording_storage_path is not null then
    insert into public.voice_recording_deletions(storage_path) values(old.recording_storage_path) on conflict do nothing;
  end if;
  delete from public.voice_recording_observations where provider_call_id=old.provider_call_id;
  return old;
end $$;
drop trigger if exists queue_deleted_voice_recording on public.voice_calls;
create trigger queue_deleted_voice_recording before delete on public.voice_calls
  for each row execute function public.queue_deleted_voice_recording();

-- Usage evidence outlives transcript retention and contains no caller content.
create table if not exists public.voice_forwarding_usage (
  provider_call_id text primary key, account_id uuid not null references public.accounts(id) on delete cascade,
  observed_at timestamptz not null, connected_at timestamptz, ended_at timestamptz,
  seconds integer check(seconds>=0 and seconds<=86400)
);
create index if not exists voice_forwarding_usage_account_period on public.voice_forwarding_usage(account_id,observed_at);
alter table public.voice_forwarding_usage enable row level security;
alter table public.voice_forwarding_usage force row level security;
revoke all on public.voice_forwarding_usage from public,anon,authenticated;
grant all on public.voice_forwarding_usage to service_role;
create or replace function public.record_voice_forwarding_usage(
  p_account_id uuid,p_call_id text,p_caller text,p_state text,p_seconds integer,p_observed_at timestamptz
) returns void language plpgsql security invoker set search_path = pg_catalog, public as $$
declare u public.voice_forwarding_usage;
begin
  if p_seconds < 0 or p_seconds > 86400 or nullif(btrim(p_call_id),'') is null then raise exception 'Invalid forwarding duration'; end if;
  insert into public.voice_forwarding_usage(provider_call_id,account_id,observed_at,seconds,connected_at,ended_at)
    values(p_call_id,p_account_id,case when p_state='completed' and p_seconds is not null then p_observed_at-make_interval(secs=>p_seconds) else p_observed_at end,p_seconds,
      case when p_state='connected' then p_observed_at end,
      case when p_state in ('disconnected','completed') then p_observed_at end)
    on conflict(provider_call_id) do update set
      observed_at=least(voice_forwarding_usage.observed_at,excluded.observed_at),
      seconds=greatest(voice_forwarding_usage.seconds,excluded.seconds),
      connected_at=least(voice_forwarding_usage.connected_at,excluded.connected_at),
      ended_at=greatest(voice_forwarding_usage.ended_at,excluded.ended_at)
      where voice_forwarding_usage.account_id=excluded.account_id;
  update public.voice_forwarding_usage set seconds=greatest(seconds,
    least(86400,greatest(0,ceil(extract(epoch from (ended_at-connected_at)))::integer)))
    where provider_call_id=p_call_id and account_id=p_account_id and connected_at is not null and ended_at is not null;
  select * into strict u from public.voice_forwarding_usage where provider_call_id=p_call_id and account_id=p_account_id;
  insert into public.voice_calls(account_id,provider,provider_call_id,caller_number,started_at,outcome,settlement)
    values(p_account_id,'signalwire',p_call_id,p_caller,u.observed_at,case when p_state in ('no-answer','busy','failed','canceled','ended') then 'failed' else 'transferred' end,'unmetered')
    on conflict(provider,provider_call_id) do nothing;
  update public.voice_calls set forwarding_seconds=u.seconds,forwarding_connected_at=u.connected_at,forwarding_ended_at=u.ended_at
    where provider='signalwire' and provider_call_id=p_call_id and account_id=p_account_id;
end $$;
create or replace function public.voice_forwarding_usage_summary(p_account_id uuid)
returns table(minutes bigint,unresolved_calls bigint,included_minutes integer,period_start timestamptz,period_end timestamptz)
language sql stable security invoker set search_path = pg_catalog, public as $$
  select coalesce(sum(ceil(u.seconds/60.0)),0)::bigint,
    count(u.provider_call_id) filter(where u.seconds is null),
    coalesce((e.feature_limits->>'forwarding_minutes')::integer,0),e.period_start,e.period_end
    from public.workspace_entitlements e left join public.voice_forwarding_usage u
      on u.account_id=e.account_id and u.observed_at>=e.period_start and u.observed_at<e.period_end
    where e.account_id=p_account_id group by e.feature_limits,e.period_start,e.period_end
$$;
revoke all on function public.voice_forwarding_usage_summary(uuid) from public,anon,authenticated;
grant execute on function public.voice_forwarding_usage_summary(uuid) to service_role;

alter table public.voice_call_admissions add column if not exists tool_invocations integer not null default 0;
create or replace function public.authorize_voice_tool_invocation(p_account_id uuid,p_call_id text,p_caller text)
returns boolean language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  update public.voice_call_admissions set tool_invocations=tool_invocations+1
    where account_id=p_account_id and provider='signalwire' and provider_call_id=p_call_id
      and caller_number is not distinct from p_caller and admission_state='admitted'
      and provider_terminal_at is null and admitted_at > now()-interval '60 minutes' and tool_invocations < 100;
  return found;
end $$;

revoke all on function public.apply_voice_recording_observation(text,text,text,integer,bigint,text,text),
 public.project_early_voice_recording(),public.queue_deleted_voice_recording(),
 public.record_voice_forwarding_usage(uuid,text,text,text,integer,timestamptz),
 public.authorize_voice_tool_invocation(uuid,text,text) from public,anon,authenticated;
grant execute on function public.apply_voice_recording_observation(text,text,text,integer,bigint,text,text),
 public.project_early_voice_recording(),public.queue_deleted_voice_recording(),
 public.record_voice_forwarding_usage(uuid,text,text,text,integer,timestamptz),
 public.authorize_voice_tool_invocation(uuid,text,text) to service_role;
create or replace function public.queue_expired_voice_recording_observations() returns void
language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  with removed as (
    delete from public.voice_recording_observations r where created_at < now()-interval '90 days'
      and not exists(select 1 from public.voice_calls c where c.provider_call_id=r.provider_call_id)
      returning storage_path
  ) insert into public.voice_recording_deletions(storage_path)
    select storage_path from removed where storage_path is not null on conflict do nothing;
end $$;
revoke all on function public.queue_expired_voice_recording_observations() from public,anon,authenticated;
grant execute on function public.queue_expired_voice_recording_observations() to service_role;
-- Appointment changes remain requests until office staff verify ownership.
create or replace function public.append_voice_appointment_request(p_account_id uuid,p_lead_id uuid,p_call_id text,p_request text)
returns boolean language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if length(p_request)>2000 or p_request is null then raise exception 'Invalid appointment request'; end if;
  update public.leads set message=case when strpos(coalesce(message,''),p_request)>0 then message
    else concat_ws(E'\n',nullif(message,''),p_request) end
    where id=p_lead_id and account_id=p_account_id and source_voice_provider_call_id=p_call_id;
  return found;
end $$;
revoke all on function public.append_voice_appointment_request(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.append_voice_appointment_request(uuid,uuid,text,text) to service_role;
commit;
