-- Adversarial hardening for dedicated SignalWire number provisioning.
--
-- This migration quarantines legacy active inventory that predates the final
-- carrier/phone proof, makes carrier spend policy authoritative in Postgres,
-- standardizes operation lock order, and keeps carrier downgrades durable.
-- It performs no provider request and creates no sellable entitlement.

begin;

-- -------------------------------------------------------------------------
-- 1. Authoritative carrier spend policy and immutable operation snapshots.
-- -------------------------------------------------------------------------

create table if not exists public.messaging_number_spend_policies (
  provider text primary key check (provider = 'signalwire'),
  currency text not null default 'USD' check (currency = 'USD'),
  monthly_unit_price_cents bigint not null
    check (monthly_unit_price_cents between 1 and 999999999),
  aggregate_monthly_ceiling_cents bigint not null
    check (
      aggregate_monthly_ceiling_cents between 1 and 999999999
      and aggregate_monthly_ceiling_cents >= monthly_unit_price_cents
    ),
  revision bigint not null default 1 check (revision between 1 and 2147483647),
  updated_by text not null check (pg_catalog.length(updated_by) between 3 and 320),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

alter table public.messaging_number_provisioning_operations
  add column if not exists monthly_unit_price_cents bigint,
  add column if not exists aggregate_monthly_ceiling_cents bigint,
  add column if not exists spend_policy_revision bigint;

alter table public.messaging_number_provisioning_operations
  drop constraint if exists messaging_number_operation_spend_snapshot_shape;
alter table public.messaging_number_provisioning_operations
  add constraint messaging_number_operation_spend_snapshot_shape check (
    (
      operation_type <> 'purchase_number'
      and monthly_unit_price_cents is null
      and aggregate_monthly_ceiling_cents is null
      and spend_policy_revision is null
    )
    or (
      operation_type = 'purchase_number'
      and (
        (
          monthly_unit_price_cents is null
          and aggregate_monthly_ceiling_cents is null
          and spend_policy_revision is null
        )
        or (
          monthly_unit_price_cents between 1 and 999999999
          and aggregate_monthly_ceiling_cents between monthly_unit_price_cents and 999999999
          and spend_policy_revision between 1 and 2147483647
        )
      )
    )
  );

create or replace function public.set_messaging_number_spend_policy(
  p_provider text,
  p_monthly_unit_price_cents bigint,
  p_aggregate_monthly_ceiling_cents bigint,
  p_actor_reference text
)
returns table (
  provider text,
  currency text,
  monthly_unit_price_cents bigint,
  aggregate_monthly_ceiling_cents bigint,
  revision bigint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_policy public.messaging_number_spend_policies%rowtype;
begin
  if p_provider <> 'signalwire'
     or p_monthly_unit_price_cents not between 1 and 999999999
     or p_aggregate_monthly_ceiling_cents not between p_monthly_unit_price_cents and 999999999
     or pg_catalog.length(pg_catalog.btrim(coalesce(p_actor_reference, ''))) not between 3 and 320 then
    raise exception 'Messaging number spend policy input is invalid' using errcode = '22023';
  end if;

  -- The setter and every purchase claim share this transaction lock. A policy
  -- can never change between a claim's price comparison and spend reservation.
  perform pg_catalog.pg_advisory_xact_lock(1280265031, 2108);

  insert into public.messaging_number_spend_policies as policy (
    provider, currency, monthly_unit_price_cents,
    aggregate_monthly_ceiling_cents, revision, updated_by,
    created_at, updated_at
  ) values (
    p_provider, 'USD', p_monthly_unit_price_cents,
    p_aggregate_monthly_ceiling_cents, 1,
    pg_catalog.btrim(p_actor_reference), v_now, v_now
  )
  on conflict on constraint messaging_number_spend_policies_pkey do update
    set monthly_unit_price_cents = excluded.monthly_unit_price_cents,
        aggregate_monthly_ceiling_cents = excluded.aggregate_monthly_ceiling_cents,
        revision = policy.revision + 1,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
  returning * into v_policy;

  -- A reviewed policy is also the explicit backfill authority for legacy
  -- purchase operations which predate durable price snapshots. No default or
  -- guessed carrier price is introduced by the migration itself.
  update public.messaging_number_provisioning_operations o
     set monthly_unit_price_cents = v_policy.monthly_unit_price_cents,
         aggregate_monthly_ceiling_cents = v_policy.aggregate_monthly_ceiling_cents,
         spend_policy_revision = v_policy.revision,
         updated_at = v_now
    from public.messaging_registration_applications a
   where a.id = o.application_id
     and a.provider = v_policy.provider
     and o.operation_type = 'purchase_number'
     and o.monthly_unit_price_cents is null
     and o.aggregate_monthly_ceiling_cents is null
     and o.spend_policy_revision is null;

  return query select
    v_policy.provider,
    v_policy.currency,
    v_policy.monthly_unit_price_cents,
    v_policy.aggregate_monthly_ceiling_cents,
    v_policy.revision,
    v_policy.updated_at;
end;
$$;

-- -------------------------------------------------------------------------
-- 2. Final phone proof and validated activation invariants.
-- -------------------------------------------------------------------------

alter table public.messaging_registration_applications
  add column if not exists provider_phone_verified_at timestamptz,
  add column if not exists provider_sms_capable boolean,
  add column if not exists inbound_message_handler text;

alter table public.sms_sender_numbers
  add column if not exists provider_brand_state text,
  add column if not exists provider_campaign_state text,
  add column if not exists provider_verified_at timestamptz,
  add column if not exists provider_phone_verified_at timestamptz,
  add column if not exists provider_sms_capable boolean,
  add column if not exists inbound_message_handler text;

-- Quarantine every legacy active application which cannot prove the final
-- carrier campaign, current phone identity/SMS capability, and POST handler.
update public.messaging_registration_applications
   set status = 'suspended',
       status_detail = 'Dedicated messaging was paused until carrier campaign, SMS capability, and production POST webhook evidence are reverified.',
       suspended_at = coalesce(suspended_at, pg_catalog.clock_timestamp()),
       updated_at = pg_catalog.clock_timestamp()
 where status = 'active'
   and (
     provider_brand_state is distinct from 'complete'
     or provider_campaign_state is distinct from 'complete'
     or provider_verified_at is null
     or provider_phone_verified_at is null
     or provider_sms_capable is distinct from true
     or inbound_request_method is distinct from 'POST'
     or pg_catalog.lower(coalesce(inbound_message_handler, '')) <> 'laml_webhooks'
   );

-- Sender inventory is the egress authority, so it receives an independent
-- quarantine even when its application projection is absent or inconsistent.
update public.sms_sender_numbers s
   set provisioning_status = 'suspended',
       assignment_state = 'suspended',
       suspended_at = coalesce(s.suspended_at, pg_catalog.clock_timestamp()),
       updated_at = pg_catalog.clock_timestamp()
 where s.provisioning_status = 'active'
   and (
     s.provider_brand_state is distinct from 'complete'
     or s.provider_campaign_state is distinct from 'complete'
     or s.provider_verified_at is null
     or s.provider_phone_verified_at is null
     or s.provider_sms_capable is distinct from true
     or s.inbound_request_method is distinct from 'POST'
     or pg_catalog.lower(coalesce(s.inbound_message_handler, '')) <> 'laml_webhooks'
     or not exists (
       select 1
         from public.messaging_registration_applications a
        where a.id = s.provisioning_application_id
          and a.account_id = s.account_id
          and a.provider = s.provider
          and a.provider_number_id = s.provider_number_id
          and a.purchased_number = s.e164_number
          and a.provider_brand_id = s.brand_id
          and a.provider_campaign_id = s.campaign_id
          and a.status = 'active'
     )
   );

-- If sender quarantine exposed an otherwise-valid but orphaned active
-- application, quarantine that projection too.
update public.messaging_registration_applications a
   set status = 'suspended',
       status_detail = 'Dedicated messaging was paused because its canonical sender inventory is not fully verified.',
       suspended_at = coalesce(a.suspended_at, pg_catalog.clock_timestamp()),
       updated_at = pg_catalog.clock_timestamp()
 where a.status = 'active'
   and not exists (
     select 1
       from public.sms_sender_numbers s
      where s.provisioning_application_id = a.id
        and s.account_id = a.account_id
        and s.provider = a.provider
        and s.provider_number_id = a.provider_number_id
        and s.e164_number = a.purchased_number
        and s.provisioning_status = 'active'
        and s.assignment_state = 'assigned'
        and s.inbound_ready
        and s.suspended_at is null
   );

update public.messaging_registrations r
   set status = 'action_required',
       assigned_number = null,
       status_detail = 'Dedicated messaging is paused while carrier and phone configuration are reverified.',
       decided_at = pg_catalog.clock_timestamp(),
       updated_at = pg_catalog.clock_timestamp()
  from public.messaging_registration_applications a
 where a.account_id = r.account_id
   and a.status = 'suspended'
   and a.status_detail in (
     'Dedicated messaging was paused until carrier campaign, SMS capability, and production POST webhook evidence are reverified.',
     'Dedicated messaging was paused because its canonical sender inventory is not fully verified.'
   );

insert into public.messaging_registration_events (
  application_id, account_id, event_type, actor_type, actor_reference,
  previous_status, new_status, detail, metadata
)
select
  a.id, a.account_id, 'legacy_active_inventory_quarantined', 'system',
  'migration:20260821204404', 'active', 'suspended', a.status_detail,
  pg_catalog.jsonb_build_object('migration', '20260821204404')
from public.messaging_registration_applications a
where a.status = 'suspended'
  and a.status_detail in (
    'Dedicated messaging was paused until carrier campaign, SMS capability, and production POST webhook evidence are reverified.',
    'Dedicated messaging was paused because its canonical sender inventory is not fully verified.'
  )
  and not exists (
    select 1
      from public.messaging_registration_events e
     where e.application_id = a.id
       and e.event_type = 'legacy_active_inventory_quarantined'
       and e.metadata->>'migration' = '20260821204404'
  );

alter table public.messaging_registration_applications
  drop constraint if exists messaging_registration_application_verified_activation_shape;
alter table public.messaging_registration_applications
  add constraint messaging_registration_application_verified_activation_shape check (
    status <> 'active'
    or (
      provider_brand_state is not distinct from 'complete'
      and provider_campaign_state is not distinct from 'complete'
      and provider_verified_at is not null
      and provider_phone_verified_at is not null
      and provider_sms_capable is true
      and inbound_request_method is not distinct from 'POST'
      and pg_catalog.lower(coalesce(inbound_message_handler, '')) = 'laml_webhooks'
    )
  );

alter table public.sms_sender_numbers
  drop constraint if exists sms_sender_numbers_activation_shape;
alter table public.sms_sender_numbers
  add constraint sms_sender_numbers_activation_shape check (
    provisioning_status <> 'active'
    or (
      assignment_state = 'assigned'
      and inbound_ready
      and activated_at is not null
      and suspended_at is null
      and provider_brand_state is not distinct from 'complete'
      and provider_campaign_state is not distinct from 'complete'
      and provider_verified_at is not null
      and provider_phone_verified_at is not null
      and provider_sms_capable is true
      and inbound_request_method is not distinct from 'POST'
      and pg_catalog.lower(coalesce(inbound_message_handler, '')) = 'laml_webhooks'
    )
  );

-- -------------------------------------------------------------------------
-- 3. Bound applications cannot rewrite identity or re-enter review.
-- -------------------------------------------------------------------------

create or replace function public.prevent_bound_messaging_application_resubmission()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  -- Owner resubmission is the only supported revision-changing update. Inspect
  -- OLD so a single statement cannot silently clear carrier evidence and then
  -- rewrite the reviewed business identity.
  if new.revision is distinct from old.revision
     and (
       old.provider_brand_id is not null
       or old.provider_campaign_id is not null
       or old.provider_number_id is not null
       or old.purchased_number is not null
       or old.candidate_number is not null
       or old.assignment_order_id is not null
       or old.assignment_id is not null
       or exists (
         select 1
           from public.messaging_number_provisioning_operations o
          where o.application_id = old.id
       )
       or exists (
         select 1
           from public.sms_sender_numbers s
          where s.provisioning_application_id = old.id
       )
     ) then
    raise exception 'A carrier-bound messaging application cannot be resubmitted; operations must review and invalidate the binding explicitly'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists messaging_registration_applications_bound_resubmission_guard
  on public.messaging_registration_applications;
create trigger messaging_registration_applications_bound_resubmission_guard
before update of revision on public.messaging_registration_applications
for each row execute function public.prevent_bound_messaging_application_resubmission();

create or replace function public.review_messaging_registration_application_v2(
  p_application_id uuid,
  p_decision text,
  p_detail text,
  p_provider_brand_id text,
  p_provider_campaign_id text,
  p_provider_brand_state text,
  p_provider_campaign_state text,
  p_provider_campaign_use_case text,
  p_verified_legal_business_name text,
  p_verified_dba_name text,
  p_verified_website_host text,
  p_verified_ein_last_four text,
  p_provider_verified_at timestamptz,
  p_actor_reference text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_application public.messaging_registration_applications%rowtype;
  v_compliance public.messaging_compliance_verifications%rowtype;
  v_previous text;
  v_projection text;
  v_expected_host text;
begin
  if p_decision not in ('under_review', 'action_required', 'approved', 'rejected') then
    raise exception 'Messaging application review decision is invalid' using errcode = '22023';
  end if;
  select * into strict v_application
    from public.messaging_registration_applications
   where id = p_application_id
   for update;
  if v_application.status not in ('submitted', 'under_review', 'action_required', 'rejected')
     or v_application.provider_brand_id is not null
     or v_application.provider_campaign_id is not null
     or v_application.provider_number_id is not null
     or v_application.purchased_number is not null
     or exists (
       select 1
         from public.messaging_number_provisioning_operations o
        where o.application_id = v_application.id
     ) then
    raise exception 'An approved or carrier-bound messaging application is immutable in the review RPC'
      using errcode = '55000';
  end if;
  if p_decision in ('action_required', 'rejected')
     and pg_catalog.length(coalesce(p_detail, '')) < 10 then
    raise exception 'A clear review reason is required' using errcode = '22023';
  end if;

  if p_decision = 'approved' then
    select * into strict v_compliance
      from public.messaging_compliance_verifications
     where application_id = v_application.id
       and account_id = v_application.account_id
       and application_revision = v_application.revision
     for update;
    v_expected_host := pg_catalog.lower(pg_catalog.split_part(
      pg_catalog.regexp_replace(v_application.website_url, '^https://', '', 'i'), '/', 1
    ));
    v_expected_host := pg_catalog.split_part(v_expected_host, ':', 1);
    v_expected_host := pg_catalog.regexp_replace(v_expected_host, '^www\.', '');

    if coalesce(p_provider_brand_id, '') !~ '^[0-9a-fA-F-]{36}$'
       or coalesce(p_provider_campaign_id, '') !~ '^[0-9a-fA-F-]{36}$'
       or pg_catalog.lower(coalesce(p_provider_brand_state, '')) <> 'complete'
       or pg_catalog.lower(coalesce(p_provider_campaign_state, '')) <> 'complete'
       or pg_catalog.length(coalesce(p_provider_campaign_use_case, '')) < 2
       or p_provider_verified_at is null
       or p_provider_verified_at < v_now - interval '10 minutes'
       or p_provider_verified_at > v_now + interval '2 minutes'
       or p_verified_legal_business_name is distinct from v_application.legal_business_name
       or p_verified_dba_name is distinct from v_application.dba_name
       or pg_catalog.lower(coalesce(p_verified_website_host, '')) <> v_expected_host
       or p_verified_ein_last_four is distinct from v_compliance.ein_last_four then
      raise exception 'Approval requires a fresh carrier-complete campaign bound to this exact business revision'
        using errcode = '55000';
    end if;
  end if;

  v_previous := v_application.status;
  update public.messaging_registration_applications
     set status = p_decision,
         status_detail = nullif(p_detail, ''),
         provider_brand_id = case when p_decision = 'approved' then p_provider_brand_id else provider_brand_id end,
         provider_campaign_id = case when p_decision = 'approved' then p_provider_campaign_id else provider_campaign_id end,
         provider_brand_state = case when p_decision = 'approved' then 'complete' else null end,
         provider_campaign_state = case when p_decision = 'approved' then 'complete' else null end,
         provider_campaign_use_case = case when p_decision = 'approved' then p_provider_campaign_use_case else null end,
         provider_verified_at = case when p_decision = 'approved' then p_provider_verified_at else null end,
         provider_verified_legal_name = case when p_decision = 'approved' then p_verified_legal_business_name else null end,
         provider_verified_dba_name = case when p_decision = 'approved' then p_verified_dba_name else null end,
         provider_verified_website_host = case when p_decision = 'approved' then p_verified_website_host else null end,
         reviewed_by = p_actor_reference,
         reviewed_at = v_now,
         updated_at = v_now
   where id = p_application_id;

  v_projection := case
    when p_decision in ('under_review', 'approved') then 'in_review'
    when p_decision = 'action_required' then 'action_required'
    else 'rejected'
  end;
  update public.messaging_registrations
     set status = v_projection,
         status_detail = nullif(p_detail, ''),
         provider = 'signalwire',
         provider_reference = p_application_id::text,
         decided_at = case when p_decision in ('action_required', 'rejected') then v_now else null end,
         updated_at = v_now
   where account_id = v_application.account_id;

  insert into public.messaging_registration_events (
    application_id, account_id, event_type, actor_type, actor_reference,
    previous_status, new_status, detail, metadata
  ) values (
    p_application_id, v_application.account_id, 'application_reviewed',
    'staff', p_actor_reference, v_previous, p_decision, nullif(p_detail, ''),
    pg_catalog.jsonb_build_object(
      'provider_brand_id', p_provider_brand_id,
      'provider_campaign_id', p_provider_campaign_id,
      'brand_state', case when p_decision = 'approved' then 'complete' else null end,
      'campaign_state', case when p_decision = 'approved' then 'complete' else null end
    )
  );
  return p_decision;
end;
$$;

-- Compliance evidence is immutable after carrier approval, even when a later
-- carrier downgrade changes the workflow status to action_required.
create or replace function public.record_messaging_compliance_verification(
  p_application_id uuid,
  p_ein_last_four text,
  p_verification_reference text,
  p_actor_reference text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_application public.messaging_registration_applications%rowtype;
begin
  if p_application_id is null
     or coalesce(p_ein_last_four, '') !~ '^[0-9]{4}$'
     or pg_catalog.length(pg_catalog.btrim(coalesce(p_verification_reference, ''))) not between 4 and 255
     or pg_catalog.btrim(coalesce(p_verification_reference, '')) ~ '(^|[^0-9])[0-9]{2}-?[0-9]{7}([^0-9]|$)'
     or pg_catalog.length(pg_catalog.regexp_replace(coalesce(p_verification_reference, ''), '[^0-9]', '', 'g')) = 9
     or pg_catalog.length(pg_catalog.btrim(coalesce(p_actor_reference, ''))) not between 3 and 320 then
    raise exception 'Messaging compliance verification input is invalid' using errcode = '22023';
  end if;

  select * into strict v_application
    from public.messaging_registration_applications
   where id = p_application_id
   for update;

  if v_application.status not in ('submitted', 'under_review', 'action_required', 'rejected')
     or v_application.provider_brand_id is not null
     or v_application.provider_campaign_id is not null
     or v_application.provider_number_id is not null then
    raise exception 'Approved or provisioned compliance evidence is immutable; clear the carrier binding through a reviewed invalidation before reverifying'
      using errcode = '55000';
  end if;

  insert into public.messaging_compliance_verifications (
    application_id, account_id, application_revision, ein_last_four,
    verification_reference, verified_at, verified_by, created_at, updated_at
  ) values (
    v_application.id, v_application.account_id, v_application.revision,
    p_ein_last_four, pg_catalog.btrim(p_verification_reference), v_now,
    pg_catalog.btrim(p_actor_reference), v_now, v_now
  )
  on conflict (application_id) do update
    set account_id = excluded.account_id,
        application_revision = excluded.application_revision,
        ein_last_four = excluded.ein_last_four,
        verification_reference = excluded.verification_reference,
        verified_at = excluded.verified_at,
        verified_by = excluded.verified_by,
        updated_at = excluded.updated_at;

  insert into public.messaging_registration_events (
    application_id, account_id, event_type, actor_type, actor_reference,
    previous_status, new_status, detail, metadata
  ) values (
    v_application.id, v_application.account_id, 'compliance_verified',
    'staff', p_actor_reference, v_application.status, v_application.status,
    'Tax identity verified by MFA operations; only the last four are retained in restricted compliance storage.',
    pg_catalog.jsonb_build_object(
      'application_revision', v_application.revision,
      'ein_last_four_recorded', true
    )
  );
  return true;
end;
$$;

-- -------------------------------------------------------------------------
-- 4. Carrier downgrade snapshots are durable and fail closed.
-- -------------------------------------------------------------------------

create or replace function public.record_messaging_campaign_verification_v2(
  p_application_id uuid,
  p_provider_brand_id text,
  p_provider_campaign_id text,
  p_provider_brand_state text,
  p_provider_campaign_state text,
  p_provider_campaign_use_case text,
  p_verified_legal_business_name text,
  p_verified_dba_name text,
  p_verified_website_host text,
  p_verified_ein_last_four text,
  p_provider_verified_at timestamptz,
  p_actor_reference text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_application public.messaging_registration_applications%rowtype;
  v_compliance public.messaging_compliance_verifications%rowtype;
  v_expected_host text;
  v_brand_state text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_provider_brand_state, '')));
  v_campaign_state text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_provider_campaign_state, '')));
  v_is_complete boolean;
  v_restore_pre_purchase_approval boolean;
  v_new_status text;
