-- Purpose-aware tenant routing for ordinary replies to platform SMS numbers.
--
-- The webhook foundation deliberately quarantined every ordinary reply to an
-- LGQ-owned shared number because outbound history is not tenant authority.
-- Consent scopes, introduced by 20260821210000, are the first durable evidence
-- that can safely distinguish an owner/account-holder handset from crew. Keep
-- the old migration fail-closed for partial rollouts and replace the ingest RPC
-- only after that scope table and the inbound-action outbox both exist.

begin;

create or replace function public.ingest_sms_inbound_webhook(
  p_provider text,
  p_provider_event_id text,
  p_receipt_key text,
  p_body_sha256 text,
  p_content_type text,
  p_request_url text,
  p_from_number text,
  p_to_number text,
  p_message_body text,
  p_media_urls text[],
  p_keyword text
)
returns table (
  ingress_disposition text,
  webhook_receipt_id uuid,
  routed_account_id uuid,
  routed_sender_number_id uuid,
  routed_sender_purpose text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_receipt public.sms_webhook_receipts%rowtype;
  v_existing public.sms_webhook_receipts%rowtype;
  v_sender public.sms_sender_numbers%rowtype;
  v_message_id uuid;
  v_reason text;
  v_existing_consent boolean;
  v_routed_account_id uuid;
  v_routed_account_count bigint := 0;
begin
  if p_provider not in ('twilio', 'signalwire')
     or p_provider_event_id is null
     or pg_catalog.length(p_provider_event_id) not between 1 and 255
     or p_receipt_key is null
     or pg_catalog.length(p_receipt_key) not between 1 and 700
     or p_body_sha256 is null
     or p_body_sha256 !~ '^[0-9a-f]{64}$'
     or p_from_number is null
     or p_from_number !~ '^\+[1-9][0-9]{7,14}$'
     or p_to_number is null
     or p_to_number !~ '^\+[1-9][0-9]{7,14}$'
     or p_keyword not in ('stop', 'start', 'help', 'other')
     or pg_catalog.length(coalesce(p_message_body, '')) > 5000
     or coalesce(pg_catalog.array_length(p_media_urls, 1), 0) > 10 then
    raise exception 'SMS inbound webhook arguments are invalid'
      using errcode = '22023';
  end if;

  insert into public.sms_webhook_receipts (
    provider, webhook_kind, receipt_key, provider_event_id, body_sha256,
    content_type, request_url, from_number, to_number
  ) values (
    p_provider, 'inbound', p_receipt_key, p_provider_event_id,
    p_body_sha256, pg_catalog.left(p_content_type, 255),
    pg_catalog.left(p_request_url, 2000), p_from_number, p_to_number
  )
  on conflict (provider, webhook_kind, receipt_key) do nothing
  returning * into v_receipt;

  if v_receipt.id is null then
    select r.* into v_existing
      from public.sms_webhook_receipts r
     where r.provider = p_provider
       and r.webhook_kind = 'inbound'
       and r.receipt_key = p_receipt_key
     for update;
    if v_existing.provider_event_id is distinct from p_provider_event_id
       or v_existing.body_sha256 is distinct from p_body_sha256
       or v_existing.from_number is distinct from p_from_number
       or v_existing.to_number is distinct from p_to_number
       or v_existing.content_type is distinct from pg_catalog.left(p_content_type, 255)
       or v_existing.request_url is distinct from pg_catalog.left(p_request_url, 2000) then
      raise exception 'SMS inbound receipt key was replayed with different immutable evidence'
        using errcode = 'P5120';
    end if;
    -- Dedupe precedes every preference, transcript, review, and outbox write.
    return query
    select 'duplicate'::text, v_existing.id, v_existing.account_id,
           v_existing.sender_number_id, s.purpose
      from public.sms_webhook_receipts r
      left join public.sms_sender_numbers s on s.id = r.sender_number_id
     where r.id = v_existing.id;
    return;
  end if;

  select s.* into v_sender
    from public.sms_sender_numbers s
   where s.provider = p_provider
     and s.e164_number = p_to_number
     and s.provisioning_status = 'active'
     and s.assignment_state = 'assigned'
     and s.inbound_ready
     and s.suspended_at is null
   for share;

  if v_sender.id is null then
    insert into public.sms_operator_review_items (
      webhook_receipt_id, reason, severity, provider, provider_event_id,
      from_number, to_number, message_body, media_urls
    ) values (
      v_receipt.id, 'unknown_destination', 'critical', p_provider,
      p_provider_event_id, p_from_number, p_to_number,
      pg_catalog.left(p_message_body, 5000), p_media_urls
    );
    update public.sms_webhook_receipts
       set processing_state = 'review', disposition = 'unknown_destination',
           processed_at = v_now
     where id = v_receipt.id;
    return query select 'review'::text, v_receipt.id, null::uuid,
                        null::uuid, null::text;
    return;
  end if;

  -- Ordinary replies and STOP/START for the same provider sender/contact must
  -- observe one another in commit order. This is the same lock used by final
  -- delivery staging; a sender-scoped STOP can never race a routing decision.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'sms-sender-consent:' || v_sender.id::text || ':' || p_from_number,
      20260821
    )
  );

  v_routed_account_id := v_sender.account_id;

  -- Preserve the established keyword behavior. A shared-number STOP/START/HELP
  -- may touch an account ledger only when complete accepted outbound history for
  -- this exact sender/contact identifies one account. Ordinary traffic never
  -- uses this history; it is authorized solely by the audience scope below.
  if p_keyword in ('stop', 'start', 'help')
     and v_sender.purpose = 'lgq_shared'
     and v_routed_account_id is null then
    select pg_catalog.count(*),
           case when pg_catalog.count(*) = 1
             then (pg_catalog.array_agg(candidate.account_id))[1]
             else null::uuid
           end
      into v_routed_account_count, v_routed_account_id
      from (
        select distinct e.account_id
          from public.sms_events e
         where e.sender_number_id = v_sender.id
           and e.phone_number = p_from_number
           and e.account_id is not null
           and e.status in ('sent', 'delivered')
           and e.provider_id is not null
      ) candidate;
  end if;

  -- Dispatch STOP/START must identify a current crew account without requiring
  -- the base consent row to be opted in: START has to remain usable after STOP.
  -- The append-only crew scope establishes the audience, while the live roster
  -- and current phone establish present authority. More than one account fails
  -- closed; duplicate crew rows inside one account do not create ambiguity.
  if p_keyword in ('stop', 'start')
     and v_sender.purpose = 'lgq_dispatch'
     and v_routed_account_id is null then
    select pg_catalog.count(*),
           case when pg_catalog.count(*) = 1
             then (pg_catalog.array_agg(candidate.account_id))[1]
             else null::uuid
           end
      into v_routed_account_count, v_routed_account_id
      from (
        select distinct c.account_id
          from public.sms_consent c
          join public.sms_consent_scopes scope
            on scope.account_id = c.account_id
           and scope.phone_number = c.phone_number
           and scope.consent_scope = 'crew'
         where c.phone_number = p_from_number
           and c.consented_at is not null
           and exists (
             select 1
               from public.crew member
              where member.account_id = c.account_id
                and member.active
                and member.deleted_at is null
                and public.sms_normalize_recipient_phone(member.phone)
                      = p_from_number
           )
      ) candidate;
  end if;

  -- Platform lanes have no account on the number row. Route an ordinary reply
  -- only from current affirmative audience evidence. The aggregate intentionally
  -- has no recency ordering or LIMIT: zero and multiple accounts both fail closed.
  if p_keyword = 'other'
     and v_sender.purpose in ('lgq_shared', 'lgq_dispatch') then
    select pg_catalog.count(*),
           case when pg_catalog.count(*) = 1
             then (pg_catalog.array_agg(candidate.account_id))[1]
             else null::uuid
           end
      into v_routed_account_count, v_routed_account_id
      from (
        select c.account_id
          from public.sms_consent c
          join public.sms_consent_scopes scope
            on scope.account_id = c.account_id
           and scope.phone_number = c.phone_number
            and scope.consent_scope = case v_sender.purpose
              when 'lgq_shared' then 'owner'
              when 'lgq_dispatch' then 'crew'
              else null
            end
         where c.phone_number = p_from_number
           and c.status = 'opted_in'
           and c.consented_at is not null
           and c.opted_out_at is null
           and (
             (
               v_sender.purpose = 'lgq_shared'
               and exists (
                 select 1
                   from public.accounts account
                  where account.id = c.account_id
                    and account.high_value_sms_enabled is true
                    and public.sms_normalize_recipient_phone(account.alert_phone)
                          = p_from_number
               )
             )
             or
             (
               v_sender.purpose = 'lgq_dispatch'
               and exists (
                 select 1
                   from public.crew member
                  where member.account_id = c.account_id
                    and member.active
                    and member.deleted_at is null
                    and public.sms_normalize_recipient_phone(member.phone)
                          = p_from_number
               )
             )
           )
           and not exists (
             select 1
               from public.sms_sender_keyword_preferences preference
              where preference.sender_number_id = v_sender.id
                and preference.phone_number = p_from_number
                and preference.status = 'opted_out'
                and preference.opted_out_at is not null
           )
      ) candidate;
  end if;

  update public.sms_webhook_receipts
     set sender_number_id = v_sender.id,
         account_id = v_routed_account_id
   where id = v_receipt.id;

  -- An unresolved dispatch START must never clear the exact-sender block or
  -- claim re-subscription while no unique account ledger can be restored.
  if p_keyword = 'start'
     and v_sender.purpose = 'lgq_dispatch'
     and v_routed_account_id is null then
    insert into public.sms_sender_keyword_preferences (
      sender_number_id, phone_number, status, source, opted_out_at, updated_at
    ) values (
      v_sender.id, p_from_number, 'opted_out', 'inbound_start', v_now, v_now
    )
    on conflict (sender_number_id, phone_number) do update
      set status = 'opted_out',
          source = 'inbound_start',
          opted_out_at = coalesce(
            public.sms_sender_keyword_preferences.opted_out_at,
            excluded.opted_out_at
          ),
          updated_at = excluded.updated_at;

    v_reason := case
      when v_routed_account_count > 1 then 'ambiguous_destination'
      else 'shared_destination_unroutable'
    end;
    insert into public.sms_operator_review_items (
      webhook_receipt_id, reason, severity, provider, sender_number_id,
      provider_event_id, from_number, to_number, message_body, media_urls
    ) values (
      v_receipt.id, v_reason,
      case when v_reason = 'ambiguous_destination' then 'critical' else 'warning' end,
      p_provider, v_sender.id, p_provider_event_id, p_from_number, p_to_number,
      pg_catalog.left(p_message_body, 5000), p_media_urls
    );
    update public.sms_webhook_receipts
       set account_id = null, processing_state = 'review',
           disposition = v_reason, processed_at = v_now
     where id = v_receipt.id;
    return query select 'review'::text, v_receipt.id, null::uuid,
                        v_sender.id, v_sender.purpose;
    return;
  end if;

  if p_keyword in ('stop', 'start') then
    insert into public.sms_sender_keyword_preferences (
      sender_number_id, phone_number, status, source, opted_out_at, updated_at
    ) values (
      v_sender.id, p_from_number,
      case when p_keyword = 'stop' then 'opted_out' else 'opted_in' end,
      case when p_keyword = 'stop' then 'inbound_stop' else 'inbound_start' end,
      case when p_keyword = 'stop' then v_now else null end,
      v_now
    )
    on conflict (sender_number_id, phone_number) do update
      set status = excluded.status,
          source = excluded.source,
          opted_out_at = excluded.opted_out_at,
          updated_at = excluded.updated_at;

    if v_routed_account_id is not null then
      select pg_catalog.count(*) > 0 into v_existing_consent
        from public.sms_consent c
       where c.account_id = v_routed_account_id
         and c.phone_number = p_from_number;

      insert into public.sms_consent (
        account_id, phone_number, status, source, consented_at,
        opted_out_at, disclosure_version, updated_at
      ) values (
        v_routed_account_id, p_from_number,
        case when p_keyword = 'stop' then 'opted_out' else 'opted_in' end,
        case when p_keyword = 'stop' then 'inbound_stop' else 'inbound_start' end,
        case when p_keyword = 'start' then v_now else null end,
        case when p_keyword = 'stop' then v_now else null end,
        null, v_now
      )
      on conflict (account_id, phone_number) do update
        set status = excluded.status,
            source = excluded.source,
            consented_at = case
              when excluded.status = 'opted_in' then excluded.consented_at
              else public.sms_consent.consented_at
            end,
            opted_out_at = excluded.opted_out_at,
            updated_at = excluded.updated_at;

      if p_keyword = 'start' and not v_existing_consent then
        insert into public.sms_operator_review_items (
          webhook_receipt_id, reason, severity, provider, account_id,
          sender_number_id, provider_event_id, from_number, to_number,
          message_body
        ) values (
          v_receipt.id, 'restart_without_consent', 'info', p_provider,
          v_routed_account_id, v_sender.id, p_provider_event_id,
          p_from_number, p_to_number, pg_catalog.left(p_message_body, 5000)
        );
      end if;
    elsif v_sender.purpose = 'lgq_dispatch' then
      -- STOP remains safe without guessing an account: the exact sender is
      -- blocked above, the account ledger is untouched, and review work records
      -- whether current roster authority was absent or cross-account ambiguous.
      v_reason := case
        when v_routed_account_count > 1 then 'ambiguous_destination'
        else 'shared_destination_unroutable'
      end;
      insert into public.sms_operator_review_items (
        webhook_receipt_id, reason, severity, provider, sender_number_id,
        provider_event_id, from_number, to_number, message_body, media_urls
      ) values (
        v_receipt.id, v_reason,
        case when v_reason = 'ambiguous_destination' then 'critical' else 'warning' end,
        p_provider, v_sender.id, p_provider_event_id, p_from_number, p_to_number,
        pg_catalog.left(p_message_body, 5000), p_media_urls
      );
    end if;

    update public.sms_webhook_receipts
       set processing_state = 'processed',
           disposition = 'keyword_' || p_keyword,
           processed_at = v_now
     where id = v_receipt.id;
    return query select ('keyword_' || p_keyword)::text, v_receipt.id,
                        v_routed_account_id, v_sender.id, v_sender.purpose;
    return;
  end if;

  if p_keyword = 'help' then
    update public.sms_webhook_receipts
       set processing_state = 'processed', disposition = 'keyword_help',
           processed_at = v_now
     where id = v_receipt.id;
    return query select 'keyword_help'::text, v_receipt.id,
                        v_routed_account_id, v_sender.id, v_sender.purpose;
    return;
  end if;

  if v_routed_account_id is null then
    v_reason := case
      when v_routed_account_count > 1 then 'ambiguous_destination'
      when v_sender.purpose in ('lgq_shared', 'lgq_dispatch')
        then 'shared_destination_unroutable'
      else 'unknown_destination'
    end;
    insert into public.sms_operator_review_items (
      webhook_receipt_id, reason, severity, provider, sender_number_id,
      provider_event_id, from_number, to_number, message_body, media_urls
    ) values (
      v_receipt.id, v_reason,
      case when v_reason = 'ambiguous_destination' then 'critical' else 'warning' end,
      p_provider, v_sender.id, p_provider_event_id, p_from_number, p_to_number,
      pg_catalog.left(p_message_body, 5000), p_media_urls
    );
    update public.sms_webhook_receipts
       set account_id = null, processing_state = 'review',
           disposition = v_reason, processed_at = v_now
     where id = v_receipt.id;
    return query select 'review'::text, v_receipt.id, null::uuid,
                        v_sender.id, v_sender.purpose;
    return;
  end if;

  -- The downstream exact-one action classifier and all of its candidate writers
  -- share this account/recipient lock. Bind the transcript and its receipt to
  -- that same authority before the existing receipt trigger creates the outbox.
  perform pg_catalog.pg_advisory_xact_lock(
    public.sms_inbound_recipient_lock_key(v_routed_account_id, p_from_number)
  );

  insert into public.sms_messages (
    account_id, phone_number, direction, body, provider_id, media_urls,
    provider, sender_number_id, read_at, created_at
  ) values (
    v_routed_account_id, p_from_number, 'inbound',
    coalesce(p_message_body, ''), p_provider_event_id,
    p_media_urls, p_provider, v_sender.id, null, v_now
  ) returning id into v_message_id;

  update public.sms_webhook_receipts
     set processing_state = 'processed', disposition = 'routed',
         account_id = v_routed_account_id,
         sms_message_id = v_message_id, processed_at = v_now
   where id = v_receipt.id;
  return query select 'routed'::text, v_receipt.id, v_routed_account_id,
                      v_sender.id, v_sender.purpose;
