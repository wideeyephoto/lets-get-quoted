-- Let a received top-up become credit.
--
-- WHY. Migration 20260818140000 let a paid top-up LAND and deliberately gave it
-- nowhere to go: its terminal-shape branch requires every projection column to
-- stay NULL, so no projector could write a legal row. That was the point --- with
-- no legal projected shape, a half-written projector cannot half-work. The
-- projector is now being written, so this migration supplies the shape and the
-- result vocabulary its header promised.
--
-- WHAT THE RECEIPT BRANCH LEFT OPEN. The branch 20260818140000 appended reads
-- "scope = platform_top_up and every projection column is null" and says nothing
-- about processing_status. Every other scope pairs its unprojected shape with
-- "processing_status not in ('processed', 'ignored')". Without that pairing a
-- top-up event can be marked processed or ignored while carrying no evidence
-- that anything happened --- the exact half-work the receipt migration set out to
-- prevent, one step earlier in the row's life. Verified against PostgreSQL 17.10
-- rather than argued: both inserts are accepted today.
--
-- That gap cannot be closed by OR-ing, because OR only ever widens. It is closed
-- here by a NEW constraint that ANDs alongside the others, which is why nothing
-- below rewrites the receipt branch. The two extensions that ARE needed --- a
-- projected shape, and the result literals it names --- are appended with the
-- same pg_get_constraintdef technique 20260818140000 used, for the same reason:
-- these constraints are hundreds of characters of nested boolean logic and
-- retyping one to add a branch is how a subtle inversion gets introduced.
--
-- THE VOCABULARY. Eight results, each a distinct real outcome, each bound to the
-- event types that can actually produce it:
--
--   top_up_credits_granted            a paid session became a credit lot
--   top_up_credits_already_granted    that lot already existed (replay)
--   top_up_awaiting_async_payment     completed, but not yet paid (delayed rail)
--   top_up_payment_failed             the delayed payment did not arrive
--   top_up_checkout_expired           the session lapsed unpaid
--   top_up_not_a_purchase             the session is not a top-up purchase
--   top_up_fulfillment_withheld       a withheld or plan-ineligible SKU was paid
--   top_up_capacity_fulfillment_deferred  a recurring-capacity SKU was paid
--
-- The last two are not tidiness. Every recurring-capacity SKU is withheld in the
-- catalog --- storage_100gb because nothing fulfils a purchased capacity increase,
-- office_user and crew_user because a bought seat would enforce nothing --- so
-- money can still be taken for something this projector must not grant. That has
-- to be a named, queryable outcome rather than a silent success or a stuck
-- queue. capacity_fulfillment_deferred is unreachable while all three are
-- withheld, and stays in the vocabulary as the safety net for the day one is
-- sold before its fulfillment exists.
--
-- Granting goes through grant_usage_credits, which already owns positive-unit
-- checks, resource-code shape, a per-workspace advisory lock, and idempotency.
-- Purchased lots pass expires_at = null; the database enforces that too.

begin;

-- A top-up row that already carries processing history predates this projector
-- and cannot be classified from here --- including one marked terminal through the
-- gap described above.
--
-- The guard asks about the state BEFORE this migration, so it must not fire on a
-- database where this migration has already run: by then the projector is live
-- and processing history is exactly what is supposed to be there. Without the
-- early return, re-applying this file after the first purchase fails with a
-- message that reads like data corruption and is only a re-run.
lock table public.billing_events in share row exclusive mode;
do $$
begin
  if exists (
    select 1
      from pg_constraint
     where conrelid = 'public.billing_events'::regclass
       and conname = 'billing_events_top_up_projection_completeness_check'
  ) then
    return;
  end if;

  if exists (
    select 1
      from public.billing_events e
     where e.event_scope = 'platform_top_up'
       and e.processing_status <> 'received'
  ) then
    raise exception 'top-up inbox contains pre-projector processing history'
      using errcode = '55000';
  end if;
end
$$;

-- Extend the two constraints that must admit more, from their own live text.
-- Each `extra` is dollar-quoted rather than written as a doubled-quote string
-- literal: the branch below is nested boolean logic, and hand-doubling forty
-- quotes inside it is its own way to introduce an inversion.
do $mig$
declare
  spec record;
  body text;
