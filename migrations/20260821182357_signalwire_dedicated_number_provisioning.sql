-- Dedicated contractor-number registration and provisioning foundation.
--
-- DARK BY CONSTRUCTION. This migration creates durable application, review,
-- and provider-operation state. It creates no cron, trigger that purchases a
-- number, provider call, or entitlement. Carrier spend remains impossible
-- until an MFA-authorized server action also passes the exact-1 environment
-- gate and explicitly claims one of the operations below.

begin;

-- -------------------------------------------------------------------------
-- 1. One current downstream-business application per workspace.
-- -------------------------------------------------------------------------

create table if not exists public.messaging_registration_applications (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null unique
    references public.accounts(id) on delete restrict,
  provider text not null default 'signalwire'
    check (provider = 'signalwire'),
  status text not null default 'submitted'
    check (status in (
      'submitted', 'under_review', 'action_required', 'approved',
      'rejected', 'provisioning', 'active', 'suspended'
    )),
  revision integer not null default 1 check (revision between 1 and 100),

  legal_business_name text not null check (
    pg_catalog.length(legal_business_name) between 2 and 200
  ),
  dba_name text check (dba_name is null or pg_catalog.length(dba_name) <= 200),
  business_type text not null check (business_type in (
    'sole_proprietor', 'llc', 'corporation', 'partnership', 'nonprofit', 'other'
  )),
  website_url text not null check (pg_catalog.length(website_url) between 8 and 1000),
  business_email text not null check (pg_catalog.length(business_email) between 3 and 320),
  business_phone text not null check (business_phone ~ '^\+[1-9][0-9]{7,14}$'),
  authorized_contact_name text not null check (
    pg_catalog.length(authorized_contact_name) between 2 and 200
  ),
  authorized_contact_title text not null check (
    pg_catalog.length(authorized_contact_title) between 2 and 200
  ),
  authorized_contact_email text not null check (
    pg_catalog.length(authorized_contact_email) between 3 and 320
    and authorized_contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  authorized_contact_phone text not null check (
    authorized_contact_phone ~ '^\+[1-9][0-9]{7,14}$'
  ),
  messaging_support_email text not null check (
    pg_catalog.length(messaging_support_email) between 3 and 320
    and messaging_support_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  messaging_support_phone text not null check (
    messaging_support_phone ~ '^\+[1-9][0-9]{7,14}$'
  ),
  address_line1 text not null check (pg_catalog.length(address_line1) between 2 and 200),
  address_line2 text check (address_line2 is null or pg_catalog.length(address_line2) <= 200),
  city text not null check (pg_catalog.length(city) between 2 and 120),
  region text not null check (region ~ '^[A-Z]{2}$'),
  postal_code text not null check (postal_code ~ '^[0-9]{5}(-[0-9]{4})?$'),
  desired_area_code text not null check (desired_area_code ~ '^[2-9][0-9]{2}$'),
  messaging_use_case text not null check (pg_catalog.length(messaging_use_case) between 30 and 4000),
  estimated_monthly_messages integer not null
    check (estimated_monthly_messages between 1 and 10000000),
  opt_in_description text not null check (pg_catalog.length(opt_in_description) between 30 and 4000),
  opt_in_evidence_url text not null check (
    pg_catalog.length(opt_in_evidence_url) between 8 and 1000
    and opt_in_evidence_url ~ '^https://[^[:space:]]+$'
  ),
  sample_messages text[] not null check (
    pg_catalog.cardinality(sample_messages) between 2 and 5
  ),
  privacy_policy_url text not null check (pg_catalog.length(privacy_policy_url) between 8 and 1000),
  terms_url text not null check (pg_catalog.length(terms_url) between 8 and 1000),
  attested_at timestamptz not null,

  provider_brand_id text,
  provider_campaign_id text,
  status_detail text check (status_detail is null or pg_catalog.length(status_detail) <= 4000),
  reviewed_by text check (reviewed_by is null or pg_catalog.length(reviewed_by) <= 320),
  reviewed_at timestamptz,

  candidate_number text check (candidate_number is null or candidate_number ~ '^\+[1-9][0-9]{7,14}$'),
  candidate_region text,
  candidate_city text,
  candidate_searched_at timestamptz,
  candidate_expires_at timestamptz,

  provider_number_id text,
  purchased_number text check (purchased_number is null or purchased_number ~ '^\+[1-9][0-9]{7,14}$'),
  purchased_at timestamptz,
  inbound_webhook_url text,
  inbound_configured_at timestamptz,
  assignment_order_id text,
  assignment_id text,
  provider_assignment_state text,
  assignment_checked_at timestamptz,
  activated_at timestamptz,
  suspended_at timestamptz,

  last_submission_key text not null unique
    check (last_submission_key ~ '^[A-Za-z0-9][A-Za-z0-9:._/-]{7,199}$'),
  last_submission_fingerprint text not null
    check (last_submission_fingerprint ~ '^[a-f0-9]{64}$'),
  submitted_at timestamptz not null default pg_catalog.now(),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),

  constraint messaging_registration_application_purchase_shape check (
    (provider_number_id is null and purchased_number is null and purchased_at is null)
    or (provider_number_id is not null and purchased_number is not null and purchased_at is not null)
  ),
  constraint messaging_registration_application_active_shape check (
    status <> 'active'
    or (
      provider_number_id is not null
      and purchased_number is not null
      and inbound_configured_at is not null
      and provider_assignment_state = 'complete'
      and activated_at is not null
      and suspended_at is null
    )
  )
);

create index if not exists messaging_registration_applications_status_idx
  on public.messaging_registration_applications (status, submitted_at);
create index if not exists messaging_registration_applications_campaign_idx
  on public.messaging_registration_applications (provider_campaign_id)
  where provider_campaign_id is not null;
create unique index if not exists messaging_registration_applications_provider_number_uidx
  on public.messaging_registration_applications (provider, provider_number_id)
  where provider_number_id is not null;
create unique index if not exists messaging_registration_applications_purchased_number_uidx
  on public.messaging_registration_applications (provider, purchased_number)
  where purchased_number is not null;

-- Full EINs never enter the owner-readable application or any event/audit
-- payload. MFA-authorized operations verifies the tax identity out of band
-- and retains only the last four plus a nonsecret case/reference identifier.
-- The application revision binds that evidence to the exact reviewed form.
create table if not exists public.messaging_compliance_verifications (
  application_id uuid primary key
    references public.messaging_registration_applications(id) on delete restrict,
  account_id uuid not null references public.accounts(id) on delete restrict,
  application_revision integer not null check (application_revision between 1 and 100),
  ein_last_four text not null check (ein_last_four ~ '^[0-9]{4}$'),
  verification_reference text not null check (
    pg_catalog.length(verification_reference) between 4 and 255
    and verification_reference !~ '(^|[^0-9])[0-9]{2}-?[0-9]{7}([^0-9]|$)'
    and pg_catalog.length(pg_catalog.regexp_replace(verification_reference, '[^0-9]', '', 'g')) <> 9
  ),
  verified_at timestamptz not null,
  verified_by text not null check (pg_catalog.length(verified_by) between 3 and 320),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create index if not exists messaging_compliance_verifications_account_idx
  on public.messaging_compliance_verifications (account_id);
create index if not exists messaging_compliance_verifications_verified_idx
  on public.messaging_compliance_verifications (verified_at desc);

-- Append-only business and provider lifecycle evidence. Payloads contain no API
-- credentials and no full tax identifier; those must never enter this ledger.
create table if not exists public.messaging_registration_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  application_id uuid not null
    references public.messaging_registration_applications(id) on delete restrict,
  account_id uuid not null references public.accounts(id) on delete restrict,
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]{2,99}$'),
  actor_type text not null check (actor_type in ('owner', 'staff', 'system', 'provider')),
  actor_reference text check (actor_reference is null or pg_catalog.length(actor_reference) <= 320),
  previous_status text,
  new_status text,
  detail text check (detail is null or pg_catalog.length(detail) <= 4000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now()
);

create index if not exists messaging_registration_events_application_idx
  on public.messaging_registration_events (application_id, created_at desc);
create index if not exists messaging_registration_events_account_idx
  on public.messaging_registration_events (account_id, created_at desc);

-- -------------------------------------------------------------------------
-- 2. Idempotent leased operations around every provider mutation.
-- -------------------------------------------------------------------------

create table if not exists public.messaging_number_provisioning_operations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  application_id uuid not null
    references public.messaging_registration_applications(id) on delete restrict,
  account_id uuid not null references public.accounts(id) on delete restrict,
  operation_type text not null check (operation_type in (
    'purchase_number', 'configure_inbound', 'assign_campaign'
  )),
  idempotency_key text not null unique
    check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9:._/+\-]{7,249}$'),
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  request_payload jsonb not null,
  state text not null default 'pending' check (state in (
    'pending', 'claimed', 'request_started', 'succeeded', 'failed',
    'indeterminate', 'cancelled'
  )),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  claim_token uuid,
  lease_expires_at timestamptz,
  request_started_at timestamptz,
  provider_object_id text,
  provider_result jsonb,
  error_code text check (error_code is null or error_code ~ '^[a-z][a-z0-9_]{2,99}$'),
  error_detail text check (error_detail is null or pg_catalog.length(error_detail) <= 2000),
  completed_at timestamptz,
  failed_at timestamptz,
  indeterminate_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint messaging_number_operation_state_shape check (
    (state = 'pending' and claim_token is null and lease_expires_at is null
      and request_started_at is null and completed_at is null and failed_at is null and indeterminate_at is null)
    or (state = 'claimed' and claim_token is not null and lease_expires_at is not null
      and request_started_at is null and completed_at is null and failed_at is null and indeterminate_at is null)
    or (state = 'request_started' and claim_token is not null and lease_expires_at is not null
      and request_started_at is not null and completed_at is null and failed_at is null and indeterminate_at is null)
    or (state = 'succeeded' and claim_token is null and lease_expires_at is null
      and completed_at is not null and failed_at is null and indeterminate_at is null)
    or (state = 'failed' and claim_token is null and lease_expires_at is null
      and failed_at is not null and completed_at is null and indeterminate_at is null)
    or (state = 'indeterminate' and claim_token is null and lease_expires_at is null
      and indeterminate_at is not null and completed_at is null and failed_at is null)
    or state = 'cancelled'
  )
);

