-- The AI Voice receipt boundary: what LGQ admitted, and what the provider says
-- happened.
--
-- TWO TABLES IN ONE MIGRATION, because either alone is unsafe.
--
-- docs/ai-voice-v1-decisions.md §11 records what a real SignalWire AI Agent
-- sends, measured: one JSON POST at the end of a call, no signature header, no
-- default authentication of any kind, and no signing secret available in the
-- dashboard. Basic credentials embedded in the callback URL are the only
-- supported mechanism, and they stay readable after saving.
--
-- So the receipt cannot be trusted on its transport alone. A leaked credential
-- would let anyone post a fabricated call record, and fabricated call records
-- are money. What makes it safe is that **LGQ admits the call first**: the
-- number's webhook returns the SWML that starts the agent, and that request is
-- where minutes are reserved and concurrency is checked. `voice_call_admissions`
-- is the record of that moment.
--
-- A receipt whose call id matches no admission therefore settles nothing. It is
-- still stored — it is evidence, and silently dropping it would hide an attack
-- and a misconfiguration equally well — but it lands `ignored`, bound to no
-- workspace, and no ledger function is ever called for it.
--
-- THE TRAP THIS AVOIDS. 20260818170000 exists because a table's CHECK allowlist
-- was widened and the ingest RPC's own dispatch was not, so a signature-verified
-- delivery passed every guard, reached the RPC, and came back 22023 — which the
-- webhook boundary turns into a 500, which the provider retries forever, for an
-- event that can never succeed. Here the table and the RPC are created together
-- and a post-condition asserts the RPC accepts every event type the table
-- admits, so they cannot drift apart at birth.

begin;

-- ---------------------------------------------------------------------------
-- What LGQ admitted
-- ---------------------------------------------------------------------------
create table if not exists public.voice_call_admissions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider text not null check (provider in ('signalwire')),
  -- The provider's id for the call. This is the join to the receipt, and the
  -- reason a forged receipt is inert.
  provider_call_id text not null
    check (pg_catalog.length(pg_catalog.btrim(provider_call_id)) > 0),
  -- The ledger hold taken at admission. Null only when the call was admitted
  -- unmetered, which is what the meter does while it is measuring rather than
  -- enforcing.
  reservation_id uuid references public.usage_reservations(id) on delete set null,
  reserved_minutes integer not null default 0 check (reserved_minutes >= 0),
  admitted_at timestamptz not null default now(),
  constraint voice_call_admissions_call_unique unique (provider, provider_call_id)
);

create index if not exists voice_call_admissions_account_idx
  on public.voice_call_admissions (account_id, admitted_at desc);

-- ---------------------------------------------------------------------------
-- What the provider reported
-- ---------------------------------------------------------------------------
create table if not exists public.voice_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'signalwire' check (provider in ('signalwire')),
  -- `<call_id>:<action>` rather than the bare call id. There is exactly one
  -- receipt per call today, so the call id alone would be unique -- but a second
  -- event type would then collide with the first on the same call and be
  -- rejected as a duplicate of something it is not.
  provider_event_id text not null
    check (pg_catalog.length(pg_catalog.btrim(provider_event_id)) > 0),
  event_type text not null check (event_type in ('post_conversation')),
  -- Kept separate and indexed: this is what a settlement joins on.
  provider_call_id text not null
    check (pg_catalog.length(pg_catalog.btrim(provider_call_id)) > 0),
  -- LGQ's own SignalWire identifiers, carried in the payload. Checked on ingest
  -- so a receipt from someone else's project is refused rather than stored as
  -- though it were ours.
  provider_project_id text,
  provider_space_id text,
  account_id uuid references public.accounts(id) on delete set null,
  envelope_schema text not null default 'signalwire.post_conversation.v1',
  payload jsonb not null check (pg_catalog.jsonb_typeof(payload) = 'object'),
  payload_sha256 text check (payload_sha256 is null or payload_sha256 ~ '^[0-9a-f]{64}$'),
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processing', 'processed', 'failed', 'ignored')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  processing_started_at timestamptz,
  processed_at timestamptz,
  next_attempt_at timestamptz,
  last_error text,
  received_at timestamptz not null default now(),
  constraint voice_events_provider_event_unique unique (provider, provider_event_id),
  constraint voice_events_processed_state_check check (
    processed_at is null or processing_status in ('processed', 'ignored')
  )
);

create index if not exists voice_events_processing_queue_idx
  on public.voice_events (processing_status, next_attempt_at, received_at)
  where processing_status in ('received', 'failed');
create index if not exists voice_events_call_idx
  on public.voice_events (provider, provider_call_id, received_at desc);
