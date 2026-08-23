-- Make the voice settings table tell the truth about the runtime that exists.
--
-- `recording_enabled` and `emergency_transfer_number` shipped ahead of their
-- provider behavior. The SWML answer starts no recording instruction, has no
-- recording storage/retention/deletion rail, and exposes one transfer target
-- only. A writable setting that changes neither behavior is worse than a
-- missing setting because the owner reasonably believes it took effect.
--
-- Keep both columns for the eventual feature migrations, but make the
-- unsupported state unrepresentable until those migrations deliberately remove
-- these constraints. Existing rows are made safe first.

begin;

update public.voice_settings
   set recording_enabled = false,
       emergency_transfer_number = null
 where recording_enabled is distinct from false
    or emergency_transfer_number is not null;

alter table public.voice_settings
  drop constraint if exists voice_settings_recording_runtime_disabled;
alter table public.voice_settings
  add constraint voice_settings_recording_runtime_disabled
  check (recording_enabled = false);

alter table public.voice_settings
  drop constraint if exists voice_settings_emergency_routing_runtime_disabled;
alter table public.voice_settings
  add constraint voice_settings_emergency_routing_runtime_disabled
  check (emergency_transfer_number is null);

comment on constraint voice_settings_recording_runtime_disabled on public.voice_settings is
  'Temporary product truth guard: remove only with working provider recording plus disclosure, storage, retention, and deletion.';
comment on constraint voice_settings_emergency_routing_runtime_disabled on public.voice_settings is
  'Temporary product truth guard: remove only when the provider answer implements a separately audited emergency route.';

-- The receipt inbox already carried queue state, an attempt counter, and a due
-- timestamp, but the route did not claim that work. A duplicate returned early
-- solely because ingest said `inserted = false`; if the first settlement threw,
-- every retry therefore became a successful no-op and the admitted call was
-- never settled. A rotating token and finite lease turn that latent queue shape
-- into an actual one-processor compare-and-set boundary.
alter table public.voice_events
  add column if not exists processing_token uuid;
alter table public.voice_events
  add column if not exists processing_lease_expires_at timestamptz;

-- A settlement retry is deliberately replayable: ledger finalization and call
-- history already use stable provider-call keys. Give the lead the same property
-- so a response lost after its INSERT cannot make the next attempt create a
-- second customer inquiry. PostgreSQL UNIQUE permits many NULLs, while still
-- giving PostgREST a non-partial conflict target for voice insert-or-ignore.
alter table public.leads
  add column if not exists source_voice_event_id uuid
    references public.voice_events(id) on delete set null;
create unique index if not exists leads_source_voice_event_uidx
  on public.leads (source_voice_event_id);

-- Recover any pre-CAS row that was left mid-processing. Existing definite
-- settlement failures are also made immediately eligible; unbillable/manual-
-- review failures keep next_attempt_at NULL and remain exhausted by design.
update public.voice_events
   set processing_status = 'failed',
       processing_token = null,
       processing_lease_expires_at = null,
       next_attempt_at = pg_catalog.now(),
       last_error = coalesce(last_error, 'voice_processing_interrupted')
 where processing_status = 'processing';

update public.voice_events
   set next_attempt_at = pg_catalog.now()
 where processing_status = 'failed'
   and last_error = 'settlement_failed'
   and attempt_count < 5
   and next_attempt_at is null;

update public.voice_events
   set processing_token = null,
       processing_lease_expires_at = null,
       processed_at = coalesce(processed_at, received_at),
       next_attempt_at = null
 where processing_status in ('processed', 'ignored');

alter table public.voice_events
  drop constraint if exists voice_events_processed_state_check;
alter table public.voice_events
  drop constraint if exists voice_events_processing_state_check;
alter table public.voice_events
  add constraint voice_events_processing_state_check check (
    (processing_status = 'processing'
      and processing_token is not null
      and processing_started_at is not null
      and processing_lease_expires_at is not null
      and processed_at is null)
    or (processing_status in ('received', 'failed')
      and processing_token is null
      and processing_lease_expires_at is null
      and processed_at is null)
    or (processing_status in ('processed', 'ignored')
      and processing_token is null
      and processing_lease_expires_at is null
      and processed_at is not null)
  );