create unique index if not exists messaging_number_operations_one_open_stage_uidx
  on public.messaging_number_provisioning_operations (application_id, operation_type)
  where state in ('pending', 'claimed', 'request_started');
create index if not exists messaging_number_operations_review_idx
  on public.messaging_number_provisioning_operations (state, updated_at)
  where state in ('request_started', 'failed', 'indeterminate');

create table if not exists public.messaging_number_provisioning_attempts (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  operation_id uuid not null
    references public.messaging_number_provisioning_operations(id) on delete restrict,
  attempt_number integer not null check (attempt_number between 1 and 5),
  claim_token uuid not null unique,
  claimed_at timestamptz not null,
  request_started_at timestamptz,
  outcome text check (outcome is null or outcome in (
    'succeeded', 'provider_rejected', 'indeterminate', 'lease_expired'
  )),
  error_code text check (error_code is null or error_code ~ '^[a-z][a-z0-9_]{2,99}$'),
  finished_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  unique (operation_id, attempt_number),
  constraint messaging_number_attempt_outcome_shape check (
    (outcome is null and finished_at is null)
    or (outcome is not null and finished_at is not null)
  )
);

create unique index if not exists messaging_number_attempts_one_open_uidx
  on public.messaging_number_provisioning_attempts (operation_id)
  where outcome is null;

