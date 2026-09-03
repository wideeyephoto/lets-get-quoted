-- Keep LGQ platform-lane traffic out of the contractor's customer inbox.
--
-- The transcript row remains durable and keeps every receipt/task foreign key
-- intact. Visibility is derived at the sms_messages table boundary instead of
-- being trusted to each producer: inbound webhook rows, delivery mirrors, and
-- future writers all get the same answer from the authenticated sender record.

begin;

alter table public.sms_messages
  add column if not exists inbox_visible boolean default true;

alter table public.sms_messages
  alter column inbox_visible set default true;

-- Existing rows predate the derived column. Reconcile every row so a partially
-- applied deployment is repaired too: LGQ shared/dispatch rows are platform
-- operations, while a dedicated or legacy/null sender remains customer inbox
-- traffic. This changes presentation only; no transcript is deleted or unbound.
update public.sms_messages m
   set inbox_visible = not exists (
     select 1
       from public.sms_sender_numbers s
      where s.id = m.sender_number_id
        and s.purpose in ('lgq_shared', 'lgq_dispatch')
   )
 where m.inbox_visible is distinct from not exists (
     select 1
       from public.sms_sender_numbers s
      where s.id = m.sender_number_id
        and s.purpose in ('lgq_shared', 'lgq_dispatch')
   );

alter table public.sms_messages
  alter column inbox_visible set not null;

create or replace function public.derive_sms_message_inbox_visibility()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_sender_purpose text;
begin
  if new.sender_number_id is null then
    new.inbox_visible := true;
    return new;
  end if;

  select s.purpose
    into v_sender_purpose
    from public.sms_sender_numbers s
   where s.id = new.sender_number_id;

  -- A missing sender row will fail the existing FK after BEFORE triggers run.
  -- Keep the derivation fail-open for legacy/null identity; only an exact
  -- platform purpose is allowed to hide a customer-inbox row.
  new.inbox_visible := coalesce(
    v_sender_purpose not in ('lgq_shared', 'lgq_dispatch'),
    true
  );
  return new;
end;
$$;

-- The existing provider-identity trigger is named
-- sms_messages_provider_identity_guard. PostgreSQL runs same-event triggers in
-- name order, so it hydrates sender_number_id from a deterministic sms_event
-- before this visibility guard derives the value. Including inbox_visible in
-- the UPDATE columns also prevents privileged writers from overriding the
-- derived invariant directly; read_at-only inbox updates do not invoke it.
drop trigger if exists sms_messages_visibility_from_sender_guard
  on public.sms_messages;
create trigger sms_messages_visibility_from_sender_guard
before insert or update of sender_number_id, sms_event_id, inbox_visible
on public.sms_messages
for each row execute function public.derive_sms_message_inbox_visibility();

-- PostgreSQL ORs permissive policies. The historic FOR ALL policy therefore
-- bypassed a visibility predicate added only to SELECT, and also let office
-- users update/delete hidden platform-lane transcripts. Replace every legacy
-- policy shape with command-specific policies at the table boundary.
alter table public.sms_messages enable row level security;

drop policy if exists sms_messages_owner on public.sms_messages;
drop policy if exists sms_messages_all on public.sms_messages;
drop policy if exists sms_messages_select on public.sms_messages;
drop policy if exists sms_messages_modify on public.sms_messages;
drop policy if exists sms_messages_insert on public.sms_messages;
drop policy if exists sms_messages_update on public.sms_messages;
drop policy if exists sms_messages_delete on public.sms_messages;

create policy sms_messages_select on public.sms_messages
  for select
  using (
    inbox_visible = true
    and public.office_can(account_id, 'messages.read')
  );

create policy sms_messages_insert on public.sms_messages
  for insert
  with check (public.office_can(account_id, 'messages.send'));

create policy sms_messages_update on public.sms_messages
  for update
  using (
    inbox_visible = true
    and public.office_can(account_id, 'messages.send')
  )
  with check (
    inbox_visible = true
    and public.office_can(account_id, 'messages.send')
  );

create policy sms_messages_delete on public.sms_messages
  for delete
  using (
    inbox_visible = true
    and public.office_can(account_id, 'messages.send')
  );

-- Match the two customer-inbox access paths: recent conversation rows and the
-- unread badge. Existing broad indexes remain available to audit/worker paths.
create index if not exists sms_messages_visible_recent_idx
  on public.sms_messages (account_id, created_at desc)
  where inbox_visible = true;

create index if not exists sms_messages_visible_unread_idx
  on public.sms_messages (account_id)
  where inbox_visible = true
    and direction = 'inbound'
    and read_at is null;

