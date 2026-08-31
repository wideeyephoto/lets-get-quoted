-- Migration: 20260830120000_crew_field_intake.sql
-- Enables Crew & Subcontractor SMS & Voice Field Intake on the shared company line.
--
-- Key features:
-- 1. Updates `ingest_sms_inbound_webhook` so `lgq_shared` routes inbound texts
--    from active crew phones with `consent_scope = 'crew'` in addition to the owner.
-- 2. Expands `apply_owner_field_action` into a unified caller-aware field intake RPC:
--    - Authenticates whether caller is Owner or an active Crew Member.
--    - Appropriately attributes job_feed timeline entries, costs, and tasks with
--      crew member's full name (e.g. 'Crew: Mike D. (Field SMS)').
--    - Enforces safety boundaries (crew can log notes, costs, and tasks; administrative
--      actions like lead creation and job rescheduling remain owner-only).
--    - Supports `complete_job_task` for marking checklist items done from the field.
--    - Sends deterministic GSM-7 confirmation SMS back to the sender.

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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'sms-sender-consent:' || v_sender.id::text || ':' || p_from_number,
      20260821
    )
  );

  v_routed_account_id := v_sender.account_id;

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

  -- Platform lanes: route ordinary inbound texts and voice memos.
  -- lgq_shared routes from BOTH owner (account.alert_phone) AND active crew members on public.crew.
  -- lgq_dispatch routes from active crew members.
  if p_keyword = 'other'
     and v_sender.purpose in ('lgq_shared', 'lgq_dispatch') then
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
         where c.phone_number = p_from_number
           and c.status = 'opted_in'
           and c.consented_at is not null
           and c.opted_out_at is null
           and (
             (
               v_sender.purpose = 'lgq_shared'
               and (
                 (
                   scope.consent_scope = 'owner'
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
                   scope.consent_scope = 'crew'
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
             )
             or
             (
               v_sender.purpose = 'lgq_dispatch'
               and scope.consent_scope = 'crew'
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
            opted_out_at = case
              when excluded.status = 'opted_out' then coalesce(public.sms_consent.opted_out_at, excluded.opted_out_at)
              else null
            end,
            updated_at = excluded.updated_at;

      -- Restored from the live body: a START from a number with no prior
      -- consent row is an opt-in with no recorded prior consent, and an
      -- operator should see it. The account_events row below is an addition,
      -- not a replacement -- an earlier draft swapped one evidence surface for
      -- the other and lost this review item.
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

      insert into public.account_events (
        account_id, kind, summary, meta
      ) values (
        v_routed_account_id, 'compliance_toggled',
        'SMS compliance preference updated via inbound ' || p_keyword,
        jsonb_build_object(
          'source', 'inbound_sms',
          'provider', p_provider,
          'keyword', p_keyword,
          'phone_number', p_from_number,
          'sender_number_id', v_sender.id,
          'webhook_receipt_id', v_receipt.id
        )
      );
    elsif v_sender.purpose = 'lgq_dispatch' then
      -- Restored from the live body. STOP remains safe without guessing an
      -- account: the exact sender is blocked above, the account ledger is
      -- untouched, and review work records whether current roster authority
      -- was absent or cross-account ambiguous.
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
       set processing_state = 'processed', disposition = 'keyword_' || p_keyword,
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
       set processing_state = 'review', disposition = v_reason,
           processed_at = v_now
     where id = v_receipt.id;
    return query select 'review'::text, v_receipt.id, null::uuid,
                        v_sender.id, v_sender.purpose;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    public.sms_inbound_recipient_lock_key(v_routed_account_id, p_from_number)
  );

  -- Column list matches the LIVE table exactly. An earlier draft wrote
  -- sender_purpose and raw_payload here; neither column exists on
  -- public.sms_messages, and plpgsql only syntax-parses bodies at CREATE, so it
  -- applied cleanly and would have thrown 42703 on the first routed inbound
  -- text -- aborting the whole webhook transaction, rolling back the
  -- sms_webhook_receipts dedupe row with it, and putting the provider into an
  -- infinite redelivery loop on the one lane that works today. The payload
  -- provenance those columns wanted already lives on the receipt row.
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
         account_id = v_routed_account_id, sms_message_id = v_message_id,
         processed_at = v_now
   where id = v_receipt.id;

  return query select 'routed'::text, v_receipt.id, v_routed_account_id,
                      v_sender.id, v_sender.purpose;
end;
$$;

revoke all on function public.ingest_sms_inbound_webhook(text,text,text,text,text,text,text,text,text,text[],text) from public, anon, authenticated;
grant execute on function public.ingest_sms_inbound_webhook(text,text,text,text,text,text,text,text,text,text[],text) to service_role;


-- Unified Caller-Aware Field Intake RPC (Supports Owner and Crew Callers)
create or replace function public.apply_owner_field_action(
  p_task_id uuid,
  p_claim_token uuid,
  p_intent text,
  p_params jsonb,
  p_transcript text,
  p_confirmation_text text
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
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_job public.jobs%rowtype;
  v_job_id uuid;
  v_target_id uuid;
  v_lead_id uuid;
  v_cost_id uuid;
  v_task_id_out uuid;
  v_amount numeric(12,2);
  v_cost_type text;
  v_label text;
  v_note text;
  v_task_title text;
  v_client_name text;
  v_client_phone text;
  v_address text;
  v_feed_kind text;
  v_sms_event_id uuid;
  v_outcome jsonb;
  v_is_owner boolean := false;
  v_crew public.crew%rowtype;
  v_author text;
  v_unsupported boolean := false;
begin
  -- 1. Claim verification and locking
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

  -- 2. Receipt and sender validation
  select r.* into strict v_receipt
    from public.sms_webhook_receipts r
   where r.id = v_task.webhook_receipt_id;

  if v_receipt.account_id is distinct from v_task.account_id
     or v_receipt.disposition <> 'routed' then
    raise exception 'Inbound action task binding is invalid' using errcode = '23514';
  end if;

  -- 3. Caller identity & affirmative consent re-validation
  -- Check if caller is Owner
  select true into v_is_owner
    from public.sms_consent c
    join public.sms_consent_scopes scope
      on scope.account_id = c.account_id
     and scope.phone_number = c.phone_number
     and scope.consent_scope = 'owner'
   where c.account_id = v_task.account_id
     and c.phone_number = v_receipt.from_number
     and c.status = 'opted_in'
     and c.opted_out_at is null;

  -- If not owner, check if caller is an active Crew Member
  if not coalesce(v_is_owner, false) then
    select cr.* into v_crew
      from public.crew cr
      join public.sms_consent c
        on c.account_id = cr.account_id
       and c.phone_number = v_receipt.from_number
      join public.sms_consent_scopes scope
        on scope.account_id = c.account_id
       and scope.phone_number = c.phone_number
       and scope.consent_scope = 'crew'
     where cr.account_id = v_task.account_id
       and cr.active
       and cr.deleted_at is null
       and public.sms_normalize_recipient_phone(cr.phone) = v_receipt.from_number
       and c.status = 'opted_in'
       and c.opted_out_at is null
     limit 1;
  end if;

  if not coalesce(v_is_owner, false) and v_crew.id is null then
    raise exception 'Sender consent is missing or revoked' using errcode = '28000';
  end if;

  -- Enforce intent authorization: administrative intents are strictly owner-only.
  -- Only create_lead is listed: it is the sole owner-only intent this rail
  -- actually implements. reschedule_job/assign_crew/update_client fall through
  -- to the graceful unsupported branch below, which answers BOTH roles with an
  -- honest "can't do that by text yet" -- raising 42501 for crew here would
  -- retry the task into the dead-letter queue while the sender hears nothing,
  -- the exact failure mode that branch exists to prevent. Reinstate them in
  -- this guard the day they are implemented.
  if not coalesce(v_is_owner, false) and p_intent = 'create_lead' then
    raise exception 'Intent % is restricted to account owner', p_intent using errcode = '42501';
  end if;

  -- 4. Advisory lock on contractor account
  perform pg_catalog.pg_advisory_xact_lock(
    public.sms_inbound_recipient_lock_key(v_task.account_id, v_receipt.from_number)
  );

  -- Media provenance lives on sms_messages, NOT on the receipt --
  -- sms_webhook_receipts has no media_urls column, and because this runs
  -- unconditionally before intent dispatch, reading v_receipt.media_urls made
  -- EVERY field action throw 42703 at first call.
  select case
    when coalesce(pg_catalog.array_length(m.media_urls, 1), 0) > 0
      then 'field_voice_note'
    else 'field_sms_update'
  end into v_feed_kind
    from public.sms_messages m
   where m.id = v_task.sms_message_id;
  v_feed_kind := coalesce(v_feed_kind, 'field_sms_update');

  v_author := case
    when coalesce(v_is_owner, false)
      then 'Owner (Field ' || case when v_feed_kind = 'field_voice_note' then 'Voice' else 'SMS' end || ')'
    else 'Crew: ' || coalesce(v_crew.name, 'Field Worker') || ' (Field ' || case when v_feed_kind = 'field_voice_note' then 'Voice' else 'SMS' end || ')'
  end;

  -- 5. Intent Execution
  if p_intent = 'append_internal_note' then
    v_job_id := (p_params->>'job_id')::uuid;
    v_note := pg_catalog.btrim(coalesce(p_params->>'note', ''));

    select j.* into strict v_job
      from public.jobs j
     where j.id = v_job_id
       and j.account_id = v_task.account_id
     for update;

    v_target_id := v_job.id;

    -- Insert internal note into job_feed (strictly keeping jobs.scope clean)
    insert into public.job_feed (
      account_id, job_id, kind, title, body, visibility, author, meta
    ) values (
      v_task.account_id, v_job.id, v_feed_kind, 'Field Note',
      v_note, 'internal', v_author,
      jsonb_build_object(
        'transcript', p_transcript,
        'receipt_id', v_receipt.id,
        'from_number', v_receipt.from_number,
        'crew_id', v_crew.id
      )
    );

  elsif p_intent = 'log_cost' then
    v_job_id := (p_params->>'job_id')::uuid;
    v_amount := (p_params->>'amount')::numeric;
    v_label := coalesce(nullif(pg_catalog.btrim(p_params->>'label'), ''), 'Material cost');
    v_cost_type := coalesce(nullif(pg_catalog.btrim(p_params->>'cost_type'), ''), 'material');

    select j.* into strict v_job
      from public.jobs j
     where j.id = v_job_id
       and j.account_id = v_task.account_id
     for update;

    v_target_id := v_job.id;

    insert into public.costs (
      account_id, job_id, type, category, description, amount
    ) values (
      -- schema-qualified: search_path is pinned to pg_catalog, so an
      -- unqualified ::cost_type resolves to nothing and throws 42704 at the
      -- first log_cost action (runtime, not CREATE time)
      v_task.account_id, v_job.id, v_cost_type::public.cost_type,
      v_cost_type, v_label, v_amount
    ) returning id into v_cost_id;

    insert into public.job_feed (
      account_id, job_id, kind, title, body, amount, visibility, author, meta
    ) values (
      v_task.account_id, v_job.id, 'cost_added',
      'Cost logged: ' || v_label,
      v_label || ' ($' || v_amount::text || ')',
      v_amount, 'internal', v_author,
      jsonb_build_object(
        'cost_id', v_cost_id,
        'transcript', p_transcript,
        'receipt_id', v_receipt.id,
        'crew_id', v_crew.id
      )
    );

  elsif p_intent = 'add_job_task' then
    v_job_id := (p_params->>'job_id')::uuid;
    v_task_title := coalesce(nullif(pg_catalog.btrim(p_params->>'title'), ''), 'Follow up');

    select j.* into strict v_job
      from public.jobs j
     where j.id = v_job_id
       and j.account_id = v_task.account_id
     for update;

    v_target_id := v_job.id;

    insert into public.job_tasks (
      account_id, job_id, title, done
    ) values (
      v_task.account_id, v_job.id, v_task_title, false
    ) returning id into v_task_id_out;

    insert into public.job_feed (
      account_id, job_id, kind, title, body, visibility, author, meta
    ) values (
      v_task.account_id, v_job.id, v_feed_kind,
      'Task added: ' || v_task_title,
      v_task_title, 'internal', v_author,
      jsonb_build_object(
        'task_id', v_task_id_out,
        'transcript', p_transcript,
        'receipt_id', v_receipt.id,
        'crew_id', v_crew.id
      )
    );

  elsif p_intent = 'complete_job_task' then
    v_job_id := (p_params->>'job_id')::uuid;
    v_task_title := coalesce(nullif(pg_catalog.btrim(p_params->>'title'), ''), '');

    select j.* into strict v_job
      from public.jobs j
     where j.id = v_job_id
       and j.account_id = v_task.account_id
     for update;

    v_target_id := v_job.id;

    if v_task_title <> '' then
      -- job_tasks has no updated_at column; completion is recorded on
      -- done_at/done_by (both nullable, done_by text).
      update public.job_tasks
         set done = true, done_at = v_now, done_by = v_author
       where account_id = v_task.account_id
         and job_id = v_job.id
         and not done
         and title ilike ('%' || v_task_title || '%');
    end if;

    insert into public.job_feed (
      account_id, job_id, kind, title, body, visibility, author, meta
    ) values (
      v_task.account_id, v_job.id, v_feed_kind,
      'Task completed: ' || coalesce(nullif(v_task_title, ''), 'Checklist item'),
      coalesce(nullif(v_task_title, ''), 'Marked task completed'),
      'internal', v_author,
      jsonb_build_object(
        'transcript', p_transcript,
        'receipt_id', v_receipt.id,
        'crew_id', v_crew.id
      )
    );

  elsif p_intent = 'create_lead' then
    v_client_name := coalesce(nullif(pg_catalog.btrim(p_params->>'client_name'), ''), 'New Prospect');
    v_client_phone := nullif(pg_catalog.btrim(p_params->>'client_phone'), '');
    v_address := nullif(pg_catalog.btrim(p_params->>'address'), '');
    v_note := coalesce(nullif(pg_catalog.btrim(p_params->>'notes'), ''), p_transcript);

    insert into public.leads (
      account_id, source, status, name, phone, address, message
    ) values (
      -- schema-qualified for the same pinned-search_path reason as cost_type
      v_task.account_id, 'manual'::public.lead_source, 'new'::public.lead_status,
      v_client_name, v_client_phone, v_address, v_note
    ) returning id into v_lead_id;

    v_target_id := v_lead_id;

  elsif p_intent in ('report_ambiguity', 'no_action') then
    v_target_id := null;

  elsif p_intent in ('reschedule_job', 'update_client', 'assign_crew',
                     'add_quote_line_item', 'send_client_quote_link') then
    -- Known worker intents this rail does not implement yet. The worker's tool
    -- list offers all five, and the owner-only guard above authorises three of
    -- them, so raising here would be self-contradictory -- and an exception
    -- retries the task 8 times into the dead-letter queue while the sender
    -- hears nothing. Completing with an honest reply is the only ending that
    -- neither lies nor goes silent: no domain write happens, and the
    -- confirmation the worker composed (which claims success) is REPLACED
    -- below with the truth. Implementing these for real is feature work that
    -- belongs to the worker's owner, not a side effect of this migration.
    v_target_id := null;
    v_unsupported := true;

  else
    raise exception 'Unrecognized field intent: %', p_intent using errcode = '22023';
  end if;

  if v_unsupported then
    p_confirmation_text :=
      'Sorry - I can''t make that change by text yet. Please use the dashboard, '
      || 'or reply with a note and I''ll save it to the job.';
  end if;

  -- 6. Enqueue confirmation SMS back to the sender
  if p_confirmation_text is not null and pg_catalog.length(pg_catalog.btrim(p_confirmation_text)) > 0 then
    select e.sms_event_id into v_sms_event_id
      from public.enqueue_sms_delivery(
        p_account_id => v_task.account_id,
        p_phone_number => v_receipt.from_number,
        p_body => pg_catalog.btrim(p_confirmation_text),
        p_message_kind => case when v_crew.id is not null then 'crew-field-confirm' else 'owner-field-confirm' end,
        -- Bare text literals: enqueue_sms_delivery declares these parameters as
        -- plain text, and the enum types an earlier draft cast to
        -- (public.sms_billing_category / sms_sender_purpose / sms_delivery_context)
        -- do not exist in this database -- the casts resolve at first execution,
        -- not at CREATE, so they applied cleanly and threw 42704 on the first
        -- field action.
        p_billing_category => case when v_crew.id is not null then 'crew_message' else 'owner_alert' end,
        p_sender_purpose => 'lgq_shared',
        p_context => case when v_crew.id is not null then 'subcontractor' else 'owner' end,
        p_event_type => case when v_crew.id is not null then 'crew_field_confirm' else 'owner_field_confirm' end,
        p_idempotency_key => 'field-confirm:' || v_receipt.id::text,
        p_payment_id => null::uuid,
        p_crew_id => v_crew.id,
        p_sender_number_id => v_task.sender_number_id
      ) e;
  end if;

  -- 7. Complete task atomically
  v_outcome := jsonb_build_object(
    'intent', p_intent,
    'unsupported_intent', v_unsupported,
    'target_id', v_target_id,
    'confirmation_text', p_confirmation_text,
    'sms_event_id', v_sms_event_id,
    'applied_at', v_now,
    'crew_id', v_crew.id,
    'is_owner', coalesce(v_is_owner, false)
  );

  -- claim_token and lease_expires_at MUST be cleared here:
  -- sms_inbound_action_tasks_claim_shape requires them null for every state
  -- except 'processing', so leaving them set makes every successful action
  -- abort with 23514 at its final statement, rolling back the work it just did.
  update public.sms_inbound_action_tasks
     set task_state = 'completed',
         claim_token = null,
         lease_expires_at = null,
         effect_applied_at = v_now,
         completed_at = v_now,
         outcome = v_outcome,
         updated_at = v_now
   where id = v_task.id;

  return v_outcome;
end;
$$;

revoke all on function public.apply_owner_field_action(uuid,uuid,text,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.apply_owner_field_action(uuid,uuid,text,jsonb,text,text) to service_role;

commit;