begin
  for spec in
    select *
      from (values
        (
          'billing_events_projection_result_check',
          'top_up_credits_granted',
          $extra$(
            projection_result in (
              'top_up_credits_granted',
              'top_up_credits_already_granted',
              'top_up_awaiting_async_payment',
              'top_up_payment_failed',
              'top_up_checkout_expired',
              'top_up_not_a_purchase',
              'top_up_fulfillment_withheld',
              'top_up_capacity_fulfillment_deferred'
            )
          )$extra$
        ),
        (
          'billing_events_projection_terminal_shape_check',
          'stripe_platform_top_up_projection_v1',
          $extra$(
            event_scope = 'platform_top_up'
            and processed_at is not null
            and projection_schema_version is not distinct from
              'stripe_platform_top_up_projection_v1'
            and projection_applied is not null
            and (
              (
                processing_status = 'processed'
                and projection_applied
                and event_type in (
                  'checkout.session.completed',
                  'checkout.session.async_payment_succeeded'
                )
                and projection_result = 'top_up_credits_granted'
              )
              or (
                processing_status = 'processed'
                and not projection_applied
                and event_type in (
                  'checkout.session.completed',
                  'checkout.session.async_payment_succeeded'
                )
                and projection_result = 'top_up_credits_already_granted'
              )
              or (
                processing_status = 'ignored'
                and not projection_applied
                and (
                  (
                    event_type = 'checkout.session.completed'
                    and projection_result = 'top_up_awaiting_async_payment'
                  )
                  or (
                    event_type = 'checkout.session.async_payment_failed'
                    and projection_result = 'top_up_payment_failed'
                  )
                  or (
                    event_type = 'checkout.session.expired'
                    and projection_result = 'top_up_checkout_expired'
                  )
                  or (
                    event_type in (
                      'checkout.session.completed',
                      'checkout.session.async_payment_succeeded'
                    )
                    and projection_result in (
                      'top_up_fulfillment_withheld',
                      'top_up_capacity_fulfillment_deferred'
                    )
                  )
                  or projection_result = 'top_up_not_a_purchase'
                )
              )
            )
          )$extra$
        )
      ) as t(conname, marker, extra)
  loop
    select pg_get_constraintdef(c.oid) into body
      from pg_constraint c
     where c.conrelid = 'public.billing_events'::regclass
       and c.conname = spec.conname;

    if body is null then
      raise exception 'constraint % not found on billing_events', spec.conname;
    end if;

    -- Already extended: a second apply must not append the branch twice.
    if pg_catalog.strpos(body, spec.marker) > 0 then
      continue;
    end if;

    body := pg_catalog.btrim(body);
    if body !~ '^CHECK \(' then
      raise exception 'unexpected constraint shape for %: %', spec.conname, pg_catalog.left(body, 40);
    end if;
    body := pg_catalog.substr(body, 8, pg_catalog.length(body) - 8);

    execute pg_catalog.format(
      'alter table public.billing_events drop constraint %I', spec.conname);
    execute pg_catalog.format(
      'alter table public.billing_events add constraint %I check ((%s) or %s)',
      spec.conname, body, spec.extra);
  end loop;
end
$mig$;

-- Close what OR cannot. A new constraint ANDs with the others, so this narrows
-- platform_top_up without touching a character of the branch 20260818140000
-- wrote. Read with billing_events_processed_state_check (processed_at implies a
-- terminal status), it makes the two equivalent for this scope: a terminal
-- top-up row has processed_at, which makes the receipt branch unsatisfiable,
-- which forces the projected branch above and every column of evidence it names.
alter table public.billing_events
  drop constraint if exists billing_events_top_up_projection_completeness_check;
alter table public.billing_events
  add constraint billing_events_top_up_projection_completeness_check check (
    event_scope <> 'platform_top_up'
    or processing_status not in ('processed', 'ignored')
    or processed_at is not null
  );

