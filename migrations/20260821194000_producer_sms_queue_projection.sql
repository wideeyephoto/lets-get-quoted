-- Durable producer identities and honest subcontractor delivery projection.
--
-- `subcontractor_offers.provider_id` is carrier evidence. Earlier application
-- code placed the local sms_events UUID there as soon as enqueue returned and
-- marked the parent request sent. Keep the local identity in a real FK, then
-- let only sms_events lifecycle facts project sent/delivered/failed.

begin;

alter table public.subcontractor_requests
  add column if not exists queued_at timestamptz;

alter table public.subcontractor_requests
  drop constraint if exists subcontractor_requests_status_check;
alter table public.subcontractor_requests
  add constraint subcontractor_requests_status_check check (
    status in (
      'draft', 'queued', 'sent', 'delivery_failed', 'viewed',
      'partially_responded', 'claimed', 'expired', 'cancelled', 'reopened'
    )
  );

drop index if exists public.subcontractor_requests_one_live_per_job;
create unique index subcontractor_requests_one_live_per_job
  on public.subcontractor_requests (job_id)
  where status in (
    'draft', 'queued', 'sent', 'delivery_failed', 'viewed',
    'partially_responded', 'reopened'
  );

drop index if exists public.subcontractor_requests_open_idx;
create index subcontractor_requests_open_idx
  on public.subcontractor_requests (account_id, expires_at)
  where status in ('queued', 'sent', 'viewed', 'partially_responded', 'reopened');

alter table public.subcontractor_offers
  add column if not exists sms_event_id uuid
    references public.sms_events(id) on delete set null;

create unique index if not exists subcontractor_offers_sms_event_uidx
  on public.subcontractor_offers (sms_event_id)
  where sms_event_id is not null;

-- Repair rows written by the interim queue producer, which stored a local
-- event UUID in provider_id. A UUID-shaped carrier id is not enough: the event
-- must also belong to the same account, crew member and subcontractor context.
update public.subcontractor_offers o
   set sms_event_id = e.id,
       provider_id = e.provider_id,
       queued_at = coalesce(o.queued_at, e.queued_at, o.created_at),
       updated_at = pg_catalog.clock_timestamp()
  from public.sms_events e
 where o.sms_event_id is null
   and o.provider_id = e.id::text
   and e.account_id = o.account_id
   and e.crew_id = o.crew_id
   and e.context = 'subcontractor';

create or replace function public.validate_subcontractor_offer_sms_identity()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  v_event public.sms_events%rowtype;
begin
  if new.sms_event_id is null then
    if new.provider_id is not null and (
      tg_op = 'INSERT' or new.provider_id is distinct from old.provider_id
    ) then
      raise exception 'Subcontractor carrier identity requires an SMS event'
        using errcode = '23514';
    end if;
    return new;
  end if;

  select e.* into v_event
    from public.sms_events e
   where e.id = new.sms_event_id;

  if v_event.id is null
     or v_event.account_id is distinct from new.account_id
     or v_event.crew_id is distinct from new.crew_id
     or v_event.context <> 'subcontractor' then
    raise exception 'Subcontractor SMS event identity does not match the offer'
      using errcode = '23514';
  end if;
  if new.provider_id is not null
     and new.provider_id is distinct from v_event.provider_id then
    raise exception 'Subcontractor carrier identity does not match the SMS event'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists subcontractor_offer_sms_identity_guard
  on public.subcontractor_offers;
create trigger subcontractor_offer_sms_identity_guard
before insert or update of sms_event_id, provider_id, account_id, crew_id
on public.subcontractor_offers
for each row execute function public.validate_subcontractor_offer_sms_identity();

