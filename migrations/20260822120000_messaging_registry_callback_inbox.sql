-- SignalWire 10DLC Campaign Registry status-callback inbox.
--
-- Why this exists: on 2026-08-21 the individual number assignment for the LGQ
-- shared number failed, and the carrier reason was never captured. It was not
-- mislaid -- it was never received. No status_callback_url was ever registered
-- with SignalWire, because assignMessagingNumberCampaign refuses to register one
-- until an authenticated receiving route exists
-- (src/lib/messaging-number-provisioning.ts, "no authenticated 10DLC
-- assignment-callback route"). This migration is the storage half of that route.
--
-- Design constraint that shapes everything below: the payload shape of a
-- Campaign Registry status callback is NOT documented by SignalWire beyond a
-- field list, is not captured anywhere in this repo, and carries no reason field
-- in the published spec. A receiver that stores only parsed fields would lose
-- the next failure exactly as the last one was lost. Therefore raw bytes are the
-- deliverable and the parse is a convenience that is allowed to return nothing.

begin;

-- ---------------------------------------------------------------------------
-- 1. webhook_failures gains its value BEFORE any code writes it.
--    logWebhookFailure catches its own insert error (src/lib/webhook-failures.ts),
--    so a CHECK violation does not raise -- the failure log just silently stops
--    recording, during the exact window someone is watching it. Same ordering
--    and same reason as migrations/20260819100000_webhook_source_ai_voice.sql.
-- ---------------------------------------------------------------------------
alter table public.webhook_failures drop constraint if exists webhook_failures_source_check;
alter table public.webhook_failures add constraint webhook_failures_source_check
  check (source in (
    'stripe', 'resend',
    'twilio_inbound', 'twilio_status',
    'sms_inbound', 'sms_status', 'sms_voice',
    'ai_voice',
    -- the 10DLC Campaign Registry assignment status callback
    'sms_registry'
  ));

-- ---------------------------------------------------------------------------
-- 2. Correlation index. A callback arrives keyed by the provider's order id and
--    there is no index to resolve it back to an application.
--
--    Deliberately NOT unique: production data is unverified from here, and a
--    unique index that discovers a pre-existing duplicate fails the entire
--    migration rather than the one row that is wrong.
-- ---------------------------------------------------------------------------
create index if not exists messaging_registration_applications_assignment_order_idx
  on public.messaging_registration_applications (assignment_order_id)
  where assignment_order_id is not null;

-- ---------------------------------------------------------------------------
-- 3. The inbox. Raw bytes first, meaning second.
--
--    on delete set null, NOT restrict: every FK on this rail is restrict, and a
--    new restrict FK would make an account undeletable the moment this table
--    receives its first row. voice_events took set null for the same reason.
-- ---------------------------------------------------------------------------
create table if not exists public.messaging_registry_callbacks (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  provider text not null default 'signalwire' check (provider = 'signalwire'),

  -- Dedupe identity. Built by the route from whatever identity the body yields
  -- plus the digest of the exact bytes, so a redelivery collides and a genuine
  -- later transition does not.
  receipt_key text not null
    check (pg_catalog.length(receipt_key) between 1 and 700),
  body_sha256 text not null check (body_sha256 ~ '^[0-9a-f]{64}$'),

  -- Bytes exactly as received, before any parse or newline normalization.
  raw_body text not null check (pg_catalog.length(raw_body) <= 65536),
  content_type text check (content_type is null or pg_catalog.length(content_type) <= 255),
  request_method text not null check (request_method in ('POST', 'PUT', 'GET')),
  -- Written with the secret path segment replaced by a placeholder. The token
  -- must never reach this table.
  request_path text not null check (pg_catalog.length(request_path) <= 2048),
  -- Header names verbatim; values only for a safe allowlist, presence-only
  -- booleans for anything that carries reusable authentication material.
  request_headers jsonb not null default '{}'::jsonb
    check (pg_catalog.jsonb_typeof(request_headers) = 'object'),
  -- Recorded, never gated on. Nothing establishes that SignalWire signs this
  -- surface at all; capturing the value is what lets the scheme be verified
  -- offline later. An HMAC value discloses no key.
  signature_header_name text
    check (signature_header_name is null or pg_catalog.length(signature_header_name) <= 128),
  signature_header_value text
    check (signature_header_value is null or pg_catalog.length(signature_header_value) <= 512),

  -- Best-effort interpretation. Null is a legal and expected outcome.
  parsed jsonb check (parsed is null or pg_catalog.jsonb_typeof(parsed) = 'object'),
  provider_order_id text check (provider_order_id is null or pg_catalog.length(provider_order_id) <= 200),
  provider_assignment_id text check (provider_assignment_id is null or pg_catalog.length(provider_assignment_id) <= 200),
  provider_campaign_id text check (provider_campaign_id is null or pg_catalog.length(provider_campaign_id) <= 200),
  provider_phone_number text check (provider_phone_number is null or pg_catalog.length(provider_phone_number) <= 32),
  provider_state text check (provider_state is null or pg_catalog.length(provider_state) <= 200),
  -- Normalized with the same three-way vocabulary as the rest of the rail, plus
  -- 'unknown'. The rail's own case expression maps anything unrecognized to
  -- 'pending'; if the registry spells a terminal state 'FAILED' or 'declined',
  -- that would read as in-progress forever. 'unknown' makes a novel terminal
  -- state visible instead of silently benign.
  normalized_state text
    check (normalized_state is null
           or normalized_state in ('complete', 'failed', 'pending', 'unknown')),
  failure_code text
    check (failure_code is null or failure_code ~ '^[a-z][a-z0-9_]{2,99}$'),
  failure_detail text
    check (failure_detail is null or pg_catalog.length(failure_detail) <= 2000),

  application_id uuid
    references public.messaging_registration_applications(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,

  processing_status text not null default 'received'
    check (processing_status in ('received', 'processed', 'unmatched', 'review', 'ignored', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text check (last_error is null or pg_catalog.length(last_error) <= 2000),
  received_at timestamptz not null default pg_catalog.now(),
  processed_at timestamptz,

  constraint messaging_registry_callbacks_receipt_unique
    unique (provider, receipt_key),
  constraint messaging_registry_callbacks_processing_shape check (
    (processing_status = 'received' and processed_at is null)
    or (processing_status <> 'received' and processed_at is not null)
  )
);

create index if not exists messaging_registry_callbacks_order_idx
  on public.messaging_registry_callbacks (provider_order_id, received_at desc)
  where provider_order_id is not null;
create index if not exists messaging_registry_callbacks_application_idx
  on public.messaging_registry_callbacks (application_id, received_at desc)
  where application_id is not null;
create index if not exists messaging_registry_callbacks_open_idx
  on public.messaging_registry_callbacks (received_at, id)
  where processing_status in ('received', 'failed', 'unmatched');

-- ---------------------------------------------------------------------------
-- 4. Ingest. Every row-count-bearing statement proves its own effect, because
--    on this codebase a zero-row write returns no error and reports success.
-- ---------------------------------------------------------------------------
create or replace function public.ingest_messaging_registry_callback(
  p_receipt_key text,
  p_body_sha256 text,
  p_raw_body text,
  p_content_type text,
  p_request_method text,
  p_request_path text,
  p_request_headers jsonb,
  p_signature_header_name text,
  p_signature_header_value text,
  p_parsed jsonb,
  p_provider_order_id text,
  p_provider_assignment_id text,
  p_provider_campaign_id text,
  p_provider_phone_number text,
  p_provider_state text,
  p_normalized_state text,
  p_failure_code text,
  p_failure_detail text
)
returns table (
  callback_id uuid,
  inserted boolean,
  matched_application_id uuid,
  disposition text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_existing public.messaging_registry_callbacks%rowtype;
  v_application public.messaging_registration_applications%rowtype;
  v_matched boolean := false;
  v_account uuid;
  v_status text;
  v_id uuid;
begin
  if p_receipt_key is null or pg_catalog.length(pg_catalog.btrim(p_receipt_key)) = 0
     or coalesce(p_body_sha256, '') !~ '^[0-9a-f]{64}$'
     or p_raw_body is null then
    raise exception 'registry callback input is invalid' using errcode = '22023';
  end if;

  select c.* into v_existing
    from public.messaging_registry_callbacks c
   where c.provider = 'signalwire' and c.receipt_key = p_receipt_key
   for update;

  if found then
    -- A replay must be byte-identical. Differing bytes under one receipt key
    -- means the key was built from something that does not identify the event.
    if v_existing.body_sha256 is distinct from p_body_sha256 then
      raise exception 'registry callback already received with different bytes'
        using errcode = '23505';
    end if;
    return query select v_existing.id, false, v_existing.application_id,
                        v_existing.processing_status;
    return;
  end if;

  if p_provider_order_id is not null then
    select a.* into v_application
      from public.messaging_registration_applications a
     where a.assignment_order_id = p_provider_order_id
     for update;
    v_matched := found;
  end if;

  if v_matched and v_application.id is not null then
    v_account := v_application.account_id;
    v_status  := 'received';
  else
    -- A callback naming an order LGQ cannot resolve is still stored. Dropping it
    -- would hide a misconfiguration and a forged request equally well.
    v_application.id := null;
    v_account := null;
    v_status  := 'unmatched';
  end if;

  insert into public.messaging_registry_callbacks (
    provider, receipt_key, body_sha256, raw_body, content_type,
    request_method, request_path, request_headers,
    signature_header_name, signature_header_value, parsed,
    provider_order_id, provider_assignment_id, provider_campaign_id,
    provider_phone_number, provider_state, normalized_state,
    failure_code, failure_detail,
    application_id, account_id, processing_status, processed_at
  ) values (
    'signalwire', p_receipt_key, p_body_sha256, p_raw_body, p_content_type,
    p_request_method, p_request_path, coalesce(p_request_headers, '{}'::jsonb),
    p_signature_header_name, p_signature_header_value, p_parsed,
    p_provider_order_id, p_provider_assignment_id, p_provider_campaign_id,
    p_provider_phone_number, p_provider_state, p_normalized_state,
    p_failure_code, p_failure_detail,
    v_application.id, v_account, v_status,
    case when v_status = 'unmatched' then v_now else null end
  )
  returning id into v_id;

  -- Row-count proof: INSERT ... RETURNING INTO leaves v_id null on zero rows,
  -- and "no error" is not evidence that anything was written.
  if v_id is null then
    raise exception 'registry callback was not stored' using errcode = '55000';
  end if;

  -- Advisory mirror onto the application. This records that the provider spoke;
  -- it deliberately does NOT change assignment state. Activation trusts only a
  -- live read of the individual assignment, never an order-level callback.
  if v_application.id is not null
     and p_normalized_state in ('failed', 'pending', 'complete', 'unknown') then
    update public.messaging_registration_applications
       set assignment_checked_at = v_now, updated_at = v_now
     where id = v_application.id;
    if not found then
      raise exception 'registry callback could not touch its application row'
        using errcode = '55000';
    end if;

    insert into public.messaging_registration_events (
      application_id, account_id, event_type, actor_type, actor_reference,
      previous_status, new_status, detail, metadata
    ) values (
      v_application.id, v_account, 'assignment_status_callback_received',
      'provider', 'signalwire:registry-callback',
      v_application.status, v_application.status,
      p_failure_detail,
      pg_catalog.jsonb_build_object(
        'callback_id', v_id,
        'provider_order_id', p_provider_order_id,
        'provider_assignment_id', p_provider_assignment_id,
        'provider_state', p_provider_state,
        'normalized_state', p_normalized_state,
        'failure_code', p_failure_code,
        'body_sha256', p_body_sha256
      )
    );
  end if;

  return query select v_id, true, v_application.id, v_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Least privilege. The table is unreachable by anon and authenticated, and
--    the route reaches it only through the service role via this one function.
-- ---------------------------------------------------------------------------
alter table public.messaging_registry_callbacks enable row level security;
alter table public.messaging_registry_callbacks force row level security;
-- No policy, deliberately: RLS enabled with no policy means anon and
-- authenticated read nothing at all, and the service-role client bypasses RLS.

revoke all on table public.messaging_registry_callbacks
  from public, anon, authenticated, service_role;
grant select on table public.messaging_registry_callbacks to service_role;

revoke all on function public.ingest_messaging_registry_callback(
  text, text, text, text, text, text, jsonb, text, text, jsonb,
  text, text, text, text, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.ingest_messaging_registry_callback(
  text, text, text, text, text, text, jsonb, text, text, jsonb,
  text, text, text, text, text, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 6. Post-conditions. Prove the constraint bites and the table is unreachable,
--    rather than trusting that the statements above did what they read like.
-- ---------------------------------------------------------------------------
do $$
declare
  v_bad text;
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'webhook_failures_source_check'
       and pg_catalog.pg_get_constraintdef(oid) like '%sms_registry%'
  ) then
    raise exception 'webhook_failures_source_check does not admit sms_registry';
  end if;

  select pg_catalog.string_agg(distinct g.grantee_name, ', ') into v_bad
  from (
    select pg_catalog.pg_get_userbyid(x.grantee) as grantee_name
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, '{}'::aclitem[])) x
     where n.nspname = 'public' and c.relname = 'messaging_registry_callbacks'
  ) g
  where g.grantee_name in ('anon', 'authenticated', 'public');
  if v_bad is not null then
    raise exception 'messaging_registry_callbacks is reachable by: %', v_bad;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'messaging_registry_callbacks'
       and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception 'row level security is not forced on messaging_registry_callbacks';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'ingest_messaging_registry_callback'
       and p.prosecdef
  ) then
    raise exception 'ingest_messaging_registry_callback is not security definer';
  end if;
end $$;

commit;
