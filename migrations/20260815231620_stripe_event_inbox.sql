-- Dark-launched Stripe event inbox. This deliberately does not attach to the
-- active webhook route; it only establishes an atomic, least-privilege receipt
-- boundary for a future platform-subscription or connected-payment endpoint.

begin;

alter table public.billing_events
  add column if not exists event_scope text;

-- Existing rows cannot be classified safely from a nullable provider account:
-- a platform event and an incompletely recorded Connect event look identical.
-- This table is still dark, so fail instead of guessing if it has been used.
do $$
begin
  if exists (
    select 1
      from public.billing_events
     where event_scope is null
  ) then
    raise exception 'billing_events contains rows that predate explicit Stripe event scope; classify them before applying this migration'
      using errcode = '23514';
  end if;
end
$$;

alter table public.billing_events
  alter column event_scope set not null;

do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.billing_events'::pg_catalog.regclass
       and conname = 'billing_events_scope_check'
  ) then
    alter table public.billing_events
      add constraint billing_events_scope_check
      check (event_scope in ('connected_payment', 'platform_subscription'));
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.billing_events'::pg_catalog.regclass
       and conname = 'billing_events_scope_binding_check'
  ) then
    alter table public.billing_events
      add constraint billing_events_scope_binding_check
      check (
        (
          event_scope = 'connected_payment'
          and account_id is not null
          and provider_account_id is not null
        )
        or (
          event_scope = 'platform_subscription'
          and provider_account_id is null
        )
      );
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.billing_events'::pg_catalog.regclass
       and conname = 'billing_events_stripe_identity_format_check'
  ) then
    alter table public.billing_events
      add constraint billing_events_stripe_identity_format_check
      check (
        provider_event_id ~ '^evt_[A-Za-z0-9_]{8,}$'
        and (
          provider_account_id is null
          or provider_account_id ~ '^acct_[A-Za-z0-9]{8,}$'
        )
      );
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.billing_events'::pg_catalog.regclass
       and conname = 'billing_events_complete_receipt_check'
  ) then
    alter table public.billing_events
      add constraint billing_events_complete_receipt_check
      check (
        provider_created_at is not null
        and payload_sha256 is not null
      );
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.billing_events'::pg_catalog.regclass
       and conname = 'billing_events_type_scope_check'
  ) then
    alter table public.billing_events
      add constraint billing_events_type_scope_check
      check (
        (
          event_scope = 'connected_payment'
          and event_type in (
            'checkout.session.completed',
            'checkout.session.async_payment_succeeded',
            'checkout.session.async_payment_failed',
            'checkout.session.expired',
            'payment_intent.processing',
            'payment_intent.succeeded',
            'payment_intent.payment_failed',
            'payment_intent.canceled',
            'charge.succeeded',
            'charge.failed',
            'charge.refunded',
            'charge.refund.updated',
            'charge.dispute.created',
            'charge.dispute.updated',
            'charge.dispute.closed',
            'charge.dispute.funds_reinstated',
            'charge.dispute.funds_withdrawn',
            'refund.created',
            'refund.updated',
            'refund.failed'
          )
        )
        or (
          event_scope = 'platform_subscription'
          and event_type in (
            'customer.subscription.created',
            'customer.subscription.updated',
            'customer.subscription.deleted',
            'customer.subscription.paused',
            'customer.subscription.resumed',
            'customer.subscription.pending_update_applied',
            'customer.subscription.pending_update_expired',
            'customer.subscription.trial_will_end',
            'invoice.created',
            'invoice.updated',
            'invoice.finalized',
            'invoice.finalization_failed',
            'invoice.paid',
            'invoice.payment_succeeded',
            'invoice.payment_failed',
            'invoice.payment_action_required',
            'invoice.marked_uncollectible',
            'invoice.voided'
          )
        )
      );
  end if;
end
$$;

comment on column public.billing_events.event_scope is
  'Explicit purpose boundary: platform subscription or connected-account direct payment. Platform top-ups stay disabled until a durable operation maps the Stripe object to a workspace purchase.';
comment on column public.billing_events.payload is
  'PII-minimized canonical envelope only. Raw request bodies and full Stripe data.object payloads are intentionally not persisted by the inbox RPC.';