create or replace function public.apply_subcontractor_sms_event_projection(
  p_sms_event_id uuid
)
returns void
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  v_event public.sms_events%rowtype;
  v_request_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  select e.* into v_event
    from public.sms_events e
   where e.id = p_sms_event_id;
  if v_event.id is null or v_event.context <> 'subcontractor' then
    return;
  end if;

  update public.subcontractor_offers o
     set provider_id = coalesce(v_event.provider_id, o.provider_id),
         status = case
           -- A response or closed business outcome is richer than transport.
           when o.status in ('viewed', 'accepted', 'declined', 'expired', 'covered')
             then o.status
           when v_event.status = 'delivered' then 'delivered'
           when v_event.status = 'sent' then 'sent'
           when v_event.status in ('failed', 'opted_out', 'cancelled', 'suppressed')
             then 'failed'
           else o.status
         end,
         sent_at = case
           when v_event.status in ('sent', 'delivered')
             then coalesce(o.sent_at, v_event.provider_accepted_at, v_event.sent_at, v_now)
           else o.sent_at
         end,
         delivered_at = case
           when v_event.status = 'delivered'
             then coalesce(o.delivered_at, v_event.delivered_at, v_now)
           else o.delivered_at
         end,
         error_reason = case
           when v_event.status in ('failed', 'opted_out', 'cancelled', 'suppressed')
             then coalesce(v_event.error_reason, v_event.status)
           when v_event.status in ('sent', 'delivered') then null
           else o.error_reason
         end,
         updated_at = v_now
   where o.sms_event_id = v_event.id
     and o.account_id = v_event.account_id
  returning o.request_id into v_request_id;

  if v_request_id is null then
    return;
  end if;

  -- Only transport-level request states are projected. Viewed, responded,
  -- claimed, expired, cancelled and reopened are domain facts and never move
  -- backwards because a late carrier callback arrived.
  update public.subcontractor_requests r
     set status = case
           when exists (
             select 1
               from public.subcontractor_offers o
              where o.request_id = r.id
                and (
                  o.sent_at is not null
                  or o.status in ('sent', 'delivered', 'viewed', 'accepted', 'declined', 'covered')
                )
           ) then 'sent'
           when exists (
             select 1 from public.subcontractor_offers o where o.request_id = r.id
           ) and not exists (
             select 1
               from public.subcontractor_offers o
              where o.request_id = r.id
                and o.status <> 'failed'
           ) then 'delivery_failed'
           else 'queued'
         end,
         queued_at = coalesce(
           r.queued_at,
           (select min(o.queued_at) from public.subcontractor_offers o where o.request_id = r.id),
           r.created_at
         ),
         sent_at = (
           select min(o.sent_at)
             from public.subcontractor_offers o
            where o.request_id = r.id
         ),
         updated_at = v_now
   where r.id = v_request_id
     and r.status in ('queued', 'sent', 'delivery_failed');

  return;
end;
$$;

create or replace function public.project_subcontractor_sms_event()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  perform public.apply_subcontractor_sms_event_projection(new.id);

  return new;
end;
$$;

drop trigger if exists sms_event_subcontractor_projection on public.sms_events;
create trigger sms_event_subcontractor_projection
after update of status, provider_id, provider_accepted_at, delivered_at, failed_at, error_reason
on public.sms_events
for each row execute function public.project_subcontractor_sms_event();

-- A carrier callback can win the race against the producer attaching its local
-- event id to the offer. Re-project the event when that link appears, so a
-- terminal fact is not stranded merely because it arrived first.
create or replace function public.project_subcontractor_offer_sms_link()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.sms_event_id is not null
     and (tg_op = 'INSERT' or new.sms_event_id is distinct from old.sms_event_id) then
    perform public.apply_subcontractor_sms_event_projection(new.sms_event_id);
  end if;
  return new;
end;
$$;

drop trigger if exists subcontractor_offer_sms_link_insert_projection
  on public.subcontractor_offers;
create trigger subcontractor_offer_sms_link_insert_projection
after insert on public.subcontractor_offers
for each row execute function public.project_subcontractor_offer_sms_link();

drop trigger if exists subcontractor_offer_sms_link_update_projection
  on public.subcontractor_offers;
create trigger subcontractor_offer_sms_link_update_projection
after update of sms_event_id on public.subcontractor_offers
for each row execute function public.project_subcontractor_offer_sms_link();

