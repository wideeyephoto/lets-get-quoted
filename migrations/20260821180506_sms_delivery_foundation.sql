-- Durable, provider-neutral SMS delivery foundation.
--
-- DARK BY CONSTRUCTION. This migration creates no cron, webhook, trigger, or
-- provider call. Existing synchronous senders continue to behave exactly as
-- before until the application worker is deployed and producers are converted.
--
-- The safety boundary is deliberately in PostgreSQL:
--   * one event and one task are enqueued atomically;
--   * claims use short SKIP LOCKED transactions;
--   * provider I/O occurs after the claim transaction commits;
--   * a lease lost after request_started_at becomes indeterminate, never a
--     blind retry;
--   * consent and sender readiness are rechecked immediately before egress.

begin;

-- -------------------------------------------------------------------------
-- 1. Canonical, non-secret sender-number inventory.
-- -------------------------------------------------------------------------

create table if not exists public.sms_sender_numbers (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  provider text not null
    check (provider in ('twilio', 'signalwire')),
  e164_number text not null
    check (e164_number ~ '^\+[1-9][0-9]{7,14}$'),
  provider_number_id text,
  purpose text not null
    check (purpose in ('lgq_shared', 'lgq_dispatch', 'contractor_dedicated')),
  account_id uuid references public.accounts(id) on delete restrict,
  brand_id text,
  campaign_id text,
  assignment_id text,
  assignment_state text not null default 'not_started'
    check (assignment_state in (
      'not_started', 'pending', 'assigned', 'failed', 'suspended'
    )),
  inbound_resource_id text,
  inbound_webhook_url text,
  provisioning_status text not null default 'pending'
    check (provisioning_status in (
      'pending', 'purchased', 'campaign_pending', 'assignment_pending',
      'inbound_pending', 'active', 'suspended', 'release_pending',
      'released', 'failed', 'indeterminate'
    )),
  inbound_ready boolean not null default false,
  activated_at timestamptz,
  suspended_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint sms_sender_numbers_tenant_shape check (
    (purpose = 'contractor_dedicated' and account_id is not null)
    or (purpose in ('lgq_shared', 'lgq_dispatch') and account_id is null)
  ),
  constraint sms_sender_numbers_activation_shape check (
    (provisioning_status = 'active'
      and assignment_state = 'assigned'
      and inbound_ready
      and activated_at is not null
      and suspended_at is null)
    or provisioning_status <> 'active'
  )
);

create unique index if not exists sms_sender_numbers_provider_e164_uidx
  on public.sms_sender_numbers (provider, e164_number);
create unique index if not exists sms_sender_numbers_provider_resource_uidx
  on public.sms_sender_numbers (provider, provider_number_id)
  where provider_number_id is not null;
create unique index if not exists sms_sender_numbers_one_active_dedicated_uidx
  on public.sms_sender_numbers (account_id)
  where purpose = 'contractor_dedicated' and provisioning_status = 'active';
create index if not exists sms_sender_numbers_ready_lookup_idx
  on public.sms_sender_numbers (provider, purpose, account_id, e164_number)
  where provisioning_status = 'active'
    and assignment_state = 'assigned'
    and inbound_ready;