create index if not exists voice_events_account_received_idx
  on public.voice_events (account_id, received_at desc)
  where account_id is not null;

-- Payloads are backend-only. They carry a full transcript of a homeowner's call.
alter table public.voice_call_admissions enable row level security;
alter table public.voice_events enable row level security;
-- No policy is created, deliberately: with RLS on and no policy, anon and
-- authenticated can read nothing, and the service-role client bypasses RLS.

-- ---------------------------------------------------------------------------
-- Ingest
-- ---------------------------------------------------------------------------
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
as $$
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

  -- Every event type the TABLE admits must be handled here. The post-condition
  -- at the end of this migration asserts that, because the one time these two
  -- lists drifted it produced an endlessly retried 500.
  if p_event_type is distinct from 'post_conversation' then
    raise exception 'unsupported voice event type: %', p_event_type using errcode = '22023';
  end if;

  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception 'voice event payload must be a JSON object' using errcode = '22023';
  end if;

  -- The receipt names the project and space it came from. With no signature to
  -- verify, this is one of the few things about it that can be checked at all --
  -- so a receipt from another SignalWire project is refused outright rather than
  -- stored as evidence of something that did not happen here.
  if p_expected_project_id is not null
     and p_provider_project_id is distinct from p_expected_project_id then
    raise exception 'voice event project does not match this deployment' using errcode = '22023';
  end if;
  if p_expected_space_id is not null
     and p_provider_space_id is distinct from p_expected_space_id then
    raise exception 'voice event space does not match this deployment' using errcode = '22023';
  end if;

  v_event_id := p_provider_call_id || ':' || p_event_type;

  -- Hash the exact canonical JSONB that is persisted, not a caller-supplied
  -- digest and not whatever key order JavaScript happened to serialise.
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
    -- A replay must be byte-identical. A receipt that changed between deliveries
    -- is not a retry, and accepting it would let a second delivery restate what
    -- a call cost after the first was already settled.
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

  -- The control that makes an unauthenticated receipt safe: settle only calls
  -- LGQ admitted. No admission, no workspace, no ledger call -- but the row is
  -- still written, because a receipt nobody can explain is exactly the thing
  -- worth being able to find later.
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
end;
$$;

-- A browser must not be able to write either table directly. The receipt route
-- and the SWML route both run server-side with the service-role client.
revoke all on table public.voice_call_admissions from public, anon, authenticated;
revoke all on table public.voice_events from public, anon, authenticated;
revoke all on function public.ingest_voice_event(text, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.ingest_voice_event(text, text, text, text, text, text, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- Post-conditions
-- ---------------------------------------------------------------------------
do $$
declare
  v_type text;
  v_allowed text[];
  v_source text;
  v_bad text;
begin
  -- THE ONE THAT MATTERS. Pull the event types the TABLE admits straight out of
  -- its CHECK constraint and prove the RPC's dispatch mentions each of them. A
  -- type the table accepts and the function rejects is a permanent 22023, which
  -- the webhook boundary reports as 500, which the provider retries forever.
  select array_agg(m[1]) into v_allowed
  from (
    select pg_catalog.regexp_matches(
      pg_catalog.pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') as m
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid = c.conrelid
    where t.relname = 'voice_events' and c.conname like '%event_type%'
  ) s;

  if v_allowed is null or pg_catalog.array_length(v_allowed, 1) = 0 then
    raise exception 'could not read the voice_events event_type allowlist';
  end if;

  select p.prosrc into v_source
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ingest_voice_event';

  if v_source is null then
    raise exception 'ingest_voice_event was not created';
  end if;

  foreach v_type in array v_allowed loop
    if pg_catalog.strpos(v_source, v_type) = 0 then
      raise exception 'ingest_voice_event does not handle event type %, which its table admits', v_type;
    end if;
  end loop;

  -- Neither table may be reachable by a browser role, payloads being full
  -- transcripts of a homeowner's phone call.
  select pg_catalog.string_agg(distinct g.grantee_name, ', ') into v_bad
  from (
    select pg_catalog.pg_get_userbyid(x.grantee) as grantee_name
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, '{}'::aclitem[])) x
    where n.nspname = 'public' and c.relname in ('voice_events', 'voice_call_admissions')
  ) g
  where g.grantee_name in ('anon', 'authenticated', 'public');

  if v_bad is not null then
    raise exception 'voice tables are reachable by: %', v_bad;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'voice_events' and c.relrowsecurity
  ) then
    raise exception 'row level security is not enabled on voice_events';
  end if;
end $$;

commit;