alter table public.sms_sender_numbers
  add column if not exists provisioning_application_id uuid
    references public.messaging_registration_applications(id) on delete restrict;
create unique index if not exists sms_sender_numbers_provisioning_application_uidx
  on public.sms_sender_numbers (provisioning_application_id)
  where provisioning_application_id is not null;

-- -------------------------------------------------------------------------
-- 3. Append-only protection.
-- -------------------------------------------------------------------------

create or replace function public.prevent_messaging_registration_event_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception 'Messaging registration events are append-only'
    using errcode = '55000';
end;
$$;

drop trigger if exists messaging_registration_events_append_only
  on public.messaging_registration_events;
create trigger messaging_registration_events_append_only
before update or delete on public.messaging_registration_events
for each row execute function public.prevent_messaging_registration_event_mutation();

create or replace function public.prevent_messaging_number_attempt_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Messaging number attempts are append-only'
      using errcode = '55000';
  end if;
  if old.operation_id is distinct from new.operation_id
     or old.attempt_number is distinct from new.attempt_number
     or old.claim_token is distinct from new.claim_token
     or old.claimed_at is distinct from new.claimed_at
     or old.created_at is distinct from new.created_at
     or old.outcome is not null then
    raise exception 'Messaging number attempt identity and terminal outcome are immutable'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists messaging_number_attempts_append_only
  on public.messaging_number_provisioning_attempts;
create trigger messaging_number_attempts_append_only
before update or delete on public.messaging_number_provisioning_attempts
for each row execute function public.prevent_messaging_number_attempt_mutation();

-- -------------------------------------------------------------------------
-- 4. Owner submission and staff review RPCs.
-- -------------------------------------------------------------------------

create or replace function public.submit_messaging_registration_application(
  p_account_id uuid,
  p_submission_key text,
  p_submission_fingerprint text,
  p_legal_business_name text,
  p_dba_name text,
  p_business_type text,
  p_website_url text,
  p_business_email text,
  p_business_phone text,
  p_authorized_contact_name text,
  p_authorized_contact_title text,
  p_authorized_contact_email text,
  p_authorized_contact_phone text,
  p_messaging_support_email text,
  p_messaging_support_phone text,
  p_address_line1 text,
  p_address_line2 text,
  p_city text,
  p_region text,
  p_postal_code text,
  p_desired_area_code text,
  p_messaging_use_case text,
  p_estimated_monthly_messages integer,
  p_opt_in_description text,
  p_opt_in_evidence_url text,
  p_sample_messages text[],
  p_privacy_policy_url text,
  p_terms_url text,
  p_attested_at timestamptz,
  p_actor_reference text
)
returns table (application_id uuid, application_status text, created boolean)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_application public.messaging_registration_applications%rowtype;
  v_created boolean := false;
  v_previous_status text;