-- A STOP belongs to the exact number the recipient replied to. This sender-
-- scoped ledger is created with the delivery foundation so the final egress
-- gate can enforce it atomically. The webhook migration populates it.
create table if not exists public.sms_sender_keyword_preferences (
  sender_number_id uuid not null
    references public.sms_sender_numbers(id) on delete restrict,
  phone_number text not null
    check (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  status text not null check (status in ('opted_in', 'opted_out')),
  source text not null check (source in ('inbound_stop', 'inbound_start')),
  opted_out_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (sender_number_id, phone_number),
  constraint sms_sender_keyword_preferences_state_shape check (
    (status = 'opted_out' and opted_out_at is not null)
    or (status = 'opted_in' and opted_out_at is null)
  )
);

create index if not exists sms_sender_keyword_opt_out_idx
  on public.sms_sender_keyword_preferences (phone_number, sender_number_id)
  where status = 'opted_out';

-- -------------------------------------------------------------------------
-- 2. Extend sms_events without rewriting existing history.
-- -------------------------------------------------------------------------

alter table public.sms_events add column if not exists provider text;
alter table public.sms_events add column if not exists sender_number_id uuid
  references public.sms_sender_numbers(id) on delete restrict;
alter table public.sms_events add column if not exists idempotency_key text;
alter table public.sms_events add column if not exists message_kind text;
alter table public.sms_events add column if not exists billing_category text;
alter table public.sms_events add column if not exists sender_purpose text;
alter table public.sms_events add column if not exists queued_at timestamptz;
alter table public.sms_events add column if not exists send_started_at timestamptz;
alter table public.sms_events add column if not exists provider_accepted_at timestamptz;
alter table public.sms_events add column if not exists delivered_at timestamptz;
alter table public.sms_events add column if not exists failed_at timestamptz;
alter table public.sms_events add column if not exists indeterminate_at timestamptz;
alter table public.sms_events add column if not exists cancelled_at timestamptz;
alter table public.sms_events add column if not exists updated_at timestamptz
  not null default pg_catalog.now();

alter table public.sms_events drop constraint if exists sms_events_status_check;
alter table public.sms_events add constraint sms_events_status_check check (
  status in (
    'pending', 'queued', 'sending', 'sent', 'delivered', 'failed',
    'opted_out', 'indeterminate', 'cancelled', 'suppressed'
  )
);

-- The old enum-like checks could only represent payment/crew/subcontractor
-- rows. New canonical message kinds already live in sms-catalogue.ts; the
-- database protects their shape without creating a second list that drifts.
alter table public.sms_events drop constraint if exists sms_events_context_check;
alter table public.sms_events add constraint sms_events_context_check check (
  context ~ '^[a-z][a-z0-9_]{2,63}$'
);
alter table public.sms_events drop constraint if exists sms_events_event_type_allowed;
alter table public.sms_events add constraint sms_events_event_type_allowed check (
  event_type ~ '^[a-z][a-z0-9_]{2,99}$'
);
alter table public.sms_events drop constraint if exists sms_events_target_check;
alter table public.sms_events add constraint sms_events_target_check check (
  (context = 'payment' and payment_id is not null)
  or (context in ('crew', 'subcontractor') and crew_id is not null)
  or context in ('owner', 'customer', 'automation', 'platform')
);

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'sms_events_provider_check'
       and conrelid = 'public.sms_events'::pg_catalog.regclass
  ) then
    alter table public.sms_events add constraint sms_events_provider_check
      check (provider is null or provider in ('twilio', 'signalwire'));
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'sms_events_new_delivery_shape'
       and conrelid = 'public.sms_events'::pg_catalog.regclass
  ) then
    alter table public.sms_events add constraint sms_events_new_delivery_shape
      check (
        idempotency_key is null
        or (
          idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9:._/-]{2,199}$'
          and message_kind ~ '^[a-z][a-z0-9_-]{2,99}$'
          and billing_category in (
            'customer_message', 'crew_message', 'owner_alert',
            'payment_message', 'verification'
          )
          and sender_purpose in (
            'lgq_shared', 'lgq_dispatch', 'contractor_dedicated'
          )
          and queued_at is not null
          and (
            (status = 'queued')
            or (status = 'sending' and send_started_at is not null)
            or (status = 'sent' and provider_id is not null and provider_accepted_at is not null)
            or (status = 'delivered' and provider_id is not null and delivered_at is not null)
            or (status = 'failed' and failed_at is not null)
            or (status = 'indeterminate' and indeterminate_at is not null)
            or (status = 'cancelled' and cancelled_at is not null)
            or (status = 'suppressed' and cancelled_at is not null)
          )
        )
      ) not valid;
  end if;
end
$$;

create unique index if not exists sms_events_idempotency_uidx
  on public.sms_events (idempotency_key)
  where idempotency_key is not null;
create unique index if not exists sms_events_provider_message_uidx
  on public.sms_events (provider, provider_id)
  where provider is not null
    and provider_id is not null
    and provider_id <> 'simulated';
create index if not exists sms_events_sender_number_idx
  on public.sms_events (sender_number_id, created_at desc)
  where sender_number_id is not null;
create index if not exists sms_events_account_status_idx
  on public.sms_events (account_id, status, created_at desc);

-- -------------------------------------------------------------------------
-- 3. One leased task per event and append-only attempt evidence.
-- -------------------------------------------------------------------------

create table if not exists public.sms_delivery_tasks (
  sms_event_id uuid primary key
    references public.sms_events(id) on delete restrict,
  task_state text not null default 'queued'
    check (task_state in (
      'queued', 'leased', 'completed', 'failed', 'indeterminate', 'cancelled'
    )),
  claim_token uuid,
  lease_expires_at timestamptz,
  attempt_count integer not null default 0
    check (attempt_count between 0 and 8),
  available_at timestamptz not null default pg_catalog.now(),
  request_started_at timestamptz,
  last_error_code text
    check (last_error_code is null or last_error_code ~ '^[a-z][a-z0-9_]{2,99}$'),
  completed_at timestamptz,
  failed_at timestamptz,
  indeterminate_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint sms_delivery_tasks_state_shape check (
    (task_state = 'queued'
      and claim_token is null and lease_expires_at is null
      and request_started_at is null
      and completed_at is null and failed_at is null
      and indeterminate_at is null and cancelled_at is null)
    or (task_state = 'leased'
      and claim_token is not null and lease_expires_at is not null
      and completed_at is null and failed_at is null
      and indeterminate_at is null and cancelled_at is null)
    or (task_state = 'completed'
      and claim_token is null and lease_expires_at is null
      and completed_at is not null and failed_at is null
      and indeterminate_at is null and cancelled_at is null)
    or (task_state = 'failed'
      and claim_token is null and lease_expires_at is null
      and failed_at is not null and completed_at is null
      and indeterminate_at is null and cancelled_at is null)
    or (task_state = 'indeterminate'
      and claim_token is null and lease_expires_at is null
      and indeterminate_at is not null and completed_at is null
      and failed_at is null and cancelled_at is null)
    or (task_state = 'cancelled'
      and claim_token is null and lease_expires_at is null
      and cancelled_at is not null and completed_at is null
      and failed_at is null and indeterminate_at is null)
  )
);