end;
$$;

-- The receipt's sender purpose is also the authority for which domain intents
-- an ordinary reply may mutate. A handset can legitimately hold more than one
-- audience scope in the same account; matching its phone against every open
-- request would otherwise let a crew YES accept a homeowner estimate, or a
-- customer YES claim a subcontractor offer.
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
  v_sender_purpose text;
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
     or v_receipt.sender_number_id is distinct from v_task.sender_number_id
     or v_message.sender_number_id is distinct from v_task.sender_number_id
     or v_receipt.disposition <> 'routed' then
    raise exception 'Inbound action task binding is invalid' using errcode = '23514';
  end if;

  select s.purpose into strict v_sender_purpose
    from public.sms_sender_numbers s
   where s.id = v_task.sender_number_id;
  if v_sender_purpose not in (
    'contractor_dedicated', 'lgq_dispatch', 'lgq_shared'
  ) then
    raise exception 'Inbound action sender purpose is invalid' using errcode = '23514';
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

  -- Domain state may change only in response to the exact outbound question
  -- linked by that domain record. Provider acceptance, sender, audience, tenant,
  -- recipient, and chronology are all part of the binding; queued, failed, and
  -- post-reply events are deliberately invisible to the candidate classifier.
  with accepted_question_events as materialized (
    select e.*
      from public.sms_events e
     where e.account_id = v_task.account_id
       and e.phone_number = v_receipt.from_number
       and e.sender_number_id = v_task.sender_number_id
       and e.sender_purpose = v_sender_purpose
       and e.provider = v_receipt.provider
       and nullif(pg_catalog.btrim(e.provider_id), '') is not null
       and e.provider_id <> 'simulated'
       and e.status in ('sent', 'delivered')
       and e.queued_at is not null
       and e.send_started_at is not null
       and e.provider_accepted_at is not null
       and e.sent_at is not null
       and e.created_at <= e.queued_at
       and e.queued_at <= e.send_started_at
       and e.send_started_at <= e.provider_accepted_at
       and e.provider_accepted_at <= e.sent_at
       and e.created_at <= v_receipt.received_at
       and e.queued_at <= v_receipt.received_at
       and e.send_started_at <= v_receipt.received_at
       and e.provider_accepted_at <= v_receipt.received_at
       and e.sent_at <= v_receipt.received_at
       and (e.status <> 'delivered' or e.delivered_at is not null)
       and e.failed_at is null
       and e.indeterminate_at is null
       and e.cancelled_at is null
  ), candidates as (
    select 'estimate'::text as kind, e.id as target_id
      from public.estimate_offers e
     where v_sender_purpose = 'contractor_dedicated'
       and not v_confirmation_only
          and e.account_id = v_task.account_id
          and e.phone = v_receipt.from_number
          and e.status = 'held'
          and exists (
            select 1
              from public.account_events account_event
              join accepted_question_events question
                on question.id::text = account_event.meta->>'sms_event_id'
             where account_event.account_id = e.account_id
               and account_event.kind = 'automation_toggled'
               and account_event.meta->>'source' = 'estimate_offer'
               and account_event.meta->>'offer_id' = e.id::text
               and account_event.meta->>'lead_id' = e.lead_id::text
               and account_event.created_at <= v_receipt.received_at
               and question.context = 'customer'
               and question.event_type = 'estimate_offer'
               and question.message_kind = 'estimate-offer'
               and question.billing_category = 'customer_message'
               and question.idempotency_key = 'estimate-offer:' || e.id::text
          )
      union all
      select 'reschedule'::text, o.id
        from public.reschedule_offers o
       where v_sender_purpose = 'contractor_dedicated'
         and not v_confirmation_only
          and o.account_id = v_task.account_id
          and o.phone = v_receipt.from_number
          and o.status = 'sent'
          and exists (
            select 1
              from public.account_events account_event
              join accepted_question_events question
                on question.id::text = account_event.meta->>'sms_event_id'
             where account_event.account_id = o.account_id
               and account_event.kind = 'automation_toggled'
               and account_event.meta->>'source' = 'reschedule_offer'
               and account_event.meta->>'offer_id' = o.id::text
               and account_event.meta->>'job_id' = o.job_id::text
               and account_event.created_at <= v_receipt.received_at
               and question.context = 'customer'
               and question.event_type = 'estimate_offer'
               and question.message_kind = 'estimate-offer'
               and question.billing_category = 'customer_message'
               and question.idempotency_key = 'reschedule-offer:' || o.id::text
          )
      union all
      select 'appointment'::text, j.id
        from public.jobs j
       where v_sender_purpose = 'contractor_dedicated'
         and v_decision = 'accept'
         and j.account_id = v_task.account_id
         and public.sms_normalize_recipient_phone(j.client_phone) = v_receipt.from_number
         and j.scheduled_for >= (v_now at time zone 'UTC')::date
         and j.status in ('new_lead', 'in_progress')
         and j.appointment_confirmed_at is null
          and exists (
            select 1
              from public.job_feed f
              join accepted_question_events question
                on question.id::text = f.meta->>'sms_event_id'
             where f.account_id = j.account_id
               and f.job_id = j.id
               and f.kind = 'appointment_reminder'
               and f.meta->>'channel' = 'sms'
               and f.meta->>'scheduled_for' = j.scheduled_for::text
               and (f.meta->>'scheduled_time')
                     is not distinct from j.scheduled_time::text
               and f.created_at <= v_receipt.received_at
               and question.context = 'automation'
               and question.event_type = 'appointment_reminder'
               and question.message_kind = 'appointment-reminder'
               and question.billing_category = 'customer_message'
               and question.idempotency_key =
                     'appointment-reminder:' || j.id::text || ':' ||
                     j.scheduled_for::text || ':' ||
                     coalesce(j.scheduled_time::text, 'none')
          )
      union all
      select 'subcontractor'::text, o.id
        from public.subcontractor_offers o
        join public.subcontractor_requests r on r.id = o.request_id
        join accepted_question_events question on question.id = o.sms_event_id
       where v_sender_purpose = 'lgq_dispatch'
         and not v_confirmation_only
          and v_decision in ('accept', 'decline')
          and o.account_id = v_task.account_id
          and o.phone = v_receipt.from_number
          and o.status in ('sent','delivered','viewed')
          and r.status in ('sent','viewed','partially_responded','reopened')
          and r.expires_at > v_now
          and question.crew_id = o.crew_id
          and question.context = 'subcontractor'
          and question.event_type = 'sub_offer'
          and question.message_kind = 'sub-offer'
          and question.billing_category = 'crew_message'
          and question.idempotency_key =
                'subcontractor:' || o.id::text || ':offer'
  )
  select pg_catalog.count(*)::integer,
         (pg_catalog.array_agg(c.kind))[1],
         (pg_catalog.array_agg(c.target_id))[1]
    into v_candidate_count, v_kind, v_target_id
    from candidates c;

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
         and status in ('sent','delivered','viewed');
      v_reply_body := 'Thanks — we recorded that you are not available for this job.';
      v_alert_body := 'A subcontractor declined ' || v_sub_request.work_description || ' by text.';
    elsif v_sub_request.selection_mode = 'collect_interest' then
      update public.subcontractor_offers
         set status = 'accepted', won = false, responded_at = v_now, updated_at = v_now
       where id = v_sub_offer.id
         and status in ('sent','delivered','viewed');
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

revoke all on function public.apply_sms_inbound_action(uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_sms_inbound_action(uuid,uuid)
  to service_role;

revoke all on function public.ingest_sms_inbound_webhook(
  text,text,text,text,text,text,text,text,text,text[],text
) from public, anon, authenticated, service_role;
grant execute on function public.ingest_sms_inbound_webhook(
  text,text,text,text,text,text,text,text,text,text[],text
) to service_role;

commit;
