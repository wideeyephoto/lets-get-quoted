-- Close the remaining crash windows around payment-transition producers,
-- missed-call callbacks, ambiguous specialized payment SMS sends, and text
-- reservations whose provider request has already crossed the no-return line.
-- All mutation surfaces in this migration are service-role only.

begin;

-- -------------------------------------------------------------------------
-- 1. Transactional producer outbox for legacy/destination payment SMS.
-- -------------------------------------------------------------------------

create table if not exists public.payment_sms_producer_tasks (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  payment_id uuid not null,
  account_id uuid not null references public.accounts(id) on delete restrict,
  event_type text not null
    check (event_type in ('payment_paid', 'payment_failed', 'payment_refunded')),
  task_state text not null default 'ready'
    check (task_state in ('ready', 'leased', 'retry_wait', 'completed', 'dead_letter')),
  claim_token uuid,
  lease_expires_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count between 0 and 8),
  next_attempt_at timestamptz,
  sms_event_id uuid references public.sms_events(id) on delete restrict,
  outcome text check (
    outcome is null or outcome in ('queued', 'duplicate', 'skipped', 'opted_out', 'superseded')
  ),
  last_error_code text check (
    last_error_code is null or last_error_code ~ '^[a-z][a-z0-9_]{2,99}$'
  ),
  completed_at timestamptz,
  dead_lettered_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint payment_sms_producer_payment_scope_fk
    foreign key (payment_id, account_id)
    references public.payments(id, account_id) on delete restrict,
  constraint payment_sms_producer_identity_unique unique (payment_id, event_type),
  constraint payment_sms_producer_task_shape check (
    (task_state = 'ready'
      and claim_token is null and lease_expires_at is null
      and attempt_count = 0 and next_attempt_at is null
      and outcome is null and sms_event_id is null
      and last_error_code is null and completed_at is null and dead_lettered_at is null)
    or (task_state = 'leased'
      and claim_token is not null and lease_expires_at is not null
      and attempt_count between 1 and 8 and next_attempt_at is null
      and outcome is null and sms_event_id is null
      and completed_at is null and dead_lettered_at is null)
    or (task_state = 'retry_wait'
      and claim_token is null and lease_expires_at is null
      and attempt_count between 1 and 7 and next_attempt_at is not null
      and outcome is null and sms_event_id is null
      and last_error_code is not null and completed_at is null and dead_lettered_at is null)
    or (task_state = 'completed'
      and claim_token is null and lease_expires_at is null
      and attempt_count between 1 and 8 and next_attempt_at is null
      and outcome is not null and last_error_code is null
      and completed_at is not null and dead_lettered_at is null
      and ((outcome in ('queued', 'duplicate') and sms_event_id is not null)
        or (outcome in ('skipped', 'opted_out', 'superseded') and sms_event_id is null)))
    or (task_state = 'dead_letter'
      and claim_token is null and lease_expires_at is null
      and attempt_count between 1 and 8 and next_attempt_at is null
      and outcome is null and sms_event_id is null
      and last_error_code is not null and completed_at is null and dead_lettered_at is not null)
  )
);

-- `if not exists` preserves data on a replay; these named postconditions keep
-- the durable state machine current if the migration text itself is reapplied
-- while developing the not-yet-deployed phase.
alter table public.payment_sms_producer_tasks
  drop constraint if exists payment_sms_producer_tasks_outcome_check;
alter table public.payment_sms_producer_tasks
  drop constraint if exists payment_sms_producer_outcome_check;
alter table public.payment_sms_producer_tasks
  add constraint payment_sms_producer_outcome_check check (
    outcome is null or outcome in (
      'queued', 'duplicate', 'skipped', 'opted_out', 'superseded'
    )
  );
alter table public.payment_sms_producer_tasks
  drop constraint if exists payment_sms_producer_task_shape;
alter table public.payment_sms_producer_tasks
  add constraint payment_sms_producer_task_shape check (
    (task_state = 'ready'
      and claim_token is null and lease_expires_at is null
      and attempt_count = 0 and next_attempt_at is null
      and outcome is null and sms_event_id is null
      and last_error_code is null and completed_at is null and dead_lettered_at is null)
    or (task_state = 'leased'
      and claim_token is not null and lease_expires_at is not null
      and attempt_count between 1 and 8 and next_attempt_at is null
      and outcome is null and sms_event_id is null
      and completed_at is null and dead_lettered_at is null)
    or (task_state = 'retry_wait'
      and claim_token is null and lease_expires_at is null
      and attempt_count between 1 and 7 and next_attempt_at is not null
      and outcome is null and sms_event_id is null
      and last_error_code is not null and completed_at is null and dead_lettered_at is null)
    or (task_state = 'completed'
      and claim_token is null and lease_expires_at is null
      and attempt_count between 1 and 8 and next_attempt_at is null
      and outcome is not null and last_error_code is null
      and completed_at is not null and dead_lettered_at is null
      and ((outcome in ('queued', 'duplicate') and sms_event_id is not null)
        or (outcome in ('skipped', 'opted_out', 'superseded') and sms_event_id is null)))
    or (task_state = 'dead_letter'
      and claim_token is null and lease_expires_at is null
      and attempt_count between 1 and 8 and next_attempt_at is null
      and outcome is null and sms_event_id is null
      and last_error_code is not null and completed_at is null and dead_lettered_at is not null)
  );

create unique index if not exists payment_sms_producer_claim_uidx
  on public.payment_sms_producer_tasks (claim_token)
  where claim_token is not null;
create index if not exists payment_sms_producer_due_idx
  on public.payment_sms_producer_tasks (next_attempt_at, created_at, id)
  where task_state in ('ready', 'retry_wait');
create index if not exists payment_sms_producer_lease_idx
  on public.payment_sms_producer_tasks (lease_expires_at, id)
  where task_state = 'leased';

create or replace function public.queue_payment_sms_transition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_event_type text;
begin
  -- Direct-charge payments have a separate settlement notification state
  -- machine. Imported history is never a new customer notification.
  if new.charge_model is distinct from 'destination' or new.imported then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  v_event_type := case new.status::text
    when 'paid' then 'payment_paid'
    when 'failed' then 'payment_failed'
    when 'refunded' then 'payment_refunded'
    else null
  end;
  if v_event_type is null then
    return new;
  end if;

  insert into public.payment_sms_producer_tasks (
    payment_id, account_id, event_type
  ) values (
    new.id, new.account_id, v_event_type
  ) on conflict (payment_id, event_type) do nothing;
  return new;
end;
$$;

drop trigger if exists payment_sms_transition_outbox on public.payments;
create trigger payment_sms_transition_outbox
after insert or update of status on public.payments
for each row execute function public.queue_payment_sms_transition();