create index if not exists sms_delivery_tasks_due_idx
  on public.sms_delivery_tasks (available_at, sms_event_id)
  where task_state = 'queued';
create index if not exists sms_delivery_tasks_expired_lease_idx
  on public.sms_delivery_tasks (lease_expires_at, sms_event_id)
  where task_state = 'leased';

create table if not exists public.sms_delivery_attempts (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  sms_event_id uuid not null
    references public.sms_delivery_tasks(sms_event_id) on delete restrict,
  claim_token uuid not null unique,
  attempt_number integer not null check (attempt_number between 1 and 8),
  leased_at timestamptz not null,
  lease_expires_at timestamptz not null,
  request_started_at timestamptz,
  outcome text check (outcome is null or outcome in (
    'completed', 'retryable_failure', 'terminal_failure', 'indeterminate',
    'provider_rejected_retryable', 'provider_rejected_terminal',
    'cancelled', 'deferred', 'lease_expired'
  )),
  error_code text
    check (error_code is null or error_code ~ '^[a-z][a-z0-9_]{2,99}$'),
  finished_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  unique (sms_event_id, attempt_number),
  constraint sms_delivery_attempts_outcome_shape check (
    (outcome is null and finished_at is null)
    or (outcome is not null and finished_at is not null)
  )
);

create unique index if not exists sms_delivery_attempts_one_open_uidx
  on public.sms_delivery_attempts (sms_event_id)
  where outcome is null;

create or replace function public.prevent_sms_delivery_attempt_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'SMS delivery attempts are append-only'
      using errcode = '55000';
  end if;
  if old.sms_event_id is distinct from new.sms_event_id
     or old.claim_token is distinct from new.claim_token
     or old.attempt_number is distinct from new.attempt_number
     or old.leased_at is distinct from new.leased_at
     or old.lease_expires_at is distinct from new.lease_expires_at
     or old.created_at is distinct from new.created_at
     or old.outcome is not null then
    raise exception 'SMS delivery attempt identity and terminal outcome are immutable'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists sms_delivery_attempts_append_only
  on public.sms_delivery_attempts;
create trigger sms_delivery_attempts_append_only
before update or delete on public.sms_delivery_attempts
for each row execute function public.prevent_sms_delivery_attempt_mutation();

-- -------------------------------------------------------------------------
-- 4. Atomic enqueue and bounded claims.
-- -------------------------------------------------------------------------

create or replace function public.enqueue_sms_delivery(
  p_account_id uuid,
  p_phone_number text,
  p_body text,
  p_message_kind text,
  p_billing_category text,
  p_sender_purpose text,
  p_context text,
  p_event_type text,
  p_idempotency_key text,
  p_payment_id uuid default null,
  p_crew_id uuid default null,
  p_sender_number_id uuid default null
)
returns table (
  sms_event_id uuid,
  task_state text,
  created boolean
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_event public.sms_events%rowtype;
  v_inserted boolean := false;
begin
  if p_account_id is null then
    raise exception 'SMS delivery requires an account'
      using errcode = '22023';
  end if;
  if p_phone_number is null or p_phone_number !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'SMS destination must be E.164'
      using errcode = '22023';
  end if;
  if p_body is null or pg_catalog.length(p_body) not between 1 and 5000 then
    raise exception 'SMS body length is invalid'
      using errcode = '22023';
  end if;
  if p_message_kind is null or p_message_kind !~ '^[a-z][a-z0-9_-]{2,99}$' then
    raise exception 'SMS message kind is invalid'
      using errcode = '22023';
  end if;
  if p_billing_category is null or p_billing_category not in (
    'customer_message', 'crew_message', 'owner_alert',
    'payment_message', 'verification'
  ) then
    raise exception 'SMS billing category is invalid'
      using errcode = '22023';
  end if;
  if p_sender_purpose is null or p_sender_purpose not in (
    'lgq_shared', 'lgq_dispatch', 'contractor_dedicated'
  ) then
    raise exception 'SMS sender purpose is invalid'
      using errcode = '22023';
  end if;
  if p_context is null or p_context !~ '^[a-z][a-z0-9_]{2,63}$'
     or p_event_type is null or p_event_type !~ '^[a-z][a-z0-9_]{2,99}$' then
    raise exception 'SMS context or event type is invalid'
      using errcode = '22023';
  end if;
  if p_idempotency_key is null
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9:._/-]{2,199}$' then
    raise exception 'SMS idempotency key is invalid'
      using errcode = '22023';
  end if;
  if p_context = 'payment' and p_payment_id is null
     or p_context in ('crew', 'subcontractor') and p_crew_id is null
     or p_context not in (
       'payment', 'crew', 'subcontractor', 'owner',
       'customer', 'automation', 'platform'
     ) then
    raise exception 'SMS context target is invalid'
      using errcode = '22023';
  end if;

  insert into public.sms_events (
    account_id, payment_id, event_type, phone_number, status, body,
    context, crew_id, provider, sender_number_id, idempotency_key,
    message_kind, billing_category, sender_purpose, queued_at, updated_at
  ) values (
    p_account_id, p_payment_id, p_event_type, p_phone_number, 'queued', p_body,
    p_context, p_crew_id, null, p_sender_number_id, p_idempotency_key,
    p_message_kind, p_billing_category, p_sender_purpose, v_now, v_now
  )
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning * into v_event;

  if found then
    v_inserted := true;
    insert into public.sms_delivery_tasks (
      sms_event_id, task_state, available_at, created_at, updated_at
    ) values (
      v_event.id, 'queued', v_now, v_now, v_now
    );
  else
    select e.* into v_event
      from public.sms_events e
     where e.idempotency_key = p_idempotency_key
     for update;
    if not found then
      raise exception 'SMS idempotency conflict cannot be resolved'
        using errcode = '40001';
    end if;
    if v_event.account_id is distinct from p_account_id
       or v_event.phone_number is distinct from p_phone_number
       or v_event.body is distinct from p_body
       or v_event.message_kind is distinct from p_message_kind
       or v_event.billing_category is distinct from p_billing_category
       or v_event.sender_purpose is distinct from p_sender_purpose
       or v_event.context is distinct from p_context
       or v_event.event_type is distinct from p_event_type
       or v_event.payment_id is distinct from p_payment_id
       or v_event.crew_id is distinct from p_crew_id
       or v_event.sender_number_id is distinct from p_sender_number_id then
      raise exception 'SMS idempotency key was reused with a different payload'
        using errcode = '22000';
    end if;
    if not exists (
      select 1 from public.sms_delivery_tasks t
       where t.sms_event_id = v_event.id
    ) then
      raise exception 'SMS event exists without its delivery task'
        using errcode = '55000';
    end if;
  end if;

  return query
  select v_event.id, t.task_state, v_inserted
    from public.sms_delivery_tasks t
   where t.sms_event_id = v_event.id;