begin
  select * into strict v_application
    from public.messaging_registration_applications
   where id = p_application_id
   for update;

  if v_application.status not in ('approved', 'provisioning', 'active', 'suspended', 'action_required')
     or v_application.provider_brand_id is distinct from p_provider_brand_id
     or v_application.provider_campaign_id is distinct from p_provider_campaign_id then
    raise exception 'Campaign verification is not bound to the approved application' using errcode = '55000';
  end if;
  if pg_catalog.length(v_brand_state) not between 2 and 100
     or pg_catalog.length(v_campaign_state) not between 2 and 100
     or p_provider_verified_at is null
     or p_provider_verified_at < v_now - interval '10 minutes'
     or p_provider_verified_at > v_now + interval '2 minutes' then
    raise exception 'Campaign verification snapshot is invalid or stale' using errcode = '55000';
  end if;

  v_is_complete := v_brand_state = 'complete' and v_campaign_state = 'complete';
  if v_is_complete then
    select * into strict v_compliance
      from public.messaging_compliance_verifications
     where application_id = v_application.id
       and account_id = v_application.account_id
       and application_revision = v_application.revision;
    v_expected_host := pg_catalog.lower(pg_catalog.split_part(
      pg_catalog.regexp_replace(v_application.website_url, '^https://', '', 'i'), '/', 1
    ));
    v_expected_host := pg_catalog.split_part(v_expected_host, ':', 1);
    v_expected_host := pg_catalog.regexp_replace(v_expected_host, '^www\.', '');
    if pg_catalog.length(coalesce(p_provider_campaign_use_case, '')) < 2
       or p_verified_legal_business_name is distinct from v_application.legal_business_name
       or p_verified_dba_name is distinct from v_application.dba_name
       or pg_catalog.lower(coalesce(p_verified_website_host, '')) <> v_expected_host
       or p_verified_ein_last_four is distinct from v_compliance.ein_last_four then
      raise exception 'Campaign verification does not match the exact downstream business' using errcode = '55000';
    end if;
  end if;

  -- Only a carrier downgrade recorded by this function may automatically
  -- return an already-reviewed, still-unpurchased application to approved.
  -- Other action-required reasons continue to require an explicit review.
  v_restore_pre_purchase_approval := v_is_complete
    and v_application.status = 'action_required'
    and v_application.provider_number_id is null
    and v_application.status_detail = 'SignalWire reports that the registered brand or campaign is no longer carrier-complete.';
  v_new_status := case
    when v_restore_pre_purchase_approval then 'approved'
    when v_is_complete then v_application.status
    when v_application.provider_number_id is null then 'action_required'
    else 'suspended'
  end;

  update public.messaging_registration_applications
     set provider_brand_state = v_brand_state,
         provider_campaign_state = v_campaign_state,
         provider_campaign_use_case = nullif(p_provider_campaign_use_case, ''),
         provider_verified_at = p_provider_verified_at,
         provider_verified_legal_name = case when v_is_complete then p_verified_legal_business_name else provider_verified_legal_name end,
          provider_verified_dba_name = case when v_is_complete then p_verified_dba_name else provider_verified_dba_name end,
          provider_verified_website_host = case when v_is_complete then p_verified_website_host else provider_verified_website_host end,
          status = v_new_status,
          status_detail = case when v_restore_pre_purchase_approval then null
            when v_is_complete then status_detail
            else 'SignalWire reports that the registered brand or campaign is no longer carrier-complete.' end,
         suspended_at = case when not v_is_complete and provider_number_id is not null
           then coalesce(suspended_at, v_now) else suspended_at end,
         updated_at = v_now
   where id = p_application_id;

  update public.sms_sender_numbers
     set provider_brand_state = v_brand_state,
         provider_campaign_state = v_campaign_state,
         provider_verified_at = p_provider_verified_at,
         provisioning_status = case when v_is_complete then provisioning_status else 'suspended' end,
         assignment_state = case when v_is_complete then assignment_state else 'suspended' end,
         suspended_at = case when v_is_complete then suspended_at else coalesce(suspended_at, v_now) end,
         last_verified_at = v_now,
         updated_at = v_now
   where provisioning_application_id = p_application_id;

  if v_restore_pre_purchase_approval then
    update public.messaging_registrations
       set status = 'in_review', assigned_number = null,
           status_detail = null, decided_at = null, updated_at = v_now
     where account_id = v_application.account_id;
  elsif not v_is_complete then
    update public.messaging_registrations
       set status = 'action_required', assigned_number = null,
           status_detail = 'Dedicated messaging is paused because the carrier brand or campaign is not complete.',
           decided_at = v_now, updated_at = v_now
     where account_id = v_application.account_id;
  end if;

  insert into public.messaging_registration_events (
    application_id, account_id, event_type, actor_type, actor_reference,
    previous_status, new_status, detail, metadata
  ) values (
    v_application.id, v_application.account_id,
    case when v_is_complete then 'provider_campaign_verified' else 'provider_campaign_downgraded' end,
    'staff', p_actor_reference, v_application.status, v_new_status,
    case when v_is_complete then null else 'Carrier brand or campaign state is no longer complete.' end,
    pg_catalog.jsonb_build_object(
      'provider_brand_id', p_provider_brand_id,
      'provider_campaign_id', p_provider_campaign_id,
      'brand_state', v_brand_state,
      'campaign_state', v_campaign_state
    )
  );
  return true;