-- Claim one top-up event by explicit inbox ID.
--
-- Mirrors the connected-payment claim: the immutable inbox envelope is verified
-- on every call, terminal and in-progress replays return before any work, and
-- the lease is five minutes. What it deliberately does NOT do is resolve a
-- workspace. The inbox leaves account_id null for this scope on purpose --- a
-- platform Session carries no connected account to map from --- so the workspace
-- arrives later, from the Session's own metadata, and is bound by the projector.
create or replace function public.claim_stripe_platform_top_up_event(
  p_billing_event_id uuid
)
returns table (
  claim_status text,
  billing_event_id uuid,
  claim_token uuid,
  attempt_count integer,
  provider_event_id text,
  event_type text,
  checkout_session_id text,
  workspace_id uuid,
  livemode boolean,
  provider_created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_event public.billing_events%rowtype;
  v_claim_token uuid := pg_catalog.gen_random_uuid();
  v_checkout_session_id text;
  v_expected_hash text;
begin
  if p_billing_event_id is null then
    raise exception 'top-up event ID is required' using errcode = '22023';
  end if;

  select e.* into v_event
    from public.billing_events e
   where e.id = p_billing_event_id
   for update;
  if not found then
    raise exception 'top-up event was not found' using errcode = 'P0002';
  end if;

  v_checkout_session_id := v_event.payload #>> '{data_object,id}';
  v_expected_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_event.payload::text, 'UTF8'), 'sha256'),
    'hex'
  );
  if v_event.provider <> 'stripe'
     or v_event.event_scope <> 'platform_top_up'
     or v_event.event_type not in (
          'checkout.session.completed',
          'checkout.session.async_payment_succeeded',
          'checkout.session.async_payment_failed',
          'checkout.session.expired')
     or v_event.provider_account_id is not null
     or v_event.provider_created_at is null
     or v_event.payload_sha256 is distinct from v_expected_hash
     or v_event.payload #>> '{schema}' is distinct from 'lgq.stripe-event-inbox.v1'
     or v_event.payload #>> '{scope}' is distinct from 'platform_top_up'
     or v_event.payload #>> '{event,id}' is distinct from v_event.provider_event_id
     or v_event.payload #>> '{event,type}' is distinct from v_event.event_type
     or v_event.payload #>> '{event,account}' is not null
     or v_event.payload #> '{event,livemode}' is distinct from pg_catalog.to_jsonb(v_event.livemode)
     or v_event.payload #>> '{data_object,object}' is distinct from 'checkout.session'
     or v_checkout_session_id is null
     or v_checkout_session_id !~ '^cs_[A-Za-z0-9_]+$' then
    raise exception 'top-up event inbox contract is invalid' using errcode = '22000';
  end if;

  if v_event.processing_status = 'processed' then
    return query select
      'processed'::text, v_event.id, null::uuid, v_event.attempt_count,
      v_event.provider_event_id, v_event.event_type, v_checkout_session_id,
      v_event.account_id, v_event.livemode, v_event.provider_created_at;
    return;
  end if;
  if v_event.processing_status = 'ignored' then
    return query select
      'ignored'::text, v_event.id, null::uuid, v_event.attempt_count,
      v_event.provider_event_id, v_event.event_type, v_checkout_session_id,
      v_event.account_id, v_event.livemode, v_event.provider_created_at;
    return;
  end if;
  if v_event.processing_status = 'failed' and v_event.next_attempt_at is null then
    return query select
      'failed_terminal'::text, v_event.id, null::uuid, v_event.attempt_count,
      v_event.provider_event_id, v_event.event_type, v_checkout_session_id,
      v_event.account_id, v_event.livemode, v_event.provider_created_at;
    return;
  end if;
  if (v_event.processing_status = 'processing'
      and v_event.projection_lease_expires_at > pg_catalog.now())
     or (v_event.processing_status = 'failed'
      and v_event.next_attempt_at > pg_catalog.now()) then
    return query select
      'in_progress'::text, v_event.id, null::uuid, v_event.attempt_count,
      v_event.provider_event_id, v_event.event_type, v_checkout_session_id,
      v_event.account_id, v_event.livemode, v_event.provider_created_at;
    return;
  end if;

  if v_event.processing_status not in ('received', 'failed', 'processing') then
    raise exception 'top-up event has an unsupported processing state'
      using errcode = '55000';
  end if;

  update public.billing_events e
     set processing_status = 'processing',
         attempt_count = e.attempt_count + 1,
         processing_started_at = pg_catalog.now(),
         projection_claim_token = v_claim_token,
         projection_lease_expires_at = pg_catalog.now() + interval '5 minutes',
         next_attempt_at = null,
         last_error = null
   where e.id = v_event.id
  returning * into v_event;

  return query select
    'claimed'::text, v_event.id, v_event.projection_claim_token,
    v_event.attempt_count, v_event.provider_event_id, v_event.event_type,
    v_checkout_session_id, v_event.account_id, v_event.livemode,
    v_event.provider_created_at;