end;
$$;

create or replace function public.claim_sms_delivery_tasks(p_batch_size integer)
returns table (
  work_claim_token uuid,
  sms_event_id uuid,
  account_id uuid,
  phone_number text,
  body text,
  message_kind text,
  billing_category text,
  sender_purpose text,
  attempt_number integer,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_task public.sms_delivery_tasks%rowtype;
  v_token uuid;
  v_lease timestamptz;
begin
  if p_batch_size is null or p_batch_size not between 1 and 25 then
    raise exception 'SMS delivery batch size must be between 1 and 25'
      using errcode = '22023';
  end if;

  -- Recover stale leases before selecting new work. A request-started lease is
  -- terminally uncertain; a pre-request lease may safely return to the queue.
  for v_task in
    select t.*
      from public.sms_delivery_tasks t
     where t.task_state = 'leased'
       and t.lease_expires_at <= v_now
     order by t.lease_expires_at, t.sms_event_id
     for update skip locked
  loop
    if v_task.request_started_at is not null then
      update public.sms_events e
         set status = 'indeterminate',
             error_reason = 'sms_delivery_unknown_after_lease_expiry',
             indeterminate_at = v_now,
             updated_at = v_now
       where e.id = v_task.sms_event_id
         and e.status = 'sending';
      if not found then
        raise exception 'Expired SMS request has no exact sending event'
          using errcode = '55000';
      end if;
      update public.sms_delivery_attempts a
         set outcome = 'indeterminate',
             error_code = 'sms_delivery_unknown_after_lease_expiry',
             finished_at = v_now
       where a.claim_token = v_task.claim_token
         and a.outcome is null;
      if not found then
        raise exception 'Expired SMS request has no open attempt'
          using errcode = '55000';
      end if;
      update public.sms_delivery_tasks t
         set task_state = 'indeterminate',
             claim_token = null,
             lease_expires_at = null,
             last_error_code = 'sms_delivery_unknown_after_lease_expiry',
             indeterminate_at = v_now,
             updated_at = v_now
       where t.sms_event_id = v_task.sms_event_id;
    elsif v_task.attempt_count >= 8 then
      update public.sms_events e
         set status = 'failed',
             error_reason = 'sms_delivery_attempt_limit_reached',
             failed_at = v_now,
             updated_at = v_now
       where e.id = v_task.sms_event_id
         and e.status = 'queued';
      update public.sms_delivery_attempts a
         set outcome = 'terminal_failure',
             error_code = 'sms_delivery_attempt_limit_reached',
             finished_at = v_now
       where a.claim_token = v_task.claim_token
         and a.outcome is null;
      update public.sms_delivery_tasks t
         set task_state = 'failed', claim_token = null,
             lease_expires_at = null,
             last_error_code = 'sms_delivery_attempt_limit_reached',
             failed_at = v_now, updated_at = v_now
       where t.sms_event_id = v_task.sms_event_id;
    else
      update public.sms_delivery_attempts a
         set outcome = 'lease_expired',
             error_code = 'sms_delivery_pre_request_lease_expired',
             finished_at = v_now
       where a.claim_token = v_task.claim_token
         and a.outcome is null;
      if not found then
        raise exception 'Expired SMS lease has no open attempt'
          using errcode = '55000';
      end if;
      update public.sms_delivery_tasks t
         set task_state = 'queued', claim_token = null,
             lease_expires_at = null, available_at = v_now,
             last_error_code = 'sms_delivery_pre_request_lease_expired',
             updated_at = v_now
       where t.sms_event_id = v_task.sms_event_id;
    end if;
  end loop;

  for v_task in
    select t.*
      from public.sms_delivery_tasks t
     where t.task_state = 'queued'
       and t.available_at <= v_now
       and t.attempt_count < 8
     order by t.available_at, t.sms_event_id
     limit p_batch_size
     for update skip locked
  loop
    v_token := pg_catalog.gen_random_uuid();
    v_lease := v_now + interval '5 minutes';

    update public.sms_delivery_tasks t
       set task_state = 'leased',
           claim_token = v_token,
           lease_expires_at = v_lease,
           attempt_count = t.attempt_count + 1,
           request_started_at = null,
           last_error_code = null,
           updated_at = v_now
     where t.sms_event_id = v_task.sms_event_id;

    insert into public.sms_delivery_attempts (
      sms_event_id, claim_token, attempt_number,
      leased_at, lease_expires_at, created_at
    ) values (
      v_task.sms_event_id, v_token, v_task.attempt_count + 1,
      v_now, v_lease, v_now
    );

    return query
    select v_token, e.id, e.account_id, e.phone_number, e.body,
           e.message_kind, e.billing_category, e.sender_purpose,
           v_task.attempt_count + 1, v_lease
      from public.sms_events e
     where e.id = v_task.sms_event_id
       and e.status = 'queued';
  end loop;
end;
$$;

-- -------------------------------------------------------------------------
-- 5. Last-moment consent/sender gate and compare-and-set finalization.
-- -------------------------------------------------------------------------

create or replace function public.stage_sms_delivery(
  p_sms_event_id uuid,
  p_claim_token uuid,
  p_provider text
)
returns table (
  dispatch_status text,
  sender_number_id uuid,
  sender_e164 text,
  provider_number_id text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_task public.sms_delivery_tasks%rowtype;
  v_event public.sms_events%rowtype;
  v_sender public.sms_sender_numbers%rowtype;
begin
  if p_provider is null or p_provider not in ('twilio', 'signalwire') then
    raise exception 'SMS provider is invalid'
      using errcode = '22023';
  end if;
  select t.* into v_task
    from public.sms_delivery_tasks t
   where t.sms_event_id = p_sms_event_id
   for update;
  select e.* into v_event
    from public.sms_events e
   where e.id = p_sms_event_id
   for update;
  if v_task.sms_event_id is null or v_event.id is null
     or v_task.task_state <> 'leased'
     or v_task.claim_token is distinct from p_claim_token
     or v_task.lease_expires_at <= v_now
     or v_task.request_started_at is not null
     or v_event.status <> 'queued' then
    raise exception 'SMS delivery lease is stale or invalid'
      using errcode = '55000';
  end if;

  if not exists (
    select 1 from public.sms_consent c
     where c.account_id = v_event.account_id
       and c.phone_number = v_event.phone_number
       and c.status = 'opted_in'
       and c.consented_at is not null
       and c.opted_out_at is null
  ) then
    update public.sms_events e
       set status = 'cancelled', error_reason = 'sms_consent_not_current',
           cancelled_at = v_now, updated_at = v_now
     where e.id = v_event.id;
    update public.sms_delivery_tasks t
       set task_state = 'cancelled', claim_token = null,
           lease_expires_at = null, last_error_code = 'sms_consent_not_current',
           cancelled_at = v_now, updated_at = v_now
     where t.sms_event_id = v_event.id;
    update public.sms_delivery_attempts a
       set outcome = 'cancelled', error_code = 'sms_consent_not_current',
           finished_at = v_now
     where a.claim_token = p_claim_token and a.outcome is null;
    return query select 'cancelled'::text, null::uuid, null::text, null::text;
    return;
  end if;

  if v_event.sender_number_id is not null then
    select s.* into v_sender
      from public.sms_sender_numbers s
     where s.id = v_event.sender_number_id
       and s.provider = p_provider
       and s.purpose = v_event.sender_purpose
       and (s.account_id is null or s.account_id = v_event.account_id)
       and s.provisioning_status = 'active'
       and s.assignment_state = 'assigned'
       and s.inbound_ready
       and s.suspended_at is null
     for share;
  else
    select s.* into v_sender
      from public.sms_sender_numbers s
     where s.provider = p_provider
       and s.purpose = v_event.sender_purpose
       and (
         (s.purpose = 'contractor_dedicated' and s.account_id = v_event.account_id)
         or (s.purpose in ('lgq_shared', 'lgq_dispatch') and s.account_id is null)
       )
       and s.provisioning_status = 'active'
       and s.assignment_state = 'assigned'
       and s.inbound_ready
       and s.suspended_at is null
     order by s.activated_at, s.id
     limit 1
     for share;
  end if;
  if v_sender.id is null then
    return query select 'blocked_sender'::text, null::uuid, null::text, null::text;
    return;
  end if;

  -- Recheck sender-scoped STOP at the same compare-and-set boundary as consent
  -- and inventory readiness. A STOP arriving after enqueue but before egress
  -- therefore wins without a race, including for the shared LGQ sender.
  if exists (
    select 1
      from public.sms_sender_keyword_preferences p
     where p.sender_number_id = v_sender.id
       and p.phone_number = v_event.phone_number
       and p.status = 'opted_out'
       and p.opted_out_at is not null
  ) then
    update public.sms_events e
       set status = 'cancelled', error_reason = 'sms_sender_opted_out',
           cancelled_at = v_now, updated_at = v_now
     where e.id = v_event.id;
    update public.sms_delivery_tasks t
       set task_state = 'cancelled', claim_token = null,
           lease_expires_at = null, last_error_code = 'sms_sender_opted_out',
           cancelled_at = v_now, updated_at = v_now
     where t.sms_event_id = v_event.id;
    update public.sms_delivery_attempts a
       set outcome = 'cancelled', error_code = 'sms_sender_opted_out',
           finished_at = v_now
     where a.claim_token = p_claim_token and a.outcome is null;
    return query select 'cancelled'::text, null::uuid, null::text, null::text;
    return;
  end if;

  update public.sms_events e
     set provider = p_provider,
         sender_number_id = v_sender.id,
         updated_at = v_now
   where e.id = v_event.id;

  return query
  select 'ready'::text, v_sender.id, v_sender.e164_number,
         v_sender.provider_number_id;
end;
$$;

create or replace function public.mark_sms_delivery_request_started(
  p_sms_event_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  update public.sms_delivery_tasks t
     set request_started_at = v_now, updated_at = v_now
   where t.sms_event_id = p_sms_event_id
     and t.task_state = 'leased'
     and t.claim_token = p_claim_token
     and t.lease_expires_at > v_now
     and t.request_started_at is null;
  if not found then
    raise exception 'SMS delivery lease cannot start a provider request'
      using errcode = '55000';
  end if;
  update public.sms_delivery_attempts a
     set request_started_at = v_now
   where a.claim_token = p_claim_token and a.outcome is null;
  if not found then
    raise exception 'SMS delivery request has no open attempt'
      using errcode = '55000';
  end if;
  update public.sms_events e
     set status = 'sending', send_started_at = v_now, updated_at = v_now
   where e.id = p_sms_event_id and e.status = 'queued';
  if not found then
    raise exception 'SMS delivery request has no queued event'
      using errcode = '55000';
  end if;
  return true;
end;
$$;

create or replace function public.complete_sms_delivery(
  p_sms_event_id uuid,
  p_claim_token uuid,
  p_provider_id text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_event public.sms_events%rowtype;
begin
  if p_provider_id is null or pg_catalog.length(p_provider_id) not between 1 and 255
     or p_provider_id = 'simulated' then
    raise exception 'SMS provider message id is invalid'
      using errcode = '22023';
  end if;
  select e.* into v_event
    from public.sms_events e
    join public.sms_delivery_tasks t on t.sms_event_id = e.id
   where e.id = p_sms_event_id
     and e.status = 'sending'
     and t.task_state = 'leased'
     and t.claim_token = p_claim_token
     and t.request_started_at is not null
   for update of e, t;
  if not found then
    raise exception 'SMS completion lease is stale or invalid'
      using errcode = '55000';
  end if;

  update public.sms_events e
     set status = 'sent', provider_id = p_provider_id,
         provider_accepted_at = v_now, sent_at = v_now,
         error_reason = null, updated_at = v_now
   where e.id = p_sms_event_id;
  update public.sms_delivery_tasks t
     set task_state = 'completed', claim_token = null,
         lease_expires_at = null, last_error_code = null,
         completed_at = v_now, updated_at = v_now
   where t.sms_event_id = p_sms_event_id;
  update public.sms_delivery_attempts a
     set outcome = 'completed', finished_at = v_now
   where a.claim_token = p_claim_token and a.outcome is null;
  if not found then
    raise exception 'SMS completion has no open attempt'
      using errcode = '55000';
  end if;

  insert into public.sms_messages (
    id, account_id, phone_number, direction, body,
    provider_id, read_at, created_at
  ) values (
    v_event.id, v_event.account_id, v_event.phone_number, 'outbound',
    v_event.body, p_provider_id, v_now, v_now
  ) on conflict (id) do nothing;
  return true;
end;
$$;

create or replace function public.fail_sms_delivery(
  p_sms_event_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_retryable boolean
)
returns table (
  failure_status text,
  task_state text,
  next_attempt_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_task public.sms_delivery_tasks%rowtype;
  v_next timestamptz;
begin
  if p_error_code is null or p_error_code !~ '^[a-z][a-z0-9_]{2,99}$' then
    raise exception 'SMS delivery error code is invalid'
      using errcode = '22023';
  end if;
  select t.* into v_task
    from public.sms_delivery_tasks t
   where t.sms_event_id = p_sms_event_id
     and t.task_state = 'leased'
     and t.claim_token = p_claim_token
   for update;
  if not found then
    raise exception 'SMS failure lease is stale or invalid'
      using errcode = '55000';
  end if;

  if v_task.request_started_at is not null then
    update public.sms_events e
       set status = 'indeterminate', error_reason = p_error_code,
           indeterminate_at = v_now, updated_at = v_now
     where e.id = p_sms_event_id and e.status = 'sending';
    update public.sms_delivery_tasks t
       set task_state = 'indeterminate', claim_token = null,
           lease_expires_at = null, last_error_code = p_error_code,
           indeterminate_at = v_now, updated_at = v_now
     where t.sms_event_id = p_sms_event_id;
    update public.sms_delivery_attempts a
       set outcome = 'indeterminate', error_code = p_error_code,
           finished_at = v_now
     where a.claim_token = p_claim_token and a.outcome is null;
    return query select 'indeterminate'::text, 'indeterminate'::text, null::timestamptz;
    return;
  end if;

  if p_retryable and v_task.attempt_count < 8 then
    v_next := v_now + pg_catalog.make_interval(
      secs => least(900, 15 * (2 ^ least(v_task.attempt_count - 1, 6)))::integer
    );
    update public.sms_delivery_tasks t
       set task_state = 'queued', claim_token = null,
           lease_expires_at = null, available_at = v_next,
           last_error_code = p_error_code, updated_at = v_now
     where t.sms_event_id = p_sms_event_id;
    update public.sms_delivery_attempts a
       set outcome = 'retryable_failure', error_code = p_error_code,
           finished_at = v_now
     where a.claim_token = p_claim_token and a.outcome is null;
    return query select 'retryable'::text, 'queued'::text, v_next;
    return;
  end if;

  update public.sms_events e
     set status = 'failed', error_reason = p_error_code,
         failed_at = v_now, updated_at = v_now
   where e.id = p_sms_event_id and e.status = 'queued';
  update public.sms_delivery_tasks t
     set task_state = 'failed', claim_token = null,
         lease_expires_at = null, last_error_code = p_error_code,
         failed_at = v_now, updated_at = v_now
   where t.sms_event_id = p_sms_event_id;
  update public.sms_delivery_attempts a
     set outcome = 'terminal_failure', error_code = p_error_code,
         finished_at = v_now
   where a.claim_token = p_claim_token and a.outcome is null;
  return query select 'terminal'::text, 'failed'::text, null::timestamptz;
end;
$$;

-- A received provider rejection is categorically different from a lost
-- response. This RPC is intentionally unusable before request_started_at: only
-- positive response evidence may cross a started attempt back into the retry
-- queue or into an ordinary terminal failure.
create or replace function public.record_sms_delivery_provider_rejection(
  p_sms_event_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_retryable boolean
)
returns table (
  failure_status text,
  task_state text,
  next_attempt_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_task public.sms_delivery_tasks%rowtype;
  v_event public.sms_events%rowtype;
  v_next timestamptz;
begin
  if p_error_code is null or p_error_code !~ '^[a-z][a-z0-9_]{2,99}$'
     or p_retryable is null then
    raise exception 'SMS provider rejection arguments are invalid'
      using errcode = '22023';
  end if;

  select t.* into v_task
    from public.sms_delivery_tasks t
   where t.sms_event_id = p_sms_event_id
   for update;
  select e.* into v_event
    from public.sms_events e
   where e.id = p_sms_event_id
   for update;
  if v_task.sms_event_id is null or v_event.id is null
     or v_task.task_state <> 'leased'
     or v_task.claim_token is distinct from p_claim_token
     or v_task.request_started_at is null
     or v_event.status <> 'sending' then
    raise exception 'SMS provider rejection lease is stale or not request-started'
      using errcode = '55000';
  end if;

  if p_retryable and v_task.attempt_count < 8 then
    v_next := v_now + pg_catalog.make_interval(
      secs => least(900, 15 * (2 ^ least(v_task.attempt_count - 1, 6)))::integer
    );
    update public.sms_events e
       set status = 'queued', send_started_at = null,
           error_reason = p_error_code, updated_at = v_now
     where e.id = p_sms_event_id and e.status = 'sending';
    if not found then
      raise exception 'Retryable SMS rejection has no exact sending event'
        using errcode = '55000';
    end if;
    update public.sms_delivery_tasks t
       set task_state = 'queued', claim_token = null,
           lease_expires_at = null, request_started_at = null,
           available_at = v_next, last_error_code = p_error_code,
           updated_at = v_now
     where t.sms_event_id = p_sms_event_id;
    update public.sms_delivery_attempts a
       set outcome = 'provider_rejected_retryable', error_code = p_error_code,
           finished_at = v_now
     where a.claim_token = p_claim_token and a.outcome is null;
    if not found then
      raise exception 'Retryable SMS rejection has no open attempt'
        using errcode = '55000';
    end if;
    return query select 'retryable'::text, 'queued'::text, v_next;
    return;
  end if;

  update public.sms_events e
     set status = 'failed', error_reason = p_error_code,
         failed_at = v_now, updated_at = v_now
   where e.id = p_sms_event_id and e.status = 'sending';
  if not found then
    raise exception 'Terminal SMS rejection has no exact sending event'
      using errcode = '55000';
  end if;
  update public.sms_delivery_tasks t
     set task_state = 'failed', claim_token = null,
         lease_expires_at = null, last_error_code = p_error_code,
         failed_at = v_now, updated_at = v_now
   where t.sms_event_id = p_sms_event_id;
  update public.sms_delivery_attempts a
     set outcome = 'provider_rejected_terminal', error_code = p_error_code,
         finished_at = v_now
   where a.claim_token = p_claim_token and a.outcome is null;
  if not found then
    raise exception 'Terminal SMS rejection has no open attempt'
      using errcode = '55000';
  end if;
  return query select 'terminal'::text, 'failed'::text, null::timestamptz;
end;
$$;

create or replace function public.defer_sms_delivery(
  p_sms_event_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_delay_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_error_code is null or p_error_code !~ '^[a-z][a-z0-9_]{2,99}$'
     or p_delay_seconds is null or p_delay_seconds not between 5 and 86400 then
    raise exception 'SMS defer arguments are invalid'
      using errcode = '22023';
  end if;
  update public.sms_delivery_tasks t
     set task_state = 'queued', claim_token = null,
         lease_expires_at = null,
         available_at = v_now + pg_catalog.make_interval(secs => p_delay_seconds),
         last_error_code = p_error_code, updated_at = v_now
   where t.sms_event_id = p_sms_event_id
     and t.task_state = 'leased'
     and t.claim_token = p_claim_token
     and t.request_started_at is null;
  if not found then
    raise exception 'SMS delivery cannot be deferred after request start'
      using errcode = '55000';
  end if;
  update public.sms_delivery_attempts a
     set outcome = 'deferred', error_code = p_error_code,
         finished_at = v_now
   where a.claim_token = p_claim_token and a.outcome is null;
  if not found then
    raise exception 'Deferred SMS delivery has no open attempt'
      using errcode = '55000';
  end if;
  return true;
end;
$$;

-- -------------------------------------------------------------------------
-- 6. Service-only storage and narrow RPC boundary.
-- -------------------------------------------------------------------------

alter table public.sms_sender_numbers enable row level security;
alter table public.sms_sender_numbers force row level security;
alter table public.sms_sender_keyword_preferences enable row level security;
alter table public.sms_sender_keyword_preferences force row level security;
alter table public.sms_delivery_tasks enable row level security;
alter table public.sms_delivery_tasks force row level security;
alter table public.sms_delivery_attempts enable row level security;
alter table public.sms_delivery_attempts force row level security;

revoke all on table public.sms_sender_numbers
  from public, anon, authenticated, service_role;
revoke all on table public.sms_sender_keyword_preferences
  from public, anon, authenticated, service_role;
revoke all on table public.sms_delivery_tasks
  from public, anon, authenticated, service_role;
revoke all on table public.sms_delivery_attempts
  from public, anon, authenticated, service_role;

-- Operations can inspect readiness and queue health through the service-role
-- server client, but every mutation remains behind the audited/narrow RPCs.
grant select on table public.sms_sender_numbers to service_role;
grant select on table public.sms_sender_keyword_preferences to service_role;
grant select on table public.sms_delivery_tasks to service_role;
grant select on table public.sms_delivery_attempts to service_role;

-- sms_events remains owner-readable but never owner-writable. Restate the
-- effective post-settlement boundary because schema.sql historically carried
-- an obsolete FOR ALL policy.
drop policy if exists sms_event_all on public.sms_events;
drop policy if exists sms_event_owner_read on public.sms_events;
create policy sms_event_owner_read
on public.sms_events
for select
to authenticated
using ((select public.is_owner(account_id)));
revoke all on table public.sms_events
  from public, anon, authenticated, service_role;
grant select on table public.sms_events to authenticated;
grant select, insert, update, delete on table public.sms_events to service_role;

revoke all on function public.prevent_sms_delivery_attempt_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.enqueue_sms_delivery(uuid,text,text,text,text,text,text,text,text,uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_sms_delivery_tasks(integer)
  from public, anon, authenticated, service_role;
revoke all on function public.stage_sms_delivery(uuid,uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function public.mark_sms_delivery_request_started(uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_sms_delivery(uuid,uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function public.fail_sms_delivery(uuid,uuid,text,boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.record_sms_delivery_provider_rejection(uuid,uuid,text,boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.defer_sms_delivery(uuid,uuid,text,integer)
  from public, anon, authenticated, service_role;

grant execute on function public.enqueue_sms_delivery(uuid,text,text,text,text,text,text,text,text,uuid,uuid,uuid)
  to service_role;
grant execute on function public.claim_sms_delivery_tasks(integer)
  to service_role;
grant execute on function public.stage_sms_delivery(uuid,uuid,text)
  to service_role;
grant execute on function public.mark_sms_delivery_request_started(uuid,uuid)
  to service_role;
grant execute on function public.complete_sms_delivery(uuid,uuid,text)
  to service_role;
grant execute on function public.fail_sms_delivery(uuid,uuid,text,boolean)
  to service_role;
grant execute on function public.record_sms_delivery_provider_rejection(uuid,uuid,text,boolean)
  to service_role;
grant execute on function public.defer_sms_delivery(uuid,uuid,text,integer)
  to service_role;

commit;