create or replace function public.claim_voice_event_processing(
  p_voice_event_id uuid
)
returns table (
  claim_status text,
  claim_token uuid,
  attempt_number integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_event public.voice_events%rowtype;
  v_token uuid;
  v_retry integer;
begin
  if p_voice_event_id is null then
    raise exception 'voice event id is required' using errcode = '22023';
  end if;

  select e.* into v_event
    from public.voice_events e
   where e.id = p_voice_event_id
   for update;
  if not found then
    raise exception 'voice event does not exist' using errcode = '22023';
  end if;

  if v_event.processing_status = 'processed' then
    return query select 'processed'::text, null::uuid,
                        v_event.attempt_count, null::integer;
    return;
  end if;
  if v_event.processing_status = 'ignored' then
    return query select 'ignored'::text, null::uuid,
                        v_event.attempt_count, null::integer;
    return;
  end if;

  if v_event.processing_status = 'processing'
     and v_event.processing_lease_expires_at > v_now then
    v_retry := greatest(1, ceil(extract(epoch from
      (v_event.processing_lease_expires_at - v_now)))::integer);
    return query select 'busy'::text, null::uuid,
                        v_event.attempt_count, v_retry;
    return;
  end if;

  if v_event.attempt_count >= 5 then
    update public.voice_events e
       set processing_status = 'failed',
           processing_token = null,
           processing_lease_expires_at = null,
           next_attempt_at = null,
           last_error = coalesce(e.last_error, 'voice_processing_attempts_exhausted')
     where e.id = p_voice_event_id;
    return query select 'exhausted'::text, null::uuid,
                        v_event.attempt_count, null::integer;
    return;
  end if;

  if v_event.processing_status = 'failed'
     and v_event.next_attempt_at is null then
    return query select 'exhausted'::text, null::uuid,
                        v_event.attempt_count, null::integer;
    return;
  end if;

  if v_event.processing_status = 'failed'
     and v_event.next_attempt_at > v_now then
    v_retry := greatest(1, ceil(extract(epoch from
      (v_event.next_attempt_at - v_now)))::integer);
    return query select 'deferred'::text, null::uuid,
                        v_event.attempt_count, v_retry;
    return;
  end if;

  if v_event.processing_status not in ('received', 'failed', 'processing')
     or v_event.account_id is null then
    raise exception 'voice event is not eligible for processing' using errcode = '55000';
  end if;

  v_token := pg_catalog.gen_random_uuid();
  update public.voice_events e
     set processing_status = 'processing',
         processing_token = v_token,
         processing_started_at = v_now,
         processing_lease_expires_at = v_now + interval '5 minutes',
         attempt_count = e.attempt_count + 1,
         next_attempt_at = null,
         last_error = null
   where e.id = p_voice_event_id;

  return query select 'claimed'::text, v_token,
                      v_event.attempt_count + 1, null::integer;
end;
$$;

create or replace function public.complete_voice_event_processing(
  p_voice_event_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
begin
  update public.voice_events e
     set processing_status = 'processed',
         processing_token = null,
         processing_lease_expires_at = null,
         processed_at = pg_catalog.clock_timestamp(),
         next_attempt_at = null,
         last_error = null
   where e.id = p_voice_event_id
     and e.processing_status = 'processing'
     and e.processing_token = p_claim_token;
  if not found then
    raise exception 'voice event completion claim is stale or invalid'
      using errcode = '55000';
  end if;
  return true;
end;
$$;

create or replace function public.fail_voice_event_processing(
  p_voice_event_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_retryable boolean
)
returns table (
  failure_status text,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_event public.voice_events%rowtype;
  v_retry integer;
begin
  if p_error_code is null or p_error_code !~ '^[a-z][a-z0-9_]{2,99}$'
     or p_retryable is null then
    raise exception 'voice event failure arguments are invalid' using errcode = '22023';
  end if;

  select e.* into v_event
    from public.voice_events e
   where e.id = p_voice_event_id
   for update;
  if not found
     or v_event.processing_status <> 'processing'
     or v_event.processing_token is distinct from p_claim_token then
    raise exception 'voice event failure claim is stale or invalid'
      using errcode = '55000';
  end if;

  if p_retryable and v_event.attempt_count < 5 then
    v_retry := least(300, 5 * (2 ^ least(v_event.attempt_count - 1, 6)))::integer;
    update public.voice_events e
       set processing_status = 'failed',
           processing_token = null,
           processing_lease_expires_at = null,
           next_attempt_at = v_now + pg_catalog.make_interval(secs => v_retry),
           last_error = p_error_code
     where e.id = p_voice_event_id;
    return query select 'retryable'::text, v_retry;
    return;
  end if;

  update public.voice_events e
     set processing_status = 'failed',
         processing_token = null,
         processing_lease_expires_at = null,
         next_attempt_at = null,
         last_error = p_error_code
   where e.id = p_voice_event_id;
  return query select 'exhausted'::text, null::integer;
end;
$$;

revoke all on function public.claim_voice_event_processing(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_voice_event_processing(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.fail_voice_event_processing(uuid, uuid, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_voice_event_processing(uuid) to service_role;
grant execute on function public.complete_voice_event_processing(uuid, uuid) to service_role;
grant execute on function public.fail_voice_event_processing(uuid, uuid, text, boolean) to service_role;

do $$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_constraintdef(c.oid)
    into v_definition
    from pg_catalog.pg_constraint c
   where c.conrelid = 'public.voice_settings'::pg_catalog.regclass
     and c.conname = 'voice_settings_recording_runtime_disabled';
  if v_definition is null or pg_catalog.strpos(v_definition, 'recording_enabled = false') = 0 then
    raise exception 'voice recording runtime guard is missing or drifted';
  end if;

  select pg_catalog.pg_get_constraintdef(c.oid)
    into v_definition
    from pg_catalog.pg_constraint c
   where c.conrelid = 'public.voice_settings'::pg_catalog.regclass
     and c.conname = 'voice_settings_emergency_routing_runtime_disabled';
  if v_definition is null or pg_catalog.strpos(v_definition, 'emergency_transfer_number IS NULL') = 0 then
    raise exception 'voice emergency routing runtime guard is missing or drifted';
  end if;

  if exists (
    select 1 from public.voice_settings
     where recording_enabled is distinct from false
        or emergency_transfer_number is not null
  ) then
    raise exception 'unsupported voice settings remain enabled';
  end if;
end $$;

commit;
