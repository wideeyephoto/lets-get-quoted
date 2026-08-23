-- Durable, receipt-keyed processing for ordinary inbound SMS replies.
--
-- Authenticated carrier ingest remains the only creator of work. The trigger
-- below runs in the same transaction that stores the inbound transcript, so a
-- routed receipt can never commit without its action task. Domain effects and
-- the exact reply intent commit together; carrier egress remains in the
-- existing durable sms_delivery queue.

begin;

-- An accepted estimate creates one route stop. This source key makes replay
-- harmless even if the caller loses the RPC response after commit.
alter table public.route_stops
  add column if not exists source_sms_webhook_receipt_id uuid
    references public.sms_webhook_receipts(id) on delete restrict;
create unique index if not exists route_stops_sms_webhook_receipt_uidx
  on public.route_stops (source_sms_webhook_receipt_id)
  where source_sms_webhook_receipt_id is not null;

create table if not exists public.sms_inbound_action_tasks (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  webhook_receipt_id uuid not null unique
    references public.sms_webhook_receipts(id) on delete restrict,
  account_id uuid not null references public.accounts(id) on delete restrict,
  sender_number_id uuid not null
    references public.sms_sender_numbers(id) on delete restrict,
  sms_message_id uuid not null unique
    references public.sms_messages(id) on delete restrict,
  task_state text not null default 'pending'
    check (task_state in ('pending', 'processing', 'failed', 'completed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default pg_catalog.now(),
  claim_token uuid,
  lease_expires_at timestamptz,
  effect_applied_at timestamptz,
  outcome jsonb,
  customer_reply_event_id uuid references public.sms_events(id) on delete restrict,
  owner_alert_event_id uuid references public.sms_events(id) on delete restrict,
  last_error text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  constraint sms_inbound_action_tasks_claim_shape check (
    (task_state = 'processing' and claim_token is not null and lease_expires_at is not null)
    or (task_state <> 'processing' and claim_token is null and lease_expires_at is null)
  ),
  constraint sms_inbound_action_tasks_effect_shape check (
    (effect_applied_at is null and outcome is null)
    or (effect_applied_at is not null and outcome is not null)
  ),
  constraint sms_inbound_action_tasks_completed_shape check (
    (task_state = 'completed' and completed_at is not null and effect_applied_at is not null)
    or (task_state <> 'completed' and completed_at is null)
  )
);

create index if not exists sms_inbound_action_tasks_due_idx
  on public.sms_inbound_action_tasks (next_attempt_at, created_at, id)
  where task_state in ('pending', 'failed', 'processing');

-- Candidate producers and the reply applier share this per-account/recipient
-- advisory lock. It closes the count-then-mutate race without a global lock on
-- jobs or offers. The trigger is deliberately at the table boundary so every
-- writer (dashboard, cron, public token page, or future code) participates.
create or replace function public.sms_normalize_recipient_phone(p_phone text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  with value as (
    select pg_catalog.regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as digits
  )
  select case
    when pg_catalog.length(digits) = 10 then '+1' || digits
    when pg_catalog.length(digits) between 8 and 15 and digits ~ '^[1-9][0-9]+$'
      then '+' || digits
    else null::text
  end
  from value
$$;

create or replace function public.sms_inbound_recipient_lock_key(
  p_account_id uuid,
  p_phone text
)
returns bigint
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select pg_catalog.hashtextextended(
    coalesce(p_account_id::text, '') || ':' ||
    coalesce(public.sms_normalize_recipient_phone(p_phone), ''),
    0
  )
$$;

create or replace function public.lock_sms_inbound_candidate_recipient()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_old_key bigint;
  v_new_key bigint;
begin
  if tg_op <> 'INSERT' then
    v_old_key := public.sms_inbound_recipient_lock_key(
      old.account_id,
      coalesce(
        pg_catalog.to_jsonb(old)->>'client_phone',
        pg_catalog.to_jsonb(old)->>'phone',
        pg_catalog.to_jsonb(old)->>'phone_number'
      )
    );
  end if;
  if tg_op <> 'DELETE' then
    v_new_key := public.sms_inbound_recipient_lock_key(
      new.account_id,
      coalesce(
        pg_catalog.to_jsonb(new)->>'client_phone',
        pg_catalog.to_jsonb(new)->>'phone',
        pg_catalog.to_jsonb(new)->>'phone_number'
      )
    );
  end if;

  -- Stable ordering prevents two phone/account swaps from deadlocking.
  if v_old_key is not null and v_new_key is not null and v_old_key <> v_new_key then
    perform pg_catalog.pg_advisory_xact_lock(least(v_old_key, v_new_key));
    perform pg_catalog.pg_advisory_xact_lock(greatest(v_old_key, v_new_key));
  else
    perform pg_catalog.pg_advisory_xact_lock(coalesce(v_new_key, v_old_key));
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists estimate_offers_sms_inbound_recipient_lock
  on public.estimate_offers;
create trigger estimate_offers_sms_inbound_recipient_lock
before insert or update or delete on public.estimate_offers
for each row execute function public.lock_sms_inbound_candidate_recipient();

drop trigger if exists reschedule_offers_sms_inbound_recipient_lock
  on public.reschedule_offers;
create trigger reschedule_offers_sms_inbound_recipient_lock
before insert or update or delete on public.reschedule_offers
for each row execute function public.lock_sms_inbound_candidate_recipient();

drop trigger if exists jobs_sms_inbound_recipient_lock on public.jobs;
create trigger jobs_sms_inbound_recipient_lock
before insert or update or delete on public.jobs
for each row execute function public.lock_sms_inbound_candidate_recipient();

drop trigger if exists subcontractor_offers_sms_inbound_recipient_lock
  on public.subcontractor_offers;
create trigger subcontractor_offers_sms_inbound_recipient_lock
before insert or update or delete on public.subcontractor_offers
for each row execute function public.lock_sms_inbound_candidate_recipient();

drop trigger if exists sms_events_sms_inbound_recipient_lock
  on public.sms_events;
create trigger sms_events_sms_inbound_recipient_lock
before insert or update or delete on public.sms_events
for each row execute function public.lock_sms_inbound_candidate_recipient();

-- A sent appointment question is the conjunction of job_feed evidence and a
-- sent/delivered sms_event. Both table boundaries participate in the same
-- recipient lock as jobs so that question cannot appear during exact-one
-- classification.
create or replace function public.lock_sms_inbound_job_feed_recipient()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_old_key bigint;
  v_new_key bigint;
begin
  if tg_op <> 'INSERT' and old.kind = 'appointment_reminder' then
    select public.sms_inbound_recipient_lock_key(j.account_id, j.client_phone)
      into v_old_key from public.jobs j where j.id = old.job_id;
  end if;
  if tg_op <> 'DELETE' and new.kind = 'appointment_reminder' then
    select public.sms_inbound_recipient_lock_key(j.account_id, j.client_phone)
      into v_new_key from public.jobs j where j.id = new.job_id;
  end if;
  if v_old_key is not null and v_new_key is not null and v_old_key <> v_new_key then
    perform pg_catalog.pg_advisory_xact_lock(least(v_old_key, v_new_key));
    perform pg_catalog.pg_advisory_xact_lock(greatest(v_old_key, v_new_key));
  elsif coalesce(v_new_key, v_old_key) is not null then
    perform pg_catalog.pg_advisory_xact_lock(coalesce(v_new_key, v_old_key));
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists job_feed_sms_inbound_recipient_lock on public.job_feed;
create trigger job_feed_sms_inbound_recipient_lock
before insert or update or delete on public.job_feed
for each row execute function public.lock_sms_inbound_job_feed_recipient();

-- Request state changes also open/close every linked subcontractor offer. Lock
-- those phone scopes in deterministic order before changing the request.
create or replace function public.lock_sms_inbound_subcontractor_request_recipients()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_key bigint;
begin
  for v_key in
    select distinct public.sms_inbound_recipient_lock_key(o.account_id, o.phone)
      from public.subcontractor_offers o
     where o.request_id in (old.id, new.id)
     order by 1
  loop
    perform pg_catalog.pg_advisory_xact_lock(v_key);
  end loop;
  return new;
end;
$$;

drop trigger if exists subcontractor_requests_sms_inbound_recipient_lock
  on public.subcontractor_requests;
create trigger subcontractor_requests_sms_inbound_recipient_lock
before update on public.subcontractor_requests
for each row execute function public.lock_sms_inbound_subcontractor_request_recipients();

create or replace function public.enqueue_sms_inbound_action_task()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.webhook_kind = 'inbound'
     and new.processing_state = 'processed'
     and new.disposition = 'routed'
     and new.account_id is not null
     and new.sender_number_id is not null
     and new.sms_message_id is not null then
    insert into public.sms_inbound_action_tasks (
      webhook_receipt_id, account_id, sender_number_id, sms_message_id
    ) values (
      new.id, new.account_id, new.sender_number_id, new.sms_message_id
    ) on conflict (webhook_receipt_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists sms_webhook_receipt_enqueue_inbound_action
  on public.sms_webhook_receipts;
create trigger sms_webhook_receipt_enqueue_inbound_action
after insert or update on public.sms_webhook_receipts
for each row execute function public.enqueue_sms_inbound_action_task();

create or replace function public.get_sms_inbound_receipt_disposition(
  p_webhook_receipt_id uuid
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select r.disposition
    from public.sms_webhook_receipts r
   where r.id = p_webhook_receipt_id
     and r.webhook_kind = 'inbound'
$$;

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

  v_token := pg_catalog.gen_random_uuid();
  update public.sms_inbound_action_tasks
     set task_state = 'processing', claim_token = v_token,
         lease_expires_at = v_now + interval '2 minutes',
         attempt_count = attempt_count + 1, last_error = null,
         updated_at = v_now
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

  return query
  with due as (
    select t.id
      from public.sms_inbound_action_tasks t
     where (
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
           updated_at = v_now
      from due
     where t.id = due.id
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

create or replace function public.apply_sms_inbound_action(
  p_task_id uuid,
  p_claim_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_task public.sms_inbound_action_tasks%rowtype;
  v_receipt public.sms_webhook_receipts%rowtype;
  v_message public.sms_messages%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_token text;
  v_decision text;
  v_confirmation_only boolean := false;
  v_candidate_count integer := 0;
  v_kind text;
  v_target_id uuid;
  v_business_name text := 'your contractor';
  v_reply_kind text;
  v_reply_body text;
  v_alert_phone text;
  v_alert_body text;
  v_name text;
  v_when text;
  v_stop_id uuid;
  v_estimate public.estimate_offers%rowtype;
  v_reschedule public.reschedule_offers%rowtype;
  v_job public.jobs%rowtype;
  v_sub_offer public.subcontractor_offers%rowtype;
  v_sub_request public.subcontractor_requests%rowtype;
begin
  select t.* into v_task
    from public.sms_inbound_action_tasks t
   where t.id = p_task_id
   for update;
  if v_task.id is null
     or v_task.task_state <> 'processing'
     or v_task.claim_token is distinct from p_claim_token
     or v_task.lease_expires_at <= v_now then
    raise exception 'Inbound action claim is not active' using errcode = '55000';
  end if;
  if v_task.effect_applied_at is not null then
    return v_task.outcome;
  end if;

  select r.* into strict v_receipt
    from public.sms_webhook_receipts r
   where r.id = v_task.webhook_receipt_id;
  select m.* into strict v_message
    from public.sms_messages m
   where m.id = v_task.sms_message_id;
  if v_receipt.account_id is distinct from v_task.account_id
     or v_message.account_id is distinct from v_task.account_id
     or v_message.phone_number is distinct from v_receipt.from_number
     or v_receipt.disposition <> 'routed' then
    raise exception 'Inbound action task binding is invalid' using errcode = '23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    public.sms_inbound_recipient_lock_key(v_task.account_id, v_receipt.from_number)
  );

  v_token := pg_catalog.upper(
    coalesce((pg_catalog.regexp_split_to_array(pg_catalog.btrim(v_message.body), E'\\s+'))[1], '')
  );
  if v_token in ('YES','Y','YEP','YEAH','SURE','OK','ACCEPT','CONFIRM','CONFIRMED','1','C') then
    v_decision := 'accept';
  elsif v_token in ('NO','N','NOPE','DECLINE','2') then
    v_decision := 'decline';
  else
    v_decision := 'unclear';
  end if;
  v_confirmation_only := v_token = 'C';

  select pg_catalog.count(*)::integer,
         (pg_catalog.array_agg(c.kind))[1],
         (pg_catalog.array_agg(c.target_id))[1]
    into v_candidate_count, v_kind, v_target_id
    from (
      select 'estimate'::text as kind, e.id as target_id
        from public.estimate_offers e
       where not v_confirmation_only
         and e.account_id = v_task.account_id
         and e.phone = v_receipt.from_number
         and e.status = 'held'
      union all
      select 'reschedule'::text, o.id
        from public.reschedule_offers o
       where not v_confirmation_only
         and o.account_id = v_task.account_id
         and o.phone = v_receipt.from_number
         and o.status = 'sent'
      union all
      select 'appointment'::text, j.id
        from public.jobs j
       where v_decision = 'accept'
         and j.account_id = v_task.account_id
         and public.sms_normalize_recipient_phone(j.client_phone) = v_receipt.from_number
         and j.scheduled_for >= (v_now at time zone 'UTC')::date
         and j.status in ('new_lead', 'in_progress')
         and j.appointment_confirmed_at is null
         and exists (
           select 1
             from public.job_feed f
             join public.sms_events e on e.id::text = f.meta->>'sms_event_id'
            where f.account_id = j.account_id
              and f.job_id = j.id
              and f.kind = 'appointment_reminder'
              and f.meta->>'channel' = 'sms'
              and f.meta->>'scheduled_for' = j.scheduled_for::text
              and e.status in ('sent', 'delivered')
         )
      union all
      select 'subcontractor'::text, o.id
        from public.subcontractor_offers o
        join public.subcontractor_requests r on r.id = o.request_id
       where not v_confirmation_only
         and v_decision in ('accept', 'decline')
         and o.account_id = v_task.account_id
         and o.phone = v_receipt.from_number
         and o.status in ('queued','sent','delivered','viewed','failed')
         and r.status in ('sent','viewed','partially_responded','reopened')
         and r.expires_at > v_now
    ) c;

  select nullif(pg_catalog.btrim(a.business_name), ''),
         public.sms_normalize_recipient_phone(a.alert_phone)
    into v_business_name, v_alert_phone
    from public.accounts a where a.id = v_task.account_id;
  if v_business_name is null or v_business_name = 'My Business' then
    v_business_name := 'your contractor';
  end if;

  if v_candidate_count = 0 then
    v_reply_kind := null;
    v_reply_body := null;
    v_kind := 'none';
  elsif v_candidate_count > 1 then
    v_kind := 'ambiguous';
    v_reply_kind := 'ambiguity';
    v_reply_body := 'We found more than one open request for this number, so nothing was changed. Please use the link in the message you are answering or contact ' || v_business_name || '.';
  elsif v_kind = 'estimate' then
    select e.* into strict v_estimate
      from public.estimate_offers e where e.id = v_target_id for update;
    select coalesce(nullif(pg_catalog.btrim(l.name), ''), 'there')
      into v_name from public.leads l where l.id = v_estimate.lead_id;
    v_reply_kind := 'offer';
    if v_decision = 'decline' then
      update public.estimate_offers
         set status = 'declined', replied_at = v_now,
             reply_body = pg_catalog.left(v_message.body, 500), updated_at = v_now
       where id = v_estimate.id and status = 'held';
      v_reply_body := 'No problem ' || v_name || ' — that estimate window has been released. ' || v_business_name || ' still has your request.';
      v_alert_body := v_name || ' said NO to an estimate window.';
    elsif v_decision = 'unclear' then
      update public.estimate_offers
         set forwarded_at = coalesce(forwarded_at, v_now), updated_at = v_now
       where id = v_estimate.id and status = 'held';
      v_reply_body := 'Thanks ' || v_name || ' — we passed that to ' || v_business_name || ' and they will follow up shortly.';
    elsif v_estimate.hold_expires_at <= v_now then
      update public.estimate_offers
         set status = 'accepted_late', replied_at = v_now,
             reply_body = pg_catalog.left(v_message.body, 500), updated_at = v_now
       where id = v_estimate.id and status = 'held';
      v_reply_body := 'Thanks ' || v_name || '! That window has just passed, so it was not booked. ' || v_business_name || ' has your reply and will help find a time.';
      v_alert_body := v_name || ' said YES after an estimate hold expired.';
    else
      insert into public.route_stops (
        account_id, crew_id, lead_id, scheduled_for, scheduled_time,
        label, address, lat, lng, minutes, kind, note,
        source_sms_webhook_receipt_id
      )
      select v_estimate.account_id, v_estimate.crew_id, v_estimate.lead_id,
             v_estimate.offer_date, v_estimate.arrival_time,
             'Estimate — ' || v_name, l.address, l.lat, l.lng,
             v_estimate.visit_minutes, 'estimate',
             'Accepted by text from receipt ' || v_receipt.id::text,
             v_receipt.id
        from public.leads l where l.id = v_estimate.lead_id
      on conflict (source_sms_webhook_receipt_id)
        where source_sms_webhook_receipt_id is not null
      do update
        set source_sms_webhook_receipt_id = excluded.source_sms_webhook_receipt_id
      returning id into v_stop_id;
      update public.estimate_offers
         set status = 'accepted', replied_at = v_now,
             reply_body = pg_catalog.left(v_message.body, 500),
             route_stop_id = v_stop_id, updated_at = v_now
       where id = v_estimate.id and status = 'held';
      update public.leads
         set quote_visit = pg_catalog.jsonb_build_object(
               'scheduledFor', v_estimate.offer_date,
               'scheduledTime', v_estimate.arrival_time,
               'durationMinutes', v_estimate.visit_minutes,
               'notes', 'Booked from an estimate offer by text.',
               'confirmationTextSentAt', v_now,
               'scheduledAt', v_now
             ),
             status = case when status = 'new' then 'contacted' else status end,
             updated_at = v_now
       where id = v_estimate.lead_id and account_id = v_task.account_id;
      v_when := pg_catalog.to_char(v_estimate.offer_date, 'FMDay, Mon FMDD') ||
        ' between ' || pg_catalog.to_char(v_estimate.window_start, 'FMHH12:MI AM') ||
        ' and ' || pg_catalog.to_char(v_estimate.window_end, 'FMHH12:MI AM');
      v_reply_body := 'You are booked, ' || v_name || '! ' || v_business_name || ' will arrive ' || v_when || '.';
      v_alert_body := v_name || ' said YES — the estimate was added to the schedule.';
    end if;
  elsif v_kind = 'reschedule' then
    select o.* into strict v_reschedule
      from public.reschedule_offers o where o.id = v_target_id for update;
    select j.* into strict v_job from public.jobs j where j.id = v_reschedule.job_id for update;
    v_name := coalesce(nullif(pg_catalog.btrim(v_job.client_name), ''), 'there');
    v_reply_kind := 'reschedule';
    if v_decision = 'decline' then
      update public.reschedule_offers
         set status = 'declined', replied_at = v_now,
             reply_body = pg_catalog.left(v_message.body, 500), updated_at = v_now
       where id = v_reschedule.id and status = 'sent';
      v_reply_body := 'No problem ' || v_name || ' — you are still booked for the original time. Nothing changed.';
      v_alert_body := v_name || ' said NO to a reschedule offer.';
    elsif v_decision = 'unclear' then
      update public.reschedule_offers
         set forwarded_at = coalesce(forwarded_at, v_now), updated_at = v_now
       where id = v_reschedule.id and status = 'sent';
      v_reply_body := 'Thanks ' || v_name || ' — we passed that to ' || v_business_name || ' and they will follow up shortly.';
    else
      update public.jobs
         set scheduled_for = v_reschedule.to_date,
             scheduled_time = v_reschedule.arrival_time,
             reschedule_discount_percent = v_reschedule.discount_percent,
             reschedule_discount_note = 'Agreed by text to move from ' || v_reschedule.from_date::text || ' to ' || v_reschedule.to_date::text,
             reschedule_discount_agreed_at = v_now
       where id = v_reschedule.job_id and account_id = v_task.account_id;
      update public.reschedule_offers
         set status = 'accepted', replied_at = v_now,
             reply_body = pg_catalog.left(v_message.body, 500), updated_at = v_now
       where id = v_reschedule.id and status = 'sent';
      v_when := pg_catalog.to_char(v_reschedule.to_date, 'FMDay, Mon FMDD') ||
        ', ' || pg_catalog.to_char(v_reschedule.window_start, 'FMHH12:MI AM') ||
        '–' || pg_catalog.to_char(v_reschedule.window_end, 'FMHH12:MI AM');
      v_reply_body := 'You are moved, ' || v_name || ' — ' || v_when || '. The ' ||
        v_reschedule.discount_percent::text || '% comes off your final bill.';
      v_alert_body := v_name || ' said YES — the job was moved and the discount recorded.';
    end if;
  elsif v_kind = 'appointment' then
    select j.* into strict v_job from public.jobs j where j.id = v_target_id for update;
    update public.jobs set appointment_confirmed_at = v_now
     where id = v_job.id and account_id = v_task.account_id
       and appointment_confirmed_at is null;
    v_name := coalesce(nullif(pg_catalog.btrim(v_job.client_name), ''), 'there');
    v_when := pg_catalog.to_char(v_job.scheduled_for, 'FMDay, Mon FMDD') ||
      case when v_job.scheduled_time is null then ''
           else ' at ' || pg_catalog.to_char(v_job.scheduled_time, 'FMHH12:MI AM') end;
    v_reply_kind := 'appointment_confirmation';
    v_reply_body := 'Thanks ' || v_name || ' — your appointment ' || v_when ||
      ' with ' || v_business_name || ' is confirmed. See you then!';
  elsif v_kind = 'subcontractor' then
    select o.* into strict v_sub_offer
      from public.subcontractor_offers o where o.id = v_target_id for update;
    select r.* into strict v_sub_request
      from public.subcontractor_requests r where r.id = v_sub_offer.request_id for update;
    v_reply_kind := 'subcontractor';
    if v_decision = 'decline' then
      update public.subcontractor_offers
         set status = 'declined', responded_at = v_now,
             decline_reason = 'Declined by text', updated_at = v_now
       where id = v_sub_offer.id
         and status in ('queued','sent','delivered','viewed','failed');
      v_reply_body := 'Thanks — we recorded that you are not available for this job.';
      v_alert_body := 'A subcontractor declined ' || v_sub_request.work_description || ' by text.';
    elsif v_sub_request.selection_mode = 'collect_interest' then
      update public.subcontractor_offers
         set status = 'accepted', won = false, responded_at = v_now, updated_at = v_now
       where id = v_sub_offer.id
         and status in ('queued','sent','delivered','viewed','failed');
      update public.subcontractor_requests
         set status = 'partially_responded', updated_at = v_now
       where id = v_sub_request.id
         and status in ('sent','viewed','partially_responded','reopened');
      v_reply_body := 'Thanks — your availability was recorded. ' || v_business_name || ' will let you know if you are selected.';
      v_alert_body := 'A subcontractor is available for ' || v_sub_request.work_description || '.';
    else
      update public.subcontractor_requests
         set status = 'claimed', claimed_offer_id = v_sub_offer.id,
             claimed_crew_id = v_sub_offer.crew_id, claimed_at = v_now,
             updated_at = v_now
       where id = v_sub_request.id
         and claimed_offer_id is null
         and status in ('sent','viewed','partially_responded','reopened')
         and expires_at > v_now;
      if not found then
        raise exception 'Subcontractor request changed during reply processing'
          using errcode = '40001';
      end if;
      insert into public.crew_assignments(account_id, job_id, crew_id)
      values (v_task.account_id, v_sub_request.job_id, v_sub_offer.crew_id)
      on conflict (job_id, crew_id) do nothing;
      update public.subcontractor_offers
         set status = 'accepted', won = true, responded_at = v_now, updated_at = v_now
       where id = v_sub_offer.id;
      update public.subcontractor_offers
         set status = 'covered', updated_at = v_now
       where request_id = v_sub_request.id and id <> v_sub_offer.id
         and status in ('queued','sent','delivered','viewed','failed');
      v_reply_body := 'You got the job. Open the secure link from the offer message for the customer and site details.';
      v_alert_body := 'A subcontractor accepted ' || v_sub_request.work_description || ' and was assigned to the job.';
    end if;
  end if;

  -- Free-text forwarding has no terminal owner alert; the inbox row itself is
  -- the durable owner-visible fact. All other preserved alerts are queued after
  -- this transaction with their own receipt-derived idempotency key.
  if v_decision = 'unclear' or v_kind in ('none', 'ambiguous', 'appointment') then
    v_alert_phone := null;
    v_alert_body := null;
  end if;

  v_task.outcome := pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'action_kind', v_kind,
    'target_id', v_target_id,
    'decision', v_decision,
    'reply_kind', v_reply_kind,
    'reply_body', v_reply_body,
    'owner_alert_phone', v_alert_phone,
    'owner_alert_body', v_alert_body
  ));
  update public.sms_inbound_action_tasks
     set effect_applied_at = v_now, outcome = v_task.outcome, updated_at = v_now
   where id = v_task.id and task_state = 'processing'
     and claim_token = p_claim_token;
  return v_task.outcome;
end;
$$;

create or replace function public.complete_sms_inbound_action(
  p_task_id uuid,
  p_claim_token uuid,
  p_customer_reply_event_id uuid default null,
  p_owner_alert_event_id uuid default null
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
  update public.sms_inbound_action_tasks
     set task_state = 'completed', claim_token = null, lease_expires_at = null,
         customer_reply_event_id = p_customer_reply_event_id,
         owner_alert_event_id = p_owner_alert_event_id,
         completed_at = v_now, updated_at = v_now, last_error = null
   where id = p_task_id and task_state = 'processing'
     and claim_token = p_claim_token and effect_applied_at is not null;
  if not found then
    raise exception 'Inbound action completion claim is invalid' using errcode = '55000';
  end if;
  return true;
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
begin
  if p_error_code is null or p_error_code !~ '^[a-z][a-z0-9_]{2,99}$' then
    raise exception 'Inbound action error code is invalid' using errcode = '22023';
  end if;
  update public.sms_inbound_action_tasks
     set task_state = 'failed', claim_token = null, lease_expires_at = null,
         next_attempt_at = v_now + least(
           interval '15 minutes',
           pg_catalog.make_interval(secs => (5 * pg_catalog.power(2, least(attempt_count, 8)))::integer)
         ),
         last_error = p_error_code, updated_at = v_now
   where id = p_task_id and task_state = 'processing'
     and claim_token = p_claim_token;
  if not found then
    raise exception 'Inbound action failure claim is invalid' using errcode = '55000';
  end if;
  return true;
end;
$$;

alter table public.sms_inbound_action_tasks enable row level security;
alter table public.sms_inbound_action_tasks force row level security;

revoke all on table public.sms_inbound_action_tasks
  from public, anon, authenticated, service_role;
revoke all on function public.sms_normalize_recipient_phone(text)
  from public, anon, authenticated, service_role;
revoke all on function public.sms_inbound_recipient_lock_key(uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function public.lock_sms_inbound_candidate_recipient()
  from public, anon, authenticated, service_role;
revoke all on function public.lock_sms_inbound_subcontractor_request_recipients()
  from public, anon, authenticated, service_role;
revoke all on function public.lock_sms_inbound_job_feed_recipient()
  from public, anon, authenticated, service_role;
revoke all on function public.enqueue_sms_inbound_action_task()
  from public, anon, authenticated, service_role;

revoke all on function public.get_sms_inbound_receipt_disposition(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_sms_inbound_receipt_disposition(uuid)
  to service_role;
revoke all on function public.claim_sms_inbound_action(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_sms_inbound_action(uuid)
  to service_role;
revoke all on function public.claim_sms_inbound_action_batch(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_sms_inbound_action_batch(integer)
  to service_role;
revoke all on function public.apply_sms_inbound_action(uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_sms_inbound_action(uuid,uuid)
  to service_role;
revoke all on function public.complete_sms_inbound_action(uuid,uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_sms_inbound_action(uuid,uuid,uuid,uuid)
  to service_role;
revoke all on function public.fail_sms_inbound_action(uuid,uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.fail_sms_inbound_action(uuid,uuid,text)
  to service_role;

commit;