-- Field intake may include authenticated MMS downloads plus one model call.
-- The generic inbound worker leases claims for two minutes, which is suitable
-- for its SQL-only reply parser but too short for bounded multimodal work. Give
-- the exact live claim a six-minute lease before any provider call so the next
-- one-minute cron cannot reclaim it while the first worker is still running.
create or replace function public.extend_sms_inbound_action_field_lease(
  p_task_id uuid,
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
  update public.sms_inbound_action_tasks
     set lease_expires_at = greatest(
           lease_expires_at,
           v_now + interval '6 minutes'
         ),
         updated_at = v_now
   where id = p_task_id
     and task_state = 'processing'
     and claim_token is not distinct from p_claim_token
     and lease_expires_at > v_now;
  return found;
end;
$$;

-- Final authorization boundary for the fresh shared-number field-intake rail.
-- The model is an untrusted parser: authorization is re-established from the
-- immutable receipt/task bindings and live lifecycle rows immediately before
-- the existing atomic action mutates domain data. Crew callers may only
-- finalize a deterministic no_action response until their model context and
-- every job-targeting action are assignment-scoped end to end.
create or replace function public.apply_authorized_sms_field_action(
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
  v_message public.sms_messages%rowtype;
  v_sender public.sms_sender_numbers%rowtype;
  v_account public.accounts%rowtype;
  v_crew public.crew%rowtype;
  v_consent public.sms_consent%rowtype;
  v_sender_preference public.sms_sender_keyword_preferences%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_has_caller_scope boolean := false;
  v_is_owner boolean := false;
  v_crew_match_count integer := 0;
  v_required_scope text;
  v_cost_amount numeric;
  v_cost_type text;
begin
  -- Match the legacy applier's first lock so the wrapper and every retry use a
  -- single task-first order. Re-locking this row inside the delegated function
  -- is harmless within the same transaction.
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

  -- A retry after the mutation but before queue completion is idempotent. It
  -- returns the already-authorized result and can never apply a second effect.
  if v_task.effect_applied_at is not null then
    return v_task.outcome;
  end if;

  select r.* into v_receipt
    from public.sms_webhook_receipts r
   where r.id = v_task.webhook_receipt_id
   for share;

  if v_receipt.id is null
     or v_receipt.webhook_kind <> 'inbound'
     or v_receipt.processing_state <> 'processed'
     or v_receipt.disposition <> 'routed'
     or v_receipt.account_id is distinct from v_task.account_id
     or v_receipt.sender_number_id is distinct from v_task.sender_number_id
     or v_receipt.sms_message_id is distinct from v_task.sms_message_id
     or v_receipt.from_number is null then
    raise exception 'Inbound action task binding is invalid' using errcode = '23514';
  end if;

  select m.* into v_message
    from public.sms_messages m
   where m.id = v_task.sms_message_id
     and m.id = v_receipt.sms_message_id
     and m.account_id = v_task.account_id
     and m.sender_number_id = v_task.sender_number_id
     and m.provider = v_receipt.provider
     and m.provider_id = v_receipt.provider_event_id
     and m.phone_number = v_receipt.from_number
     and m.direction = 'inbound'
   for share;

  if v_message.id is null then
    raise exception 'Inbound action message binding is invalid' using errcode = '23514';
  end if;

  -- STOP/START routing already uses this exact sender/contact key. Take it
  -- before the account/recipient lock everywhere so the two rails cannot form a
  -- lock-order cycle, including when no preference row exists yet.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'sms-sender-consent:' || v_task.sender_number_id::text || ':' || v_receipt.from_number,
      20260821
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    public.sms_inbound_recipient_lock_key(v_task.account_id, v_receipt.from_number)
  );

  -- FOR SHARE is deliberate: concurrent suspension, transfer, alert-phone
  -- change, or consent revocation must serialize before/after this action.
  select s.* into v_sender
    from public.sms_sender_numbers s
   where s.id = v_task.sender_number_id
     and s.id = v_receipt.sender_number_id
     and s.provider = v_receipt.provider
     and s.e164_number = v_receipt.to_number
     and s.purpose = 'lgq_shared'
     and s.account_id is null
     and s.provisioning_status = 'active'
     and s.assignment_state = 'assigned'
     and s.inbound_ready
     and s.activated_at is not null
     and s.suspended_at is null
   for share;

  if v_sender.id is null then
    raise exception 'Shared SMS sender is no longer active' using errcode = '55000';
  end if;

  select a.* into v_account
    from public.accounts a
   where a.id = v_task.account_id
     and a.suspended_at is null
   for share;

  if v_account.id is null then
    raise exception 'Field intake account is no longer active' using errcode = '28000';
  end if;

  v_is_owner := v_account.high_value_sms_enabled is true
    and public.sms_normalize_recipient_phone(v_account.alert_phone) = v_receipt.from_number;

  if v_is_owner then
    v_required_scope := 'owner';
  else
    -- Lock every matching live identity, then require exactly one. This avoids
    -- LIMIT 1 attribution when a reused phone is present on duplicate rows.
    for v_crew in
      select cr.*
        from public.crew cr
       where cr.account_id = v_task.account_id
         and cr.active
         and cr.deleted_at is null
         and cr.access_revoked_at is null
         and public.sms_normalize_recipient_phone(cr.phone) = v_receipt.from_number
       order by cr.id
       for share
    loop
      v_crew_match_count := v_crew_match_count + 1;
    end loop;

    if v_crew_match_count <> 1 then
      raise exception 'Field intake sender identity is missing or ambiguous' using errcode = '28000';
    end if;
    if p_intent <> 'no_action' then
      raise exception 'Crew field commands are not enabled' using errcode = '42501';
    end if;
    v_required_scope := 'crew';
  end if;

  select c.* into v_consent
    from public.sms_consent c
   where c.account_id = v_task.account_id
     and c.phone_number = v_receipt.from_number
   for share;

  if v_consent.id is null
     or v_consent.status <> 'opted_in'
     or v_consent.opted_out_at is not null then
    raise exception 'Sender consent is missing or revoked' using errcode = '28000';
  end if;

  select true into v_has_caller_scope
    from public.sms_consent_scopes scope
   where scope.account_id = v_task.account_id
     and scope.phone_number = v_receipt.from_number
     and scope.consent_scope = v_required_scope
   for share;

  if not coalesce(v_has_caller_scope, false) then
    raise exception 'Sender consent scope is missing' using errcode = '28000';
  end if;

  select pref.* into v_sender_preference
    from public.sms_sender_keyword_preferences pref
   where pref.sender_number_id = v_task.sender_number_id
     and pref.phone_number = v_receipt.from_number
   for share;

  if v_sender_preference.sender_number_id is not null
     and (
       v_sender_preference.status <> 'opted_in'
       or v_sender_preference.opted_out_at is not null
     ) then
    raise exception 'Sender-specific consent is revoked' using errcode = '28000';
  end if;

  -- The legacy completion intent performs an unescaped fuzzy ILIKE update and
  -- can mark zero or many tasks while confirming success. Keep it off this
  -- fresh rail until callers provide one exact task UUID.
  if p_intent = 'complete_job_task' then
    raise exception 'Task completion by SMS requires an exact task ID' using errcode = '42501';
  end if;

  if p_intent = 'log_cost' then
    if pg_catalog.jsonb_typeof(p_params->'amount') is distinct from 'number' then
      raise exception 'Cost amount must be a JSON number' using errcode = '22023';
    end if;
    v_cost_amount := (p_params->>'amount')::numeric;
    v_cost_type := coalesce(
      nullif(pg_catalog.btrim(p_params->>'cost_type'), ''),
      'material'
    );
    if v_cost_amount::text in ('NaN', 'Infinity', '-Infinity')
       or v_cost_amount <= 0
       or v_cost_amount > 1000000 then
      raise exception 'Cost amount is outside the allowed range' using errcode = '22023';
    end if;
    if v_cost_type not in ('material', 'labor', 'sub', 'receipt', 'other') then
      raise exception 'Cost type is invalid' using errcode = '22023';
    end if;
  end if;

  return public.apply_owner_field_action(
    p_task_id,
    p_claim_token,
    p_intent,
    p_params,
    p_transcript,
    p_confirmation_text
  );
end;
$$;

-- Trigger functions are internal implementation details. SECURITY DEFINER is
-- required so authenticated inbox writers cannot influence the lookup through
-- sms_sender_numbers RLS; the hardened path and revoked EXECUTE keep it out of
-- the Data API surface.
revoke all on function public.derive_sms_message_inbox_visibility()
  from public, anon, authenticated, service_role;
revoke all on function public.extend_sms_inbound_action_field_lease(uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.extend_sms_inbound_action_field_lease(uuid,uuid)
  to service_role;
-- Keep the legacy service-role grant during a migration-first rollout so old
-- application instances do not fail between database and code deployment.
-- A later exact-release migration may revoke this compatibility entry point
-- after every worker version calls the authorized wrapper.
revoke all on function public.apply_owner_field_action(uuid,uuid,text,jsonb,text,text)
  from public, anon, authenticated;
grant execute on function public.apply_owner_field_action(uuid,uuid,text,jsonb,text,text)
  to service_role;
revoke all on function public.apply_authorized_sms_field_action(uuid,uuid,text,jsonb,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_authorized_sms_field_action(uuid,uuid,text,jsonb,text,text)
  to service_role;

commit;