begin
  if p_account_id is null
     or p_submission_key is null
     or p_submission_fingerprint !~ '^[a-f0-9]{64}$'
     or p_attested_at is null then
    raise exception 'Messaging application identity is invalid' using errcode = '22023';
  end if;

  -- Locks the workspace, so two first submissions cannot both decide there is
  -- no application and manufacture competing current rows.
  perform 1 from public.accounts where id = p_account_id for update;
  if not found then
    raise exception 'Messaging application account does not exist' using errcode = '23503';
  end if;

  select * into v_application
    from public.messaging_registration_applications
   where account_id = p_account_id
   for update;

  if found then
    if v_application.last_submission_key = p_submission_key then
      if v_application.last_submission_fingerprint <> p_submission_fingerprint then
        raise exception 'Messaging application idempotency key was reused with different input'
          using errcode = '22000';
      end if;
      return query select v_application.id, v_application.status, false;
      return;
    end if;
    if v_application.last_submission_fingerprint = p_submission_fingerprint then
      return query select v_application.id, v_application.status, false;
      return;
    end if;
    if v_application.status not in ('action_required', 'rejected') then
      raise exception 'Messaging application cannot be edited in its current state'
        using errcode = '55000';
    end if;
    v_previous_status := v_application.status;
    update public.messaging_registration_applications
       set legal_business_name = p_legal_business_name,
           dba_name = nullif(p_dba_name, ''),
           business_type = p_business_type,
           website_url = p_website_url,
           business_email = p_business_email,
           business_phone = p_business_phone,
           authorized_contact_name = p_authorized_contact_name,
           authorized_contact_title = p_authorized_contact_title,
           authorized_contact_email = p_authorized_contact_email,
           authorized_contact_phone = p_authorized_contact_phone,
           messaging_support_email = p_messaging_support_email,
           messaging_support_phone = p_messaging_support_phone,
           address_line1 = p_address_line1,
           address_line2 = nullif(p_address_line2, ''),
           city = p_city,
           region = p_region,
           postal_code = p_postal_code,
           desired_area_code = p_desired_area_code,
           messaging_use_case = p_messaging_use_case,
           estimated_monthly_messages = p_estimated_monthly_messages,
           opt_in_description = p_opt_in_description,
           opt_in_evidence_url = p_opt_in_evidence_url,
           sample_messages = p_sample_messages,
           privacy_policy_url = p_privacy_policy_url,
           terms_url = p_terms_url,
           attested_at = p_attested_at,
           status = 'submitted', status_detail = null,
           revision = revision + 1,
           last_submission_key = p_submission_key,
           last_submission_fingerprint = p_submission_fingerprint,
           submitted_at = v_now, reviewed_by = null, reviewed_at = null,
           updated_at = v_now
     where id = v_application.id
     returning * into v_application;
  else
    insert into public.messaging_registration_applications (
      account_id, legal_business_name, dba_name, business_type,
      website_url, business_email, business_phone,
      authorized_contact_name, authorized_contact_title,
      authorized_contact_email, authorized_contact_phone,
      messaging_support_email, messaging_support_phone, address_line1,
      address_line2, city, region, postal_code, desired_area_code,
      messaging_use_case, estimated_monthly_messages, opt_in_description, opt_in_evidence_url,
      sample_messages, privacy_policy_url, terms_url, attested_at,
      last_submission_key, last_submission_fingerprint, submitted_at
    ) values (
      p_account_id, p_legal_business_name, nullif(p_dba_name, ''), p_business_type,
      p_website_url, p_business_email, p_business_phone,
      p_authorized_contact_name, p_authorized_contact_title,
      p_authorized_contact_email, p_authorized_contact_phone,
      p_messaging_support_email, p_messaging_support_phone, p_address_line1,
      nullif(p_address_line2, ''), p_city, p_region, p_postal_code, p_desired_area_code,
      p_messaging_use_case, p_estimated_monthly_messages, p_opt_in_description, p_opt_in_evidence_url,
      p_sample_messages, p_privacy_policy_url, p_terms_url, p_attested_at,
      p_submission_key, p_submission_fingerprint, v_now
    ) returning * into v_application;
    v_created := true;
  end if;

  insert into public.messaging_registrations (
    account_id, status, provider, provider_reference, status_detail,
    submitted_at, decided_at, updated_at
  ) values (
    p_account_id, 'submitted', 'signalwire', v_application.id::text,
    null, v_now, null, v_now
  )
  on conflict (account_id) do update
    set status = 'submitted', provider = 'signalwire',
        provider_reference = excluded.provider_reference,
        status_detail = null, submitted_at = excluded.submitted_at,
        decided_at = null, updated_at = excluded.updated_at;

  insert into public.messaging_registration_events (
    application_id, account_id, event_type, actor_type, actor_reference,
    previous_status, new_status, metadata
  ) values (
    v_application.id, p_account_id,
    case when v_created then 'application_submitted' else 'application_resubmitted' end,
    'owner', p_actor_reference, v_previous_status, 'submitted',
    pg_catalog.jsonb_build_object('revision', v_application.revision)
  );

  return query select v_application.id, v_application.status, v_created;
end;
$$;

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

  -- Serializes verification against resubmission/review and binds the retained
  -- evidence to the exact application revision being inspected by operations.
  select * into strict v_application
    from public.messaging_registration_applications
   where id = p_application_id
   for update;

  if v_application.status not in ('submitted', 'under_review', 'action_required', 'rejected', 'approved') then
    raise exception 'Messaging compliance verification cannot be edited in this application state'
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

  -- This owner-readable ledger deliberately contains neither the EIN suffix
  -- nor the verification reference. The restricted row above is authoritative.
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

