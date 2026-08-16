-- DARK direct-payment settlement SMS inbox mirror.
--
-- This follow-up keeps provider egress outside PostgreSQL, but makes the
-- database outcome after egress indivisible: the payment SMS ledger, the
-- contractor's two-way inbox mirror, and settlement task/attempt completion
-- now commit or roll back together. It adds no route, cron, caller, flag, or
-- provider egress and assumes the 20260816083000 settlement foundation.

begin;

create or replace function public.stage_direct_payment_settlement_sms(
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
  v_sms public.sms_events%rowtype;
  v_message public.sms_messages%rowtype;
  v_digits text;
  v_expected_phone text;
  v_outcome text;
  v_updated integer;
  v_sms_exists boolean := false;
  v_mirror_timestamp timestamptz;
begin
  select t.* into v_task
    from public.billing_direct_payment_settlement_tasks t
   where t.id = p_task_id
   for update;
  if not found
     or v_task.task_state <> 'leased'
     or v_task.claim_token is distinct from p_claim_token
     or v_task.lease_expires_at <= v_now
     or v_task.feed_status <> 'recorded'
     or v_task.sms_status <> 'pending' then
    raise exception 'direct settlement SMS claim is not ready, owned, or current'
      using errcode = '55000';
  end if;

  select p.* into v_payment
    from public.payments p
   where p.id = v_task.payment_id
     and p.account_id = v_task.account_id
   for share;
  if not found
     or v_payment.job_id is distinct from v_task.job_id
     or v_payment.invoice_id is distinct from v_task.invoice_id
     or v_payment.charge_model <> 'direct'
     or v_payment.status::text <> 'paid'
     or v_payment.paid_at is distinct from v_task.settled_at then
    raise exception 'direct settlement SMS payment scope changed'
      using errcode = '55000';
  end if;

  -- Inspect the one-per-payment SMS ledger before any no-consent fast path.
  -- A stale pending/failed row remains ambiguous even if consent has since
  -- changed; quarantine it rather than leaving retry-looking evidence behind.
  select s.* into v_sms
    from public.sms_events s
   where s.payment_id = v_task.payment_id
     and s.event_type = 'payment_paid'
   for update;
  v_sms_exists := found;
  if v_sms_exists then
    if v_sms.account_id is distinct from v_task.account_id then
      raise exception 'existing settlement SMS conflicts with current payment scope'
        using errcode = '22000';
    end if;

    if v_sms.status not in ('sent', 'opted_out') then
      update public.sms_events s
         set status = 'indeterminate',
             error_reason = 'settlement_sms_existing_nonterminal_outcome'
       where s.id = v_sms.id;
      update public.billing_direct_payment_settlement_tasks t
         set task_state = 'dead_letter', claim_token = null,
             lease_expires_at = null, next_attempt_at = null,
             sms_status = 'indeterminate', sms_event_id = v_sms.id,
             last_error_code = 'sms_existing_nonterminal_outcome',
             dead_lettered_at = v_now, updated_at = v_now
       where t.id = v_task.id;
      update public.billing_direct_payment_settlement_attempts a
         set outcome_status = 'sms_indeterminate',
             error_code = 'sms_existing_nonterminal_outcome',
             feed_status = 'recorded', sms_status = 'indeterminate', finished_at = v_now
       where a.claim_token = p_claim_token and a.outcome_status is null;
      get diagnostics v_updated = row_count;
      if v_updated <> 1 then
        raise exception 'indeterminate settlement SMS has no open attempt'
          using errcode = '55000';
      end if;
      return query select 'indeterminate'::text, v_sms.id, null::text;
      return;
    end if;

    if v_sms.status = 'sent' then
      -- A sent ledger row is historical delivery evidence. Current consent,
      -- phone, or regenerated copy may have changed after that delivery, so
      -- never let today's envelope suppress or rewrite its inbox mirror.
      if v_sms.context is distinct from 'payment'
         or v_sms.phone_number !~ '^\+[0-9]{10,15}$'
         or v_sms.body is null
         or pg_catalog.length(v_sms.body) not between 1 and 1600
         or v_sms.body ~ '[[:cntrl:]]'
         or v_sms.provider_id is null
         or pg_catalog.length(pg_catalog.btrim(v_sms.provider_id)) not between 1 and 255
         or v_sms.provider_id ~ '[[:cntrl:]]'
         or v_sms.sent_at is null
         or v_sms.created_at is null
         or v_sms.sent_at < v_sms.created_at then
        raise exception 'existing sent settlement SMS evidence is invalid'
          using errcode = '22000';
      end if;

      -- A sent ledger row is never resent. Before completing the task, create
      -- (or prove) its deterministic inbox mirror in this same transaction.
      -- No FK is added: contractors retain the existing ability to delete an
      -- inbox row without mutating the delivery ledger.
      v_mirror_timestamp := v_sms.sent_at;
      insert into public.sms_messages (
        id, account_id, phone_number, direction, body, provider_id,
        read_at, media_urls, created_at
      ) values (
        v_sms.id, v_task.account_id, v_sms.phone_number, 'outbound',
        v_sms.body, v_sms.provider_id,
        v_mirror_timestamp, null, v_mirror_timestamp
      )
      on conflict (id) do nothing;

      select m.* into v_message
        from public.sms_messages m
       where m.id = v_sms.id
       for update;
      if not found
         or v_message.account_id is distinct from v_task.account_id
         or v_message.phone_number is distinct from v_sms.phone_number
         or v_message.direction is distinct from 'outbound'
         or v_message.body is distinct from v_sms.body
         or v_message.provider_id is distinct from v_sms.provider_id
         or v_message.read_at is distinct from v_mirror_timestamp
         or v_message.media_urls is not null
         or v_message.created_at is distinct from v_mirror_timestamp then
        raise exception 'existing sent settlement SMS has no exact inbox mirror'
          using errcode = '22000';
      end if;

      update public.billing_direct_payment_settlement_tasks t
         set task_state = 'completed', claim_token = null,
             lease_expires_at = null, next_attempt_at = null,
             sms_status = 'sent', sms_event_id = v_sms.id,
             last_error_code = null, completed_at = v_now, updated_at = v_now
       where t.id = v_task.id;
      update public.billing_direct_payment_settlement_attempts a
         set outcome_status = 'completed', feed_status = 'recorded',
             sms_status = 'sent', finished_at = v_now
       where a.claim_token = p_claim_token and a.outcome_status is null;
      get diagnostics v_updated = row_count;
      if v_updated <> 1 then
        raise exception 'already-sent settlement SMS has no open attempt'
          using errcode = '55000';
      end if;
      return query select 'already_sent'::text, v_sms.id, null::text;
      return;
    end if;

    if v_sms.status = 'opted_out' then
      -- Likewise, an existing terminal opt-out wins over any later consent
      -- mutation. Reopening this task as dispatchable could duplicate or send
      -- a message that the historical ledger says was suppressed.
      update public.billing_direct_payment_settlement_tasks t
         set task_state = 'completed', claim_token = null,
             lease_expires_at = null, next_attempt_at = null,
             sms_status = 'skipped_opted_out', sms_event_id = null,
             last_error_code = null, completed_at = v_now, updated_at = v_now
       where t.id = v_task.id;
      update public.billing_direct_payment_settlement_attempts a
         set outcome_status = 'completed', feed_status = 'recorded',
             sms_status = 'skipped_opted_out', finished_at = v_now
       where a.claim_token = p_claim_token and a.outcome_status is null;
      get diagnostics v_updated = row_count;
      if v_updated <> 1 then
        raise exception 'opted-out settlement SMS has no open attempt'
          using errcode = '55000';
      end if;
      return query select 'skipped_opted_out'::text, null::uuid, null::text;
      return;
    end if;

    raise exception 'existing settlement SMS has an unsupported terminal status'
      using errcode = '22000';
  end if;

  if v_payment.sms_consent is distinct from true
     or v_payment.homeowner_phone is null
     or pg_catalog.length(pg_catalog.btrim(v_payment.homeowner_phone)) = 0 then
    v_outcome := 'skipped_no_consent';
  else
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
    if not found
       or v_consent.status <> 'opted_in'
       or v_consent.consented_at is null
       or v_consent.opted_out_at is not null then
      v_outcome := case
        when found and v_consent.status = 'opted_out' then 'skipped_opted_out'
        else 'skipped_no_consent'
      end;
    end if;
  end if;

  if v_outcome is not null then
    update public.billing_direct_payment_settlement_tasks t
       set task_state = 'completed',
           claim_token = null,
           lease_expires_at = null,
           next_attempt_at = null,
           sms_status = v_outcome,
           last_error_code = null,
           completed_at = v_now,
           updated_at = v_now
     where t.id = v_task.id;

    update public.billing_direct_payment_settlement_attempts a
       set outcome_status = 'completed',
           feed_status = 'recorded',
           sms_status = v_outcome,
           finished_at = v_now
     where a.claim_token = p_claim_token
       and a.outcome_status is null;
    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception 'direct settlement SMS skip has no open attempt'
        using errcode = '55000';
    end if;

    return query select v_outcome, null::uuid, null::text;
    return;
  end if;

  insert into public.sms_events (
    account_id, payment_id, event_type, phone_number, status, body, context
  ) values (
    v_task.account_id, v_task.payment_id, 'payment_paid',
    p_normalized_phone, 'pending', p_body, 'payment'
  ) returning * into v_sms;

  update public.billing_direct_payment_settlement_tasks t
     set sms_status = 'dispatching',
         sms_event_id = v_sms.id,
         updated_at = v_now
   where t.id = v_task.id;

  return query select 'dispatch'::text, v_sms.id, p_normalized_phone;
end;
$$;

create or replace function public.complete_direct_payment_settlement_sms(
  p_task_id uuid,
  p_claim_token uuid,
  p_sms_event_id uuid,
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
  v_task public.billing_direct_payment_settlement_tasks%rowtype;
  v_sms public.sms_events%rowtype;
  v_message public.sms_messages%rowtype;
  v_updated integer;
begin
  if p_provider_id is null
     or pg_catalog.length(pg_catalog.btrim(p_provider_id)) not between 1 and 255
     or p_provider_id ~ '[[:cntrl:]]' then
    raise exception 'direct settlement SMS provider ID is invalid'
      using errcode = '22023';
  end if;

  select t.* into v_task
    from public.billing_direct_payment_settlement_tasks t
   where t.id = p_task_id
   for update;
  if not found
     or v_task.task_state <> 'leased'
     or v_task.claim_token is distinct from p_claim_token
     or v_task.lease_expires_at <= v_now
     or v_task.feed_status <> 'recorded'
     or v_task.sms_status <> 'dispatching'
     or v_task.sms_event_id is distinct from p_sms_event_id then
    raise exception 'direct settlement SMS completion claim is not owned or current'
      using errcode = '55000';
  end if;

  update public.sms_events s
     set status = 'sent',
         provider_id = p_provider_id,
         sent_at = v_now,
         error_reason = null
   where s.id = p_sms_event_id
     and s.account_id = v_task.account_id
     and s.payment_id = v_task.payment_id
     and s.context = 'payment'
     and s.event_type = 'payment_paid'
     and s.status = 'pending'
  returning s.* into v_sms;
  if not found then
    raise exception 'direct settlement SMS completion has no exact pending event'
      using errcode = '55000';
  end if;

  -- The event UUID is also the inbox UUID. That deterministic identity makes
  -- this insert idempotent without a new FK or an owner-visible source column.
  -- A conflicting row is never overwritten; exact verification fails closed.
  insert into public.sms_messages (
    id, account_id, phone_number, direction, body, provider_id,
    read_at, media_urls, created_at
  ) values (
    v_sms.id, v_task.account_id, v_sms.phone_number, 'outbound',
    v_sms.body, p_provider_id,
    v_now, null, v_now
  )
  on conflict (id) do nothing;

  select m.* into v_message
    from public.sms_messages m
   where m.id = v_sms.id
   for update;
  if not found
     or v_message.account_id is distinct from v_task.account_id
     or v_message.phone_number is distinct from v_sms.phone_number
     or v_message.direction is distinct from 'outbound'
     or v_message.body is distinct from v_sms.body
     or v_message.provider_id is distinct from p_provider_id
     or v_message.read_at is distinct from v_now
     or v_message.media_urls is not null
     or v_message.created_at is distinct from v_now then
    raise exception 'direct settlement SMS completion has no exact inbox mirror'
      using errcode = '22000';
  end if;

  update public.billing_direct_payment_settlement_tasks t
     set task_state = 'completed',
         claim_token = null,
         lease_expires_at = null,
         next_attempt_at = null,
         sms_status = 'sent',
         last_error_code = null,
         completed_at = v_now,
         updated_at = v_now
   where t.id = v_task.id;

  update public.billing_direct_payment_settlement_attempts a
     set outcome_status = 'completed',
         feed_status = 'recorded',
         sms_status = 'sent',
         finished_at = v_now
   where a.claim_token = p_claim_token
     and a.outcome_status is null;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'direct settlement SMS completion has no open attempt'
      using errcode = '55000';
  end if;
  return true;
end;
$$;

-- sms_events is a delivery ledger, but the base owner FOR ALL policy makes it
-- owner-writable. An authenticated contractor could otherwise edit the staged
-- phone/body/status between the stage and completion RPCs. Besides falsifying
-- the inbox mirror, changing pending to a terminal status would make lease
-- recovery fail on every claim and could pin the shared queue behind that task.
-- All application writers already use the service-role client, while owners
-- only read this ledger, so enforce SELECT-only access in both RLS and grants.
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

-- Do not narrow sms_messages: its existing owner FOR ALL policy and grants are
-- what let contractors manage and delete their own inbox rows. The immutable
-- service delivery ledger is sms_events; the inbox mirror remains owner data.

-- CREATE OR REPLACE preserves existing ACLs, but restate the boundary so the
-- follow-up remains reviewable on its own and never widens Data API access.
revoke all on function public.stage_direct_payment_settlement_sms(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_direct_payment_settlement_sms(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function public.stage_direct_payment_settlement_sms(uuid, uuid, text, text)
  to service_role;
grant execute on function public.complete_direct_payment_settlement_sms(uuid, uuid, uuid, text)
  to service_role;

commit;
