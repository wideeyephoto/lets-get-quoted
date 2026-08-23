-- AI Voice may answer only a currently assigned SignalWire contractor number.
-- Application reads make the normal path cheap and explainable; this migration
-- repeats the proof under row locks at the admission transaction, where a
-- suspension or number reassignment can no longer race the paid AI answer.

begin;

-- A number can move A -> B -> A. Matching only the E.164 value would revive the
-- first A verification, so every change advances an immutable route epoch.
alter table public.accounts
  add column if not exists ai_voice_route_revision bigint not null default 0;

alter table public.accounts
  drop constraint if exists accounts_ai_voice_route_revision_nonnegative;
alter table public.accounts
  add constraint accounts_ai_voice_route_revision_nonnegative
  check (ai_voice_route_revision >= 0);

create or replace function public.guard_ai_voice_route_revision()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
begin
  if new.call_tracking_number is distinct from old.call_tracking_number then
    new.ai_voice_route_revision := old.ai_voice_route_revision + 1;
    -- Preserve the older missed-call card's safety when a caller updates the
    -- number through SQL/REST rather than the dashboard action.
    new.call_tracking_verified_at := null;
  else
    -- Owners may update accounts through RLS. The epoch is system-owned even if
    -- a crafted REST update tries to name this column directly.
    new.ai_voice_route_revision := old.ai_voice_route_revision;
  end if;
  return new;
end
$fn$;

drop trigger if exists accounts_ai_voice_route_revision_guard on public.accounts;
create trigger accounts_ai_voice_route_revision_guard
before update of call_tracking_number, ai_voice_route_revision on public.accounts
for each row execute function public.guard_ai_voice_route_revision();

revoke all on function public.guard_ai_voice_route_revision()
  from public, anon, authenticated, service_role;

-- Keep the exact number authority on every new admission. Existing historical
-- admissions remain nullable; only the service-only claim RPC can create a new
-- claimed row, and that RPC always binds all three fields.
alter table public.voice_call_admissions
  add column if not exists sender_number_id uuid
    references public.sms_sender_numbers(id) on delete restrict,
  add column if not exists dialed_number text,
  add column if not exists route_revision bigint;

alter table public.voice_call_admissions
  drop constraint if exists voice_call_admissions_number_binding_shape;
alter table public.voice_call_admissions
  add constraint voice_call_admissions_number_binding_shape check (
    (sender_number_id is null and dialed_number is null and route_revision is null)
    or (
      sender_number_id is not null
      and dialed_number ~ '^\+[1-9][0-9]{7,14}$'
      and route_revision >= 0
    )
  );

create index if not exists voice_call_admissions_sender_idx
  on public.voice_call_admissions (sender_number_id, admitted_at desc)
  where sender_number_id is not null;

-- Remove the unbound overload. Dropping it also drops its grants; leaving it
-- executable would make the stronger function optional for a service caller.
drop function if exists public.claim_voice_call_admission(uuid, text, integer);

create or replace function public.claim_voice_call_admission(
  p_account_id uuid,
  p_provider_call_id text,
  p_dialed_number text,
  p_concurrency_limit integer
)
returns table (
  claim_status text,
  admission_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_existing public.voice_call_admissions%rowtype;
  v_open bigint;
  v_id uuid;
  v_sender_number_id uuid;
  v_route_revision bigint;
begin
  if p_account_id is null
     or p_provider_call_id is null
     or pg_catalog.length(pg_catalog.btrim(p_provider_call_id)) = 0
     or pg_catalog.length(p_provider_call_id) > 255
     or p_dialed_number is null
     or p_dialed_number !~ '^\+[1-9][0-9]{7,14}$'
     or p_concurrency_limit is null
     or p_concurrency_limit < 1
     or p_concurrency_limit > 100 then
    raise exception 'voice admission claim arguments are invalid'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_account_id::text, 84601211)
  );

  -- FOR SHARE holds both the workspace mapping and sender lifecycle stable
  -- through the insert. A concurrent suspension/transfer wins before this read
  -- (and refuses the call) or waits until the claim is durably bound.
  select s.id, a.ai_voice_route_revision
    into v_sender_number_id, v_route_revision
    from public.accounts a
    join public.sms_sender_numbers s
      on s.account_id = a.id
     and s.e164_number = a.call_tracking_number
   where a.id = p_account_id
     and a.call_tracking_number = p_dialed_number
     and s.provider = 'signalwire'
     and s.purpose = 'contractor_dedicated'
     and s.e164_number = p_dialed_number
     and s.provisioning_status = 'active'
     and s.assignment_state = 'assigned'
     and s.inbound_ready
     and s.activated_at is not null
     and s.suspended_at is null
     and s.provider_number_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   for share of a, s;

  if not found then
    -- One generic answer for unprovisioned, shared, suspended, mismatched and
    -- other-account numbers. The boundary rejects without disclosing ownership.
    return query select 'number_not_ready'::text, null::uuid;
    return;
  end if;

  select a.* into v_existing
    from public.voice_call_admissions a
   where a.provider = 'signalwire'
     and a.provider_call_id = p_provider_call_id;

  if found then
    if v_existing.account_id <> p_account_id then
      raise exception 'voice call id is already bound to another workspace'
        using errcode = '22000';
    end if;
    if v_existing.sender_number_id is distinct from v_sender_number_id
       or v_existing.dialed_number is distinct from p_dialed_number
       or v_existing.route_revision is distinct from v_route_revision then
      return query select 'number_not_ready'::text, null::uuid;
    elsif v_existing.admission_state = 'admitted' then
      return query select 'existing'::text, v_existing.id;
    else
      return query select 'busy'::text, v_existing.id;
    end if;
    return;
  end if;

  select pg_catalog.count(*) into v_open
    from public.voice_call_admissions a
   where a.account_id = p_account_id
     and a.provider = 'signalwire'
     and a.admitted_at >= pg_catalog.clock_timestamp() - interval '60 minutes'
     and not exists (
       select 1
         from public.voice_events e
        where e.provider = a.provider
          and e.provider_call_id = a.provider_call_id
     );

  if v_open >= p_concurrency_limit then
    return query select 'at_capacity'::text, null::uuid;
    return;
  end if;

  insert into public.voice_call_admissions (
    account_id, provider, provider_call_id, reservation_id,
    reserved_minutes, admission_state, sender_number_id,
    dialed_number, route_revision
  ) values (
    p_account_id, 'signalwire', p_provider_call_id, null,
    0, 'claimed', v_sender_number_id, p_dialed_number, v_route_revision
  )
  returning id into v_id;

  return query select 'claimed'::text, v_id;