create or replace function public.claim_payment_sms_producer_tasks(
  p_batch_size integer default 20
)
returns table (
  task_id uuid,
  work_claim_token uuid,
  payment_id uuid,
  event_type text,
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
  v_task public.payment_sms_producer_tasks%rowtype;
  v_token uuid;
begin
  if p_batch_size is null or p_batch_size not between 1 and 100 then
    raise exception 'payment SMS producer batch size must be between 1 and 100'
      using errcode = '22023';
  end if;

  -- No carrier request happens in this producer. An expired lease is always
  -- safe to retry because enqueue_sms_delivery has a stable idempotency key.
  update public.payment_sms_producer_tasks t
     set task_state = case when t.attempt_count >= 8 then 'dead_letter' else 'retry_wait' end,
         claim_token = null,
         lease_expires_at = null,
         next_attempt_at = case when t.attempt_count >= 8 then null else v_now end,
         last_error_code = 'producer_lease_expired',
         dead_lettered_at = case when t.attempt_count >= 8 then v_now else null end,
         updated_at = v_now
   where t.task_state = 'leased'
     and t.lease_expires_at <= v_now;

  -- Collapse obsolete terminal intents before leasing anything. This is an
  -- operational cleanup, not the safety boundary: a payment can still change
  -- after claim, so the final request marker independently rechecks it while
  -- holding the payment row lock immediately before provider egress. Run this
  -- after lease recovery so an expired stale lease cannot be reclaimed once.
  update public.payment_sms_producer_tasks t
     set task_state = 'completed', claim_token = null, lease_expires_at = null,
         attempt_count = greatest(1, t.attempt_count), next_attempt_at = null,
         sms_event_id = null, outcome = 'superseded', last_error_code = null,
         completed_at = v_now, dead_lettered_at = null, updated_at = v_now
    from public.payments p
   where p.id = t.payment_id
     and p.account_id = t.account_id
     and t.task_state in ('ready', 'retry_wait')
     and not (
       (t.event_type = 'payment_paid' and p.status::text = 'paid')
       or (t.event_type = 'payment_failed' and p.status::text = 'failed')
       or (t.event_type = 'payment_refunded' and p.status::text = 'refunded')
     );

  for v_task in
    select t.*
      from public.payment_sms_producer_tasks t
     where t.task_state in ('ready', 'retry_wait')
       and (t.next_attempt_at is null or t.next_attempt_at <= v_now)
     order by coalesce(t.next_attempt_at, t.created_at), t.created_at, t.id
     limit p_batch_size
     for update skip locked
  loop
    v_token := pg_catalog.gen_random_uuid();
    update public.payment_sms_producer_tasks t
       set task_state = 'leased',
           claim_token = v_token,
           lease_expires_at = v_now + interval '2 minutes',
           attempt_count = t.attempt_count + 1,
           next_attempt_at = null,
           last_error_code = null,
           updated_at = v_now
     where t.id = v_task.id;
    return query select v_task.id, v_token, v_task.payment_id,
                        v_task.event_type, v_task.attempt_count + 1,
                        v_now + interval '2 minutes';
  end loop;
end;
$$;

create or replace function public.complete_payment_sms_producer_task(
  p_task_id uuid,
  p_claim_token uuid,
  p_outcome text,
  p_sms_event_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_task public.payment_sms_producer_tasks%rowtype;
  v_event public.sms_events%rowtype;
begin
  if p_outcome not in ('queued', 'duplicate', 'skipped', 'opted_out', 'superseded')
     or ((p_outcome in ('queued', 'duplicate')) <> (p_sms_event_id is not null)) then
    raise exception 'payment SMS producer completion is malformed'
      using errcode = '22023';
  end if;
  select t.* into v_task
    from public.payment_sms_producer_tasks t
   where t.id = p_task_id
   for update;
  if v_task.id is null or v_task.task_state <> 'leased'
     or v_task.claim_token is distinct from p_claim_token
     or v_task.lease_expires_at <= v_now then
    raise exception 'payment SMS producer claim is not owned or current'
      using errcode = '55000';
  end if;
  if p_sms_event_id is not null then
    select e.* into v_event from public.sms_events e where e.id = p_sms_event_id;
    if v_event.id is null
       or v_event.account_id is distinct from v_task.account_id
       or v_event.payment_id is distinct from v_task.payment_id
       or v_event.event_type is distinct from v_task.event_type
       or v_event.idempotency_key is distinct from
          ('payment:' || v_task.payment_id::text || ':' || v_task.event_type) then
      raise exception 'payment SMS producer event identity does not match'
        using errcode = '55000';
    end if;
  end if;
  update public.payment_sms_producer_tasks t
     set task_state = 'completed', claim_token = null, lease_expires_at = null,
         next_attempt_at = null, sms_event_id = p_sms_event_id,
         outcome = p_outcome, last_error_code = null,
         completed_at = v_now, dead_lettered_at = null, updated_at = v_now
   where t.id = v_task.id;
  return true;
end;
$$;

create or replace function public.fail_payment_sms_producer_task(
  p_task_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_retryable boolean default true
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_task public.payment_sms_producer_tasks%rowtype;
  v_dead boolean;
begin
  if p_error_code is null or p_error_code !~ '^[a-z][a-z0-9_]{2,99}$' then
    raise exception 'payment SMS producer error code is invalid'
      using errcode = '22023';
  end if;
  select t.* into v_task
    from public.payment_sms_producer_tasks t
   where t.id = p_task_id
   for update;
  if v_task.id is null or v_task.task_state <> 'leased'
     or v_task.claim_token is distinct from p_claim_token
     or v_task.lease_expires_at <= v_now then
    raise exception 'payment SMS producer failure claim is not owned or current'
      using errcode = '55000';
  end if;
  v_dead := not coalesce(p_retryable, false) or v_task.attempt_count >= 8;
  update public.payment_sms_producer_tasks t
     set task_state = case when v_dead then 'dead_letter' else 'retry_wait' end,
         claim_token = null, lease_expires_at = null,
         next_attempt_at = case when v_dead then null else
           v_now + pg_catalog.make_interval(secs => least(1800, 15 * (2 ^ greatest(0, v_task.attempt_count - 1)))::integer)
         end,
         last_error_code = p_error_code,
         dead_lettered_at = case when v_dead then v_now else null end,
         updated_at = v_now
   where t.id = v_task.id;
  return case when v_dead then 'dead_letter' else 'retry_wait' end;
end;
$$;

-- -------------------------------------------------------------------------
-- 1b. Inbox replies cannot manufacture consent from a hand-edited thread URL.
-- -------------------------------------------------------------------------

-- `sms_consent` is the account/contact STOP ledger. It intentionally remains
-- one row per phone so STOP suppresses every audience that happens to share a
-- handset. It is not, however, proof of *who* consented: crew, an owner, and a
-- customer all historically used that same table. Keep affirmative audience
-- evidence separately so a crew baseline can never authorize a customer send.
create table if not exists public.sms_consent_scopes (
  account_id uuid not null,
  phone_number text not null
    check (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  consent_scope text not null
    check (consent_scope in ('customer', 'crew', 'owner')),
  evidence_source text not null
    check (
      pg_catalog.length(evidence_source) between 1 and 100
      and evidence_source !~ '[[:cntrl:]]'
    ),
  established_at timestamptz not null default pg_catalog.now(),
  primary key (account_id, phone_number, consent_scope),
  constraint sms_consent_scopes_consent_fk
    foreign key (account_id, phone_number)
    references public.sms_consent(account_id, phone_number) on delete cascade
);

create index if not exists sms_consent_scopes_customer_lookup_idx
  on public.sms_consent_scopes (account_id, phone_number)
  where consent_scope = 'customer';

-- Existing application writers carry a deliberately finite source vocabulary.
-- Classify only that allow-list; an unknown/future source grants no scope until
-- its consent story is reviewed. STOP/START sources are deliberately absent:
-- they change the contact-wide suppression row but do not invent an audience.
create or replace function public.establish_sms_consent_scope_from_source()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_scope text;
begin
  if new.status <> 'opted_in' or new.consented_at is null then
    return new;
  end if;
  v_scope := case
    when new.source in (
      'payment_request', 'lead_quote_visit', 'lead_quote_visit_options',
      'client_job_dashboard', 'lead_decline', 'job_update',
      'review_request', 'arrival_time_changed', 'reschedule_offer',
      'estimate_offer', 'schedule_request', 'lead_verification_request',
      'portal_link_request', 'missed_call_text_back', 'authenticated_inbound'
    ) then 'customer'
    when new.source in ('crew_added', 'subcontractor_added') then 'crew'
    when new.source = 'owner_alerts' then 'owner'
    else null
  end;
  if v_scope is not null then
    insert into public.sms_consent_scopes (
      account_id, phone_number, consent_scope, evidence_source, established_at
    ) values (
      new.account_id, new.phone_number, v_scope, new.source,
      coalesce(new.consented_at, pg_catalog.clock_timestamp())
    ) on conflict (account_id, phone_number, consent_scope) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists sms_consent_source_scope
  on public.sms_consent;
create trigger sms_consent_source_scope
after insert or update of source, consented_at, status
on public.sms_consent
for each row execute function public.establish_sms_consent_scope_from_source();

-- Narrow atomic boundary for the insert-if-absent baseline helper. The source
-- is an allow-listed product event, never free-form caller data. This matters
-- when one handset already has a crew/owner row: the base insert is a no-op,
-- but the newly proven customer audience must still be recorded. A concurrent
-- or prior STOP is locked and returned as false; it is never overwritten.
create or replace function public.ensure_sms_consent_baseline_scope(
  p_account_id uuid,
  p_phone_number text,
  p_source text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_scope text;
  v_consent public.sms_consent%rowtype;
begin
  if p_account_id is null
     or p_phone_number is null
     or p_phone_number !~ '^\+[1-9][0-9]{7,14}$'
     or p_source not in (
       'crew_added', 'subcontractor_added',
       'portal_link_request', 'missed_call_text_back'
     ) then
    raise exception 'SMS consent baseline scope is invalid'
      using errcode = '22023';
  end if;
  v_scope := case
    when p_source in ('crew_added', 'subcontractor_added') then 'crew'
    else 'customer'
  end;

  insert into public.sms_consent (
    account_id, phone_number, status, source, consented_at, updated_at
  ) values (
    p_account_id, p_phone_number, 'opted_in', p_source, v_now, v_now
  ) on conflict (account_id, phone_number) do nothing;

  select c.* into v_consent
    from public.sms_consent c
   where c.account_id = p_account_id
     and c.phone_number = p_phone_number
   for update;
  if not found then
    raise exception 'SMS consent baseline could not be established'
      using errcode = '55000';
  end if;
  if v_consent.status <> 'opted_in' or v_consent.opted_out_at is not null then
    return false;
  end if;

  -- This RPC is called at the product event represented by p_source. Fill a
  -- missing historical timestamp without changing the original audience/source.
  if v_consent.consented_at is null then
    update public.sms_consent c
       set consented_at = v_now, updated_at = v_now
     where c.id = v_consent.id;
  end if;
  insert into public.sms_consent_scopes (
    account_id, phone_number, consent_scope, evidence_source, established_at
  ) values (
    p_account_id, p_phone_number, v_scope, p_source, v_now
  ) on conflict (account_id, phone_number, consent_scope) do nothing;
  return true;
end;
$$;

-- Backfill only sources whose audience is already explicit in application
-- behavior. In particular, an unclassified historical row is not silently
-- upgraded to customer permission.
insert into public.sms_consent_scopes (
  account_id, phone_number, consent_scope, evidence_source, established_at
)
select c.account_id, c.phone_number,
       case
         when c.source in (
           'payment_request', 'lead_quote_visit', 'lead_quote_visit_options',
           'client_job_dashboard', 'lead_decline', 'job_update',
           'review_request', 'arrival_time_changed', 'reschedule_offer',
           'estimate_offer', 'schedule_request', 'lead_verification_request',
           'portal_link_request', 'missed_call_text_back', 'authenticated_inbound'
         ) then 'customer'
         when c.source in ('crew_added', 'subcontractor_added') then 'crew'
         when c.source = 'owner_alerts' then 'owner'
         else null
       end,
       c.source, coalesce(c.consented_at, c.updated_at)
  from public.sms_consent c
 where c.consented_at is not null
   and c.source in (
     'payment_request', 'lead_quote_visit', 'lead_quote_visit_options',
     'client_job_dashboard', 'lead_decline', 'job_update',
     'review_request', 'arrival_time_changed', 'reschedule_offer',
     'estimate_offer', 'schedule_request', 'lead_verification_request',
     'portal_link_request', 'missed_call_text_back', 'authenticated_inbound',
     'crew_added', 'subcontractor_added', 'owner_alerts'
   )
on conflict (account_id, phone_number, consent_scope) do nothing;

-- Final egress authorization now checks the audience represented by the
-- billing category, not merely the contact-wide STOP row. This is the single
-- provider-independent boundary used by every durable producer, so a future
-- caller cannot accidentally send a customer message on crew-only evidence.
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
  v_required_scope text;
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

  v_required_scope := case v_event.billing_category
    when 'customer_message' then 'customer'
    when 'payment_message' then 'customer'
    when 'verification' then 'customer'
    when 'crew_message' then 'crew'
    when 'owner_alert' then 'owner'
    else null
  end;
  if v_required_scope is null or not exists (
    select 1 from public.sms_consent_scopes s
     where s.account_id = v_event.account_id
       and s.phone_number = v_event.phone_number
       and s.consent_scope = v_required_scope
  ) then
    update public.sms_events e
       set status = 'cancelled', error_reason = 'sms_consent_scope_not_current',
           cancelled_at = v_now, updated_at = v_now
     where e.id = v_event.id;
    update public.sms_delivery_tasks t
       set task_state = 'cancelled', claim_token = null,
           lease_expires_at = null,
           last_error_code = 'sms_consent_scope_not_current',
           cancelled_at = v_now, updated_at = v_now
     where t.sms_event_id = v_event.id;
    update public.sms_delivery_attempts a
       set outcome = 'cancelled', error_code = 'sms_consent_scope_not_current',
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

-- Consent derived from a reply is established only when the authenticated
-- provider receipt is atomically bound to its routed inbound transcript row.
-- A dashboard insert into sms_messages cannot fire this trigger, and an
-- existing STOP wins because the insert is conflict-do-nothing.
create or replace function public.baseline_sms_consent_from_inbound_receipt()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_message public.sms_messages%rowtype;
  v_exact_customer_sender boolean;
begin
  if new.webhook_kind = 'inbound'
     and new.processing_state = 'processed'
     and new.disposition = 'routed'
     and new.account_id is not null
     and new.sender_number_id is not null
     and new.sms_message_id is not null
     and new.from_number is not null
     and new.from_number ~ '^\+[1-9][0-9]{7,14}$' then
    select pg_catalog.count(*) = 1 into v_exact_customer_sender
      from public.sms_sender_numbers s
     where s.id = new.sender_number_id
       and s.account_id = new.account_id
       and s.purpose = 'contractor_dedicated';
    if not v_exact_customer_sender then
      return new;
    end if;

    -- Ordinary traffic must be bound to its immutable transcript. STOP/START
    -- only mutate the ledgers already established for their prior audience;
    -- HELP and a first-ever START must never manufacture consent or scope.
    select m.* into v_message
      from public.sms_messages m
     where m.id = new.sms_message_id
       and m.account_id = new.account_id
       and m.direction = 'inbound'
       and m.phone_number = new.from_number
       and m.provider = new.provider
       and m.provider_id = new.provider_event_id
       and m.sender_number_id = new.sender_number_id;
    if not found then
      return new;
    end if;

    insert into public.sms_consent (
      account_id, phone_number, status, source, consented_at,
      opted_out_at, updated_at
    ) values (
      new.account_id, new.from_number, 'opted_in',
      'authenticated_inbound', coalesce(new.received_at, pg_catalog.clock_timestamp()),
      null, pg_catalog.clock_timestamp()
    ) on conflict (account_id, phone_number) do nothing;

    insert into public.sms_consent_scopes (
      account_id, phone_number, consent_scope, evidence_source, established_at
    ) values (
      new.account_id, new.from_number, 'customer', 'authenticated_inbound',
      coalesce(new.received_at, pg_catalog.clock_timestamp())
    ) on conflict (account_id, phone_number, consent_scope) do nothing;

  end if;
  return new;
end;
$$;

drop trigger if exists sms_inbound_receipt_consent_baseline
  on public.sms_webhook_receipts;
create trigger sms_inbound_receipt_consent_baseline
after insert or update of processing_state, disposition, account_id, sms_message_id
on public.sms_webhook_receipts
for each row execute function public.baseline_sms_consent_from_inbound_receipt();

-- Safe compatibility for receipts routed before this trigger existed. These
-- rows are carrier-authenticated evidence, not a customer/contact-table guess.
insert into public.sms_consent (
  account_id, phone_number, status, source, consented_at,
  opted_out_at, updated_at
)
select distinct on (m.account_id, m.phone_number)
       m.account_id, m.phone_number, 'opted_in', 'authenticated_inbound',
       m.created_at, null, pg_catalog.clock_timestamp()
  from public.sms_webhook_receipts r
  join public.sms_messages m on m.id = r.sms_message_id
 where r.webhook_kind = 'inbound'
   and r.processing_state = 'processed'
   and r.disposition = 'routed'
   and r.account_id = m.account_id
   and r.provider = m.provider
   and r.provider_event_id = m.provider_id
   and r.sender_number_id = m.sender_number_id
   and m.direction = 'inbound'
 order by m.account_id, m.phone_number, m.created_at
on conflict (account_id, phone_number) do nothing;

-- Backfill exact provider-authenticated ordinary traffic only. Keyword
-- callbacks are suppression/restoration instructions, not audience evidence.
insert into public.sms_consent_scopes (
  account_id, phone_number, consent_scope, evidence_source, established_at
)
select distinct on (r.account_id, r.from_number)
       r.account_id, r.from_number, 'customer', 'authenticated_inbound', r.received_at
  from public.sms_webhook_receipts r
  join public.sms_sender_numbers s
    on s.id = r.sender_number_id
   and s.account_id = r.account_id
   and s.purpose = 'contractor_dedicated'
  join public.sms_consent c
    on c.account_id = r.account_id
   and c.phone_number = r.from_number
 where r.webhook_kind = 'inbound'
   and r.processing_state = 'processed'
   and r.disposition = 'routed'
   and r.from_number ~ '^\+[1-9][0-9]{7,14}$'
   and exists (
     select 1 from public.sms_messages m
      where m.id = r.sms_message_id
        and m.account_id = r.account_id
        and m.phone_number = r.from_number
        and m.direction = 'inbound'
        and m.provider = r.provider
        and m.provider_id = r.provider_event_id
        and m.sender_number_id = r.sender_number_id
   )
 order by r.account_id, r.from_number, r.received_at
on conflict (account_id, phone_number, consent_scope) do nothing;

create or replace function public.enqueue_authorized_inbox_message(
  p_account_id uuid,
  p_phone_number text,
  p_body text,
  p_idempotency_key text,
  p_require_existing_thread boolean default true
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
  v_consent public.sms_consent%rowtype;
  v_evidence_id uuid;
begin
  if p_account_id is null
     or p_phone_number is null
     or p_phone_number !~ '^\+[1-9][0-9]{7,14}$'
     or p_require_existing_thread is null then
    raise exception 'Inbox message authorization is malformed'
      using errcode = '22023';
  end if;

  -- Lock the exact ledger row in the transaction that enqueues. An inbound
  -- STOP racing this call either commits first and blocks it, or commits after
  -- enqueue and is caught again by the final provider-boundary consent gate.
  select c.* into v_consent
    from public.sms_consent c
   where c.account_id = p_account_id
     and c.phone_number = p_phone_number
   for share;
  if not found
     or v_consent.status <> 'opted_in'
     or v_consent.consented_at is null
     or v_consent.opted_out_at is not null then
    raise exception 'Inbox message requires current SMS consent'
      using errcode = 'P5111';
  end if;

  -- A current base row says only that this handset has not said STOP. Require
  -- separate affirmative customer-audience evidence so crew/owner consent can
  -- never be repurposed for a customer_message.
  perform 1
    from public.sms_consent_scopes s
   where s.account_id = p_account_id
     and s.phone_number = p_phone_number
     and s.consent_scope = 'customer'
   for share;
  if not found then
    raise exception 'Inbox message requires customer-scoped SMS consent'
      using errcode = 'P5112';
  end if;

  if p_require_existing_thread then
    -- First preference is the immutable, authenticated inbound receipt. This
    -- is evidence the customer actually opened the conversation.
    select r.id into v_evidence_id
      from public.sms_webhook_receipts r
      join public.sms_messages m on m.id = r.sms_message_id
     where r.webhook_kind = 'inbound'
       and r.processing_state = 'processed'
       and r.disposition = 'routed'
       and r.account_id = p_account_id
       and m.account_id = p_account_id
       and m.phone_number = p_phone_number
       and m.direction = 'inbound'
       and r.provider = m.provider
       and r.provider_event_id = m.provider_id
       and r.sender_number_id = m.sender_number_id
     order by r.received_at desc
     limit 1
     for share of r, m;

    -- A thread the business legitimately started also remains replyable. Its
    -- canonical sms_event is service-only; a client-authored transcript row is
    -- not sufficient evidence by itself.
    if v_evidence_id is null then
      select e.id into v_evidence_id
        from public.sms_events e
       where e.account_id = p_account_id
         and e.phone_number = p_phone_number
         and e.idempotency_key is not null
       order by e.created_at desc
       limit 1
       for share;
    end if;
    if v_evidence_id is null then
      raise exception 'Inbox reply requires an existing durable conversation'
        using errcode = 'P5110';
    end if;
  end if;

  return query
  select q.sms_event_id, q.task_state, q.created
    from public.enqueue_sms_delivery(
      p_account_id, p_phone_number, p_body,
      'inbox-reply', 'customer_message', 'contractor_dedicated',
      'customer', 'inbox_reply', p_idempotency_key,
      null, null, null
    ) q;
end;
$$;

-- -------------------------------------------------------------------------
-- 2. Atomic missed-call receipt, lead, consent baseline, and SMS enqueue.
-- -------------------------------------------------------------------------

-- This existing trigger is inherited by leads and sms_events. Its unqualified
-- accounts read fails when a hardened security-definer caller deliberately
-- removes public from search_path. Qualify the relation and pin the path so the
-- atomic ingest below cannot be broken (or redirected) by caller search_path.
create or replace function public.inherit_account_test_marker()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.test_marker is null then
    select a.test_marker into new.test_marker
      from public.accounts a where a.id = new.account_id;
  end if;
  return new;
end;
$$;

create table if not exists public.sms_missed_call_receipts (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  provider text not null check (provider in ('twilio', 'signalwire')),
  provider_call_id text not null check (
    pg_catalog.length(provider_call_id) between 1 and 255
    and provider_call_id !~ '[[:cntrl:]]'
  ),
  account_id uuid not null references public.accounts(id) on delete restrict,
  phone_number text not null check (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  dial_status text not null check (dial_status in ('no-answer', 'busy', 'failed', 'canceled')),
  body_sha256 text not null check (body_sha256 ~ '^[0-9a-f]{64}$'),
  disposition text check (
    disposition is null or disposition in ('accepted', 'opted_out', 'deduplicated_recent')
  ),
  lead_id uuid references public.leads(id) on delete restrict,
  sms_event_id uuid references public.sms_events(id) on delete restrict,
  processed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  constraint sms_missed_call_receipt_identity unique (provider, provider_call_id),
  constraint sms_missed_call_receipt_shape check (
    (disposition is null and lead_id is null and sms_event_id is null and processed_at is null)
    or (disposition = 'accepted' and lead_id is not null and sms_event_id is not null and processed_at is not null)
    or (disposition = 'opted_out' and lead_id is not null and sms_event_id is null and processed_at is not null)
    or (disposition = 'deduplicated_recent' and lead_id is not null and sms_event_id is null and processed_at is not null)
  )
);

create index if not exists sms_missed_call_receipts_account_idx
  on public.sms_missed_call_receipts (account_id, created_at desc);

create or replace function public.ingest_sms_missed_call(
  p_provider text,
  p_provider_call_id text,
  p_account_id uuid,
  p_phone_number text,
  p_dial_status text,
  p_body_sha256 text
)
returns table (
  ingest_disposition text,
  receipt_id uuid,
  lead_id uuid,
  sms_event_id uuid,
  duplicate boolean
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_enabled boolean;
  v_receipt public.sms_missed_call_receipts%rowtype;
  v_lead_id uuid;
  v_consent public.sms_consent%rowtype;
  v_business_name text;
  v_body text;
  v_sms_event_id uuid;
  v_task_state text;
begin
  if p_provider not in ('twilio', 'signalwire')
     or p_provider_call_id is null
     or pg_catalog.length(p_provider_call_id) not between 1 and 255
     or p_provider_call_id ~ '[[:cntrl:]]'
     or p_account_id is null
     or p_phone_number is null or p_phone_number !~ '^\+[1-9][0-9]{7,14}$'
     or p_dial_status not in ('no-answer', 'busy', 'failed', 'canceled')
     or p_body_sha256 is null or p_body_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'missed-call callback arguments are invalid'
      using errcode = '22023';
  end if;

  select a.call_textback_enabled into v_enabled
    from public.accounts a where a.id = p_account_id for share;
  if not found then
    raise exception 'missed-call account does not exist' using errcode = 'P0002';
  end if;
  if not v_enabled then
    return query select 'disabled'::text, null::uuid, null::uuid, null::uuid, false;
    return;
  end if;

  -- Serializes both exact callback retries and distinct calls from the same
  -- number during the ten-minute lead-dedupe window.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'missed-call:' || p_account_id::text || ':' || p_phone_number, 20260821
  ));

  insert into public.sms_missed_call_receipts (
    provider, provider_call_id, account_id, phone_number, dial_status, body_sha256
  ) values (
    p_provider, p_provider_call_id, p_account_id, p_phone_number,
    p_dial_status, p_body_sha256
  ) on conflict (provider, provider_call_id) do nothing
  returning * into v_receipt;

  if v_receipt.id is null then
    select r.* into v_receipt
      from public.sms_missed_call_receipts r
     where r.provider = p_provider and r.provider_call_id = p_provider_call_id
     for update;
    if v_receipt.account_id is distinct from p_account_id
       or v_receipt.phone_number is distinct from p_phone_number
       or v_receipt.dial_status is distinct from p_dial_status
       or v_receipt.body_sha256 is distinct from p_body_sha256 then
      raise exception 'missed-call receipt key was replayed with different immutable evidence'
        using errcode = 'P5123';
    end if;
    if v_receipt.disposition is null then
      raise exception 'missed-call receipt is unfinished' using errcode = '40001';
    end if;
    return query select v_receipt.disposition, v_receipt.id,
                        v_receipt.lead_id, v_receipt.sms_event_id, true;
    return;
  end if;

  select l.id into v_lead_id
    from public.leads l
   where l.account_id = p_account_id
     and l.source::text = 'missed_call'
     and l.phone = p_phone_number
     and l.created_at >= v_now - interval '10 minutes'
   order by l.created_at desc, l.id
   limit 1;
  if v_lead_id is not null then
    update public.sms_missed_call_receipts r
       set disposition = 'deduplicated_recent', lead_id = v_lead_id,
           processed_at = v_now
     where r.id = v_receipt.id;
    return query select 'deduplicated_recent'::text, v_receipt.id,
                        v_lead_id, null::uuid, false;
    return;
  end if;

  insert into public.sms_consent (
    account_id, phone_number, status, source, consented_at, updated_at
  ) values (
    p_account_id, p_phone_number, 'opted_in', 'missed_call_text_back', v_now, v_now
  ) on conflict (account_id, phone_number) do nothing;

  -- A legacy opted-in baseline may predate consent timestamps. This fresh
  -- inbound call is current initiation evidence; fill only a missing timestamp
  -- on an already-opted-in row and never rewrite STOP.
  update public.sms_consent c
     set consented_at = coalesce(c.consented_at, v_now),
         updated_at = v_now
   where c.account_id = p_account_id
     and c.phone_number = p_phone_number
     and c.status = 'opted_in'
     and c.opted_out_at is null;

  -- A call to this contractor's dedicated number is customer-channel evidence.
  -- Keep it distinct from the global STOP row so a crew/owner baseline alone
  -- can never authorize the automatic customer_message below.
  insert into public.sms_consent_scopes (
    account_id, phone_number, consent_scope, evidence_source, established_at
  ) values (
    p_account_id, p_phone_number, 'customer', 'missed_call_text_back', v_now
  ) on conflict (account_id, phone_number, consent_scope) do nothing;

  insert into public.leads (
    account_id, source, status, name, phone, message, source_page,
    triage, created_at, updated_at
  ) values (
    p_account_id, 'missed_call', 'new', 'Missed call — ' || p_phone_number,
    p_phone_number,
    'Missed call captured automatically. Automatic text-back is enabled.',
    '/call', '{"score":"warm","flags":[],"contactPreference":"any"}'::jsonb,
    v_now, v_now
  ) returning id into v_lead_id;

  select c.* into v_consent
    from public.sms_consent c
   where c.account_id = p_account_id and c.phone_number = p_phone_number
   for share;
  if v_consent.id is null or v_consent.status = 'opted_out'
     or v_consent.opted_out_at is not null then
    update public.sms_missed_call_receipts r
       set disposition = 'opted_out', lead_id = v_lead_id, processed_at = v_now
     where r.id = v_receipt.id;
    return query select 'opted_out'::text, v_receipt.id, v_lead_id, null::uuid, false;
    return;
  end if;

  select coalesce(
           (select nullif(pg_catalog.btrim(s.company_name), '')
              from public.sites s where s.account_id = p_account_id
              order by s.updated_at desc, s.id limit 1),
           nullif(pg_catalog.btrim(a.business_name), ''),
           'us'
         ) into v_business_name
    from public.accounts a where a.id = p_account_id;
  v_body := 'Sorry we missed your call at ' || v_business_name
    || '! Reply here and we''ll help you out. Reply STOP to opt out.';

  select q.sms_event_id, q.task_state
    into v_sms_event_id, v_task_state
    from public.enqueue_sms_delivery(
      p_account_id,
      p_phone_number,
      v_body,
      'missed-call',
      'customer_message',
      'contractor_dedicated',
      'automation',
      'missed_call',
      'missed-call:' || p_provider || ':' || p_provider_call_id,
      null, null, null
    ) q;
  if v_sms_event_id is null or v_task_state is null then
    raise exception 'missed-call SMS enqueue returned no durable task'
      using errcode = '55000';
  end if;

  update public.sms_missed_call_receipts r
     set disposition = 'accepted', lead_id = v_lead_id,
         sms_event_id = v_sms_event_id, processed_at = v_now
   where r.id = v_receipt.id;
  return query select 'accepted'::text, v_receipt.id,
                      v_lead_id, v_sms_event_id, false;
end;
$$;

-- -------------------------------------------------------------------------
-- 3. Retire specialized direct-payment carrier egress. The financial feed
--    worker now atomically hands accepted SMS work to the generic durable
--    delivery queue; historical specialized unknowns remain recoverable.
-- -------------------------------------------------------------------------

alter table public.billing_direct_payment_settlement_tasks
  drop constraint if exists billing_direct_payment_settlement_tasks_sms_status_check;
alter table public.billing_direct_payment_settlement_tasks
  drop constraint if exists billing_direct_payment_settlement_sms_status_check;
alter table public.billing_direct_payment_settlement_tasks
  add constraint billing_direct_payment_settlement_sms_status_check check (
    sms_status in (
      'pending', 'queued', 'dispatching', 'sent', 'failed',
      'skipped_no_consent', 'skipped_opted_out', 'indeterminate'
    )
  );

alter table public.billing_direct_payment_settlement_tasks
  drop constraint if exists billing_direct_payment_settlement_task_shape_check;
alter table public.billing_direct_payment_settlement_tasks
  add constraint billing_direct_payment_settlement_task_shape_check check (
    (task_state = 'ready'
      and claim_token is null and lease_expires_at is null
      and attempt_count = 0 and next_attempt_at is null
      and last_error_code is null and completed_at is null and dead_lettered_at is null)
    or (task_state = 'leased'
      and claim_token is not null and lease_expires_at is not null
      and attempt_count between 1 and 8 and next_attempt_at is null
      and completed_at is null and dead_lettered_at is null)
    or (task_state = 'retry_wait'
      and claim_token is null and lease_expires_at is null
      and attempt_count between 1 and 7 and next_attempt_at is not null
      and last_error_code is not null and completed_at is null and dead_lettered_at is null)
    or (task_state = 'completed'
      and claim_token is null and lease_expires_at is null
      and attempt_count between 1 and 8 and next_attempt_at is null
      and feed_status = 'recorded'
      and sms_status in (
        'queued', 'sent', 'skipped_no_consent', 'skipped_opted_out'
      )
      and last_error_code is null and completed_at is not null and dead_lettered_at is null)
    or (task_state = 'dead_letter'
      and claim_token is null and lease_expires_at is null
      and attempt_count between 1 and 8 and next_attempt_at is null
      and last_error_code is not null and completed_at is null and dead_lettered_at is not null)
  );

alter table public.billing_direct_payment_settlement_tasks
  drop constraint if exists billing_direct_payment_settlement_sms_shape_check;
alter table public.billing_direct_payment_settlement_tasks
  add constraint billing_direct_payment_settlement_sms_shape_check check (
    (sms_status = 'pending' and sms_event_id is null)
    or (sms_status = 'queued'
      and sms_event_id is not null and task_state = 'completed')
    or (sms_status in ('skipped_no_consent', 'skipped_opted_out')
      and sms_event_id is null and task_state = 'completed')
    or (sms_status = 'dispatching'
      and sms_event_id is not null and task_state = 'leased')
    or (sms_status = 'sent'
      and sms_event_id is not null and task_state = 'completed')
    or (sms_status in ('indeterminate', 'failed')
      and sms_event_id is not null and task_state = 'dead_letter')
  );

alter table public.billing_direct_payment_settlement_attempts
  drop constraint if exists billing_direct_payment_settlement_attempts_sms_status_check;
alter table public.billing_direct_payment_settlement_attempts
  drop constraint if exists billing_direct_payment_settlement_attempt_sms_status_check;
alter table public.billing_direct_payment_settlement_attempts
  add constraint billing_direct_payment_settlement_attempt_sms_status_check check (
    sms_status is null or sms_status in (
      'pending', 'queued', 'dispatching', 'sent',
      'skipped_no_consent', 'skipped_opted_out', 'indeterminate'
    )
  );

alter table public.billing_direct_payment_settlement_attempts
  drop constraint if exists billing_direct_payment_settlement_attempt_shape_check;
alter table public.billing_direct_payment_settlement_attempts
  add constraint billing_direct_payment_settlement_attempt_shape_check check (
    (outcome_status is null
      and error_code is null and feed_status is null
      and sms_status is null and finished_at is null)
    or (outcome_status = 'completed'
      and error_code is null and feed_status = 'recorded'
      and sms_status in (
        'queued', 'sent', 'skipped_no_consent', 'skipped_opted_out'
      )
      and finished_at is not null)
    or (outcome_status in (
        'failed_retryable', 'failed_terminal', 'sms_indeterminate'
      )
      and error_code is not null and feed_status is not null
      and sms_status is not null and finished_at is not null)
  );

create or replace function public.enqueue_direct_payment_settlement_sms(
  p_task_id uuid,
  p_claim_token uuid,
  p_normalized_phone text,
  p_body text
)
returns table (
  dispatch_status text,
  sms_event_id uuid,
  phone_number text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_task public.billing_direct_payment_settlement_tasks%rowtype;
  v_payment public.payments%rowtype;
  v_consent public.sms_consent%rowtype;
  v_existing public.sms_events%rowtype;
  v_event_id uuid;
  v_delivery_state text;
  v_digits text;
  v_expected_phone text;
  v_updated integer;
begin
  select t.* into v_task
    from public.billing_direct_payment_settlement_tasks t
   where t.id = p_task_id
   for update;
  if v_task.id is null
     or v_task.task_state <> 'leased'
     or v_task.claim_token is distinct from p_claim_token
     or v_task.lease_expires_at <= v_now
     or v_task.feed_status <> 'recorded'
     or v_task.sms_status <> 'pending' then
    raise exception 'direct settlement SMS enqueue claim is not owned or current'
      using errcode = '55000';
  end if;

  select p.* into v_payment
    from public.payments p
   where p.id = v_task.payment_id
     and p.account_id = v_task.account_id
   for share;
  if v_payment.id is null
     or v_payment.job_id is distinct from v_task.job_id
     or v_payment.invoice_id is distinct from v_task.invoice_id
     or v_payment.charge_model <> 'direct'
     or v_payment.status::text <> 'paid'
     or v_payment.paid_at is distinct from v_task.settled_at then
    raise exception 'direct settlement SMS payment scope changed'
      using errcode = '55000';
  end if;

  -- Preserve the historical specialized state machine for an event that was
  -- created before this migration. It can finalize sent/opt-out evidence or
  -- quarantine a nonterminal unknown, but this new path never opens a socket.
  select e.* into v_existing
    from public.sms_events e
   where e.payment_id = v_task.payment_id
     and e.event_type = 'payment_paid'
   for update;
  if v_existing.id is not null
     or v_payment.sms_consent is distinct from true
     or v_payment.homeowner_phone is null
     or pg_catalog.length(pg_catalog.btrim(v_payment.homeowner_phone)) = 0 then
    return query
      select s.dispatch_status, s.sms_event_id, s.phone_number
        from public.stage_direct_payment_settlement_sms(
          p_task_id, p_claim_token, p_normalized_phone, p_body
        ) s;
    return;
  end if;

  v_digits := pg_catalog.regexp_replace(v_payment.homeowner_phone, '[^0-9]', '', 'g');
  v_expected_phone := case
    when pg_catalog.length(v_digits) = 10 then '+1' || v_digits
    when pg_catalog.length(v_digits) = 11 and v_digits like '1%' then '+' || v_digits
    when v_payment.homeowner_phone like '+%'
      and pg_catalog.length(v_digits) between 10 and 15 then '+' || v_digits
    else null
  end;
  if v_expected_phone is null
     or p_normalized_phone is distinct from v_expected_phone
     or p_normalized_phone !~ '^\+[0-9]{10,15}$'
     or p_body is null
     or pg_catalog.length(p_body) not between 1 and 1600
     or p_body ~ '[[:cntrl:]]' then
    raise exception 'direct settlement SMS envelope is invalid'
      using errcode = '22023';
  end if;

  select c.* into v_consent
    from public.sms_consent c
   where c.account_id = v_task.account_id
     and c.phone_number = p_normalized_phone
   for share;
  if v_consent.id is null
     or v_consent.status <> 'opted_in'
     or v_consent.consented_at is null
     or v_consent.opted_out_at is not null then
    return query
      select s.dispatch_status, s.sms_event_id, s.phone_number
        from public.stage_direct_payment_settlement_sms(
          p_task_id, p_claim_token, p_normalized_phone, p_body
        ) s;
    return;
  end if;

  select q.sms_event_id, q.task_state
    into v_event_id, v_delivery_state
    from public.enqueue_sms_delivery(
      v_task.account_id,
      p_normalized_phone,
      p_body,
      'payment-paid',
      'payment_message',
      'contractor_dedicated',
      'payment',
      'payment_paid',
      'payment:' || v_task.payment_id::text || ':payment_paid',
      v_task.payment_id,
      null,
      null
    ) q;
  if v_event_id is null or v_delivery_state is null then
    raise exception 'direct settlement SMS enqueue returned no durable task'
      using errcode = '55000';
  end if;

  update public.billing_direct_payment_settlement_tasks t
     set task_state = 'completed', claim_token = null,
         lease_expires_at = null, next_attempt_at = null,
         sms_status = 'queued', sms_event_id = v_event_id,
         last_error_code = null, completed_at = v_now,
         dead_lettered_at = null, updated_at = v_now
   where t.id = v_task.id;

  update public.billing_direct_payment_settlement_attempts a
     set outcome_status = 'completed', error_code = null,
         feed_status = 'recorded', sms_status = 'queued', finished_at = v_now
   where a.claim_token = p_claim_token and a.outcome_status is null;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'queued direct settlement SMS has no open attempt'
      using errcode = '55000';
  end if;

  return query select 'queued'::text, v_event_id, null::text;
end;
$$;

create or replace function public.project_direct_payment_sms_terminal_fact()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if new.status not in ('sent', 'delivered', 'failed') then
    return new;
  end if;

  -- Only resolve the quarantined unknown-outcome state. A later delivery
  -- failure must not rewrite a settlement task that already completed on
  -- provider acceptance; sms_events remains the delivery source of truth.
  update public.billing_direct_payment_settlement_tasks t
     set task_state = case when new.status = 'failed' then 'dead_letter' else 'completed' end,
         claim_token = null,
         lease_expires_at = null,
         next_attempt_at = null,
         sms_status = case when new.status = 'failed' then 'failed' else 'sent' end,
         last_error_code = case when new.status = 'failed'
           then 'carrier_status_failed' else null end,
         completed_at = case when new.status = 'failed' then null else v_now end,
         dead_lettered_at = case when new.status = 'failed'
           then coalesce(t.dead_lettered_at, v_now) else null end,
         updated_at = v_now
   where t.sms_event_id = new.id
     and t.task_state = 'dead_letter'
     and t.sms_status = 'indeterminate';
  return new;
end;
$$;

drop trigger if exists sms_event_direct_payment_terminal_projection
  on public.sms_events;
create trigger sms_event_direct_payment_terminal_projection
after update of status, provider_id, provider_accepted_at, delivered_at, failed_at
on public.sms_events
for each row execute function public.project_direct_payment_sms_terminal_fact();

create or replace function public.reconcile_sms_unmatched_status(
  p_review_item_id uuid,
  p_sms_event_id uuid,
  p_resolution_note text,
  p_resolution_actor text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_receipt_id uuid;
  v_review public.sms_operator_review_items%rowtype;
  v_receipt public.sms_webhook_receipts%rowtype;
  v_event public.sms_events%rowtype;
  v_task public.sms_delivery_tasks%rowtype;
  v_direct_task public.billing_direct_payment_settlement_tasks%rowtype;
  v_reconcile_disposition text;
  v_reconcile_event_id uuid;
begin
  if p_review_item_id is null
     or p_sms_event_id is null
     or p_resolution_note is null
     or pg_catalog.length(pg_catalog.btrim(p_resolution_note)) not between 3 and 2000
     or p_resolution_actor is null
     or pg_catalog.length(pg_catalog.btrim(p_resolution_actor)) not between 3 and 320 then
    raise exception 'SMS unmatched status reconciliation arguments are invalid'
      using errcode = '22023';
  end if;

  select r.webhook_receipt_id into v_receipt_id
    from public.sms_operator_review_items r where r.id = p_review_item_id;
  if v_receipt_id is null then
    raise exception 'SMS unmatched status review does not exist'
      using errcode = '55000';
  end if;

  -- One global lock order for automatic replay and operator recovery:
  -- receipt -> review -> event -> generic task -> specialized task.
  select w.* into v_receipt
    from public.sms_webhook_receipts w where w.id = v_receipt_id for update;
  select r.* into v_review
    from public.sms_operator_review_items r where r.id = p_review_item_id for update;
  select e.* into v_event
    from public.sms_events e where e.id = p_sms_event_id for update;
  select t.* into v_task
    from public.sms_delivery_tasks t where t.sms_event_id = p_sms_event_id for update;
  select t.* into v_direct_task
    from public.billing_direct_payment_settlement_tasks t
   where t.sms_event_id = p_sms_event_id for update;

  if v_review.id is null or v_receipt.id is null or v_event.id is null
     or ((v_task.sms_event_id is null) = (v_direct_task.sms_event_id is null)) then
    raise exception 'SMS unmatched status recovery target is incomplete or ambiguous'
      using errcode = '55000';
  end if;
  if v_review.review_state <> 'open'
     or v_review.reason <> 'unmatched_status'
     or v_review.webhook_receipt_id <> v_receipt.id
     or v_review.sms_event_id is not null
     or v_receipt.webhook_kind <> 'status'
     or v_receipt.processing_state <> 'review'
     or v_receipt.disposition <> 'unmatched_status'
     or v_receipt.sms_event_id is not null then
    raise exception 'SMS unmatched status review is not open and unbound'
      using errcode = '55000';
  end if;
  if v_review.provider <> v_receipt.provider
     or v_review.provider_event_id is distinct from v_receipt.provider_event_id
     or v_event.provider is distinct from v_receipt.provider then
    raise exception 'SMS unmatched status provider does not match the event'
      using errcode = '55000';
  end if;
  if v_event.provider_id is not null or v_event.status <> 'indeterminate' then
    raise exception 'SMS recovery event must be unbound and indeterminate'
      using errcode = '55000';
  end if;
  if v_task.sms_event_id is not null and v_task.task_state <> 'indeterminate' then
    raise exception 'generic SMS recovery task must be indeterminate'
      using errcode = '55000';
  end if;
  if v_direct_task.sms_event_id is not null and (
       v_direct_task.task_state <> 'dead_letter'
       or v_direct_task.sms_status <> 'indeterminate'
       or v_direct_task.sms_event_id is distinct from v_event.id
     ) then
    raise exception 'direct-payment SMS recovery task must be indeterminate'
      using errcode = '55000';
  end if;

  -- The provider identity unique index rejects carrier evidence already bound
  -- to another event. Never catch or normalize that 23505.
  update public.sms_events e
     set provider_id = v_receipt.provider_event_id,
         provider_accepted_at = coalesce(e.provider_accepted_at, v_now),
         -- For the specialized lane, obtaining the provider message id is the
         -- success condition the normal worker records as `sent`. A queued or
         -- sending callback therefore resolves the unknown API response as
         -- accepted without claiming carrier delivery.
         status = case
           when v_direct_task.sms_event_id is not null
             and pg_catalog.lower(v_receipt.provider_status) in (
               'queued', 'accepted', 'scheduled', 'initiated', 'sending'
             ) then 'sent'
           else e.status
         end,
         sent_at = case
           when v_direct_task.sms_event_id is not null
             and pg_catalog.lower(v_receipt.provider_status) in (
               'queued', 'accepted', 'scheduled', 'initiated', 'sending'
             ) then coalesce(e.sent_at, v_now)
           else e.sent_at
         end,
         indeterminate_at = case
           when v_direct_task.sms_event_id is not null
             and pg_catalog.lower(v_receipt.provider_status) in (
               'queued', 'accepted', 'scheduled', 'initiated', 'sending'
             ) then null
           else e.indeterminate_at
         end,
         error_reason = case
           when v_direct_task.sms_event_id is not null
             and pg_catalog.lower(v_receipt.provider_status) in (
               'queued', 'accepted', 'scheduled', 'initiated', 'sending'
             ) then null
           else e.error_reason
         end,
         updated_at = v_now
   where e.id = v_event.id and e.provider_id is null and e.status = 'indeterminate';
  if not found then
    raise exception 'SMS recovery event changed before provider binding'
      using errcode = '55000';
  end if;

  select s.status_disposition, s.sms_event_id
    into v_reconcile_disposition, v_reconcile_event_id
    from public.apply_sms_delivery_status_webhook(
      v_receipt.provider,
      v_receipt.provider_event_id,
      v_receipt.provider_status,
      v_receipt.provider_error_code,
      v_receipt.receipt_key,
      v_receipt.body_sha256,
      v_receipt.content_type,
      v_receipt.request_url
    ) s;
  if v_reconcile_event_id is distinct from v_event.id
     or v_reconcile_disposition not in ('applied', 'ignored_stale') then
    raise exception 'SMS unmatched status receipt could not be projected'
      using errcode = '55000';
  end if;

  update public.sms_operator_review_items r
     set account_id = v_event.account_id,
         sender_number_id = v_event.sender_number_id,
         sms_event_id = v_event.id,
         review_state = 'resolved',
         resolution_note = pg_catalog.btrim(p_resolution_note),
         resolution_actor = pg_catalog.btrim(p_resolution_actor),
         resolved_at = coalesce(r.resolved_at, v_now)
   where r.id = v_review.id and r.review_state = 'resolved';
  if not found then
    raise exception 'SMS unmatched status review did not close atomically'
      using errcode = '55000';
  end if;
  return true;
end;
$$;

-- -------------------------------------------------------------------------
-- 4. Policy/readiness deferrals do not consume the bounded provider-attempt
--    budget, while every lease still has a unique append-only sequence.
-- -------------------------------------------------------------------------

alter table public.sms_delivery_tasks
  add column if not exists lease_sequence integer not null default 0;
alter table public.sms_delivery_tasks
  drop constraint if exists sms_delivery_tasks_lease_sequence_check;

-- Backfill the lease sequence from immutable attempt evidence, then remove
-- policy-only deferrals from the provider-attempt count. This also repairs a
-- dark-deployment row that reached attempt_count=8 solely through deferrals.
update public.sms_delivery_tasks t
   set lease_sequence = greatest(
         t.lease_sequence,
         coalesce((select max(a.attempt_number)
                     from public.sms_delivery_attempts a
                    where a.sms_event_id = t.sms_event_id), 0)
       ),
       attempt_count = least(
         8,
         coalesce((select count(*)::integer
                     from public.sms_delivery_attempts a
                    where a.sms_event_id = t.sms_event_id
                      and a.outcome is distinct from 'deferred'), t.attempt_count)
       )
 where t.task_state = 'queued';

-- Non-queued rows retain the pre-follow-up meaning where every claim consumed
-- an attempt, so their current counter is the safe lower bound for the new
-- monotonic lease sequence too.
update public.sms_delivery_tasks t
   set lease_sequence = greatest(
     t.lease_sequence,
     t.attempt_count,
     coalesce((select max(a.attempt_number)
                 from public.sms_delivery_attempts a
                where a.sms_event_id = t.sms_event_id), 0)
   )
 where t.task_state <> 'queued';

alter table public.sms_delivery_tasks
  add constraint sms_delivery_tasks_lease_sequence_check
  check (lease_sequence >= attempt_count and lease_sequence >= 0);

update public.sms_events e
   set status = 'failed', error_reason = 'sms_delivery_attempt_limit_reached',
       failed_at = coalesce(e.failed_at, pg_catalog.clock_timestamp()),
       updated_at = pg_catalog.clock_timestamp()
  from public.sms_delivery_tasks t
 where t.sms_event_id = e.id
   and t.task_state = 'queued'
   and t.attempt_count >= 8
   and e.status = 'queued';
update public.sms_delivery_tasks t
   set task_state = 'failed', last_error_code = 'sms_delivery_attempt_limit_reached',
       failed_at = coalesce(t.failed_at, pg_catalog.clock_timestamp()),
       updated_at = pg_catalog.clock_timestamp()
 where t.task_state = 'queued' and t.attempt_count >= 8;

alter table public.sms_delivery_tasks
  drop constraint if exists sms_delivery_tasks_queued_attempt_budget_check;
alter table public.sms_delivery_tasks
  add constraint sms_delivery_tasks_queued_attempt_budget_check
  check (task_state <> 'queued' or attempt_count < 8);

alter table public.sms_delivery_attempts
  drop constraint if exists sms_delivery_attempts_attempt_number_check;
alter table public.sms_delivery_attempts
  add constraint sms_delivery_attempts_attempt_number_check
  check (attempt_number > 0);

create or replace function public.advance_sms_delivery_lease_sequence()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  -- Preserve compatibility with service-side imports/recovery code that
  -- materializes a historical non-queued task directly with attempt_count.
  new.lease_sequence := greatest(new.lease_sequence, new.attempt_count);
  if new.task_state = 'leased'
     and (tg_op = 'INSERT'
       or old.task_state <> 'leased'
       or old.claim_token is distinct from new.claim_token) then
    new.lease_sequence := greatest(
      new.lease_sequence,
      case when tg_op = 'INSERT' then 1 else old.lease_sequence + 1 end
    );
  end if;
  return new;
end;
$$;

drop trigger if exists sms_delivery_task_lease_sequence
  on public.sms_delivery_tasks;
create trigger sms_delivery_task_lease_sequence
before insert or update of task_state, claim_token, attempt_count
on public.sms_delivery_tasks
for each row execute function public.advance_sms_delivery_lease_sequence();

create or replace function public.assign_sms_delivery_attempt_sequence()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  select t.lease_sequence into new.attempt_number
    from public.sms_delivery_tasks t
   where t.sms_event_id = new.sms_event_id;
  if not found or new.attempt_number <= 0 then
    raise exception 'SMS delivery attempt has no leased task sequence'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists sms_delivery_attempt_lease_sequence
  on public.sms_delivery_attempts;
create trigger sms_delivery_attempt_lease_sequence
before insert on public.sms_delivery_attempts
for each row execute function public.assign_sms_delivery_attempt_sequence();

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
         -- Claim provisionally spends one attempt. A policy/readiness defer
         -- never approached the provider, so return that budget atomically;
         -- lease_sequence preserves unique append-only claim evidence.
         attempt_count = t.attempt_count - 1,
         available_at = v_now + pg_catalog.make_interval(secs => p_delay_seconds),
         last_error_code = p_error_code, updated_at = v_now
   where t.sms_event_id = p_sms_event_id
     and t.task_state = 'leased'
     and t.claim_token = p_claim_token
     and t.request_started_at is null
     and t.attempt_count > 0;
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
-- 4b. Inbound actions have a bounded retry budget and an explicit, visible
--     terminal state. Applied domain effects/outcomes remain intact so an
--     operator can recover the idempotent egress without applying twice.
-- -------------------------------------------------------------------------

alter table public.sms_inbound_action_tasks
  add column if not exists dead_lettered_at timestamptz;
alter table public.sms_inbound_action_tasks
  drop constraint if exists sms_inbound_action_tasks_task_state_check;
alter table public.sms_inbound_action_tasks
  drop constraint if exists sms_inbound_action_task_state_check;
alter table public.sms_inbound_action_tasks
  add constraint sms_inbound_action_task_state_check check (
    task_state in ('pending', 'processing', 'failed', 'completed', 'dead_letter')
  );
alter table public.sms_inbound_action_tasks
  drop constraint if exists sms_inbound_action_dead_letter_shape_check;
alter table public.sms_inbound_action_tasks
  add constraint sms_inbound_action_dead_letter_shape_check check (
    (task_state = 'dead_letter'
      and attempt_count >= 8
      and claim_token is null
      and lease_expires_at is null
      and last_error is not null
      and dead_lettered_at is not null
      and completed_at is null)
    or (task_state <> 'dead_letter' and dead_lettered_at is null)
  );

-- Repair any pre-follow-up task that already exhausted the budget. This never
-- clears effect_applied_at/outcome: those fields are the replay-safe recovery
-- evidence for work whose database mutation committed before reply enqueue.
update public.sms_inbound_action_tasks
   set task_state = 'dead_letter', claim_token = null, lease_expires_at = null,
       last_error = coalesce(last_error, 'inbound_action_attempt_limit'),
       dead_lettered_at = coalesce(dead_lettered_at, pg_catalog.clock_timestamp()),
       updated_at = pg_catalog.clock_timestamp()
 where task_state in ('pending', 'failed') and attempt_count >= 8;

create or replace function public.claim_sms_inbound_action(
  p_webhook_receipt_id uuid
)
returns table (
  claim_status text,
  task_id uuid,
  work_claim_token uuid,
  provider text,
  provider_event_id text,
  account_id uuid,
  sender_number_id uuid,
  sender_purpose text,
  from_number text,
  effect_applied boolean,
  stored_outcome jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_task public.sms_inbound_action_tasks%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_token uuid;
begin
  if p_webhook_receipt_id is null then
    raise exception 'Inbound action receipt ID is required' using errcode = '22023';
  end if;
  select t.* into v_task
    from public.sms_inbound_action_tasks t
   where t.webhook_receipt_id = p_webhook_receipt_id
   for update;
  if v_task.id is null then
    return query select 'missing'::text, null::uuid, null::uuid, null::text,
      null::text, null::uuid, null::uuid, null::text, null::text,
      false, null::jsonb;
    return;
  end if;
  if v_task.task_state = 'completed' then
    return query
    select 'completed'::text, v_task.id, null::uuid, r.provider,
           r.provider_event_id, v_task.account_id, v_task.sender_number_id,
           s.purpose, r.from_number, true, v_task.outcome
      from public.sms_webhook_receipts r
      join public.sms_sender_numbers s on s.id = v_task.sender_number_id
     where r.id = v_task.webhook_receipt_id;
    return;
  end if;
  if v_task.task_state = 'dead_letter' then
    return query
    select 'exhausted'::text, v_task.id, null::uuid, r.provider,
           r.provider_event_id, v_task.account_id, v_task.sender_number_id,
           s.purpose, r.from_number, v_task.effect_applied_at is not null,
           v_task.outcome
      from public.sms_webhook_receipts r
      join public.sms_sender_numbers s on s.id = v_task.sender_number_id
     where r.id = v_task.webhook_receipt_id;
    return;
  end if;
  if v_task.task_state = 'processing' and v_task.lease_expires_at > v_now then
    return query
    select 'busy'::text, v_task.id, null::uuid, r.provider,
           r.provider_event_id, v_task.account_id, v_task.sender_number_id,
           s.purpose, r.from_number, v_task.effect_applied_at is not null,
           v_task.outcome
      from public.sms_webhook_receipts r
      join public.sms_sender_numbers s on s.id = v_task.sender_number_id
     where r.id = v_task.webhook_receipt_id;
    return;
  end if;
  if v_task.task_state = 'failed' and v_task.next_attempt_at > v_now then
    return query
    select 'deferred'::text, v_task.id, null::uuid, r.provider,
           r.provider_event_id, v_task.account_id, v_task.sender_number_id,
           s.purpose, r.from_number, v_task.effect_applied_at is not null,
           v_task.outcome
      from public.sms_webhook_receipts r
      join public.sms_sender_numbers s on s.id = v_task.sender_number_id
     where r.id = v_task.webhook_receipt_id;
    return;
  end if;
  if v_task.attempt_count >= 8 then
    update public.sms_inbound_action_tasks
       set task_state = 'dead_letter', claim_token = null, lease_expires_at = null,
           last_error = coalesce(last_error, 'inbound_action_attempt_limit'),
           dead_lettered_at = coalesce(dead_lettered_at, v_now), updated_at = v_now
     where id = v_task.id;
    return query
    select 'exhausted'::text, v_task.id, null::uuid, r.provider,
           r.provider_event_id, v_task.account_id, v_task.sender_number_id,
           s.purpose, r.from_number, v_task.effect_applied_at is not null,
           v_task.outcome
      from public.sms_webhook_receipts r
      join public.sms_sender_numbers s on s.id = v_task.sender_number_id
     where r.id = v_task.webhook_receipt_id;
    return;
  end if;

  v_token := pg_catalog.gen_random_uuid();
  update public.sms_inbound_action_tasks
     set task_state = 'processing', claim_token = v_token,
         lease_expires_at = v_now + interval '2 minutes',
         attempt_count = attempt_count + 1, last_error = null,
         dead_lettered_at = null, updated_at = v_now
   where id = v_task.id;
  return query
  select 'claimed'::text, v_task.id, v_token, r.provider,
         r.provider_event_id, v_task.account_id, v_task.sender_number_id,
         s.purpose, r.from_number, v_task.effect_applied_at is not null,
         v_task.outcome
    from public.sms_webhook_receipts r
    join public.sms_sender_numbers s on s.id = v_task.sender_number_id
   where r.id = v_task.webhook_receipt_id;
end;
$$;

create or replace function public.claim_sms_inbound_action_batch(
  p_batch_size integer default 10
)
returns table (
  claim_status text,
  task_id uuid,
  work_claim_token uuid,
  provider text,
  provider_event_id text,
  account_id uuid,
  sender_number_id uuid,
  sender_purpose text,
  from_number text,
  effect_applied boolean,
  stored_outcome jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_batch_size not between 1 and 25 then
    raise exception 'Inbound action batch size must be between 1 and 25'
      using errcode = '22023';
  end if;
  update public.sms_inbound_action_tasks t
     set task_state = 'dead_letter', claim_token = null, lease_expires_at = null,
         last_error = coalesce(t.last_error, 'inbound_action_attempt_limit'),
         dead_lettered_at = coalesce(t.dead_lettered_at, v_now), updated_at = v_now
   where t.attempt_count >= 8
     and (t.task_state in ('pending', 'failed')
       or (t.task_state = 'processing' and t.lease_expires_at <= v_now));

  return query
  with due as (
    select t.id
      from public.sms_inbound_action_tasks t
     where t.attempt_count < 8 and (
       (t.task_state in ('pending', 'failed') and t.next_attempt_at <= v_now)
       or (t.task_state = 'processing' and t.lease_expires_at <= v_now)
     )
     order by t.next_attempt_at, t.created_at, t.id
     for update skip locked
     limit p_batch_size
  ), claimed as (
    update public.sms_inbound_action_tasks t
       set task_state = 'processing', claim_token = pg_catalog.gen_random_uuid(),
           lease_expires_at = v_now + interval '2 minutes',
           attempt_count = t.attempt_count + 1, last_error = null,
           dead_lettered_at = null, updated_at = v_now
      from due where t.id = due.id
    returning t.*
  )
  select 'claimed'::text, c.id, c.claim_token, r.provider,
         r.provider_event_id, c.account_id, c.sender_number_id,
         s.purpose, r.from_number, c.effect_applied_at is not null, c.outcome
    from claimed c
    join public.sms_webhook_receipts r on r.id = c.webhook_receipt_id
    join public.sms_sender_numbers s on s.id = c.sender_number_id;
end;
$$;

create or replace function public.fail_sms_inbound_action(
  p_task_id uuid,
  p_claim_token uuid,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_task public.sms_inbound_action_tasks%rowtype;
begin
  if p_error_code is null or p_error_code !~ '^[a-z][a-z0-9_]{2,99}$' then
    raise exception 'Inbound action error code is invalid' using errcode = '22023';
  end if;
  select t.* into v_task
    from public.sms_inbound_action_tasks t
   where t.id = p_task_id
   for update;
  if v_task.id is null or v_task.task_state <> 'processing'
     or v_task.claim_token is distinct from p_claim_token then
    raise exception 'Inbound action failure claim is invalid' using errcode = '55000';
  end if;
  update public.sms_inbound_action_tasks
     set task_state = case when v_task.attempt_count >= 8
                            then 'dead_letter' else 'failed' end,
         claim_token = null, lease_expires_at = null,
         next_attempt_at = case when v_task.attempt_count >= 8 then v_now else
           v_now + least(
             interval '15 minutes',
             pg_catalog.make_interval(secs =>
               (5 * pg_catalog.power(2, least(v_task.attempt_count, 8)))::integer)
           ) end,
         last_error = p_error_code,
         dead_lettered_at = case when v_task.attempt_count >= 8 then v_now else null end,
         updated_at = v_now
   where id = v_task.id;
  return true;
end;
$$;

-- -------------------------------------------------------------------------
-- 4c. Synchronous STOP/START/HELP TwiML is the one callback-path egress that
--     cannot use the ordinary SMS outbox. Persist its exact result before the
--     HTTP response so it is explicit, receipt-keyed, and mismatch-detecting.
-- -------------------------------------------------------------------------

create table if not exists public.sms_compliance_reply_results (
  webhook_receipt_id uuid primary key
    references public.sms_webhook_receipts(id) on delete restrict,
  keyword text not null check (keyword in ('stop', 'start', 'help')),
  egress_result text not null check (egress_result in ('twiml', 'suppressed')),
  response_body_sha256 text not null check (response_body_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default pg_catalog.now()
);

create or replace function public.record_sms_compliance_reply_result(
  p_webhook_receipt_id uuid,
  p_keyword text,
  p_egress_result text,
  p_response_body_sha256 text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_receipt public.sms_webhook_receipts%rowtype;
  v_result public.sms_compliance_reply_results%rowtype;
begin
  if p_webhook_receipt_id is null
     or p_keyword not in ('stop', 'start', 'help')
     or p_egress_result not in ('twiml', 'suppressed')
     or p_response_body_sha256 is null
     or p_response_body_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'SMS compliance reply result is invalid' using errcode = '22023';
  end if;
  select r.* into v_receipt
    from public.sms_webhook_receipts r
   where r.id = p_webhook_receipt_id
   for share;
  if v_receipt.id is null
     or v_receipt.webhook_kind <> 'inbound'
     or v_receipt.processing_state <> 'processed'
     or v_receipt.disposition is distinct from ('keyword_' || p_keyword) then
    raise exception 'SMS compliance reply is not bound to a processed keyword receipt'
      using errcode = '55000';
  end if;

  insert into public.sms_compliance_reply_results (
    webhook_receipt_id, keyword, egress_result, response_body_sha256
  ) values (
    p_webhook_receipt_id, p_keyword, p_egress_result, p_response_body_sha256
  ) on conflict (webhook_receipt_id) do nothing
  returning * into v_result;
  if v_result.webhook_receipt_id is not null then
    return true;
  end if;

  -- The first committed result wins. A provider retry or concurrent duplicate
  -- must receive no second synchronous body even if current suppression/copy
  -- would propose a different result. Keyword identity remains immutable.
  select r.* into v_result
    from public.sms_compliance_reply_results r
   where r.webhook_receipt_id = p_webhook_receipt_id
   for update;
  if v_result.webhook_receipt_id is null then
    raise exception 'SMS compliance result conflict has no durable winner'
      using errcode = '55000';
  end if;
  if v_result.keyword is distinct from p_keyword then
    raise exception 'SMS compliance receipt was replayed with a different keyword'
      using errcode = 'P5124';
  end if;
  return false;
end;
$$;

-- -------------------------------------------------------------------------
-- 5. A provider-started text hold cannot be expired before its carrier result
--    is reconciled. Ordinary pre-request holds retain the original TTL.
-- -------------------------------------------------------------------------

create or replace function public.lock_sms_reservation_at_request_boundary()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_event public.sms_events%rowtype;
  v_reservation public.usage_reservations%rowtype;
  v_payment_status text;
  v_expected_payment_status text;
begin
  if old.request_started_at is null and new.request_started_at is not null then
    select e.* into v_event
      from public.sms_events e where e.id = new.sms_event_id;

    -- Terminal payment copy is valid only while the payment still has the
    -- matching state. The row lock linearizes this check with Stripe/payment
    -- transitions: a transition that committed first makes this request fail
    -- closed; one that commits afterwards necessarily follows an already
    -- started provider request. payment_requested is intentionally untouched.
    if v_event.context = 'payment'
       and v_event.event_type in ('payment_paid', 'payment_failed', 'payment_refunded') then
      v_expected_payment_status := case v_event.event_type
        when 'payment_paid' then 'paid'
        when 'payment_failed' then 'failed'
        when 'payment_refunded' then 'refunded'
      end;
      select p.status::text into v_payment_status
        from public.payments p
       where p.id = v_event.payment_id
         and p.account_id = v_event.account_id
       for share;
      if not found or v_payment_status is distinct from v_expected_payment_status then
        raise exception 'SMS payment transition was superseded before provider request'
          using errcode = 'P5105';
      end if;
    end if;

    if v_event.text_usage_kind = 'reservation' then
      select r.* into v_reservation
        from public.usage_reservations r
       where r.id = v_event.text_usage_reservation_id
       for update;
      if v_reservation.id is null
         or v_reservation.state <> 'reserved'
         or v_reservation.expires_at <= pg_catalog.clock_timestamp()
         or v_event.text_usage_finalization_key is distinct from
            (v_reservation.idempotency_key || ':commit') then
        raise exception 'SMS text reservation expired before provider request'
          using errcode = 'P5104';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sms_delivery_request_reservation_lock
  on public.sms_delivery_tasks;
create trigger sms_delivery_request_reservation_lock
before update of request_started_at on public.sms_delivery_tasks
for each row execute function public.lock_sms_reservation_at_request_boundary();

create or replace function public.commit_usage_reservation(
  p_reservation_id uuid,
  p_finalization_key text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_reservation public.usage_reservations%rowtype;
  v_allocation record;
  v_updated integer;
  v_provider_started boolean := false;
begin
  if p_finalization_key is null or pg_catalog.length(pg_catalog.btrim(p_finalization_key)) = 0 then
    raise exception 'reservation finalization key is required' using errcode = '22023';
  end if;
  select r.* into v_reservation
    from public.usage_reservations r where r.id = p_reservation_id for update;
  if not found then
    raise exception 'usage reservation not found' using errcode = 'P0002';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_reservation.account_id::text || ':' || v_reservation.resource_code, 0
  ));
  if v_reservation.state = 'committed' then
    if v_reservation.finalization_key is distinct from p_finalization_key then
      raise exception 'reservation was committed with a different finalization key'
        using errcode = '22000';
    end if;
    return true;
  end if;
  if v_reservation.state in ('released', 'expired') then
    return false;
  end if;

  select exists (
    select 1
      from public.sms_events e
      join public.sms_delivery_tasks t on t.sms_event_id = e.id
     where e.text_usage_reservation_id = v_reservation.id
       and e.text_usage_finalization_key = p_finalization_key
       and e.text_usage_state in ('held', 'reconciliation_failed')
       and t.request_started_at is not null
  ) into v_provider_started;

  if v_reservation.expires_at <= pg_catalog.now() and not v_provider_started then
    for v_allocation in
      select a.credit_lot_id, a.units
        from public.usage_reservation_allocations a
       where a.reservation_id = p_reservation_id order by a.credit_lot_id
    loop
      update public.usage_credit_lots l
         set reserved_units = l.reserved_units - v_allocation.units
       where l.id = v_allocation.credit_lot_id
         and l.account_id = v_reservation.account_id
         and l.reserved_units >= v_allocation.units;
      get diagnostics v_updated = row_count;
      if v_updated <> 1 then
        raise exception 'usage credit reservation invariant failed while expiring'
          using errcode = 'P0001';
      end if;
    end loop;
    update public.usage_reservations
       set state = 'expired', released_at = pg_catalog.now(),
           finalization_key = p_finalization_key,
           release_reason = 'expired_before_commit'
     where id = p_reservation_id;
    return false;
  end if;

  for v_allocation in
    select a.credit_lot_id, a.units
      from public.usage_reservation_allocations a
     where a.reservation_id = p_reservation_id order by a.credit_lot_id
  loop
    update public.usage_credit_lots l
       set reserved_units = l.reserved_units - v_allocation.units,
           consumed_units = l.consumed_units + v_allocation.units
     where l.id = v_allocation.credit_lot_id
       and l.account_id = v_reservation.account_id
       and l.reserved_units >= v_allocation.units;
    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception 'usage credit reservation invariant failed while committing'
        using errcode = 'P0001';
    end if;
  end loop;
  update public.usage_reservations
     set state = 'committed', committed_at = pg_catalog.now(),
         finalization_key = p_finalization_key
   where id = p_reservation_id;
  return true;
end;
$$;

create or replace function public.expire_usage_reservations(p_limit integer default 250)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_reservation record;
  v_allocation record;
  v_updated integer;
  v_expired integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'expiration batch limit must be between 1 and 1000' using errcode = '22023';
  end if;
  for v_reservation in
    select r.id, r.account_id, r.resource_code
      from public.usage_reservations r
     where r.state = 'reserved'
       and r.expires_at <= pg_catalog.now()
       and not exists (
         select 1
           from public.sms_events e
           join public.sms_delivery_tasks t on t.sms_event_id = e.id
          where e.text_usage_reservation_id = r.id
            and e.text_usage_state in ('held', 'reconciliation_failed')
            and t.request_started_at is not null
       )
     order by
       pg_catalog.hashtextextended(r.account_id::text || ':' || r.resource_code, 0),
       r.account_id, r.resource_code, r.expires_at, r.id
     limit p_limit
     for update skip locked
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      v_reservation.account_id::text || ':' || v_reservation.resource_code, 0
    ));
    for v_allocation in
      select a.credit_lot_id, a.units
        from public.usage_reservation_allocations a
       where a.reservation_id = v_reservation.id order by a.credit_lot_id
    loop
      update public.usage_credit_lots l
         set reserved_units = l.reserved_units - v_allocation.units
       where l.id = v_allocation.credit_lot_id
         and l.account_id = v_reservation.account_id
         and l.reserved_units >= v_allocation.units;
      get diagnostics v_updated = row_count;
      if v_updated <> 1 then
        raise exception 'usage credit reservation invariant failed in expiration sweep'
          using errcode = 'P0001';
      end if;
    end loop;
    update public.usage_reservations
       set state = 'expired', released_at = pg_catalog.now(),
           finalization_key = 'system-expiry:' || v_reservation.id::text,
           release_reason = 'reservation_expired'
     where id = v_reservation.id and state = 'reserved';
    get diagnostics v_updated = row_count;
    v_expired := v_expired + v_updated;
  end loop;
  return v_expired;
end;
$$;

-- -------------------------------------------------------------------------
-- 5b. A full-cap overage settlement legitimately refunds zero. Persist an
--     exact result row so zero can never again mean both "settled" and "no
--     event", and a lost RPC response replays the original financial answer.
-- -------------------------------------------------------------------------

-- A connected AI session can have an exact measured duration of zero. The
-- settlement marks that event and retains zero rather than inventing a minute;
-- the original positive-only event checks made that legitimate full refund
-- impossible to commit.
alter table public.workspace_overage_accrual_events
  drop constraint if exists workspace_overage_accrual_events_units_check;
alter table public.workspace_overage_accrual_events
  drop constraint if exists workspace_overage_accrual_events_millicents_check;
alter table public.workspace_overage_accrual_events
  add constraint workspace_overage_accrual_events_units_check check (
    units > 0 or (units = 0 and settled_at is not null)
  );
alter table public.workspace_overage_accrual_events
  add constraint workspace_overage_accrual_events_millicents_check check (
    millicents > 0 or (millicents = 0 and settled_at is not null)
  );

create table if not exists public.workspace_overage_event_settlements (
  account_id uuid not null references public.accounts(id) on delete cascade,
  idempotency_key text not null,
  requested_units bigint not null check (requested_units >= 0),
  refunded_millicents bigint not null check (refunded_millicents >= 0),
  settled_at timestamptz not null default pg_catalog.now(),
  primary key (account_id, idempotency_key),
  constraint workspace_overage_event_settlement_event_fk
    foreign key (account_id, idempotency_key)
    references public.workspace_overage_accrual_events(account_id, idempotency_key)
    on delete cascade
);

create or replace function public.settle_usage_overage_result(
  p_account_id uuid,
  p_idempotency_key text,
  p_units bigint
)
returns table (
  settled boolean,
  refunded_millicents bigint,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_event_locator public.workspace_overage_accrual_events%rowtype;
  v_event public.workspace_overage_accrual_events%rowtype;
  v_accrual public.workspace_overage_accruals%rowtype;
  v_result public.workspace_overage_event_settlements%rowtype;
  v_kept bigint;
  v_refund bigint;
  v_units_refund bigint;
  v_period_settled boolean;
  v_updated integer;
begin
  if p_account_id is null or p_idempotency_key is null
     or p_units is null or p_units < 0 then
    raise exception 'overage settlement arguments are invalid' using errcode = '22023';
  end if;

  -- An immutable result is sufficient replay evidence and avoids requiring a
  -- still-present aggregate row after a successfully completed first call.
  select s.* into v_result
    from public.workspace_overage_event_settlements s
   where s.account_id = p_account_id
     and s.idempotency_key = p_idempotency_key;
  if v_result.account_id is not null then
    if v_result.requested_units is distinct from p_units then
      raise exception 'overage settlement key was replayed with different units'
        using errcode = 'P5125';
    end if;
    return query select true, v_result.refunded_millicents, true;
    return;
  end if;

  -- Read only the immutable aggregate coordinates before taking locks. The
  -- lock order must match period close: aggregate first, then event/result.
  -- `close_overage_period` locks every aggregate row before it snapshots and
  -- inserts its settlement, so the recheck below linearizes refund vs close.
  select e.* into v_event_locator
    from public.workspace_overage_accrual_events e
   where e.account_id = p_account_id
     and e.idempotency_key = p_idempotency_key;
  if v_event_locator.account_id is null then
    return query select false, 0::bigint, false;
    return;
  end if;

  select a.* into v_accrual
    from public.workspace_overage_accruals a
   where a.account_id = p_account_id
     and a.period_start = v_event_locator.period_start
     and a.resource_code = v_event_locator.resource_code
   for update;
  if v_accrual.account_id is null then
    raise exception 'overage aggregate evidence is missing'
      using errcode = '55000';
  end if;

  select e.* into v_event
    from public.workspace_overage_accrual_events e
   where e.account_id = p_account_id
     and e.idempotency_key = p_idempotency_key
   for update;
  if v_event.account_id is null
     or v_event.period_start is distinct from v_event_locator.period_start
     or v_event.resource_code is distinct from v_event_locator.resource_code then
    raise exception 'overage event identity changed while locking'
      using errcode = '55000';
  end if;

  select s.* into v_result
    from public.workspace_overage_event_settlements s
   where s.account_id = p_account_id
     and s.idempotency_key = p_idempotency_key
   for update;
  if v_result.account_id is not null then
    if v_result.requested_units is distinct from p_units then
      raise exception 'overage settlement key was replayed with different units'
        using errcode = 'P5125';
    end if;
    return query select true, v_result.refunded_millicents, true;
    return;
  end if;
  if v_event.released_at is not null then
    return query select false, 0::bigint, false;
    return;
  end if;
  if v_event.settled_at is not null then
    -- A legacy scalar settlement lacks the original hold/refund evidence and
    -- cannot be reconstructed safely. Never manufacture a success result.
    raise exception 'overage settlement result evidence is missing'
      using errcode = '55000';
  end if;
  if p_units > v_event.units then
    raise exception 'overage settlement exceeds the units held' using errcode = '22023';
  end if;

  -- This check is intentionally after the aggregate row lock. A concurrent
  -- period close either waits and snapshots the post-refund aggregate, or wins
  -- the lock and leaves a settlement row that makes this call refuse safely.
  select exists (
    select 1 from public.workspace_overage_settlements s
     where s.account_id = p_account_id
       and s.period_start = v_event.period_start
  ) into v_period_settled;
  if v_period_settled then
    raise exception 'overage period has already been settled; settlement refused'
      using errcode = '55000';
  end if;

  v_kept := (v_event.millicents * p_units) / v_event.units;
  v_refund := v_event.millicents - v_kept;
  v_units_refund := v_event.units - p_units;

  -- Never clamp aggregate corruption to zero. Subtract exactly the event's
  -- released evidence and require the one locked aggregate row to have enough
  -- units and money. Any missing/underflowing row aborts the whole transaction
  -- before the event/result can claim success.
  update public.workspace_overage_accruals a
     set units = a.units - v_units_refund,
         millicents = a.millicents - v_refund,
         updated_at = pg_catalog.clock_timestamp()
   where a.account_id = p_account_id
     and a.period_start = v_event.period_start
     and a.resource_code = v_event.resource_code
     and a.units >= v_units_refund
     and a.millicents >= v_refund;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'overage aggregate cannot fund the exact settlement refund'
      using errcode = '55000';
  end if;

  update public.workspace_overage_accrual_events e
     set units = p_units, millicents = v_kept,
         settled_at = pg_catalog.clock_timestamp()
   where e.account_id = p_account_id
     and e.idempotency_key = p_idempotency_key
     and e.units = v_event.units
     and e.millicents = v_event.millicents
     and e.settled_at is null
     and e.released_at is null;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'overage event changed before exact settlement'
      using errcode = '55000';
  end if;
  insert into public.workspace_overage_event_settlements (
    account_id, idempotency_key, requested_units, refunded_millicents
  ) values (
    p_account_id, p_idempotency_key, p_units, v_refund
  );
  return query select true, v_refund, false;
end;
$$;

-- -------------------------------------------------------------------------
-- 6. Force RLS and expose only the narrow service-role worker surfaces.
-- -------------------------------------------------------------------------

alter table public.payment_sms_producer_tasks enable row level security;
alter table public.payment_sms_producer_tasks force row level security;
alter table public.sms_missed_call_receipts enable row level security;
alter table public.sms_missed_call_receipts force row level security;
alter table public.sms_compliance_reply_results enable row level security;
alter table public.sms_compliance_reply_results force row level security;
alter table public.workspace_overage_event_settlements enable row level security;
alter table public.workspace_overage_event_settlements force row level security;
alter table public.sms_consent_scopes enable row level security;
alter table public.sms_consent_scopes force row level security;

-- The specialized direct-payment worker was retired above in favour of the
-- canonical SMS delivery queue. Remove its old service-executable deferral RPC
-- so no future caller can accidentally revive the stale attempt-number lease
-- protocol from the earlier projection migration.
drop function if exists public.defer_direct_payment_settlement_task(uuid,uuid,text,integer);

drop policy if exists sms_consent_scopes_owner_read
  on public.sms_consent_scopes;
create policy sms_consent_scopes_owner_read
  on public.sms_consent_scopes
  for select to authenticated
  using (public.is_owner(account_id));

revoke all on table public.payment_sms_producer_tasks
  from public, anon, authenticated, service_role;
revoke all on table public.sms_missed_call_receipts
  from public, anon, authenticated, service_role;
revoke all on table public.sms_compliance_reply_results
  from public, anon, authenticated, service_role;
revoke all on table public.workspace_overage_event_settlements
  from public, anon, authenticated, service_role;
revoke all on table public.sms_consent_scopes
  from public, anon, authenticated, service_role;
grant select on table public.payment_sms_producer_tasks to service_role;
grant select on table public.sms_missed_call_receipts to service_role;
grant select on table public.sms_compliance_reply_results to service_role;
grant select on table public.workspace_overage_event_settlements to service_role;
grant select on table public.sms_consent_scopes to authenticated, service_role;

revoke all on function public.queue_payment_sms_transition()
  from public, anon, authenticated, service_role;
revoke all on function public.claim_payment_sms_producer_tasks(integer)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_payment_sms_producer_task(uuid,uuid,text,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.fail_payment_sms_producer_task(uuid,uuid,text,boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.baseline_sms_consent_from_inbound_receipt()
  from public, anon, authenticated, service_role;
revoke all on function public.establish_sms_consent_scope_from_source()
  from public, anon, authenticated, service_role;
revoke all on function public.ensure_sms_consent_baseline_scope(uuid,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.enqueue_direct_payment_settlement_sms(uuid,uuid,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.enqueue_authorized_inbox_message(uuid,text,text,text,boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.ingest_sms_missed_call(text,text,uuid,text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_sms_compliance_reply_result(uuid,text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.settle_usage_overage_result(uuid,text,bigint)
  from public, anon, authenticated, service_role;
revoke all on function public.reconcile_sms_unmatched_status(uuid,uuid,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.commit_usage_reservation(uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function public.expire_usage_reservations(integer)
  from public, anon, authenticated, service_role;
revoke all on function public.lock_sms_reservation_at_request_boundary()
  from public, anon, authenticated, service_role;
revoke all on function public.advance_sms_delivery_lease_sequence()
  from public, anon, authenticated, service_role;
revoke all on function public.assign_sms_delivery_attempt_sequence()
  from public, anon, authenticated, service_role;

grant execute on function public.claim_payment_sms_producer_tasks(integer)
  to service_role;
grant execute on function public.complete_payment_sms_producer_task(uuid,uuid,text,uuid)
  to service_role;
grant execute on function public.fail_payment_sms_producer_task(uuid,uuid,text,boolean)
  to service_role;
grant execute on function public.enqueue_authorized_inbox_message(uuid,text,text,text,boolean)
  to service_role;
grant execute on function public.ensure_sms_consent_baseline_scope(uuid,text,text)
  to service_role;
grant execute on function public.enqueue_direct_payment_settlement_sms(uuid,uuid,text,text)
  to service_role;
grant execute on function public.ingest_sms_missed_call(text,text,uuid,text,text,text)
  to service_role;
grant execute on function public.record_sms_compliance_reply_result(uuid,text,text,text)
  to service_role;
grant execute on function public.settle_usage_overage_result(uuid,text,bigint)
  to service_role;
grant execute on function public.reconcile_sms_unmatched_status(uuid,uuid,text,text)
  to service_role;
grant execute on function public.commit_usage_reservation(uuid,text)
  to service_role;
grant execute on function public.expire_usage_reservations(integer)
  to service_role;

commit;
