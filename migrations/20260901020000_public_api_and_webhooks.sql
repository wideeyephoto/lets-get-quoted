-- Public APIs v1 and Durable Webhook Infrastructure (Release 1: Leads vertical slice)
--
-- Adds:
--   1. api_credentials: SHA-256 hashed, scoped, account-bound API tokens
--   2. api_idempotency_records: Durable 24h request idempotency ledger
--   3. api_request_audit: Redacted audit logging for public API requests
--   4. integration_events: Immutable transactional outbox event envelopes
--   5. webhook_subscriptions: Subscribed endpoints with AES-GCM encrypted secrets
--   6. webhook_deliveries: Durable leased delivery queue with exponential backoff
--   7. webhook_delivery_attempts: Granular delivery attempt telemetry
--   8. Leads outbox trigger: Atomic fanout of lead mutations to matching webhooks
--   9. Worker & replay RPCs: claim_webhook_delivery_tasks, complete, fail, retry

begin;

-- ---------------------------------------------------------------------------
-- 1. API CREDENTIALS
-- ---------------------------------------------------------------------------

create table if not exists public.api_credentials (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  token_prefix text not null,
  scopes text[] not null default '{}',
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists api_credentials_account_idx
  on public.api_credentials (account_id, created_at desc);

create index if not exists api_credentials_hash_lookup_idx
  on public.api_credentials (token_hash)
  where revoked_at is null;

alter table public.api_credentials enable row level security;

drop policy if exists api_credentials_owner on public.api_credentials;
create policy api_credentials_owner on public.api_credentials
  for all using (is_owner(account_id)) with check (is_owner(account_id));

-- ---------------------------------------------------------------------------
-- 2. API IDEMPOTENCY RECORDS
-- ---------------------------------------------------------------------------

create table if not exists public.api_idempotency_records (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  idempotency_key text not null,
  request_path text not null,
  request_hash text not null,
  response_status integer not null,
  response_body jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (account_id, idempotency_key)
);

create index if not exists api_idempotency_expiry_idx
  on public.api_idempotency_records (expires_at);

alter table public.api_idempotency_records enable row level security;

-- Idempotency ledger is managed strictly by the server-side API wrapper
revoke all on public.api_idempotency_records from public, anon, authenticated;
grant select, insert, update, delete on public.api_idempotency_records to service_role;

-- ---------------------------------------------------------------------------
-- 3. API REQUEST AUDIT
-- ---------------------------------------------------------------------------

create table if not exists public.api_request_audit (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  credential_id uuid references public.api_credentials(id) on delete set null,
  request_id text not null,
  method text not null,
  path text not null,
  status integer not null,
  ip_address text,
  user_agent text,
  duration_ms integer not null,
  error_code text,
  created_at timestamptz not null default now()
);

create index if not exists api_request_audit_account_idx
  on public.api_request_audit (account_id, created_at desc);

create index if not exists api_request_audit_credential_idx
  on public.api_request_audit (credential_id, created_at desc);

alter table public.api_request_audit enable row level security;

drop policy if exists api_request_audit_owner on public.api_request_audit;
create policy api_request_audit_owner on public.api_request_audit
  for select using (is_owner(account_id));

-- ---------------------------------------------------------------------------
-- 4. INTEGRATION EVENTS (TRANSACTIONAL OUTBOX)
-- ---------------------------------------------------------------------------

create table if not exists public.integration_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id text not null,
  payload jsonb not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists integration_events_account_time_idx
  on public.integration_events (account_id, occurred_at desc);

create index if not exists integration_events_aggregate_idx
  on public.integration_events (aggregate_type, aggregate_id);

alter table public.integration_events enable row level security;

drop policy if exists integration_events_owner on public.integration_events;
create policy integration_events_owner on public.integration_events
  for select using (is_owner(account_id));

-- ---------------------------------------------------------------------------
-- 5. WEBHOOK SUBSCRIPTIONS
-- ---------------------------------------------------------------------------

create table if not exists public.webhook_subscriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  credential_id uuid references public.api_credentials(id) on delete set null,
  target_url text not null,
  event_types text[] not null default '{}',
  encrypted_secret jsonb not null,
  secret_preview text not null,
  status text not null default 'active',
  disabled_reason text,
  consecutive_failures integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  alter table public.webhook_subscriptions add constraint webhook_subscriptions_status_check
    check (status in ('active', 'disabled', 'suspended'));
exception when duplicate_object then null; end $$;

create index if not exists webhook_subscriptions_account_idx
  on public.webhook_subscriptions (account_id, created_at desc);

create index if not exists webhook_subscriptions_active_events_idx
  on public.webhook_subscriptions (account_id, status)
  where status = 'active';

alter table public.webhook_subscriptions enable row level security;

drop policy if exists webhook_subscriptions_owner on public.webhook_subscriptions;
create policy webhook_subscriptions_owner on public.webhook_subscriptions
  for all using (is_owner(account_id)) with check (is_owner(account_id));

-- ---------------------------------------------------------------------------
-- 6. WEBHOOK DELIVERIES
-- ---------------------------------------------------------------------------

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.webhook_subscriptions(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  event_id uuid not null references public.integration_events(id) on delete cascade,
  status text not null default 'pending',
  payload jsonb not null,
  attempt_count integer not null default 0,
  max_attempts integer not null default 8,
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  alter table public.webhook_deliveries add constraint webhook_deliveries_status_check
    check (status in ('pending', 'leased', 'delivered', 'failed', 'dead_letter'));
exception when duplicate_object then null; end $$;

create index if not exists webhook_deliveries_claim_queue_idx
  on public.webhook_deliveries (next_attempt_at, created_at)
  where status in ('pending', 'failed');

create index if not exists webhook_deliveries_subscription_history_idx
  on public.webhook_deliveries (subscription_id, created_at desc);

create index if not exists webhook_deliveries_account_history_idx
  on public.webhook_deliveries (account_id, created_at desc);

alter table public.webhook_deliveries enable row level security;

drop policy if exists webhook_deliveries_owner on public.webhook_deliveries;
create policy webhook_deliveries_owner on public.webhook_deliveries
  for select using (is_owner(account_id));

-- ---------------------------------------------------------------------------
-- 7. WEBHOOK DELIVERY ATTEMPTS
-- ---------------------------------------------------------------------------

create table if not exists public.webhook_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.webhook_deliveries(id) on delete cascade,
  subscription_id uuid not null references public.webhook_subscriptions(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  event_id uuid not null references public.integration_events(id) on delete cascade,
  attempt_number integer not null,
  http_status integer,
  duration_ms integer,
  request_headers jsonb,
  response_body_preview text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists webhook_delivery_attempts_delivery_idx
  on public.webhook_delivery_attempts (delivery_id, attempt_number desc);

alter table public.webhook_delivery_attempts enable row level security;

drop policy if exists webhook_delivery_attempts_owner on public.webhook_delivery_attempts;
create policy webhook_delivery_attempts_owner on public.webhook_delivery_attempts
  for select using (is_owner(account_id));

-- ---------------------------------------------------------------------------
-- 8. LEADS OUTBOX TRIGGER & FANOUT
-- ---------------------------------------------------------------------------

create or replace function public.build_public_lead_payload(p_lead public.leads)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
declare
  v_triage jsonb;
  v_score text;
  v_flags text[];
  v_contact_pref text;
begin
  v_triage := coalesce(p_lead.triage, '{}'::jsonb);
  v_score := case when v_triage->>'score' in ('hot', 'warm', 'low') then v_triage->>'score' else 'warm' end;
  v_contact_pref := case when v_triage->>'contactPreference' = 'text_only' then 'text_only' else 'any' end;

  return jsonb_build_object(
    'id', p_lead.id,
    'status', p_lead.status,
    'source', p_lead.source,
    'customer', jsonb_build_object(
      'name', p_lead.name,
      'phone', p_lead.phone,
      'email', p_lead.email,
      'address', p_lead.address
    ),
    'project', jsonb_build_object(
      'project_type', p_lead.project_type,
      'description', p_lead.message,
      'estimated_hours', p_lead.estimated_hours,
      'timeline', v_triage->>'timeline',
      'photo_urls', coalesce(to_jsonb(p_lead.photo_paths), '[]'::jsonb)
    ),
    'triage', jsonb_build_object(
      'score', v_score,
      'flags', coalesce(v_triage->'flags', '[]'::jsonb),
      'contact_preference', v_contact_pref
    ),
    'created_at', to_char(p_lead.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'updated_at', to_char(p_lead.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
end;
$$;

create or replace function public.leads_integration_outbox_trigger_fn()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_event_type text;
  v_lead_payload jsonb;
  v_event_id uuid;
  v_event_envelope jsonb;
  v_sub record;
  v_occurred_at timestamptz;
begin
  v_occurred_at := clock_timestamp();

  if tg_op = 'INSERT' then
    v_event_type := 'lead.created';
  elsif tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      v_event_type := 'lead.status_changed';
    elsif old.name is distinct from new.name
       or old.phone is distinct from new.phone
       or old.email is distinct from new.email
       or old.address is distinct from new.address
       or old.project_type is distinct from new.project_type
       or old.message is distinct from new.message
       or old.estimated_hours is distinct from new.estimated_hours
       or old.triage is distinct from new.triage
       or old.photo_paths is distinct from new.photo_paths then
      v_event_type := 'lead.updated';
    else
      return new;
    end if;
  else
    return new;
  end if;

  v_lead_payload := public.build_public_lead_payload(new);
  v_event_id := gen_random_uuid();

  -- 1. Insert into immutable outbox ledger
  insert into public.integration_events (
    id, account_id, event_type, aggregate_type, aggregate_id, payload, occurred_at, created_at
  ) values (
    v_event_id,
    new.account_id,
    v_event_type,
    'lead',
    new.id::text,
    v_lead_payload,
    v_occurred_at,
    v_occurred_at
  );

  v_event_envelope := jsonb_build_object(
    'id', v_event_id,
    'event', v_event_type,
    'occurred_at', to_char(v_occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'data', v_lead_payload
  );

  -- 2. Fan out to active matching subscriptions in the SAME database transaction
  for v_sub in
    select id
      from public.webhook_subscriptions
     where account_id = new.account_id
       and status = 'active'
       and v_event_type = any(event_types)
  loop
    insert into public.webhook_deliveries (
      subscription_id, account_id, event_id, status, payload, next_attempt_at, created_at, updated_at
    ) values (
      v_sub.id,
      new.account_id,
      v_event_id,
      'pending',
      v_event_envelope,
      v_occurred_at,
      v_occurred_at,
      v_occurred_at
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists leads_integration_outbox_trigger on public.leads;
create trigger leads_integration_outbox_trigger
after insert or update on public.leads
for each row execute function public.leads_integration_outbox_trigger_fn();

-- ---------------------------------------------------------------------------
-- 9. LEASING AND DELIVERY WORKER RPCS
-- ---------------------------------------------------------------------------

create or replace function public.claim_webhook_delivery_tasks(
  p_batch_size integer default 10
)
returns table (
  delivery_id uuid,
  subscription_id uuid,
  account_id uuid,
  event_id uuid,
  attempt_number integer,
  lease_token uuid,
  lease_expires_at timestamptz,
  target_url text,
  encrypted_secret jsonb,
  event_payload jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_lease_token uuid;
  v_lease_duration interval := interval '60 seconds';
  v_now timestamptz := clock_timestamp();
begin
  if p_batch_size < 1 or p_batch_size > 50 then
    raise exception 'Batch size must be between 1 and 50' using errcode = '22023';
  end if;

  v_lease_token := gen_random_uuid();

  return query
  with candidate_deliveries as (
    select d.id
      from public.webhook_deliveries d
      join public.webhook_subscriptions s on s.id = d.subscription_id
     where (d.status in ('pending', 'failed') or (d.status = 'leased' and d.lease_expires_at < v_now))
       and d.next_attempt_at <= v_now
       and s.status = 'active'
     order by d.next_attempt_at asc
     limit p_batch_size
     for update of d skip locked
  ),
  updated_deliveries as (
    update public.webhook_deliveries d
       set status = 'leased',
           lease_token = v_lease_token,
           lease_expires_at = v_now + v_lease_duration,
           attempt_count = d.attempt_count + 1,
           updated_at = v_now
      from candidate_deliveries c
     where d.id = c.id
    returning d.id, d.subscription_id, d.account_id, d.event_id, d.attempt_count, d.lease_token, d.lease_expires_at, d.payload
  )
  select u.id as delivery_id,
         u.subscription_id,
         u.account_id,
         u.event_id,
         u.attempt_count as attempt_number,
         u.lease_token,
         u.lease_expires_at,
         s.target_url,
         s.encrypted_secret,
         u.payload as event_payload
    from updated_deliveries u
    join public.webhook_subscriptions s on s.id = u.subscription_id;
end;
$$;

create or replace function public.complete_webhook_delivery(
  p_delivery_id uuid,
  p_lease_token uuid,
  p_duration_ms integer,
  p_http_status integer default 200,
  p_response_preview text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_delivery record;
begin
  update public.webhook_deliveries
     set status = 'delivered',
         delivered_at = v_now,
         lease_token = null,
         lease_expires_at = null,
         updated_at = v_now
   where id = p_delivery_id
     and lease_token = p_lease_token
  returning * into v_delivery;

  if not found then
    return false;
  end if;

  -- Reset consecutive failures on subscription
  update public.webhook_subscriptions
     set consecutive_failures = 0,
         updated_at = v_now
   where id = v_delivery.subscription_id;

  -- Record attempt history
  insert into public.webhook_delivery_attempts (
    delivery_id, subscription_id, account_id, event_id, attempt_number,
    http_status, duration_ms, response_body_preview, created_at
  ) values (
    v_delivery.id, v_delivery.subscription_id, v_delivery.account_id, v_delivery.event_id,
    v_delivery.attempt_count, p_http_status, p_duration_ms, p_response_preview, v_now
  );

  return true;
end;
$$;

create or replace function public.fail_webhook_delivery(
  p_delivery_id uuid,
  p_lease_token uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean,
  p_backoff_seconds integer,
  p_disable_subscription boolean default false,
  p_disable_reason text default null,
  p_http_status integer default null,
  p_duration_ms integer default null,
  p_response_preview text default null
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_delivery record;
  v_new_status text;
  v_next_attempt timestamptz;
begin
  select * into v_delivery
    from public.webhook_deliveries
   where id = p_delivery_id
     and lease_token = p_lease_token
   for update;

  if not found then
    return 'lease_expired';
  end if;

  if p_disable_subscription then
    v_new_status := 'failed';
    v_next_attempt := v_now + interval '365 days';

    update public.webhook_subscriptions
       set status = 'disabled',
           disabled_reason = coalesce(p_disable_reason, p_error_code),
           updated_at = v_now
     where id = v_delivery.subscription_id;
  elsif not p_retryable or v_delivery.attempt_count >= v_delivery.max_attempts then
    v_new_status := 'dead_letter';
    v_next_attempt := v_now + interval '365 days';

    update public.webhook_subscriptions
       set consecutive_failures = consecutive_failures + 1,
           updated_at = v_now
     where id = v_delivery.subscription_id;
  else
    v_new_status := 'failed';
    v_next_attempt := v_now + (greatest(5, coalesce(p_backoff_seconds, 60)) || ' seconds')::interval;

    update public.webhook_subscriptions
       set consecutive_failures = consecutive_failures + 1,
           updated_at = v_now
     where id = v_delivery.subscription_id;
  end if;

  update public.webhook_deliveries
     set status = v_new_status,
         next_attempt_at = v_next_attempt,
         last_error = p_error_code,
         lease_token = null,
         lease_expires_at = null,
         updated_at = v_now
   where id = p_delivery_id;

  -- Record attempt history
  insert into public.webhook_delivery_attempts (
    delivery_id, subscription_id, account_id, event_id, attempt_number,
    http_status, duration_ms, response_body_preview, error_code, error_message, created_at
  ) values (
    v_delivery.id, v_delivery.subscription_id, v_delivery.account_id, v_delivery.event_id,
    v_delivery.attempt_count, p_http_status, p_duration_ms, p_response_preview, p_error_code, p_error_message, v_now
  );

  return v_new_status;
end;
$$;

create or replace function public.retry_webhook_delivery(
  p_delivery_id uuid,
  p_account_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  update public.webhook_deliveries
     set status = 'pending',
         next_attempt_at = v_now,
         lease_token = null,
         lease_expires_at = null,
         updated_at = v_now
   where id = p_delivery_id
     and account_id = p_account_id
     and status in ('failed', 'dead_letter');

  return found;
end;
$$;

revoke all on function public.claim_webhook_delivery_tasks(integer) from public, anon, authenticated;
grant execute on function public.claim_webhook_delivery_tasks(integer) to service_role;

revoke all on function public.complete_webhook_delivery(uuid, uuid, integer, integer, text) from public, anon, authenticated;
grant execute on function public.complete_webhook_delivery(uuid, uuid, integer, integer, text) to service_role;

revoke all on function public.fail_webhook_delivery(uuid, uuid, text, text, boolean, integer, boolean, text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.fail_webhook_delivery(uuid, uuid, text, text, boolean, integer, boolean, text, integer, integer, text) to service_role;

revoke all on function public.retry_webhook_delivery(uuid, uuid) from public, anon, authenticated;
grant execute on function public.retry_webhook_delivery(uuid, uuid) to service_role;

commit;