create or replace function public.review_messaging_registration_application(
  p_application_id uuid,
  p_decision text,
  p_detail text,
  p_provider_brand_id text,
  p_provider_campaign_id text,
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
  v_previous text;
  v_projection text;
begin
  if p_decision not in ('under_review', 'action_required', 'approved', 'rejected') then
    raise exception 'Messaging application review decision is invalid' using errcode = '22023';
  end if;
  select * into strict v_application
    from public.messaging_registration_applications
   where id = p_application_id
   for update;
  if v_application.status not in ('submitted', 'under_review', 'action_required', 'rejected', 'approved') then
    raise exception 'Messaging application cannot be reviewed in its current state' using errcode = '55000';
  end if;
  if p_decision in ('action_required', 'rejected') and pg_catalog.length(coalesce(p_detail, '')) < 10 then
    raise exception 'A clear review reason is required' using errcode = '22023';
  end if;
  if p_decision = 'approved' and pg_catalog.length(coalesce(p_provider_campaign_id, '')) < 8 then
    raise exception 'Approval requires the downstream campaign identifier' using errcode = '22023';
  end if;
  if p_decision = 'approved' and not exists (
    select 1
      from public.messaging_compliance_verifications
     where application_id = v_application.id
       and account_id = v_application.account_id
       and application_revision = v_application.revision
       and verified_at is not null
  ) then
    raise exception 'Approval requires tax identity verification for the current application revision'
      using errcode = '55000';
  end if;

  v_previous := v_application.status;
  update public.messaging_registration_applications
     set status = p_decision,
         status_detail = nullif(p_detail, ''),
         provider_brand_id = case when p_decision = 'approved' then nullif(p_provider_brand_id, '') else provider_brand_id end,
         provider_campaign_id = case when p_decision = 'approved' then p_provider_campaign_id else provider_campaign_id end,
         reviewed_by = p_actor_reference, reviewed_at = v_now, updated_at = v_now
   where id = p_application_id;

  v_projection := case
    when p_decision in ('under_review', 'approved') then 'in_review'
    when p_decision = 'action_required' then 'action_required'
    else 'rejected'
  end;
  update public.messaging_registrations
     set status = v_projection,
         status_detail = nullif(p_detail, ''),
         provider = 'signalwire', provider_reference = p_application_id::text,
         decided_at = case when p_decision in ('action_required', 'rejected') then v_now else null end,
         updated_at = v_now
   where account_id = v_application.account_id;

  insert into public.messaging_registration_events (
    application_id, account_id, event_type, actor_type, actor_reference,
    previous_status, new_status, detail,
    metadata
  ) values (
    p_application_id, v_application.account_id, 'application_reviewed',
    'staff', p_actor_reference, v_previous, p_decision,
    nullif(p_detail, ''),
    pg_catalog.jsonb_build_object(
      'provider_brand_id', p_provider_brand_id,
      'provider_campaign_id', p_provider_campaign_id
    )
  );
  return p_decision;
end;
$$;

create or replace function public.record_messaging_number_candidate(
  p_application_id uuid,
  p_number text,
  p_region text,
  p_city text,
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
  if p_number !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Candidate number must be E.164' using errcode = '22023';
  end if;
  select * into strict v_application
    from public.messaging_registration_applications
   where id = p_application_id
   for update;
  if v_application.status <> 'approved' or v_application.provider_number_id is not null then
    raise exception 'A candidate may only be selected for an approved, unpurchased application'
      using errcode = '55000';
  end if;
  if exists (
    select 1
      from public.messaging_number_provisioning_operations o
     where o.application_id = p_application_id and o.state = 'indeterminate'
  ) then
    raise exception 'An indeterminate provider operation must be reconciled before selecting another number'
      using errcode = '55000';
  end if;
  update public.messaging_registration_applications
     set candidate_number = p_number, candidate_region = nullif(p_region, ''),
         candidate_city = nullif(p_city, ''), candidate_searched_at = v_now,
         candidate_expires_at = v_now + interval '15 minutes', updated_at = v_now
   where id = p_application_id;
  insert into public.messaging_registration_events (
    application_id, account_id, event_type, actor_type, actor_reference, metadata
  ) values (
    p_application_id, v_application.account_id, 'number_candidate_selected',
    'staff', p_actor_reference,
    pg_catalog.jsonb_build_object('number', p_number, 'region', p_region, 'city', p_city)
  );
  return true;
end;
$$;

-- -------------------------------------------------------------------------
-- 5. Claim, no-return boundary, and terminal operation RPCs.
-- -------------------------------------------------------------------------

create or replace function public.claim_messaging_number_operation(
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
  v_operation public.messaging_number_provisioning_operations%rowtype;
  v_token uuid;
begin
  if p_operation_type not in ('purchase_number', 'configure_inbound', 'assign_campaign')
     or p_request_fingerprint !~ '^[a-f0-9]{64}$'
     or p_idempotency_key is null
     or p_request_payload is null then
    raise exception 'Messaging number operation input is invalid' using errcode = '22023';
  end if;
  select * into strict v_application
    from public.messaging_registration_applications
   where id = p_application_id
   for update;

  -- A completed operation is replayable even though its completion advanced
  -- the application beyond the stage precondition below. Check the immutable
  -- key and payload first; otherwise a harmless retry after purchase/configure/
  -- assignment would be rejected as "not ready" instead of returning the
  -- durably recorded provider result.
  select * into v_operation
    from public.messaging_number_provisioning_operations
   where idempotency_key = p_idempotency_key
   for update;
  if found and (
    v_operation.application_id <> p_application_id
    or v_operation.operation_type <> p_operation_type
    or v_operation.request_fingerprint <> p_request_fingerprint
    or v_operation.request_payload <> p_request_payload
  ) then
    raise exception 'Messaging number operation idempotency drift detected' using errcode = '22000';
  end if;
  if found and v_operation.state = 'succeeded' then
    return query select 'replay'::text, v_operation.id, null::uuid,
      v_operation.state, v_operation.provider_object_id, v_operation.provider_result;
    return;
  end if;
  if exists (
    select 1
      from public.messaging_number_provisioning_operations blocked
     where blocked.application_id = p_application_id
       and blocked.state = 'indeterminate'
       and blocked.idempotency_key <> p_idempotency_key
  ) then
    raise exception 'An indeterminate provider operation blocks later provisioning work'
      using errcode = '55000';
  end if;

  if p_operation_type = 'purchase_number' then
    if v_application.status <> 'approved'
       or v_application.provider_number_id is not null
       or v_application.candidate_number is distinct from (p_request_payload->>'number')
       or v_application.candidate_expires_at is null
       or v_application.candidate_expires_at <= v_now then
      raise exception 'Purchase is not bound to a current approved candidate' using errcode = '55000';
    end if;
  elsif p_operation_type = 'configure_inbound' then
    if v_application.status <> 'provisioning'
       or v_application.provider_number_id is distinct from (p_request_payload->>'provider_number_id')
       or v_application.purchased_number is distinct from (p_request_payload->>'number')
       or v_application.inbound_configured_at is not null then
      raise exception 'Inbound configuration is not bound to the purchased number' using errcode = '55000';
    end if;
  else
    if v_application.status <> 'provisioning'
       or v_application.inbound_configured_at is null
       or v_application.assignment_order_id is not null
       or v_application.provider_campaign_id is distinct from (p_request_payload->>'campaign_id')
       or v_application.purchased_number is distinct from (p_request_payload->>'number')
       or v_application.purchased_at > v_now - interval '1 hour' then
      raise exception 'Campaign assignment is not ready or the purchase is less than one hour old'
        using errcode = '55000';
    end if;
  end if;

  select * into v_operation
    from public.messaging_number_provisioning_operations
   where idempotency_key = p_idempotency_key
   for update;

  if found and (
    v_operation.application_id <> p_application_id
    or v_operation.operation_type <> p_operation_type
    or v_operation.request_fingerprint <> p_request_fingerprint
    or v_operation.request_payload <> p_request_payload
  ) then
    raise exception 'Messaging number operation idempotency drift detected' using errcode = '22000';
  end if;

  if not found then
    insert into public.messaging_number_provisioning_operations (
      application_id, account_id, operation_type, idempotency_key,
      request_fingerprint, request_payload
    ) values (
      p_application_id, v_application.account_id, p_operation_type,
      p_idempotency_key, p_request_fingerprint, p_request_payload
    ) returning * into v_operation;
  end if;

  if v_operation.state = 'succeeded' then
    return query select 'replay'::text, v_operation.id, null::uuid,
      v_operation.state, v_operation.provider_object_id, v_operation.provider_result;
    return;
  end if;
  if v_operation.state = 'indeterminate' then
    return query select 'indeterminate'::text, v_operation.id, null::uuid,
      v_operation.state, v_operation.provider_object_id, v_operation.provider_result;
    return;
  end if;
  if v_operation.state = 'request_started' then
    if v_operation.lease_expires_at <= v_now then
      update public.messaging_number_provisioning_operations
         set state = 'indeterminate', claim_token = null, lease_expires_at = null,
             indeterminate_at = v_now, error_code = 'lease_expired_after_request',
             error_detail = 'The provider request began but its result was not durably recorded.',
             updated_at = v_now
       where id = v_operation.id;
      update public.messaging_number_provisioning_attempts a
         set outcome = 'lease_expired', error_code = 'lease_expired_after_request',
             finished_at = v_now
       where a.operation_id = v_operation.id and a.outcome is null;
      return query select 'indeterminate'::text, v_operation.id, null::uuid,
        'indeterminate'::text, v_operation.provider_object_id, v_operation.provider_result;
    else
      return query select 'in_progress'::text, v_operation.id, null::uuid,
        v_operation.state, v_operation.provider_object_id, v_operation.provider_result;
    end if;
    return;
  end if;
  if v_operation.state = 'claimed' and v_operation.lease_expires_at > v_now then
    return query select 'in_progress'::text, v_operation.id, null::uuid,
      v_operation.state, v_operation.provider_object_id, v_operation.provider_result;
    return;
  end if;
  if v_operation.attempt_count >= 5 then
    return query select 'attempt_cap'::text, v_operation.id, null::uuid,
      v_operation.state, v_operation.provider_object_id, v_operation.provider_result;
    return;
  end if;

  if v_operation.state = 'claimed' then
    update public.messaging_number_provisioning_attempts a
       set outcome = 'lease_expired', error_code = 'lease_expired_before_request', finished_at = v_now
     where a.operation_id = v_operation.id and a.outcome is null;
  end if;

  v_token := pg_catalog.gen_random_uuid();
  update public.messaging_number_provisioning_operations
     set state = 'claimed', claim_token = v_token,
         lease_expires_at = v_now + interval '5 minutes',
         request_started_at = null, failed_at = null,
         error_code = null, error_detail = null,
         attempt_count = attempt_count + 1, updated_at = v_now
   where id = v_operation.id
   returning * into v_operation;
  insert into public.messaging_number_provisioning_attempts (
    operation_id, attempt_number, claim_token, claimed_at
  ) values (v_operation.id, v_operation.attempt_count, v_token, v_now);

  return query select 'claimed'::text, v_operation.id, v_token,
    v_operation.state, v_operation.provider_object_id, v_operation.provider_result;
end;
$$;

create or replace function public.begin_messaging_number_operation(
  p_operation_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare v_now timestamptz := pg_catalog.clock_timestamp();
begin
  update public.messaging_number_provisioning_operations
     set state = 'request_started', request_started_at = v_now,
         lease_expires_at = v_now + interval '5 minutes', updated_at = v_now
   where id = p_operation_id and state = 'claimed'
     and claim_token = p_claim_token and lease_expires_at > v_now;
  if not found then
    raise exception 'Messaging number operation claim is no longer valid' using errcode = '55000';
  end if;
  update public.messaging_number_provisioning_attempts
     set request_started_at = v_now
   where operation_id = p_operation_id and claim_token = p_claim_token and outcome is null;
  return true;
end;
$$;

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
  v_operation public.messaging_number_provisioning_operations%rowtype;
  v_application public.messaging_registration_applications%rowtype;
  v_number text;
  v_provider_number_id text;
  v_inbound_url text;
  v_inbound_handler text;
  v_sender public.sms_sender_numbers%rowtype;
begin
  select * into strict v_operation
    from public.messaging_number_provisioning_operations
   where id = p_operation_id
   for update;
  if v_operation.state <> 'request_started' or v_operation.claim_token <> p_claim_token then
    raise exception 'Messaging number operation is not at its completion boundary' using errcode = '55000';
  end if;
  select * into strict v_application
    from public.messaging_registration_applications
   where id = v_operation.application_id
   for update;

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
      -- An exact replay may refresh only non-ownership metadata. Never rewrite
      -- purpose, account_id, provisioning_application_id, or provider_number_id.
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

create or replace function public.reject_messaging_number_operation(
  p_operation_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_error_detail text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare v_now timestamptz := pg_catalog.clock_timestamp();
begin
  update public.messaging_number_provisioning_operations
     set state = 'failed', claim_token = null, lease_expires_at = null,
         error_code = p_error_code, error_detail = pg_catalog.left(p_error_detail, 2000),
         failed_at = v_now, updated_at = v_now
   where id = p_operation_id and state = 'request_started' and claim_token = p_claim_token;
  if not found then
    raise exception 'Messaging number rejection does not match an open request' using errcode = '55000';
  end if;
  update public.messaging_number_provisioning_attempts
     set outcome = 'provider_rejected', error_code = p_error_code, finished_at = v_now
   where operation_id = p_operation_id and claim_token = p_claim_token and outcome is null;
  return true;
end;
$$;

create or replace function public.mark_messaging_number_operation_indeterminate(
  p_operation_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_error_detail text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare v_now timestamptz := pg_catalog.clock_timestamp();
begin
  update public.messaging_number_provisioning_operations
     set state = 'indeterminate', claim_token = null, lease_expires_at = null,
         error_code = p_error_code, error_detail = pg_catalog.left(p_error_detail, 2000),
         indeterminate_at = v_now, updated_at = v_now
   where id = p_operation_id and state = 'request_started' and claim_token = p_claim_token;
  if not found then
    raise exception 'Messaging number indeterminate result does not match an open request' using errcode = '55000';
  end if;
  update public.messaging_number_provisioning_attempts
     set outcome = 'indeterminate', error_code = p_error_code, finished_at = v_now
   where operation_id = p_operation_id and claim_token = p_claim_token and outcome is null;
  return true;
end;
$$;

-- Polling uses the individual assignment state, never the order's "processed"
-- state. An order can be processed while its contained assignment failed.
create or replace function public.record_messaging_number_assignment_state(
  p_application_id uuid,
  p_assignment_id text,
  p_provider_state text,
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
  v_state text := pg_catalog.lower(pg_catalog.btrim(p_provider_state));
  v_normalized text;
begin
  select * into strict v_application
    from public.messaging_registration_applications
   where id = p_application_id
   for update;
  if v_application.assignment_order_id is null or v_application.purchased_number is null then
    raise exception 'Messaging assignment has not been ordered' using errcode = '55000';
  end if;
  v_normalized := case
    when v_state = 'complete' then 'complete'
    when v_state in ('failed', 'rejected') then 'failed'
    else 'pending'
  end;

  update public.messaging_registration_applications
     set assignment_id = nullif(p_assignment_id, ''),
         provider_assignment_state = v_normalized,
         assignment_checked_at = v_now,
         status = case when v_normalized = 'complete' then 'active'
                       when v_normalized = 'failed' then 'action_required'
                       else 'provisioning' end,
         status_detail = case when v_normalized = 'failed'
           then 'SignalWire rejected the individual number assignment. Staff must inspect the carrier response before retrying.'
           else null end,
         activated_at = case when v_normalized = 'complete' then coalesce(activated_at, v_now) else activated_at end,
         updated_at = v_now
   where id = p_application_id;

  update public.sms_sender_numbers
     set assignment_id = nullif(p_assignment_id, ''),
         assignment_state = case when v_normalized = 'complete' then 'assigned'
                                 when v_normalized = 'failed' then 'failed'
                                 else 'pending' end,
         provisioning_status = case when v_normalized = 'complete' then 'active'
                                    when v_normalized = 'failed' then 'failed'
                                    else 'assignment_pending' end,
         activated_at = case when v_normalized = 'complete' then coalesce(activated_at, v_now) else activated_at end,
         last_verified_at = v_now, updated_at = v_now
   where provisioning_application_id = p_application_id;

  update public.messaging_registrations
     set status = case when v_normalized = 'complete' then 'approved'
                       when v_normalized = 'failed' then 'action_required'
                       else 'in_review' end,
         assigned_number = case when v_normalized = 'complete' then v_application.purchased_number else null end,
         status_detail = case when v_normalized = 'failed'
           then 'Your number needs carrier attention. We are reviewing it.' else null end,
         decided_at = case when v_normalized in ('complete', 'failed') then v_now else null end,
         updated_at = v_now
   where account_id = v_application.account_id;

  insert into public.messaging_registration_events (
    application_id, account_id, event_type, actor_type, actor_reference,
    previous_status, new_status, metadata
  ) values (
    p_application_id, v_application.account_id, 'number_assignment_checked',
    'staff', p_actor_reference, v_application.status,
    case when v_normalized = 'complete' then 'active'
         when v_normalized = 'failed' then 'action_required' else 'provisioning' end,
    pg_catalog.jsonb_build_object(
      'assignment_id', p_assignment_id,
      'provider_state', p_provider_state,
      'normalized_state', v_normalized
    )
  );
  return v_normalized;
end;
$$;

-- -------------------------------------------------------------------------
-- 6. Owner-read/service-write authorization.
-- -------------------------------------------------------------------------

alter table public.messaging_registration_applications enable row level security;
alter table public.messaging_registration_applications force row level security;
alter table public.messaging_compliance_verifications enable row level security;
alter table public.messaging_compliance_verifications force row level security;
alter table public.messaging_registration_events enable row level security;
alter table public.messaging_registration_events force row level security;
alter table public.messaging_number_provisioning_operations enable row level security;
alter table public.messaging_number_provisioning_operations force row level security;
alter table public.messaging_number_provisioning_attempts enable row level security;
alter table public.messaging_number_provisioning_attempts force row level security;

drop policy if exists messaging_registration_applications_owner_read
  on public.messaging_registration_applications;
create policy messaging_registration_applications_owner_read
on public.messaging_registration_applications
for select to authenticated
using ((select public.is_owner(account_id)));

drop policy if exists messaging_registration_events_owner_read
  on public.messaging_registration_events;
create policy messaging_registration_events_owner_read
on public.messaging_registration_events
for select to authenticated
using ((select public.is_owner(account_id)));

drop policy if exists messaging_compliance_verifications_service_read
  on public.messaging_compliance_verifications;
create policy messaging_compliance_verifications_service_read
on public.messaging_compliance_verifications
for select to service_role
using (true);

revoke all on table public.messaging_registration_applications
  from public, anon, authenticated, service_role;
revoke all on table public.messaging_compliance_verifications
  from public, anon, authenticated, service_role;
revoke all on table public.messaging_registration_events
  from public, anon, authenticated, service_role;
revoke all on table public.messaging_number_provisioning_operations
  from public, anon, authenticated, service_role;
revoke all on table public.messaging_number_provisioning_attempts
  from public, anon, authenticated, service_role;
grant select on table public.messaging_registration_applications to authenticated, service_role;
grant select on table public.messaging_compliance_verifications to service_role;
grant select on table public.messaging_registration_events to authenticated, service_role;
grant select on table public.messaging_number_provisioning_operations to service_role;
grant select on table public.messaging_number_provisioning_attempts to service_role;

revoke all on function public.prevent_messaging_registration_event_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.prevent_messaging_number_attempt_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.submit_messaging_registration_application(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,integer,text,text,text[],text,text,timestamptz,text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_messaging_compliance_verification(uuid,text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.review_messaging_registration_application(uuid,text,text,text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_messaging_number_candidate(uuid,text,text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_messaging_number_operation(uuid,text,text,text,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.begin_messaging_number_operation(uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_messaging_number_operation(uuid,uuid,text,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.reject_messaging_number_operation(uuid,uuid,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.mark_messaging_number_operation_indeterminate(uuid,uuid,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_messaging_number_assignment_state(uuid,text,text,text)
  from public, anon, authenticated, service_role;

grant execute on function public.submit_messaging_registration_application(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,integer,text,text,text[],text,text,timestamptz,text)
  to service_role;
grant execute on function public.record_messaging_compliance_verification(uuid,text,text,text)
  to service_role;
grant execute on function public.review_messaging_registration_application(uuid,text,text,text,text,text)
  to service_role;
grant execute on function public.record_messaging_number_candidate(uuid,text,text,text,text)
  to service_role;
grant execute on function public.claim_messaging_number_operation(uuid,text,text,text,jsonb)
  to service_role;
grant execute on function public.begin_messaging_number_operation(uuid,uuid)
  to service_role;
grant execute on function public.complete_messaging_number_operation(uuid,uuid,text,jsonb)
  to service_role;
grant execute on function public.reject_messaging_number_operation(uuid,uuid,text,text)
  to service_role;
grant execute on function public.mark_messaging_number_operation_indeterminate(uuid,uuid,text,text)
  to service_role;
grant execute on function public.record_messaging_number_assignment_state(uuid,text,text,text)
  to service_role;

commit;