end
$fn$;

revoke all on function public.claim_voice_call_admission(uuid, text, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_voice_call_admission(uuid, text, text, integer)
  to service_role;

-- The receipt is unsigned, so a missing expected scope must never turn exact
-- comparison off. Redefine the original RPC with mandatory provider and
-- deployment project/space values before any admission lookup or insert.
create or replace function public.ingest_voice_event(
  p_provider_call_id text,
  p_event_type text,
  p_provider_project_id text,
  p_provider_space_id text,
  p_expected_project_id text,
  p_expected_space_id text,
  p_payload jsonb
)
returns table (
  voice_event_id uuid,
  inserted boolean,
  workspace_id uuid,
  admitted boolean
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_existing public.voice_events%rowtype;
  v_admission public.voice_call_admissions%rowtype;
  v_event_id text;
  v_payload_sha256 text;
  v_inserted_id uuid;
  v_status text;
  v_account uuid;
begin
  if p_provider_call_id is null
     or pg_catalog.length(pg_catalog.btrim(p_provider_call_id)) = 0 then
    raise exception 'voice call id is required' using errcode = '22023';
  end if;

  if p_event_type is distinct from 'post_conversation' then
    raise exception 'unsupported voice event type: %', p_event_type using errcode = '22023';
  end if;

  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception 'voice event payload must be a JSON object' using errcode = '22023';
  end if;

  if p_expected_project_id is null
     or pg_catalog.length(pg_catalog.btrim(p_expected_project_id)) = 0
     or p_provider_project_id is null
     or pg_catalog.length(pg_catalog.btrim(p_provider_project_id)) = 0 then
    raise exception 'voice event project scope is required' using errcode = '22023';
  end if;
  if p_expected_space_id is null
     or pg_catalog.length(pg_catalog.btrim(p_expected_space_id)) = 0
     or p_provider_space_id is null
     or pg_catalog.length(pg_catalog.btrim(p_provider_space_id)) = 0 then
    raise exception 'voice event space scope is required' using errcode = '22023';
  end if;
  if p_provider_project_id is distinct from p_expected_project_id then
    raise exception 'voice event project does not match this deployment' using errcode = '22023';
  end if;
  if p_provider_space_id is distinct from p_expected_space_id then
    raise exception 'voice event space does not match this deployment' using errcode = '22023';
  end if;

  v_event_id := p_provider_call_id || ':' || p_event_type;
  v_payload_sha256 := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );

  select e.* into v_existing
    from public.voice_events e
   where e.provider = 'signalwire'
     and e.provider_event_id = v_event_id
   for update;

  if found then
    if v_existing.event_type is distinct from p_event_type
       or v_existing.provider_call_id is distinct from p_provider_call_id
       or v_existing.payload is distinct from p_payload
       or v_existing.payload_sha256 is distinct from v_payload_sha256 then
      raise exception 'voice event was already received with different immutable input'
        using errcode = '23505';
    end if;
    return query select v_existing.id, false, v_existing.account_id,
                        v_existing.processing_status <> 'ignored';
    return;
  end if;

  select a.* into v_admission
    from public.voice_call_admissions a
   where a.provider = 'signalwire'
     and a.provider_call_id = p_provider_call_id;

  if found then
    v_account := v_admission.account_id;
    v_status := 'received';
  else
    v_account := null;
    v_status := 'ignored';
  end if;

  insert into public.voice_events (
    provider, provider_event_id, event_type, provider_call_id,
    provider_project_id, provider_space_id, account_id,
    payload, payload_sha256, processing_status, processed_at
  ) values (
    'signalwire', v_event_id, p_event_type, p_provider_call_id,
    p_provider_project_id, p_provider_space_id, v_account,
    p_payload, v_payload_sha256, v_status,
    case when v_status = 'ignored' then pg_catalog.now() else null end
  )
  returning id into v_inserted_id;

  return query select v_inserted_id, true, v_account, v_status <> 'ignored';
end
$fn$;

revoke all on function public.ingest_voice_event(text, text, text, text, text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.ingest_voice_event(text, text, text, text, text, text, jsonb)
  to service_role;

commit;
