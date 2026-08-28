-- Atomic execution RPC for AI Voice & Text-to-Job Field Intake
--
-- Why this is a single RPC:
-- 1. All domain mutations (notes, costs, tasks, leads), feed audits,
--    and confirmation SMS enqueues happen inside one ACID transaction.
-- 2. Prevents partial failure where a database record is modified but
--    confirmation or auditing fails, avoiding duplicate actions on retry.
-- 3. Field notes are strictly written to job_feed with visibility = 'internal',
--    preserving customer-facing jobs.scope integrity.

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

  -- 3. Affirmative owner consent re-validation
  if not exists (
    select 1
      from public.sms_consent c
      join public.sms_consent_scopes scope
        on scope.account_id = c.account_id
       and scope.phone_number = c.phone_number
       and scope.consent_scope = 'owner'
     where c.account_id = v_task.account_id
       and c.phone_number = v_receipt.from_number
       and c.status = 'opted_in'
       and c.opted_out_at is null
  ) then
    raise exception 'Owner consent is missing or revoked' using errcode = '28000';
  end if;

  -- 4. Advisory lock on contractor account
  perform pg_catalog.pg_advisory_xact_lock(
    public.sms_inbound_recipient_lock_key(v_task.account_id, v_receipt.from_number)
  );

  v_feed_kind := case
    when coalesce(pg_catalog.array_length(v_receipt.media_urls, 1), 0) > 0
      then 'field_voice_note'
    else 'field_sms_update'
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
      v_note, 'internal', 'Owner (Field Voice/SMS)',
      jsonb_build_object(
        'transcript', p_transcript,
        'receipt_id', v_receipt.id,
        'from_number', v_receipt.from_number
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
      v_task.account_id, v_job.id, v_cost_type::cost_type,
      v_cost_type, v_label, v_amount
    ) returning id into v_cost_id;

    insert into public.job_feed (
      account_id, job_id, kind, title, body, amount, visibility, author, meta
    ) values (
      v_task.account_id, v_job.id, 'cost_added',
      'Cost logged: ' || v_label,
      v_label || ' ($' || v_amount::text || ')',
      v_amount, 'internal', 'Owner (Field Voice/SMS)',
      jsonb_build_object(
        'cost_id', v_cost_id,
        'transcript', p_transcript,
        'receipt_id', v_receipt.id
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
      v_task_title, 'internal', 'Owner (Field Voice/SMS)',
      jsonb_build_object(
        'task_id', v_task_id_out,
        'transcript', p_transcript,
        'receipt_id', v_receipt.id
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
      v_task.account_id, 'manual'::lead_source, 'new'::lead_status,
      v_client_name, v_client_phone, v_address, v_note
    ) returning id into v_lead_id;

    v_target_id := v_lead_id;

  elsif p_intent in ('report_ambiguity', 'no_action') then
    -- Ambiguity / no-action creates no domain mutation
    v_target_id := null;
  else
    raise exception 'Unrecognized field intent: %', p_intent using errcode = '22023';
  end if;

  -- 6. Enqueue confirmation SMS if confirmation text is present
  if p_confirmation_text is not null and pg_catalog.length(pg_catalog.btrim(p_confirmation_text)) > 0 then
    select e.sms_event_id into v_sms_event_id
      from public.enqueue_sms_delivery(
        p_account_id => v_task.account_id,
        p_phone_number => v_receipt.from_number,
        p_body => pg_catalog.btrim(p_confirmation_text),
        p_message_kind => 'owner-field-confirm',
        p_billing_category => 'owner_alert'::public.sms_billing_category,
        p_sender_purpose => 'lgq_shared'::public.sms_sender_purpose,
        p_context => 'owner'::public.sms_delivery_context,
        p_event_type => 'owner_field_confirm',
        p_idempotency_key => 'owner-field-confirm:' || v_receipt.id::text,
        p_payment_id => null::uuid,
        p_crew_id => null::uuid,
        p_sender_number_id => v_task.sender_number_id
      ) e;
  end if;

  -- 7. Complete task atomically
  v_outcome := jsonb_build_object(
    'intent', p_intent,
    'target_id', v_target_id,
    'confirmation_text', p_confirmation_text,
    'sms_event_id', v_sms_event_id,
    'applied_at', v_now
  );

  update public.sms_inbound_action_tasks
     set task_state = 'completed',
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