end;
$$;

-- -------------------------------------------------------------------------
-- 5. Authoritative spend claim with a single application -> operation order.
-- -------------------------------------------------------------------------

create or replace function public.claim_messaging_number_operation_v2(
  p_application_id uuid,
  p_operation_type text,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_request_payload jsonb
)
returns table (
  claim_status text,
  operation_id uuid,
  claim_token uuid,
  operation_state text,
  provider_object_id text,
  provider_result jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_application public.messaging_registration_applications%rowtype;
  v_policy public.messaging_number_spend_policies%rowtype;
  v_existing public.messaging_number_provisioning_operations%rowtype;
  v_claim record;
  v_committed_spend bigint := 0;
  v_additional_spend bigint := 0;
begin
  select * into strict v_application
    from public.messaging_registration_applications
   where id = p_application_id
   for update;

  if p_operation_type = 'purchase_number' then
    select * into v_existing
      from public.messaging_number_provisioning_operations
     where idempotency_key = p_idempotency_key
     for update;

    -- An already-reserved provider mutation must remain replayable under the
    -- immutable policy snapshot it originally claimed. A later policy change
    -- cannot turn an idempotent status check into a new purchase.
    if v_existing.id is not null
       and v_existing.state in ('pending', 'claimed', 'request_started', 'indeterminate', 'succeeded') then
      if v_existing.monthly_unit_price_cents is null
         or v_existing.aggregate_monthly_ceiling_cents is null
         or v_existing.spend_policy_revision is null then
        raise exception 'Existing carrier spend has no authoritative price snapshot' using errcode = '55000';
      end if;
      select * into strict v_claim
        from public.claim_messaging_number_operation(
          p_application_id,
          p_operation_type,
          p_idempotency_key,
          p_request_fingerprint,
          p_request_payload
        );
      return query select
        v_claim.claim_status::text,
        v_claim.operation_id::uuid,
        v_claim.claim_token::uuid,
        v_claim.operation_state::text,
        v_claim.provider_object_id::text,
        v_claim.provider_result::jsonb;
      return;
    end if;

    perform pg_catalog.pg_advisory_xact_lock(1280265031, 2108);
    select * into strict v_policy
      from public.messaging_number_spend_policies
     where provider = v_application.provider
     for update;

    if coalesce(p_request_payload->>'monthly_price_cents', '') !~ '^[1-9][0-9]{0,8}$'
       or coalesce(p_request_payload->>'monthly_spend_ceiling_cents', '') !~ '^[1-9][0-9]{0,8}$'
       or (p_request_payload->>'monthly_price_cents')::bigint <> v_policy.monthly_unit_price_cents
       or (p_request_payload->>'monthly_spend_ceiling_cents')::bigint <> v_policy.aggregate_monthly_ceiling_cents then
      raise exception 'Purchase price and ceiling must exactly match the authoritative database policy'
        using errcode = '22023';
    end if;

    if exists (
      select 1
        from public.messaging_number_provisioning_operations o
        join public.messaging_registration_applications a on a.id = o.application_id
       where a.provider = v_policy.provider
         and o.operation_type = 'purchase_number'
         and (
           (o.state in ('pending', 'claimed', 'request_started', 'indeterminate') and a.provider_number_id is null)
           or (o.state = 'succeeded' and a.provider_number_id is not null)
         )
         and (
           o.monthly_unit_price_cents is null
           or o.aggregate_monthly_ceiling_cents is null
           or o.spend_policy_revision is null
         )
    ) then
      raise exception 'Existing carrier spend has no authoritative price snapshot' using errcode = '55000';
    end if;

    select coalesce(pg_catalog.sum(o.monthly_unit_price_cents), 0)
      into v_committed_spend
      from public.messaging_number_provisioning_operations o
      join public.messaging_registration_applications a on a.id = o.application_id
     where a.provider = v_policy.provider
       and o.operation_type = 'purchase_number'
       and (
         (o.state in ('pending', 'claimed', 'request_started', 'indeterminate') and a.provider_number_id is null)
         or (o.state = 'succeeded' and a.provider_number_id is not null)
       );

    if v_existing.id is null
       or v_existing.state in ('failed', 'cancelled') then
      v_additional_spend := v_policy.monthly_unit_price_cents;
    end if;
    if v_committed_spend + v_additional_spend > v_policy.aggregate_monthly_ceiling_cents then
      raise exception 'This purchase would exceed the authoritative aggregate monthly dedicated-number spend ceiling'
        using errcode = '54000';
    end if;
  elsif p_operation_type = 'assign_campaign' then
    if v_application.provider_brand_state <> 'complete'
       or v_application.provider_campaign_state <> 'complete'
       or v_application.provider_verified_at is null
       or v_application.provider_verified_at < v_now - interval '10 minutes'
       or v_application.provider_verified_at > v_now + interval '2 minutes' then
      raise exception 'Campaign assignment requires a fresh carrier-complete business binding'
        using errcode = '55000';
    end if;
  end if;

  select * into strict v_claim
    from public.claim_messaging_number_operation(
      p_application_id,
      p_operation_type,
      p_idempotency_key,
      p_request_fingerprint,
      p_request_payload
    );

  if p_operation_type = 'purchase_number' then
    update public.messaging_number_provisioning_operations
       set monthly_unit_price_cents = coalesce(monthly_unit_price_cents, v_policy.monthly_unit_price_cents),
           aggregate_monthly_ceiling_cents = coalesce(aggregate_monthly_ceiling_cents, v_policy.aggregate_monthly_ceiling_cents),
           spend_policy_revision = coalesce(spend_policy_revision, v_policy.revision),
           updated_at = v_now
     where id = v_claim.operation_id
       and (monthly_unit_price_cents is null or monthly_unit_price_cents = v_policy.monthly_unit_price_cents)
       and (aggregate_monthly_ceiling_cents is null or aggregate_monthly_ceiling_cents = v_policy.aggregate_monthly_ceiling_cents);
    if not found then
      raise exception 'Purchase operation price snapshot conflicts with the authoritative policy'
        using errcode = '55000';
    end if;
  end if;

  return query select
    v_claim.claim_status::text,
    v_claim.operation_id::uuid,
    v_claim.claim_token::uuid,
    v_claim.operation_state::text,
    v_claim.provider_object_id::text,
    v_claim.provider_result::jsonb;
end;
$$;

-- -------------------------------------------------------------------------
-- 6. Consistent application -> operation completion locks and exact IDs.
-- -------------------------------------------------------------------------

create or replace function public.complete_messaging_number_operation(
  p_operation_id uuid,
  p_claim_token uuid,
  p_provider_object_id text,
  p_provider_result jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_application_id uuid;
  v_operation public.messaging_number_provisioning_operations%rowtype;
  v_application public.messaging_registration_applications%rowtype;
  v_number text;
  v_provider_number_id text;
  v_inbound_url text;
  v_inbound_handler text;
  v_sender public.sms_sender_numbers%rowtype;
begin
  select application_id into strict v_application_id
    from public.messaging_number_provisioning_operations
   where id = p_operation_id;
  select * into strict v_application
    from public.messaging_registration_applications
   where id = v_application_id
   for update;
  select * into strict v_operation
    from public.messaging_number_provisioning_operations
   where id = p_operation_id
   for update;
  if v_operation.application_id <> v_application.id then
    raise exception 'Messaging number operation application changed while locking' using errcode = '55000';
  end if;
  if v_operation.state <> 'request_started' or v_operation.claim_token <> p_claim_token then
    raise exception 'Messaging number operation is not at its completion boundary' using errcode = '55000';
  end if;

  if v_operation.operation_type = 'purchase_number' then
    v_number := p_provider_result->>'number';
    v_provider_number_id := p_provider_result->>'id';
    if v_number is distinct from (v_operation.request_payload->>'number')
       or v_number !~ '^\+[1-9][0-9]{7,14}$'
       or pg_catalog.length(coalesce(v_provider_number_id, '')) < 8 then
      raise exception 'Purchased number response does not match the claimed candidate' using errcode = '22000';
    end if;
    update public.messaging_registration_applications
       set status = 'provisioning', provider_number_id = v_provider_number_id,
           purchased_number = v_number, purchased_at = v_now,
           candidate_expires_at = null, status_detail = null, updated_at = v_now
     where id = v_application.id;
    insert into public.sms_sender_numbers (
      provider, e164_number, provider_number_id, purpose, account_id,
      brand_id, campaign_id, assignment_state, provisioning_status,
      inbound_ready, provisioning_application_id, updated_at
    ) values (
      'signalwire', v_number, v_provider_number_id, 'contractor_dedicated',
      v_application.account_id, v_application.provider_brand_id,
      v_application.provider_campaign_id, 'not_started', 'purchased', false,
      v_application.id, v_now
    )
    on conflict (provider, e164_number) do nothing;
    if not found then
      select * into strict v_sender
        from public.sms_sender_numbers
       where provider = 'signalwire' and e164_number = v_number
       for update;
      if v_sender.purpose is distinct from 'contractor_dedicated'
         or v_sender.account_id is distinct from v_application.account_id
         or v_sender.provisioning_application_id is distinct from v_application.id
         or v_sender.provider_number_id is distinct from v_provider_number_id then
        raise exception 'Sender number is already owned by another purpose, account, application, or provider object'
          using errcode = '23505';
      end if;
      update public.sms_sender_numbers
         set updated_at = v_now
       where id = v_sender.id;
    end if;
  elsif v_operation.operation_type = 'configure_inbound' then
    v_inbound_url := v_operation.request_payload->>'inbound_url';
    v_inbound_handler := pg_catalog.lower(pg_catalog.btrim(coalesce(p_provider_result->>'message_handler', '')));
    if p_provider_result->>'id' is distinct from v_application.provider_number_id
       or p_provider_result->>'number' is distinct from v_application.purchased_number
       or pg_catalog.length(coalesce(v_inbound_url, '')) < 8
       or p_provider_result->>'message_request_url' is distinct from v_inbound_url
       or pg_catalog.lower(pg_catalog.btrim(coalesce(v_operation.request_payload->>'message_handler', ''))) <> 'laml_webhooks'
       or v_inbound_handler <> 'laml_webhooks' then
      raise exception 'Inbound configuration response does not confirm the claimed number, URL, and LaML webhook handler'
        using errcode = '22000';
    end if;
    update public.messaging_registration_applications
       set inbound_webhook_url = v_inbound_url, inbound_configured_at = v_now,
           updated_at = v_now
     where id = v_application.id;
    update public.sms_sender_numbers
       set inbound_webhook_url = v_inbound_url, inbound_ready = true,
           provisioning_status = 'assignment_pending', updated_at = v_now
     where provisioning_application_id = v_application.id;
  else
    if pg_catalog.length(coalesce(p_provider_result->>'id', '')) < 8 then
      raise exception 'Campaign assignment response has no order identifier' using errcode = '22000';
    end if;
    update public.messaging_registration_applications
       set assignment_order_id = p_provider_result->>'id',
           provider_assignment_state = coalesce(p_provider_result->>'state', 'pending'),
           assignment_checked_at = v_now, updated_at = v_now
     where id = v_application.id;
    update public.sms_sender_numbers
       set assignment_id = p_provider_result->>'id', assignment_state = 'pending',
           provisioning_status = 'assignment_pending', updated_at = v_now
     where provisioning_application_id = v_application.id;
  end if;

  update public.messaging_number_provisioning_operations
     set state = 'succeeded', claim_token = null, lease_expires_at = null,
         provider_object_id = p_provider_object_id,
         provider_result = p_provider_result, completed_at = v_now, updated_at = v_now
   where id = p_operation_id;
  update public.messaging_number_provisioning_attempts
     set outcome = 'succeeded', finished_at = v_now
   where operation_id = p_operation_id and claim_token = p_claim_token and outcome is null;
  insert into public.messaging_registration_events (
    application_id, account_id, event_type, actor_type, previous_status,
    new_status, metadata
  ) values (
    v_application.id, v_application.account_id,
    v_operation.operation_type || '_completed', 'system', v_application.status,
    case when v_operation.operation_type = 'purchase_number' then 'provisioning' else v_application.status end,
    pg_catalog.jsonb_build_object(
      'operation_id', p_operation_id,
      'provider_object_id', p_provider_object_id
    )
  );
  return true;
end;
$$;

create or replace function public.complete_messaging_number_operation_v2(
  p_operation_id uuid,
  p_claim_token uuid,
  p_provider_object_id text,
  p_provider_result jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_application_id uuid;
  v_application public.messaging_registration_applications%rowtype;
  v_operation public.messaging_number_provisioning_operations%rowtype;
  v_completed boolean;
begin
  select application_id into strict v_application_id
    from public.messaging_number_provisioning_operations
   where id = p_operation_id;
  select * into strict v_application
    from public.messaging_registration_applications
   where id = v_application_id
   for update;
  select * into strict v_operation
    from public.messaging_number_provisioning_operations
   where id = p_operation_id
   for update;
  if v_operation.application_id <> v_application.id
     or v_operation.state <> 'request_started'
     or v_operation.claim_token <> p_claim_token then
    raise exception 'Messaging number operation is not at its completion boundary' using errcode = '55000';
  end if;
  if coalesce(p_provider_object_id, '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or p_provider_result is null
     or p_provider_result->>'id' is distinct from p_provider_object_id then
    raise exception 'Provider result identity does not match the completed provider object'
      using errcode = '22000';
  end if;
  if v_operation.operation_type = 'configure_inbound' then
    if pg_catalog.upper(pg_catalog.btrim(coalesce(v_operation.request_payload->>'message_request_method', ''))) <> 'POST'
       or pg_catalog.upper(pg_catalog.btrim(coalesce(p_provider_result->>'message_request_method', ''))) <> 'POST' then
      raise exception 'Inbound configuration did not confirm POST request method' using errcode = '22000';
    end if;
  end if;

  select public.complete_messaging_number_operation(
    p_operation_id, p_claim_token, p_provider_object_id, p_provider_result
  ) into v_completed;
  if v_operation.operation_type = 'configure_inbound' and v_completed then
    update public.messaging_registration_applications
       set inbound_request_method = 'POST',
           inbound_message_handler = 'laml_webhooks'
     where id = v_operation.application_id;
    update public.sms_sender_numbers
       set inbound_request_method = 'POST',
           inbound_message_handler = 'laml_webhooks'
     where provisioning_application_id = v_operation.application_id;
  end if;
  return v_completed;
end;
$$;

-- -------------------------------------------------------------------------
-- 7. Recovery uses the same application -> operation lock order.
-- -------------------------------------------------------------------------

create or replace function public.resolve_messaging_number_operation_v2(
  p_operation_id uuid,
  p_resolution text,
  p_provider_object_id text,
  p_provider_result jsonb,
  p_actor_reference text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_application_id uuid;
  v_operation public.messaging_number_provisioning_operations%rowtype;
  v_application public.messaging_registration_applications%rowtype;
  v_token uuid;
begin
  if p_resolution not in ('confirmed_absent', 'confirmed_succeeded')
     or pg_catalog.length(coalesce(p_actor_reference, '')) < 3 then
    raise exception 'Messaging operation recovery input is invalid' using errcode = '22023';
  end if;
  select application_id into strict v_application_id
    from public.messaging_number_provisioning_operations
   where id = p_operation_id;
  select * into strict v_application
    from public.messaging_registration_applications
   where id = v_application_id
   for update;
  select * into strict v_operation
    from public.messaging_number_provisioning_operations
   where id = p_operation_id
   for update;
  if v_operation.application_id <> v_application.id then
    raise exception 'Messaging number operation application changed while locking' using errcode = '55000';
  end if;
  if v_operation.state <> 'indeterminate' then
    raise exception 'Only an indeterminate operation can be recovered' using errcode = '55000';
  end if;

  if p_resolution = 'confirmed_absent' then
    if v_operation.provider_object_id is not null or v_operation.provider_result is not null then
      raise exception 'Stored provider success evidence must be imported, not marked absent' using errcode = '55000';
    end if;
    update public.messaging_number_provisioning_operations
       set state = 'failed', error_code = 'operator_confirmed_absent',
           error_detail = 'MFA operations confirmed that SignalWire created no provider object.',
           claim_token = null, lease_expires_at = null,
           request_started_at = null, completed_at = null,
           indeterminate_at = null, failed_at = v_now, updated_at = v_now
     where id = p_operation_id;
  else
    if coalesce(p_provider_object_id, '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or p_provider_result is null
       or p_provider_result->>'id' is distinct from p_provider_object_id
       or (v_operation.provider_object_id is not null
           and v_operation.provider_object_id is distinct from p_provider_object_id) then
      raise exception 'Imported provider evidence does not match the quarantined operation'
        using errcode = '22000';
    end if;
    v_token := pg_catalog.gen_random_uuid();
    update public.messaging_number_provisioning_operations
       set state = 'request_started', claim_token = v_token,
           lease_expires_at = v_now + interval '5 minutes',
           request_started_at = v_now, completed_at = null,
           failed_at = null, indeterminate_at = null, updated_at = v_now
     where id = p_operation_id;
    perform public.complete_messaging_number_operation_v2(
      p_operation_id, v_token, p_provider_object_id, p_provider_result
    );
  end if;

  insert into public.messaging_registration_events (
    application_id, account_id, event_type, actor_type, actor_reference,
    previous_status, new_status, metadata
  ) values (
    v_application.id, v_application.account_id, 'provider_operation_recovered',
    'staff', p_actor_reference, v_application.status,
    case when v_operation.operation_type = 'purchase_number'
              and p_resolution = 'confirmed_succeeded' then 'provisioning'
         else v_application.status end,
    pg_catalog.jsonb_build_object(
      'operation_id', p_operation_id,
      'operation_type', v_operation.operation_type,
      'resolution', p_resolution,
      'provider_object_id', p_provider_object_id
    )
  );
  return true;
end;
$$;

-- -------------------------------------------------------------------------
-- 8. Final activation proves SMS and the exact live phone configuration.
-- -------------------------------------------------------------------------

create or replace function public.record_messaging_number_assignment_state_v3(
  p_application_id uuid,
  p_assignment_id text,
  p_provider_state text,
  p_provider_number_id text,
  p_verified_number text,
  p_sms_capable boolean,
  p_verified_message_handler text,
  p_verified_inbound_url text,
  p_verified_inbound_method text,
  p_provider_checked_at timestamptz,
  p_actor_reference text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_application public.messaging_registration_applications%rowtype;
  v_sender public.sms_sender_numbers%rowtype;
  v_state text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_provider_state, '')));
  v_normalized text;
  v_result text;
begin
  select * into strict v_application
    from public.messaging_registration_applications
   where id = p_application_id
   for update;
  select * into strict v_sender
    from public.sms_sender_numbers
   where provisioning_application_id = p_application_id
   for update;

  v_normalized := case
    when v_state = 'complete' then 'complete'
    when v_state in ('failed', 'rejected') then 'failed'
    else 'pending'
  end;

  if coalesce(p_assignment_id, '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or p_provider_number_id is distinct from v_application.provider_number_id
     or p_provider_number_id is distinct from v_sender.provider_number_id
     or v_application.assignment_order_id is null
     or v_application.purchased_number is null then
    raise exception 'Assignment does not identify the exact ordered provider phone resource'
      using errcode = '55000';
  end if;

  if v_normalized = 'complete' then
    if p_verified_number is distinct from v_application.purchased_number
       or p_verified_number is distinct from v_sender.e164_number
       or p_sms_capable is distinct from true
       or pg_catalog.lower(pg_catalog.btrim(coalesce(p_verified_message_handler, ''))) <> 'laml_webhooks'
       or p_verified_inbound_url is distinct from v_application.inbound_webhook_url
       or p_verified_inbound_url is distinct from v_sender.inbound_webhook_url
       or pg_catalog.upper(pg_catalog.btrim(coalesce(p_verified_inbound_method, ''))) <> 'POST'
       or p_provider_checked_at is null
       or p_provider_checked_at < v_now - interval '10 minutes'
       or p_provider_checked_at > v_now + interval '2 minutes'
       or v_application.inbound_request_method <> 'POST'
       or v_sender.inbound_request_method <> 'POST'
       or v_application.provider_brand_state <> 'complete'
       or v_application.provider_campaign_state <> 'complete'
       or v_application.provider_verified_at is null
       or v_application.provider_verified_at < v_now - interval '10 minutes'
       or v_application.provider_verified_at > v_now + interval '2 minutes'
       or v_sender.account_id is distinct from v_application.account_id
       or v_sender.provider is distinct from v_application.provider
       or v_sender.brand_id is distinct from v_application.provider_brand_id
       or v_sender.campaign_id is distinct from v_application.provider_campaign_id then
      raise exception 'Assignment cannot activate without fresh exact campaign, SMS phone, and production POST evidence'
        using errcode = '55000';
    end if;

    update public.messaging_registration_applications
       set provider_phone_verified_at = p_provider_checked_at,
           provider_sms_capable = true,
           inbound_message_handler = 'laml_webhooks',
           suspended_at = null,
           updated_at = v_now
     where id = p_application_id;
    update public.sms_sender_numbers
       set provider_brand_state = v_application.provider_brand_state,
           provider_campaign_state = v_application.provider_campaign_state,
           provider_verified_at = v_application.provider_verified_at,
           provider_phone_verified_at = p_provider_checked_at,
           provider_sms_capable = true,
           inbound_message_handler = 'laml_webhooks',
           inbound_request_method = 'POST',
           suspended_at = null,
           updated_at = v_now
     where id = v_sender.id;
  end if;

  select public.record_messaging_number_assignment_state(
    p_application_id, p_assignment_id, p_provider_state, p_actor_reference
  ) into v_result;
  return v_result;
end;
$$;

-- -------------------------------------------------------------------------
-- 9. Least privilege and retired bypasses.
-- -------------------------------------------------------------------------

alter table public.messaging_number_spend_policies enable row level security;
alter table public.messaging_number_spend_policies force row level security;

drop policy if exists messaging_number_spend_policies_service_read
  on public.messaging_number_spend_policies;
create policy messaging_number_spend_policies_service_read
on public.messaging_number_spend_policies
for select to service_role
using (true);

revoke all on table public.messaging_number_spend_policies
  from public, anon, authenticated, service_role;
grant select on table public.messaging_number_spend_policies to service_role;

revoke all on function public.prevent_bound_messaging_application_resubmission()
  from public, anon, authenticated, service_role;
revoke all on function public.review_messaging_registration_application_v2(uuid,text,text,text,text,text,text,text,text,text,text,text,timestamptz,text)
  from public, anon, authenticated, service_role;
revoke all on function public.set_messaging_number_spend_policy(text,bigint,bigint,text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_messaging_compliance_verification(uuid,text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_messaging_number_operation_v2(uuid,text,text,text,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_messaging_number_operation(uuid,uuid,text,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_messaging_number_operation_v2(uuid,uuid,text,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.resolve_messaging_number_operation_v2(uuid,text,text,jsonb,text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_messaging_campaign_verification_v2(uuid,text,text,text,text,text,text,text,text,text,timestamptz,text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_messaging_number_assignment_state_v2(uuid,text,text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_messaging_number_assignment_state_v3(uuid,text,text,text,text,boolean,text,text,text,timestamptz,text)
  from public, anon, authenticated, service_role;

grant execute on function public.set_messaging_number_spend_policy(text,bigint,bigint,text)
  to service_role;
grant execute on function public.review_messaging_registration_application_v2(uuid,text,text,text,text,text,text,text,text,text,text,text,timestamptz,text)
  to service_role;
grant execute on function public.record_messaging_compliance_verification(uuid,text,text,text)
  to service_role;
grant execute on function public.claim_messaging_number_operation_v2(uuid,text,text,text,jsonb)
  to service_role;
grant execute on function public.complete_messaging_number_operation_v2(uuid,uuid,text,jsonb)
  to service_role;
grant execute on function public.resolve_messaging_number_operation_v2(uuid,text,text,jsonb,text)
  to service_role;
grant execute on function public.record_messaging_campaign_verification_v2(uuid,text,text,text,text,text,text,text,text,text,timestamptz,text)
  to service_role;
grant execute on function public.record_messaging_number_assignment_state_v3(uuid,text,text,text,text,boolean,text,text,text,timestamptz,text)
  to service_role;

commit;