end;
$$;

-- Turn one claimed top-up event into its terminal shape, granting credit when
-- that is what the outcome says.
--
-- The caller resolves the Session from Stripe and decides the outcome, because
-- the inbox stores a PII-minimized envelope --- {id, object} and nothing else ---
-- so the SKU metadata simply is not in the database. What this function will not
-- do is take the caller's word for which Session that was: the projection must
-- name the same Checkout Session the stored envelope names.
--
-- UNITS. The caller supplies them from the catalog, never from Stripe metadata.
-- Metadata proves WHICH SKU was bought; the catalog says how much it grants, and
-- the catalog lives in TypeScript. That boundary is the reason this function
-- takes units as a parameter rather than looking them up.
--
-- The workspace is bound here, before granting, for two reasons that agree:
-- grant_usage_credits refuses a billing event that does not belong to the
-- workspace, and binding it is the durable mapping the inbox's own column
-- comment says a top-up is waiting for.
create or replace function public.project_stripe_platform_top_up_event(
  p_billing_event_id uuid,
  p_claim_token uuid,
  p_projection jsonb
)
returns table (
  projection_status text,
  projection_result text,
  credit_lot_id uuid,
  applied boolean
)
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_event public.billing_events%rowtype;
  v_outcome text;
  v_session text;
  v_account uuid;
  v_resource text;
  v_units bigint;
  v_catalog text;
  v_top_up text;
  v_key text;
  v_lot uuid;
  v_existing uuid;
  v_result text;
  v_status text;
  v_applied boolean;