-- Run every linked historical event through the same projector. Assigning a
-- column to itself deliberately fires the column-specific trigger without
-- inventing a new lifecycle fact.
update public.sms_events e
   set status = e.status
 where exists (
   select 1
     from public.subcontractor_offers o
    where o.sms_event_id = e.id
 );

update public.subcontractor_requests r
   set queued_at = coalesce(
         r.queued_at,
         (select min(o.queued_at) from public.subcontractor_offers o where o.request_id = r.id),
         r.created_at
       )
 where r.status in ('queued', 'delivery_failed')
   and r.queued_at is null;

-- The specialized direct-payment settlement lane predates sms_delivery_tasks,
-- but must obey the same release gates. Return a claimed pre-egress task to
-- retry_wait without consuming another finite delivery attempt. This is not a
-- failure retry: it is an operational canary hold, and it may repeat safely.
create or replace function public.defer_direct_payment_settlement_task(
  p_task_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_delay_seconds integer
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
  v_next_attempt_at timestamptz;
  v_attempt_count integer;
  v_feed_status text;
  v_sms_status text;
  v_updated integer;
begin
  if p_task_id is null
     or p_claim_token is null
     or p_error_code is null
     or p_error_code !~ '^[a-z][a-z0-9_]{2,99}$'
     or p_delay_seconds is null
     or p_delay_seconds < 60
     or p_delay_seconds > 86400 then
    raise exception 'direct settlement defer contract is invalid'
      using errcode = '22023';
  end if;

  select t.attempt_count, t.feed_status, t.sms_status
    into v_attempt_count, v_feed_status, v_sms_status
    from public.billing_direct_payment_settlement_tasks t
   where t.id = p_task_id
     and t.task_state = 'leased'
     and t.claim_token = p_claim_token
     and t.lease_expires_at > v_now
   for update;
  if not found or v_sms_status <> 'pending' then
    raise exception 'direct settlement defer claim is not owned, expired, or pre-egress'
      using errcode = '55000';
  end if;

  v_next_attempt_at := v_now + pg_catalog.make_interval(secs => p_delay_seconds);
  update public.billing_direct_payment_settlement_tasks t
     set task_state = 'retry_wait',
         claim_token = null,
         lease_expires_at = null,
         -- The claim RPC increments before the runtime can inspect account id.
         -- Retain one legal retry_wait attempt but do not exhaust the eight-send
         -- budget merely because this account is outside the current canary.
         attempt_count = greatest(1, v_attempt_count - 1),
         next_attempt_at = v_next_attempt_at,
         last_error_code = p_error_code,
         updated_at = v_now
   where t.id = p_task_id
     and t.claim_token = p_claim_token;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'direct settlement defer lost its claim'
      using errcode = '55000';
  end if;

  update public.billing_direct_payment_settlement_attempts a
     set outcome_status = 'failed_retryable',
         error_code = p_error_code,
         feed_status = v_feed_status,
         sms_status = v_sms_status,
         finished_at = v_now
   where a.claim_token = p_claim_token
     and a.outcome_status is null;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'direct settlement defer has no open attempt'
      using errcode = '55000';
  end if;

  return query select 'failed_retryable'::text, 'retry_wait'::text, v_next_attempt_at;
end;
$$;

comment on column public.subcontractor_offers.sms_event_id is
  'Durable local queue identity. provider_id is reserved for carrier evidence.';
comment on column public.subcontractor_requests.queued_at is
  'First durable offer-queue acceptance; sent_at requires provider acceptance.';

revoke all on function public.validate_subcontractor_offer_sms_identity()
  from public, anon, authenticated, service_role;
revoke all on function public.apply_subcontractor_sms_event_projection(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.project_subcontractor_sms_event()
  from public, anon, authenticated, service_role;
revoke all on function public.project_subcontractor_offer_sms_link()
  from public, anon, authenticated, service_role;
revoke all on function public.defer_direct_payment_settlement_task(uuid, uuid, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.defer_direct_payment_settlement_task(uuid, uuid, text, integer)
  to service_role;

commit;