comment on column public.billing_events.payload_sha256 is
  'SHA-256 of the stored canonical redacted envelope, not of the raw webhook body.';

create or replace function public.protect_billing_event_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if old.event_scope is distinct from new.event_scope then
    raise exception 'billing event scope is immutable' using errcode = '22000';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_billing_event_scope_update_trigger on public.billing_events;
create trigger protect_billing_event_scope_update_trigger
before update of event_scope on public.billing_events
for each row execute function public.protect_billing_event_scope();

revoke all on function public.protect_billing_event_scope()
  from public, anon, authenticated, service_role;

create or replace function public.ingest_stripe_event_inbox(
  p_provider_event_id text,
  p_event_type text,
  p_event_scope text,
  p_provider_account_id text,
  p_livemode boolean,
  p_api_version text,
  p_provider_created_at timestamptz,
  p_payload jsonb
)
returns table (
  billing_event_id uuid,
  inserted boolean,
  workspace_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_existing public.billing_events%rowtype;
  v_inserted_id uuid;
  v_workspace_id uuid;
  v_workspace_ids uuid[];
  v_expected_object_type text;
  v_payload_sha256 text;
begin
  if p_provider_event_id is null
     or p_provider_event_id !~ '^evt_[A-Za-z0-9_]{8,}$'
     or pg_catalog.length(p_provider_event_id) > 255 then
    raise exception 'invalid Stripe event ID' using errcode = '22023';
  end if;
  if p_event_type is null
     or p_event_type !~ '^[a-z0-9_]+(?:[.][a-z0-9_]+)+$'
     or pg_catalog.length(p_event_type) > 128 then
    raise exception 'invalid Stripe event type' using errcode = '22023';
  end if;
  if p_livemode is null then
    raise exception 'Stripe event livemode must be explicit' using errcode = '22023';
  end if;
  if p_provider_created_at is null or p_provider_created_at <= '2000-01-01 00:00:00+00'::timestamptz then
    raise exception 'invalid Stripe event creation time' using errcode = '22023';
  end if;
  if p_api_version is not null
     and (
       pg_catalog.length(pg_catalog.btrim(p_api_version)) = 0
       or pg_catalog.length(p_api_version) > 64
     ) then
    raise exception 'invalid Stripe event API version' using errcode = '22023';
  end if;
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Stripe event envelope must be a JSON object' using errcode = '22023';
  end if;
  -- The RPC itself enforces the PII-minimized envelope. A future caller cannot
  -- accidentally persist metadata, emails, client secrets, or the raw object by
  -- adding fields to either the root or the nested event/object records.
  if not (p_payload ?& array['schema', 'scope', 'event', 'data_object'])
     or (p_payload - array['schema', 'scope', 'event', 'data_object']::text[]) <> '{}'::jsonb
     or pg_catalog.jsonb_typeof(p_payload->'event') is distinct from 'object'
     or not ((p_payload->'event') ?& array['id', 'type', 'account', 'livemode', 'api_version', 'created'])
     or ((p_payload->'event') - array['id', 'type', 'account', 'livemode', 'api_version', 'created']::text[]) <> '{}'::jsonb
     or pg_catalog.jsonb_typeof(p_payload->'data_object') is distinct from 'object'
     or not ((p_payload->'data_object') ?& array['id', 'object'])
     or ((p_payload->'data_object') - array['id', 'object']::text[]) <> '{}'::jsonb then
    raise exception 'Stripe event envelope contains an unsupported shape or field' using errcode = '22023';
  end if;

  if p_payload->>'schema' is distinct from 'lgq.stripe-event-inbox.v1'
     or p_payload->>'scope' is distinct from p_event_scope
     or p_payload #>> '{event,id}' is distinct from p_provider_event_id
     or p_payload #>> '{event,type}' is distinct from p_event_type
     or p_payload #>> '{event,account}' is distinct from p_provider_account_id
     or p_payload #> '{event,livemode}' is distinct from pg_catalog.to_jsonb(p_livemode)
     or p_payload #>> '{event,api_version}' is distinct from p_api_version
     or pg_catalog.jsonb_typeof(p_payload #> '{event,created}') is distinct from 'number'
     or (p_payload #>> '{event,created}') !~ '^[0-9]+$'
     or pg_catalog.to_timestamp((p_payload #>> '{event,created}')::double precision) is distinct from p_provider_created_at
     or pg_catalog.jsonb_typeof(p_payload #> '{data_object,id}') is distinct from 'string'
     or pg_catalog.length(pg_catalog.btrim(p_payload #>> '{data_object,id}')) = 0
     or pg_catalog.length(p_payload #>> '{data_object,id}') > 255
     or pg_catalog.jsonb_typeof(p_payload #> '{data_object,object}') is distinct from 'string'
     or pg_catalog.length(pg_catalog.btrim(p_payload #>> '{data_object,object}')) = 0
     or pg_catalog.length(p_payload #>> '{data_object,object}') > 64 then
    raise exception 'Stripe event envelope does not match its immutable receipt fields' using errcode = '22023';
  end if;

  if p_event_scope = 'connected_payment' then
    if p_event_type not in (
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
      'checkout.session.async_payment_failed',
      'checkout.session.expired',
      'payment_intent.processing',
      'payment_intent.succeeded',
      'payment_intent.payment_failed',
      'payment_intent.canceled',
      'charge.succeeded',
      'charge.failed',
      'charge.refunded',
      'charge.refund.updated',
      'charge.dispute.created',
      'charge.dispute.updated',
      'charge.dispute.closed',
      'charge.dispute.funds_reinstated',
      'charge.dispute.funds_withdrawn',
      'refund.created',
      'refund.updated',
      'refund.failed'
    ) then
      raise exception 'unsupported Stripe payment event type for scope %: %', p_event_scope, p_event_type using errcode = '22023';
    end if;
    if p_provider_account_id is null
       or p_provider_account_id !~ '^acct_[A-Za-z0-9]{8,}$'
       or pg_catalog.length(p_provider_account_id) > 255 then
      raise exception 'connected-account payment events require a valid event.account' using errcode = '22023';
    end if;
    if p_event_type like 'checkout.session.%' then
      v_expected_object_type := 'checkout.session';
    elsif p_event_type like 'payment_intent.%' then
      v_expected_object_type := 'payment_intent';
    elsif p_event_type like 'charge.dispute.%' then
      v_expected_object_type := 'dispute';
    elsif p_event_type = 'charge.refund.updated' or p_event_type like 'refund.%' then
      v_expected_object_type := 'refund';
    else
      v_expected_object_type := 'charge';
    end if;
  elsif p_event_scope = 'platform_subscription' then
    if p_event_type not in (
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'customer.subscription.paused',
      'customer.subscription.resumed',
      'customer.subscription.pending_update_applied',
      'customer.subscription.pending_update_expired',
      'customer.subscription.trial_will_end',
      'invoice.created',
      'invoice.updated',
      'invoice.finalized',
      'invoice.finalization_failed',
      'invoice.paid',
      'invoice.payment_succeeded',
      'invoice.payment_failed',
      'invoice.payment_action_required',
      'invoice.marked_uncollectible',
      'invoice.voided'
    ) then
      raise exception 'unsupported platform subscription event type: %', p_event_type using errcode = '22023';
    end if;
    if p_provider_account_id is not null then
      raise exception 'platform subscription events must not contain event.account' using errcode = '22023';
    end if;
    if p_event_type like 'customer.subscription.%' then
      v_expected_object_type := 'subscription';
    else
      v_expected_object_type := 'invoice';
    end if;
  else
    raise exception 'unsupported Stripe event scope: %', p_event_scope using errcode = '22023';
  end if;

  if p_payload #>> '{data_object,object}' is distinct from v_expected_object_type then
    raise exception 'Stripe event type and data.object type do not match' using errcode = '22023';
  end if;

  -- Hash the exact canonical JSONB representation that is persisted. Do not
  -- trust a caller-supplied digest or JavaScript object-key ordering.
  v_payload_sha256 := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );

  -- Fast replay path: a previously accepted immutable receipt does not depend
  -- on the Merchant mapping still being current at the time Stripe retries it.
  select e.*
    into v_existing
    from public.billing_events e
   where e.provider = 'stripe'
     and e.provider_event_id = p_provider_event_id
   for update;

  if found then
    if v_existing.event_type is distinct from p_event_type
       or v_existing.event_scope is distinct from p_event_scope
       or v_existing.provider_account_id is distinct from p_provider_account_id
       or v_existing.livemode is distinct from p_livemode
       or v_existing.api_version is distinct from p_api_version
       or v_existing.provider_created_at is distinct from p_provider_created_at
       or v_existing.payload is distinct from p_payload
       or v_existing.payload_sha256 is distinct from v_payload_sha256 then
      raise exception 'Stripe event ID was already received with different immutable input'
        using errcode = '23505';
    end if;
    return query select v_existing.id, false, v_existing.account_id;
    return;
  end if;

  v_workspace_id := null;
  if p_event_scope = 'connected_payment' then
    -- Lock every matching mapping in deterministic workspace order. The current
    -- schema's unique Merchant-account index means cardinality can only be 0/1,
    -- but the explicit count keeps this RPC fail-closed if that index is absent.
    select pg_catalog.array_agg(m.id order by m.id)
      into v_workspace_ids
      from (
        select a.id
          from public.accounts a
         where a.stripe_merchant_account_id = p_provider_account_id
           and a.merchant_livemode = p_livemode
         order by a.id
         for key share
      ) as m;

    if coalesce(pg_catalog.cardinality(v_workspace_ids), 0) <> 1 then
      raise exception 'event.account and livemode must map to exactly one workspace Merchant account'
        using errcode = '23503';
    end if;
    v_workspace_id := v_workspace_ids[1];
  end if;

  insert into public.billing_events (
    provider,
    provider_event_id,
    event_type,
    event_scope,
    account_id,
    provider_account_id,
    livemode,
    api_version,
    provider_created_at,
    payload,
    payload_sha256
  ) values (
    'stripe',
    p_provider_event_id,
    p_event_type,
    p_event_scope,
    v_workspace_id,
    p_provider_account_id,
    p_livemode,
    p_api_version,
    p_provider_created_at,
    p_payload,
    v_payload_sha256
  )
  on conflict on constraint billing_events_provider_event_unique do nothing
  returning id into v_inserted_id;

  if v_inserted_id is not null then
    return query select v_inserted_id, true, v_workspace_id;
    return;
  end if;

  -- A concurrent delivery won the unique insert. Compare every immutable input
  -- before returning replay so an ID collision cannot be silently acknowledged.
  select e.*
    into v_existing
    from public.billing_events e
   where e.provider = 'stripe'
     and e.provider_event_id = p_provider_event_id
   for update;

  if not found then
    raise exception 'Stripe event conflict did not resolve to a durable inbox row' using errcode = '40001';
  end if;
  if v_existing.event_type is distinct from p_event_type
     or v_existing.event_scope is distinct from p_event_scope
     or v_existing.provider_account_id is distinct from p_provider_account_id
     or v_existing.livemode is distinct from p_livemode
     or v_existing.api_version is distinct from p_api_version
     or v_existing.provider_created_at is distinct from p_provider_created_at
     or v_existing.payload is distinct from p_payload
     or v_existing.payload_sha256 is distinct from v_payload_sha256
     or (
       p_event_scope = 'connected_payment'
       and v_existing.account_id is distinct from v_workspace_id
     ) then
    raise exception 'Stripe event ID was concurrently received with different immutable input'
      using errcode = '23505';
  end if;

  return query select v_existing.id, false, v_existing.account_id;
end;
$$;

-- There is no processor in this dark layer. Permit inspection only; a later
-- processing migration must expose narrow claim/resolve/complete RPCs rather
-- than restoring raw UPDATE or INSERT access.
revoke all on table public.billing_events
  from public, anon, authenticated, service_role;
grant select on table public.billing_events to service_role;

revoke all on function public.ingest_stripe_event_inbox(text, text, text, text, boolean, text, timestamptz, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.ingest_stripe_event_inbox(text, text, text, text, boolean, text, timestamptz, jsonb)
  to service_role;

commit;