begin
  if p_billing_event_id is null
     or p_claim_token is null
     or p_projection is null
     or pg_catalog.jsonb_typeof(p_projection) <> 'object' then
    raise exception 'top-up projection input is invalid' using errcode = '22023';
  end if;

  v_outcome := p_projection ->> 'outcome';
  if v_outcome is null or v_outcome not in (
       'grant',
       'awaiting_async_payment',
       'payment_failed',
       'checkout_expired',
       'not_a_purchase',
       'fulfillment_withheld',
       'capacity_fulfillment_deferred') then
    raise exception 'top-up projection outcome is unrecognised' using errcode = '22023';
  end if;

  select e.* into v_event
    from public.billing_events e
   where e.id = p_billing_event_id
   for update;
  if not found
     or v_event.event_scope <> 'platform_top_up'
     or v_event.processing_status <> 'processing'
     or v_event.projection_claim_token is distinct from p_claim_token
     or v_event.projection_lease_expires_at <= pg_catalog.now() then
    raise exception 'top-up projection claim is not owned or expired'
      using errcode = '55000';
  end if;

  v_session := p_projection ->> 'checkout_session_id';
  if v_session is null
     or v_session is distinct from v_event.payload #>> '{data_object,id}' then
    raise exception 'top-up projection names a different Checkout Session'
      using errcode = '22000';
  end if;

  -- The outcome must be one this event type can actually produce. The terminal
  -- shape constraint says the same thing; saying it here too turns a constraint
  -- violation into an error that names the disagreement.
  if (v_outcome = 'grant'
      and v_event.event_type not in (
        'checkout.session.completed', 'checkout.session.async_payment_succeeded'))
     or (v_outcome = 'awaiting_async_payment'
      and v_event.event_type <> 'checkout.session.completed')
     or (v_outcome = 'payment_failed'
      and v_event.event_type <> 'checkout.session.async_payment_failed')
     or (v_outcome = 'checkout_expired'
      and v_event.event_type <> 'checkout.session.expired')
     or (v_outcome in ('fulfillment_withheld', 'capacity_fulfillment_deferred')
      and v_event.event_type not in (
        'checkout.session.completed', 'checkout.session.async_payment_succeeded')) then
    raise exception 'top-up outcome % is not possible for event type %',
      v_outcome, v_event.event_type using errcode = '22000';
  end if;

  v_account := nullif(p_projection ->> 'account_id', '')::uuid;
  if v_account is not null
     and not exists (select 1 from public.accounts a where a.id = v_account) then
    raise exception 'top-up projection names a workspace that does not exist'
      using errcode = '23503';
  end if;

  -- A resolved workspace is immutable: protect_billing_event() enforces it, and
  -- a top-up that appears to belong to a second workspace is a fault to report,
  -- not a row to overwrite.
  if v_account is not null
     and v_event.account_id is not null
     and v_event.account_id is distinct from v_account then
    raise exception 'top-up event is already bound to a different workspace'
      using errcode = '22000';
  end if;

  -- Bind the workspace whenever it is known, not only when credit is granted.
  -- A withheld or deferred fulfillment is money taken from a workspace that
  -- someone will have to answer for, and an unbound row cannot be found by it.
  if v_account is not null and v_event.account_id is distinct from v_account then
    update public.billing_events e
       set account_id = v_account
     where e.id = v_event.id
    returning * into v_event;
  end if;

  if v_outcome = 'grant' then
    v_resource := p_projection ->> 'resource_code';
    v_units := nullif(p_projection ->> 'units', '')::bigint;
    v_catalog := p_projection ->> 'catalog_version';
    v_top_up := p_projection ->> 'top_up_id';
    v_key := p_projection ->> 'idempotency_key';

    if v_account is null
       or v_resource is null
       or v_units is null
       or v_key is null
       or pg_catalog.length(pg_catalog.btrim(v_key)) = 0 then
      raise exception 'top-up grant projection is incomplete' using errcode = '22023';
    end if;

    -- The same advisory lock grant_usage_credits takes, held for the whole
    -- transaction, so the "already granted?" read and the grant that may follow
    -- it cannot interleave with another event for the same wallet. Without it,
    -- two events for one Session can both miss and the second grant raises on
    -- the idempotency key instead of reporting a replay.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_account::text || ':' || v_resource, 0)
    );

    select l.id into v_existing
      from public.usage_credit_lots l
     where l.account_id = v_account
       and l.resource_code = v_resource
       and l.idempotency_key = v_key;

    if v_existing is not null then
      v_lot := v_existing;
      v_applied := false;
      v_result := 'top_up_credits_already_granted';
    else
      v_lot := public.grant_usage_credits(
        p_account_id => v_account,
        p_resource_code => v_resource,
        p_units => v_units,
        p_source_type => 'purchase',
        p_idempotency_key => v_key,
        p_catalog_version => v_catalog,
        p_billing_event_id => v_event.id,
        p_available_from => null,
        -- Purchased credit never expires. The database enforces it as well;
        -- passing it explicitly keeps the rule readable where it is decided.
        p_expires_at => null,
        p_metadata => pg_catalog.jsonb_strip_nulls(
          pg_catalog.jsonb_build_object(
            'lgq_top_up_id', v_top_up,
            'lgq_checkout_session_id', v_session,
            'lgq_provider_event_id', v_event.provider_event_id
          )
        )
      );
      v_applied := true;
      v_result := 'top_up_credits_granted';
    end if;
    v_status := 'processed';
  else
    v_applied := false;
    v_status := 'ignored';
    v_result := case v_outcome
      when 'awaiting_async_payment' then 'top_up_awaiting_async_payment'
      when 'payment_failed' then 'top_up_payment_failed'
      when 'checkout_expired' then 'top_up_checkout_expired'
      when 'not_a_purchase' then 'top_up_not_a_purchase'
      when 'fulfillment_withheld' then 'top_up_fulfillment_withheld'
      else 'top_up_capacity_fulfillment_deferred'
    end;
  end if;

  update public.billing_events e
     set processing_status = v_status,
         processed_at = pg_catalog.now(),
         next_attempt_at = null,
         last_error = null,
         projection_claim_token = null,
         projection_lease_expires_at = null,
         projection_schema_version = 'stripe_platform_top_up_projection_v1',
         projection_applied = v_applied,
         projection_result = v_result
   where e.id = v_event.id;

  return query select v_status, v_result, v_lot, v_applied;
end;
$$;

-- Release a claimed top-up event back to the queue, or park it terminally.
create or replace function public.fail_stripe_platform_top_up_event(
  p_billing_event_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_retryable boolean,
  p_next_attempt_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
set timezone to 'UTC'
as $$
declare
  v_event public.billing_events%rowtype;
begin
  if p_billing_event_id is null
     or p_claim_token is null
     or p_error_code is null
     or p_error_code !~ '^[a-z][a-z0-9_]{2,63}$'
     or p_retryable is null
     or (p_retryable and (p_next_attempt_at is null or p_next_attempt_at <= pg_catalog.now()))
     or (not p_retryable and p_next_attempt_at is not null) then
    raise exception 'top-up failure input is invalid' using errcode = '22023';
  end if;

  select e.* into v_event
    from public.billing_events e
   where e.id = p_billing_event_id
   for update;
  if not found
     or v_event.event_scope <> 'platform_top_up'
     or v_event.processing_status <> 'processing'
     or v_event.projection_claim_token is distinct from p_claim_token
     or v_event.projection_lease_expires_at <= pg_catalog.now() then
    raise exception 'top-up failure claim is not owned or expired'
      using errcode = '55000';
  end if;

  update public.billing_events e
     set processing_status = 'failed',
         processed_at = null,
         next_attempt_at = p_next_attempt_at,
         last_error = p_error_code,
         projection_claim_token = null,
         projection_lease_expires_at = null,
         projection_schema_version = null,
         projection_applied = null,
         projection_result = null
   where e.id = v_event.id;
  return true;
end;
$$;

comment on function public.claim_stripe_platform_top_up_event(uuid) is
  'Dark claim by explicit inbox ID. The workspace is not resolved here: a platform Session carries no connected account, so the projector binds it from Session metadata.';
comment on function public.project_stripe_platform_top_up_event(uuid, uuid, jsonb) is
  'Dark top-up projector; no active caller exists while LGQ_TOP_UP_PURCHASE_ENABLED is absent. Granted units come from the catalog via the caller, never from Stripe metadata.';
comment on function public.fail_stripe_platform_top_up_event(uuid, uuid, text, boolean, timestamptz) is
  'Release a claimed top-up event for retry, or park it terminally with next_attempt_at null.';

revoke all on function public.claim_stripe_platform_top_up_event(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_stripe_platform_top_up_event(uuid)
  to service_role;

revoke all on function public.project_stripe_platform_top_up_event(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.project_stripe_platform_top_up_event(uuid, uuid, jsonb)
  to service_role;

revoke all on function public.fail_stripe_platform_top_up_event(uuid, uuid, text, boolean, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.fail_stripe_platform_top_up_event(uuid, uuid, text, boolean, timestamptz)
  to service_role;

-- Prove the shape this migration exists to create, rather than assuming it.
do $$
declare
  v_terminal text;
  v_results text;
begin
  select pg_get_constraintdef(oid) into v_terminal
    from pg_constraint
   where conrelid = 'public.billing_events'::regclass
     and conname = 'billing_events_projection_terminal_shape_check';
  select pg_get_constraintdef(oid) into v_results
    from pg_constraint
   where conrelid = 'public.billing_events'::regclass
     and conname = 'billing_events_projection_result_check';

  if v_terminal not like '%stripe_platform_top_up_projection_v1%' then
    raise exception 'terminal shape does not admit the top-up projection schema';
  end if;
  if v_terminal not like '%stripe_subscription_projection_v1%'
     or v_terminal not like '%stripe_connected_payment_projection_v1%'
     or v_terminal not like '%stripe_connected_checkout_expiration_v1%' then
    raise exception 'terminal shape lost an existing scope';
  end if;
  if v_results not like '%top_up_credits_granted%'
     or v_results not like '%subscription_state_applied%'
     or v_results not like '%direct_payment_paid_reconciled%' then
    raise exception 'result vocabulary lost a literal';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.billing_events'::regclass
       and conname = 'billing_events_top_up_projection_completeness_check'
  ) then
    raise exception 'top-up completeness constraint was not created';
  end if;
end;
$$;

commit;
