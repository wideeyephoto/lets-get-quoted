-- Dedicated AI Voice number inventory and provider-operation state machine.
--
-- DARK BY CONSTRUCTION. This migration creates no spend policy, purchase
-- authorization, scheduled worker, provider request, number, or entitlement.
-- A purchase is possible only after a service-side caller records a fresh,
-- exact-price authorization and then claims the matching leased operation.

begin;

-- -------------------------------------------------------------------------
-- 1. Voice-only inventory and exact recurring-charge authorization.
-- -------------------------------------------------------------------------

create table if not exists public.voice_number_spend_policies (
  provider text primary key check (provider = 'signalwire'),
  currency text not null default 'USD' check (currency = 'USD'),
  monthly_unit_price_cents bigint not null
    check (monthly_unit_price_cents between 1 and 999999999),
  aggregate_monthly_ceiling_cents bigint not null
    check (
      aggregate_monthly_ceiling_cents between 1 and 999999999
      and aggregate_monthly_ceiling_cents >= monthly_unit_price_cents
    ),
  purchase_enabled boolean not null default false,
  revision bigint not null default 1 check (revision between 1 and 2147483647),
  updated_by text not null check (pg_catalog.length(updated_by) between 3 and 320),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

comment on table public.voice_number_spend_policies is
  'Operations-controlled AI Voice number price/aggregate ceiling. No row is seeded by migrations.';

create table if not exists public.voice_number_inventory (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,
  provider text not null default 'signalwire' check (provider = 'signalwire'),
  provider_number_id text not null check (
    provider_number_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  e164_number text not null check (e164_number ~ '^\+[1-9][0-9]{7,14}$'),
  purpose text not null default 'ai_voice' check (purpose = 'ai_voice'),
  lifecycle_state text not null default 'purchased' check (lifecycle_state in (
    'purchased', 'configuring', 'active', 'suspended',
    'release_pending', 'release_indeterminate', 'released'
  )),
  voice_capable boolean not null default false,
  call_handler text,
  call_request_url text,
  call_request_method text,
  call_status_callback_url text,
  call_status_callback_method text,
  provider_verified_at timestamptz,
  last_provider_sync_at timestamptz,
  last_provider_check_attempt_at timestamptz,
  last_provider_check_error_code text check (
    last_provider_check_error_code is null
    or last_provider_check_error_code ~ '^[a-z][a-z0-9_]{2,99}$'
  ),
  provider_readiness_state text not null default 'unverified' check (
    provider_readiness_state in ('unverified', 'ready', 'drifted', 'missing')
  ),
  provider_readiness_reason text check (
    provider_readiness_reason is null
    or provider_readiness_reason ~ '^[a-z][a-z0-9_]{2,99}$'
  ),
  provider_readiness_changed_at timestamptz,
  last_provider_observation jsonb check (
    last_provider_observation is null
    or (
      pg_catalog.jsonb_typeof(last_provider_observation) = 'object'
      and pg_catalog.octet_length(last_provider_observation::text) <= 65536
    )
  ),
  activated_at timestamptz,
  suspended_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint voice_number_inventory_active_shape check (
    lifecycle_state <> 'active'
    or (
      voice_capable
      and provider_readiness_state = 'ready'
      and pg_catalog.lower(coalesce(call_handler, '')) = 'laml_webhooks'
      and call_request_method = 'POST'
      and call_request_url ~ '^https://[^[:space:]]+/api/voice/ai$'
      and call_status_callback_url ~ '^https://[^[:space:]]+/api/voice/provider-status$'
      and call_status_callback_method = 'POST'
      and provider_verified_at is not null
      and last_provider_sync_at is not null
      and activated_at is not null
      and suspended_at is null
      and released_at is null
    )
  ),
  constraint voice_number_inventory_lifecycle_shape check (
    (lifecycle_state = 'released' and released_at is not null and suspended_at is not null)
    or (lifecycle_state in ('suspended', 'release_indeterminate')
        and suspended_at is not null and released_at is null)
    or (lifecycle_state not in ('released', 'suspended', 'release_indeterminate')
        and released_at is null)
  )
);

create unique index if not exists voice_number_inventory_live_account_uidx
  on public.voice_number_inventory (account_id)
  where lifecycle_state <> 'released';
create index if not exists voice_number_inventory_account_idx
  on public.voice_number_inventory (account_id);
create unique index if not exists voice_number_inventory_live_e164_uidx
  on public.voice_number_inventory (provider, e164_number)
  where lifecycle_state <> 'released';
create unique index if not exists voice_number_inventory_live_provider_id_uidx
  on public.voice_number_inventory (provider, provider_number_id)
  where lifecycle_state <> 'released';
create index if not exists voice_number_inventory_ready_lookup_idx
  on public.voice_number_inventory (provider, account_id, e164_number)
  where lifecycle_state = 'active';

create table if not exists public.voice_number_candidate_observations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  provider text not null default 'signalwire' check (provider = 'signalwire'),
  candidate_number text not null check (candidate_number ~ '^\+[1-9][0-9]{7,14}$'),
  voice_capable boolean not null check (voice_capable),
  search_fingerprint text not null unique check (search_fingerprint ~ '^[a-f0-9]{64}$'),
  provider_result jsonb not null check (
    pg_catalog.jsonb_typeof(provider_result) = 'object'
    and pg_catalog.octet_length(provider_result::text) <= 8192
    and provider_result->>'provider' = provider
    and provider_result->>'number' = candidate_number
    and provider_result->'voice_capable' = 'true'::jsonb
  ),
  currency text not null default 'USD' check (currency = 'USD'),
  monthly_unit_price_cents bigint not null
    check (monthly_unit_price_cents between 1 and 999999999),
  aggregate_monthly_ceiling_cents bigint not null
    check (aggregate_monthly_ceiling_cents between monthly_unit_price_cents and 999999999),
  spend_policy_revision bigint not null check (spend_policy_revision between 1 and 2147483647),
  price_evidence_source text not null check (price_evidence_source = 'signalwire_dashboard'),
  observed_by text not null check (pg_catalog.length(observed_by) between 3 and 320),
  observed_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint voice_number_candidate_observation_window check (
    expires_at > observed_at and expires_at <= observed_at + interval '15 minutes'
  )
);
create index if not exists voice_number_candidate_observations_number_idx
  on public.voice_number_candidate_observations (provider, candidate_number, expires_at desc);

create table if not exists public.voice_number_purchase_authorizations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,
  provider text not null default 'signalwire' check (provider = 'signalwire'),
  candidate_observation_id uuid not null unique
    references public.voice_number_candidate_observations(id) on delete restrict,
  candidate_number text not null check (candidate_number ~ '^\+[1-9][0-9]{7,14}$'),
  currency text not null default 'USD' check (currency = 'USD'),
  monthly_unit_price_cents bigint not null
    check (monthly_unit_price_cents between 1 and 999999999),
  aggregate_monthly_ceiling_cents bigint not null
    check (aggregate_monthly_ceiling_cents between monthly_unit_price_cents and 999999999),
  spend_policy_revision bigint not null check (spend_policy_revision between 1 and 2147483647),
  confirmation_key text not null unique
    check (confirmation_key ~ '^[A-Za-z0-9][A-Za-z0-9:._/+\-]{15,249}$'),
  authorized_by text not null check (pg_catalog.length(authorized_by) between 3 and 320),
  price_evidence_source text not null check (price_evidence_source = 'signalwire_dashboard'),
  price_observed_at timestamptz not null,
  authorized_at timestamptz not null,
  expires_at timestamptz not null,
  state text not null default 'authorized' check (state in ('authorized', 'consumed', 'revoked')),
  consumed_operation_id uuid,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  constraint voice_number_purchase_authorization_window check (
    expires_at > authorized_at
    and expires_at <= authorized_at + interval '15 minutes'
    and expires_at <= price_observed_at + interval '15 minutes'
  ),
  constraint voice_number_purchase_authorization_state_shape check (
    (state = 'authorized' and consumed_operation_id is null and consumed_at is null and revoked_at is null)
    or (state = 'consumed' and consumed_operation_id is not null and consumed_at is not null and revoked_at is null)
    or (state = 'revoked' and consumed_operation_id is null and consumed_at is null and revoked_at is not null)
  )
);

create index if not exists voice_number_purchase_authorizations_account_idx
  on public.voice_number_purchase_authorizations (account_id, authorized_at desc);

-- -------------------------------------------------------------------------
-- 2. Idempotent, leased provider mutations and immutable attempts.
-- -------------------------------------------------------------------------

create table if not exists public.voice_number_provisioning_operations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,
  provider text not null default 'signalwire' check (provider = 'signalwire'),
  operation_type text not null check (operation_type in (
    'purchase_number', 'configure_voice', 'release_number'
  )),
  inventory_id uuid references public.voice_number_inventory(id) on delete restrict,
  purchase_authorization_id uuid
    references public.voice_number_purchase_authorizations(id) on delete restrict,
  idempotency_key text not null unique
    check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9:._/+\-]{7,249}$'),
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  request_payload jsonb not null check (
    pg_catalog.jsonb_typeof(request_payload) = 'object'
    and pg_catalog.octet_length(request_payload::text) <= 32768
  ),
  state text not null default 'pending' check (state in (
    'pending', 'claimed', 'request_started', 'succeeded', 'failed',
    'indeterminate', 'cancelled'
  )),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  claim_token uuid,
  lease_expires_at timestamptz,
  request_started_at timestamptz,
  monthly_unit_price_cents bigint,
  aggregate_monthly_ceiling_cents bigint,
  spend_policy_revision bigint,
  provider_object_id text,
  provider_result jsonb check (
    provider_result is null
    or (
      pg_catalog.jsonb_typeof(provider_result) = 'object'
      and pg_catalog.octet_length(provider_result::text) <= 65536
    )
  ),
  observed_provider_object_id text check (
    observed_provider_object_id is null
    or observed_provider_object_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  observed_provider_result jsonb check (
    observed_provider_result is null
    or (
      pg_catalog.jsonb_typeof(observed_provider_result) = 'object'
      and pg_catalog.octet_length(observed_provider_result::text) <= 65536
    )
  ),
  observed_provider_recorded_at timestamptz,
  observed_provider_recorded_by text check (
    observed_provider_recorded_by is null
    or pg_catalog.length(observed_provider_recorded_by) between 3 and 320
  ),
  expected_identity_disposition text check (
    expected_identity_disposition is null
    or expected_identity_disposition in ('retained', 'released', 'confirmed_absent')
  ),
  observed_identity_disposition text check (
    observed_identity_disposition is null
    or observed_identity_disposition in (
      'not_observed', 'same_as_expected', 'released', 'confirmed_absent'
    )
  ),
  reconciliation_evidence jsonb check (
    reconciliation_evidence is null
    or (
      pg_catalog.jsonb_typeof(reconciliation_evidence) = 'object'
      and pg_catalog.octet_length(reconciliation_evidence::text) <= 8192
    )
  ),
  error_code text check (error_code is null or error_code ~ '^[a-z][a-z0-9_]{2,99}$'),
  error_detail text check (error_detail is null or pg_catalog.length(error_detail) <= 2000),
  completed_at timestamptz,
  failed_at timestamptz,
  indeterminate_at timestamptz,
  resolved_at timestamptz,
  resolved_by text check (resolved_by is null or pg_catalog.length(resolved_by) between 3 and 320),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint voice_number_operation_spend_shape check (
    operation_type <> 'purchase_number'
    or (state = 'succeeded' and inventory_id is not null)
    or (state <> 'succeeded' and inventory_id is null)
  ),
  constraint voice_number_operation_price_shape check (
    (
      operation_type = 'purchase_number'
      and purchase_authorization_id is not null
      and monthly_unit_price_cents between 1 and 999999999
      and aggregate_monthly_ceiling_cents between monthly_unit_price_cents and 999999999
      and spend_policy_revision between 1 and 2147483647
    )
    or (
      operation_type <> 'purchase_number'
      and purchase_authorization_id is null
      and monthly_unit_price_cents is null
      and aggregate_monthly_ceiling_cents is null
      and spend_policy_revision is null
    )
  ),
  constraint voice_number_operation_inventory_shape check (
    (operation_type = 'purchase_number')
    or (operation_type in ('configure_voice', 'release_number') and inventory_id is not null)
  ),
  constraint voice_number_operation_state_shape check (
    (state = 'pending' and claim_token is null and lease_expires_at is null
      and request_started_at is null and completed_at is null and failed_at is null
      and indeterminate_at is null and resolved_at is null)
    or (state = 'claimed' and claim_token is not null and lease_expires_at is not null
      and request_started_at is null and completed_at is null and failed_at is null
      and indeterminate_at is null and resolved_at is null)
    or (state = 'request_started' and claim_token is not null and lease_expires_at is not null
      and request_started_at is not null and completed_at is null and failed_at is null
      and indeterminate_at is null and resolved_at is null)
    or (state = 'succeeded' and claim_token is null and lease_expires_at is null
      and completed_at is not null and failed_at is null)
    or (state = 'failed' and claim_token is null and lease_expires_at is null
      and failed_at is not null and completed_at is null)
    or (state = 'indeterminate' and claim_token is null and lease_expires_at is null
      and indeterminate_at is not null and completed_at is null and failed_at is null
      and resolved_at is null)
    or (state = 'cancelled' and claim_token is null and lease_expires_at is null)
  ),
  constraint voice_number_operation_resolution_shape check (
    (resolved_at is null and resolved_by is null
      and expected_identity_disposition is null
      and observed_identity_disposition is null
      and reconciliation_evidence is null)
    or (resolved_at is not null and resolved_by is not null
        and indeterminate_at is not null and state in ('succeeded', 'failed')
        and expected_identity_disposition is not null
        and observed_identity_disposition is not null
        and reconciliation_evidence is not null)
  )
);

alter table public.voice_number_purchase_authorizations
  drop constraint if exists voice_number_purchase_authorizations_consumed_operation_fkey;
alter table public.voice_number_purchase_authorizations
  add constraint voice_number_purchase_authorizations_consumed_operation_fkey
  foreign key (consumed_operation_id)
  references public.voice_number_provisioning_operations(id) on delete restrict;

create unique index if not exists voice_number_operations_one_unresolved_account_uidx
  on public.voice_number_provisioning_operations (account_id)
  where state in ('pending', 'claimed', 'request_started', 'indeterminate');
create unique index if not exists voice_number_operations_one_unresolved_purchase_number_uidx
  on public.voice_number_provisioning_operations (
    provider,
    (request_payload->>'number')
  )
  where operation_type = 'purchase_number'
    and state in ('pending', 'claimed', 'request_started', 'indeterminate');
create index if not exists voice_number_operations_account_idx
  on public.voice_number_provisioning_operations (account_id, created_at desc);
create index if not exists voice_number_operations_review_idx
  on public.voice_number_provisioning_operations (state, updated_at)
  where state in ('request_started', 'failed', 'indeterminate');
create index if not exists voice_number_operations_stale_lease_idx
  on public.voice_number_provisioning_operations (lease_expires_at)
  where state in ('claimed', 'request_started');
create index if not exists voice_number_operations_inventory_idx
  on public.voice_number_provisioning_operations (inventory_id, created_at desc)
  where inventory_id is not null;
create unique index if not exists voice_number_operations_purchase_authorization_uidx
  on public.voice_number_provisioning_operations (purchase_authorization_id)
  where purchase_authorization_id is not null;
create unique index if not exists voice_number_purchase_authorizations_consumed_operation_uidx
  on public.voice_number_purchase_authorizations (consumed_operation_id)
  where consumed_operation_id is not null;

create table if not exists public.voice_number_provisioning_attempts (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  operation_id uuid not null
    references public.voice_number_provisioning_operations(id) on delete restrict,
  attempt_number integer not null check (attempt_number between 1 and 5),
  claim_token uuid not null unique,
  claimed_at timestamptz not null,
  request_started_at timestamptz,
  outcome text check (outcome is null or outcome in (
    'succeeded', 'provider_rejected', 'indeterminate', 'lease_expired',
    'authorization_invalidated', 'safety_conflict'
  )),
  error_code text check (error_code is null or error_code ~ '^[a-z][a-z0-9_]{2,99}$'),
  finished_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  unique (operation_id, attempt_number),
  constraint voice_number_attempt_outcome_shape check (
    (outcome is null and finished_at is null)
    or (outcome is not null and finished_at is not null)
  )
);

create unique index if not exists voice_number_attempts_one_open_uidx
  on public.voice_number_provisioning_attempts (operation_id)
  where outcome is null;

create table if not exists public.voice_number_operation_retry_authorizations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,
  failed_operation_id uuid not null
    references public.voice_number_provisioning_operations(id) on delete restrict,
  operation_type text not null check (operation_type in ('configure_voice', 'release_number')),
  inventory_id uuid not null references public.voice_number_inventory(id) on delete restrict,
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  request_payload jsonb not null check (
    pg_catalog.jsonb_typeof(request_payload) = 'object'
    and pg_catalog.octet_length(request_payload::text) <= 32768
  ),
  retry_generation integer not null check (retry_generation between 1 and 5),
  recovery_token_hmac text not null unique check (recovery_token_hmac ~ '^[a-f0-9]{64}$'),
  authorized_by text not null check (pg_catalog.length(authorized_by) between 3 and 320),
  authorization_reason text not null check (pg_catalog.length(authorization_reason) between 3 and 1000),
  authorized_at timestamptz not null,
  expires_at timestamptz not null,
  state text not null default 'authorized' check (state in ('authorized', 'consumed', 'revoked')),
  consumed_operation_id uuid,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  unique (failed_operation_id, retry_generation),
  constraint voice_number_retry_authorization_window check (
    expires_at > authorized_at and expires_at <= authorized_at + interval '15 minutes'
  ),
  constraint voice_number_retry_authorization_state_shape check (
    (state = 'authorized' and consumed_operation_id is null and consumed_at is null and revoked_at is null)
    or (state = 'consumed' and consumed_operation_id is not null and consumed_at is not null and revoked_at is null)
    or (state = 'revoked' and consumed_operation_id is null and consumed_at is null and revoked_at is not null)
  )
);

alter table public.voice_number_provisioning_operations
  add column if not exists retry_authorization_id uuid;
alter table public.voice_number_provisioning_operations
  add column if not exists retry_of_operation_id uuid;
alter table public.voice_number_provisioning_operations
  add column if not exists retry_generation integer not null default 0;
alter table public.voice_number_provisioning_operations
  drop constraint if exists voice_number_operations_retry_authorization_fkey;
alter table public.voice_number_provisioning_operations
  add constraint voice_number_operations_retry_authorization_fkey
  foreign key (retry_authorization_id)
  references public.voice_number_operation_retry_authorizations(id) on delete restrict;
alter table public.voice_number_provisioning_operations
  drop constraint if exists voice_number_operations_retry_of_fkey;
alter table public.voice_number_provisioning_operations
  add constraint voice_number_operations_retry_of_fkey
  foreign key (retry_of_operation_id)
  references public.voice_number_provisioning_operations(id) on delete restrict;
alter table public.voice_number_provisioning_operations
  drop constraint if exists voice_number_operations_retry_shape;
alter table public.voice_number_provisioning_operations
  add constraint voice_number_operations_retry_shape check (
    (retry_generation = 0 and retry_authorization_id is null and retry_of_operation_id is null)
    or (
      retry_generation between 1 and 5
      and operation_type in ('configure_voice', 'release_number')
      and retry_authorization_id is not null
      and retry_of_operation_id is not null
    )
  );

alter table public.voice_number_operation_retry_authorizations
  drop constraint if exists voice_number_retry_authorizations_consumed_operation_fkey;
alter table public.voice_number_operation_retry_authorizations
  add constraint voice_number_retry_authorizations_consumed_operation_fkey
  foreign key (consumed_operation_id)
  references public.voice_number_provisioning_operations(id) on delete restrict;

create unique index if not exists voice_number_operations_retry_authorization_uidx
  on public.voice_number_provisioning_operations (retry_authorization_id)
  where retry_authorization_id is not null;
create index if not exists voice_number_operations_retry_of_idx
  on public.voice_number_provisioning_operations (retry_of_operation_id)
  where retry_of_operation_id is not null;
create unique index if not exists voice_number_retry_authorizations_consumed_operation_uidx
  on public.voice_number_operation_retry_authorizations (consumed_operation_id)
  where consumed_operation_id is not null;
create unique index if not exists voice_number_retry_authorizations_one_open_uidx
  on public.voice_number_operation_retry_authorizations (failed_operation_id)
  where state = 'authorized';
create index if not exists voice_number_retry_authorizations_account_idx
  on public.voice_number_operation_retry_authorizations (account_id);
create index if not exists voice_number_retry_authorizations_inventory_idx
  on public.voice_number_operation_retry_authorizations (inventory_id);

-- A reconciliation worker may delete a wrong/uncertain carrier resource only
-- while it owns an exact, durable identity reservation. The reservation keeps
-- blocking re-import after a worker lease expires until cleanup is explicitly
-- finalized as released or confirmed absent.
create table if not exists public.voice_number_identity_cleanup_reservations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,
  operation_id uuid not null
    references public.voice_number_provisioning_operations(id) on delete restrict,
  provider text not null default 'signalwire' check (provider = 'signalwire'),
  identity_kind text not null check (identity_kind in ('expected', 'observed', 'discovered')),
  provider_number_id text not null check (
    provider_number_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  e164_number text not null check (e164_number ~ '^\+[1-9][0-9]{7,14}$'),
  reservation_key text not null unique check (
    reservation_key ~ '^[A-Za-z0-9][A-Za-z0-9:._/+\-]{15,249}$'
  ),
  lease_token uuid,
  lease_expires_at timestamptz,
  state text not null default 'reserved' check (
    state in ('reserved', 'released', 'confirmed_absent')
  ),
  authorized_by text not null check (pg_catalog.length(authorized_by) between 3 and 320),
  authorization_reason text not null check (
    pg_catalog.length(authorization_reason) between 3 and 1000
  ),
  reserved_at timestamptz not null,
  finalized_at timestamptz,
  finalization_evidence jsonb check (
    finalization_evidence is null
    or (
      pg_catalog.jsonb_typeof(finalization_evidence) = 'object'
      and pg_catalog.octet_length(finalization_evidence::text) <= 8192
    )
  ),
  finalized_by text check (
    finalized_by is null or pg_catalog.length(finalized_by) between 3 and 320
  ),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (operation_id, identity_kind, provider_number_id, e164_number),
  constraint voice_number_cleanup_reservation_lease_window check (
    (state = 'reserved' and lease_token is not null and lease_expires_at is not null
      and lease_expires_at > reserved_at
      and lease_expires_at <= reserved_at + interval '5 minutes'
      and finalized_at is null and finalization_evidence is null and finalized_by is null)
    or (state in ('released', 'confirmed_absent')
      and lease_token is null and lease_expires_at is null
      and finalized_at is not null and finalization_evidence is not null
      and finalized_by is not null)
  )
);
alter table public.voice_number_identity_cleanup_reservations
  drop constraint if exists voice_number_identity_cleanup_reservations_identity_kind_check;
alter table public.voice_number_identity_cleanup_reservations
  add constraint voice_number_identity_cleanup_reservations_identity_kind_check
  check (identity_kind in ('expected', 'observed', 'discovered'));
create unique index if not exists voice_number_cleanup_reserved_provider_id_uidx
  on public.voice_number_identity_cleanup_reservations (provider, provider_number_id)
  where state = 'reserved';
drop index if exists public.voice_number_cleanup_reserved_e164_uidx;
create index if not exists voice_number_cleanup_reserved_e164_idx
  on public.voice_number_identity_cleanup_reservations (provider, e164_number)
  where state = 'reserved';
create index if not exists voice_number_cleanup_operation_idx
  on public.voice_number_identity_cleanup_reservations (operation_id, created_at desc);
create index if not exists voice_number_cleanup_account_idx
  on public.voice_number_identity_cleanup_reservations (account_id, created_at desc);
create unique index if not exists voice_number_cleanup_one_reserved_expected_operation_uidx
  on public.voice_number_identity_cleanup_reservations (operation_id)
  where identity_kind = 'expected' and state = 'reserved';

-- Every durable identity carried by an unresolved operation is ownership
-- evidence. Centralize these predicates so claim, import, assignment, and
-- destructive cleanup cannot drift back to checking only the requested E.164.
create or replace function public.unresolved_voice_number_identity_conflict(
  p_excluded_operation_id uuid,
  p_provider_number_id text,
  p_e164_number text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $fn$
  select exists (
    select 1
      from public.voice_number_provisioning_operations operation
     where operation.provider = 'signalwire'
       and operation.state in ('pending', 'claimed', 'request_started', 'indeterminate')
       and (p_excluded_operation_id is null or operation.id <> p_excluded_operation_id)
       and (
         (
           p_provider_number_id is not null
           and (
             operation.request_payload->>'provider_number_id' = p_provider_number_id
             or operation.provider_object_id = p_provider_number_id
             or operation.provider_result->>'id' = p_provider_number_id
             or operation.observed_provider_object_id = p_provider_number_id
             or operation.observed_provider_result->>'id' = p_provider_number_id
           )
         )
         or (
           p_e164_number is not null
           and (
             operation.request_payload->>'number' = p_e164_number
             or operation.provider_result->>'number' = p_e164_number
             or operation.observed_provider_result->>'number' = p_e164_number
           )
         )
       )
  )
$fn$;

create or replace function public.unresolved_messaging_number_identity_conflict(
  p_excluded_operation_id uuid,
  p_provider_number_id text,
  p_e164_number text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $fn$
  select exists (
    select 1
      from public.messaging_number_provisioning_operations operation
      join public.messaging_registration_applications application
        on application.id = operation.application_id
     where application.provider = 'signalwire'
       and operation.state in ('pending', 'claimed', 'request_started', 'indeterminate')
       and (p_excluded_operation_id is null or operation.id <> p_excluded_operation_id)
       and (
         (
           p_provider_number_id is not null
           and (
             operation.request_payload->>'provider_number_id' = p_provider_number_id
             or operation.provider_object_id = p_provider_number_id
             or operation.provider_result->>'id' = p_provider_number_id
             or operation.provider_result->>'provider_number_id' = p_provider_number_id
             or application.provider_number_id = p_provider_number_id
           )
         )
         or (
           p_e164_number is not null
           and (
             operation.request_payload->>'number' = p_e164_number
             or operation.provider_result->>'number' = p_e164_number
             or application.purchased_number = p_e164_number
           )
         )
       )
  )
$fn$;

create or replace function public.prevent_reserved_voice_identity_assignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_row jsonb;
  v_provider_number_id text;
  v_e164_number text;
begin
  v_row := pg_catalog.to_jsonb(new);
  v_provider_number_id := v_row->>'provider_number_id';
  v_e164_number := v_row->>'e164_number';
  if v_row->>'provider' is distinct from 'signalwire' then
    return new;
  end if;
  if (tg_table_name = 'sms_sender_numbers' and v_row->>'provisioning_status' = 'released')
     or (tg_table_name = 'voice_number_inventory' and v_row->>'lifecycle_state' = 'released') then
    return new;
  end if;
  -- Cross-rail mutations always take the shared global lock before either
  -- exact identity lock. Messaging purchase claims use the same first lock.
  perform pg_catalog.pg_advisory_xact_lock(1280265031, 2108);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('voice-cleanup-id:' || v_provider_number_id, 91240519)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('voice-cleanup-number:' || v_e164_number, 91240520)
  );
  if tg_table_name = 'sms_sender_numbers' and exists (
    select 1 from public.voice_number_inventory i
     where i.provider = 'signalwire' and i.lifecycle_state <> 'released'
       and (i.provider_number_id = v_provider_number_id or i.e164_number = v_e164_number)
  ) then
    raise exception 'Provider identity is already owned by the live AI Voice rail'
      using errcode = '23505';
  elsif tg_table_name = 'sms_sender_numbers'
        and public.unresolved_voice_number_identity_conflict(
          null, v_provider_number_id, v_e164_number
        ) then
    raise exception 'Provider identity is reserved by an unresolved AI Voice operation'
      using errcode = '23505';
  elsif tg_table_name = 'voice_number_inventory' and exists (
    select 1 from public.sms_sender_numbers s
     where s.provider = 'signalwire' and s.provisioning_status <> 'released'
       and (s.provider_number_id = v_provider_number_id or s.e164_number = v_e164_number)
  ) then
    raise exception 'Provider identity is already owned by the live SMS rail'
      using errcode = '23505';
  elsif tg_table_name = 'voice_number_inventory'
        and public.unresolved_messaging_number_identity_conflict(
          null, v_provider_number_id, v_e164_number
        ) then
    raise exception 'Provider identity is reserved by an unresolved messaging operation'
      using errcode = '23505';
  end if;
  if exists (
    select 1
      from public.voice_number_identity_cleanup_reservations r
     where r.provider = 'signalwire'
       and r.state = 'reserved'
       and (
         r.provider_number_id = v_provider_number_id
         or r.e164_number = v_e164_number
       )
  ) then
    raise exception 'Provider identity is reserved for fail-closed AI Voice cleanup'
      using errcode = '55000';
  end if;
  return new;
end
$fn$;

create or replace function public.prevent_messaging_operation_voice_identity_conflict()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_provider text;
  v_request_provider_number_id text;
  v_request_number text;
  v_result_provider_number_id text;
  v_result_number text;
  v_identity text;
begin
  if tg_op = 'INSERT'
     and new.state not in ('pending', 'claimed', 'request_started', 'indeterminate') then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.state not in ('pending', 'claimed', 'request_started', 'indeterminate')
     and new.state not in ('pending', 'claimed', 'request_started', 'indeterminate') then
    return new;
  end if;
  select application.provider into strict v_provider
    from public.messaging_registration_applications application
   where application.id = new.application_id;
  if v_provider <> 'signalwire' then
    return new;
  end if;

  v_request_provider_number_id := new.request_payload->>'provider_number_id';
  v_request_number := new.request_payload->>'number';
  v_result_provider_number_id := coalesce(
    new.provider_object_id,
    new.provider_result->>'id',
    new.provider_result->>'provider_number_id'
  );
  v_result_number := new.provider_result->>'number';

  perform pg_catalog.pg_advisory_xact_lock(1280265031, 2108);
  for v_identity in
    select distinct identity_value
      from (values (v_request_provider_number_id), (v_result_provider_number_id)) identities(identity_value)
     where identity_value is not null
     order by identity_value
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('voice-cleanup-id:' || v_identity, 91240519)
    );
  end loop;
  for v_identity in
    select distinct identity_value
      from (values (v_request_number), (v_result_number)) identities(identity_value)
     where identity_value is not null
     order by identity_value
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('voice-cleanup-number:' || v_identity, 91240520)
    );
  end loop;

  if new.operation_type = 'purchase_number'
     and new.state = 'request_started'
     and (tg_op = 'INSERT' or old.state is distinct from 'request_started')
     and exists (
       select 1
         from public.voice_number_identity_cleanup_reservations reservation
        where reservation.provider = 'signalwire'
          and reservation.state = 'reserved'
     ) then
    raise exception 'Messaging purchase cannot begin while AI Voice identity cleanup is active'
      using errcode = '55000';
  end if;

  -- A provider response with an unexpected identity must always be durably
  -- quarantined. Capture it under the provider-wide/exact locks, then let
  -- later reconciliation reject import or destructive action as appropriate.
  if tg_op = 'UPDATE'
     and old.state = 'request_started'
     and new.state = 'indeterminate' then
    return new;
  end if;
  -- A pre-request authorization failure must be able to release the global
  -- purchase gate even when the now-conflicting live rail is the reason for
  -- cancellation. This path carries no provider response or observation and
  -- cannot project/import a provider identity.
  if tg_op = 'UPDATE'
     and old.state = 'claimed'
     and new.state = 'cancelled'
     and old.provider_object_id is null
     and old.provider_result is null
     and new.provider_object_id is null
     and new.provider_result is null
     and (
       pg_catalog.to_jsonb(new) - array[
         'state', 'claim_token', 'lease_expires_at', 'error_code', 'error_detail',
         'updated_at'
       ]::text[]
     ) is not distinct from (
       pg_catalog.to_jsonb(old) - array[
         'state', 'claim_token', 'lease_expires_at', 'error_code', 'error_detail',
         'updated_at'
       ]::text[]
     ) then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.state = 'indeterminate'
     and new.state = 'indeterminate'
     and old.provider_object_id is null
     and old.provider_result is null
     and new.provider_object_id is not null
     and new.provider_object_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     and new.provider_result is not null
     and pg_catalog.jsonb_typeof(new.provider_result) = 'object'
     and new.provider_result->>'id' = new.provider_object_id
     and (
       pg_catalog.to_jsonb(new)
         - array['provider_object_id', 'provider_result', 'updated_at']::text[]
     ) is not distinct from (
       pg_catalog.to_jsonb(old)
         - array['provider_object_id', 'provider_result', 'updated_at']::text[]
     ) then
    return new;
  end if;

  if public.unresolved_messaging_number_identity_conflict(
       new.id, v_request_provider_number_id, v_request_number
     )
     or public.unresolved_messaging_number_identity_conflict(
       new.id, v_result_provider_number_id, v_result_number
     ) then
    raise exception 'Messaging operation identity conflicts with another unresolved messaging operation'
      using errcode = '55000';
  end if;

  if public.unresolved_voice_number_identity_conflict(
       null, v_request_provider_number_id, v_request_number
     )
     or public.unresolved_voice_number_identity_conflict(
       null, v_result_provider_number_id, v_result_number
     )
     or exists (
       select 1
         from public.voice_number_inventory inventory
        where inventory.provider = 'signalwire'
          and inventory.lifecycle_state <> 'released'
          and (
            (v_request_provider_number_id is not null
              and inventory.provider_number_id = v_request_provider_number_id)
            or (v_result_provider_number_id is not null
              and inventory.provider_number_id = v_result_provider_number_id)
            or (v_request_number is not null and inventory.e164_number = v_request_number)
            or (v_result_number is not null and inventory.e164_number = v_result_number)
          )
     )
     or exists (
       select 1
         from public.voice_number_identity_cleanup_reservations reservation
        where reservation.provider = 'signalwire'
          and reservation.state = 'reserved'
          and (
            (v_request_provider_number_id is not null
              and reservation.provider_number_id = v_request_provider_number_id)
            or (v_result_provider_number_id is not null
              and reservation.provider_number_id = v_result_provider_number_id)
            or (v_request_number is not null and reservation.e164_number = v_request_number)
            or (v_result_number is not null and reservation.e164_number = v_result_number)
          )
     ) then
    raise exception 'Messaging operation identity conflicts with AI Voice ownership or cleanup evidence'
      using errcode = '55000';
  end if;
  return new;
end
$fn$;

drop trigger if exists messaging_number_operations_voice_identity_guard
  on public.messaging_number_provisioning_operations;
create trigger messaging_number_operations_voice_identity_guard
before insert or update of application_id, request_payload, state,
  provider_object_id, provider_result
on public.messaging_number_provisioning_operations
for each row execute function public.prevent_messaging_operation_voice_identity_conflict();

create or replace function public.prevent_voice_operation_identity_conflict()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_request_provider_number_id text;
  v_request_number text;
  v_result_provider_number_id text;
  v_result_number text;
  v_observed_provider_number_id text;
  v_observed_number text;
  v_identity text;
begin
  if new.provider <> 'signalwire' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.state not in ('pending', 'claimed', 'request_started', 'indeterminate')
     and new.state not in ('pending', 'claimed', 'request_started', 'indeterminate') then
    return new;
  end if;

  v_request_provider_number_id := new.request_payload->>'provider_number_id';
  v_request_number := new.request_payload->>'number';
  v_result_provider_number_id := coalesce(new.provider_object_id, new.provider_result->>'id');
  v_result_number := new.provider_result->>'number';
  v_observed_provider_number_id := coalesce(
    new.observed_provider_object_id,
    new.observed_provider_result->>'id'
  );
  v_observed_number := new.observed_provider_result->>'number';

  perform pg_catalog.pg_advisory_xact_lock(1280265031, 2108);
  for v_identity in
    select distinct identity_value
      from (values
        (v_request_provider_number_id),
        (v_result_provider_number_id),
        (v_observed_provider_number_id)
      ) identities(identity_value)
     where identity_value is not null
     order by identity_value
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('voice-cleanup-id:' || v_identity, 91240519)
    );
  end loop;
  for v_identity in
    select distinct identity_value
      from (values (v_request_number), (v_result_number), (v_observed_number)) identities(identity_value)
     where identity_value is not null
     order by identity_value
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('voice-cleanup-number:' || v_identity, 91240520)
    );
  end loop;

  if new.operation_type = 'purchase_number'
     and new.state = 'request_started'
     and (tg_op = 'INSERT' or old.state is distinct from 'request_started')
     and exists (
       select 1
         from public.voice_number_identity_cleanup_reservations reservation
        where reservation.provider = 'signalwire'
          and reservation.state = 'reserved'
     ) then
    raise exception 'AI Voice purchase cannot begin while provider identity cleanup is active'
      using errcode = '55000';
  end if;

  if tg_op = 'UPDATE'
     and old.state = 'request_started'
     and new.state = 'indeterminate' then
    return new;
  end if;
  -- A pre-request authorization failure must be able to release the global
  -- purchase gate even when the now-conflicting live rail is the reason for
  -- cancellation. This path carries no provider response or observation and
  -- cannot project/import a provider identity.
  if tg_op = 'UPDATE'
     and old.state = 'claimed'
     and new.state = 'cancelled'
     and old.provider_object_id is null
     and old.provider_result is null
     and old.observed_provider_object_id is null
     and old.observed_provider_result is null
     and new.provider_object_id is null
     and new.provider_result is null
     and new.observed_provider_object_id is null
     and new.observed_provider_result is null
     and (
       pg_catalog.to_jsonb(new) - array[
         'state', 'claim_token', 'lease_expires_at', 'error_code', 'error_detail',
         'updated_at'
       ]::text[]
     ) is not distinct from (
       pg_catalog.to_jsonb(old) - array[
         'state', 'claim_token', 'lease_expires_at', 'error_code', 'error_detail',
         'updated_at'
       ]::text[]
     ) then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.state = 'indeterminate'
     and new.state = 'indeterminate'
     and old.observed_provider_object_id is null
     and old.observed_provider_result is null
     and old.observed_provider_recorded_at is null
     and old.observed_provider_recorded_by is null
     and new.observed_provider_object_id is not null
     and new.observed_provider_object_id
       ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     and new.observed_provider_result is not null
     and pg_catalog.jsonb_typeof(new.observed_provider_result) = 'object'
     and new.observed_provider_result->>'provider' = 'signalwire'
     and new.observed_provider_result->>'id' = new.observed_provider_object_id
     and new.observed_provider_result->>'number' ~ '^\+[1-9][0-9]{7,14}$'
     and new.observed_provider_recorded_at is not null
     and new.observed_provider_recorded_by is not null
     and (
       pg_catalog.to_jsonb(new) - array[
         'observed_provider_object_id', 'observed_provider_result',
         'observed_provider_recorded_at', 'observed_provider_recorded_by', 'updated_at'
       ]::text[]
     ) is not distinct from (
       pg_catalog.to_jsonb(old) - array[
         'observed_provider_object_id', 'observed_provider_result',
         'observed_provider_recorded_at', 'observed_provider_recorded_by', 'updated_at'
       ]::text[]
     ) then
    return new;
  end if;

  if public.unresolved_voice_number_identity_conflict(
       new.id, v_request_provider_number_id, v_request_number
     )
     or public.unresolved_voice_number_identity_conflict(
       new.id, v_result_provider_number_id, v_result_number
     )
     or public.unresolved_voice_number_identity_conflict(
       new.id, v_observed_provider_number_id, v_observed_number
     ) then
    raise exception 'AI Voice operation identity conflicts with another unresolved AI Voice operation'
      using errcode = '55000';
  end if;
  if public.unresolved_messaging_number_identity_conflict(
       null, v_request_provider_number_id, v_request_number
     )
     or public.unresolved_messaging_number_identity_conflict(
       null, v_result_provider_number_id, v_result_number
     )
     or public.unresolved_messaging_number_identity_conflict(
       null, v_observed_provider_number_id, v_observed_number
     ) then
    raise exception 'AI Voice operation identity conflicts with an unresolved messaging operation'
      using errcode = '55000';
  end if;
  if exists (
    select 1
      from public.sms_sender_numbers sender
     where sender.provider = 'signalwire'
       and sender.provisioning_status <> 'released'
       and (
         (v_request_provider_number_id is not null
           and sender.provider_number_id = v_request_provider_number_id)
         or (v_result_provider_number_id is not null
           and sender.provider_number_id = v_result_provider_number_id)
         or (v_observed_provider_number_id is not null
           and sender.provider_number_id = v_observed_provider_number_id)
         or (v_request_number is not null and sender.e164_number = v_request_number)
         or (v_result_number is not null and sender.e164_number = v_result_number)
         or (v_observed_number is not null and sender.e164_number = v_observed_number)
       )
  ) then
    raise exception 'AI Voice operation identity is already owned by the live SMS rail'
      using errcode = '42501';
  end if;
  if exists (
    select 1
      from public.voice_number_identity_cleanup_reservations reservation
     where reservation.provider = 'signalwire'
       and reservation.state = 'reserved'
       and reservation.operation_id <> new.id
       and (
         (v_request_provider_number_id is not null
           and reservation.provider_number_id = v_request_provider_number_id)
         or (v_result_provider_number_id is not null
           and reservation.provider_number_id = v_result_provider_number_id)
         or (v_observed_provider_number_id is not null
           and reservation.provider_number_id = v_observed_provider_number_id)
         or (v_request_number is not null and reservation.e164_number = v_request_number)
         or (v_result_number is not null and reservation.e164_number = v_result_number)
         or (v_observed_number is not null and reservation.e164_number = v_observed_number)
       )
  ) then
    raise exception 'AI Voice operation identity is reserved by another cleanup operation'
      using errcode = '55000';
  end if;
  return new;
end
$fn$;

drop trigger if exists voice_number_operations_identity_conflict_guard
  on public.voice_number_provisioning_operations;
create trigger voice_number_operations_identity_conflict_guard
before insert or update of request_payload, state, provider_object_id,
  provider_result, observed_provider_object_id, observed_provider_result
on public.voice_number_provisioning_operations
for each row execute function public.prevent_voice_operation_identity_conflict();

drop trigger if exists sms_sender_numbers_voice_cleanup_reservation_guard
  on public.sms_sender_numbers;
create trigger sms_sender_numbers_voice_cleanup_reservation_guard
before insert or update of provider, provider_number_id, e164_number, provisioning_status
on public.sms_sender_numbers
for each row execute function public.prevent_reserved_voice_identity_assignment();

drop trigger if exists voice_number_inventory_cleanup_reservation_guard
  on public.voice_number_inventory;
create trigger voice_number_inventory_cleanup_reservation_guard
before insert or update of provider, provider_number_id, e164_number, lifecycle_state
on public.voice_number_inventory
for each row execute function public.prevent_reserved_voice_identity_assignment();

create or replace function public.prevent_voice_number_attempt_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
begin
  if tg_op = 'DELETE'
     or old.operation_id is distinct from new.operation_id
     or old.attempt_number is distinct from new.attempt_number
     or old.claim_token is distinct from new.claim_token
     or old.claimed_at is distinct from new.claimed_at
     or old.created_at is distinct from new.created_at
     or old.outcome is not null then
    raise exception 'Voice number attempt identity and terminal outcome are immutable'
      using errcode = '55000';
  end if;
  return new;
end
$fn$;

drop trigger if exists voice_number_attempts_append_only
  on public.voice_number_provisioning_attempts;
create trigger voice_number_attempts_append_only
before update or delete on public.voice_number_provisioning_attempts
for each row execute function public.prevent_voice_number_attempt_mutation();

create or replace function public.prevent_voice_number_candidate_observation_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
begin
  raise exception 'Voice number candidate and price evidence is immutable'
    using errcode = '55000';
end
$fn$;

drop trigger if exists voice_number_candidate_observations_immutable
  on public.voice_number_candidate_observations;
create trigger voice_number_candidate_observations_immutable
before update or delete on public.voice_number_candidate_observations
for each row execute function public.prevent_voice_number_candidate_observation_mutation();

create or replace function public.prevent_voice_number_authorization_rewrite()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
begin
  if tg_op = 'DELETE'
     or old.account_id is distinct from new.account_id
     or old.provider is distinct from new.provider
     or old.candidate_observation_id is distinct from new.candidate_observation_id
     or old.candidate_number is distinct from new.candidate_number
     or old.currency is distinct from new.currency
     or old.monthly_unit_price_cents is distinct from new.monthly_unit_price_cents
     or old.aggregate_monthly_ceiling_cents is distinct from new.aggregate_monthly_ceiling_cents
     or old.spend_policy_revision is distinct from new.spend_policy_revision
     or old.confirmation_key is distinct from new.confirmation_key
     or old.authorized_by is distinct from new.authorized_by
     or old.price_evidence_source is distinct from new.price_evidence_source
     or old.price_observed_at is distinct from new.price_observed_at
     or old.authorized_at is distinct from new.authorized_at
     or old.expires_at is distinct from new.expires_at
     or old.created_at is distinct from new.created_at
     or old.state <> 'authorized'
     or new.state not in ('consumed', 'revoked') then
    raise exception 'Voice number purchase authorization is immutable outside its one terminal transition'
      using errcode = '55000';
  end if;
  return new;
end
$fn$;

drop trigger if exists voice_number_purchase_authorizations_immutable
  on public.voice_number_purchase_authorizations;
create trigger voice_number_purchase_authorizations_immutable
before update or delete on public.voice_number_purchase_authorizations
for each row execute function public.prevent_voice_number_authorization_rewrite();

create or replace function public.prevent_voice_number_retry_authorization_rewrite()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
begin
  if tg_op = 'DELETE'
     or old.account_id is distinct from new.account_id
     or old.failed_operation_id is distinct from new.failed_operation_id
     or old.operation_type is distinct from new.operation_type
     or old.inventory_id is distinct from new.inventory_id
     or old.request_fingerprint is distinct from new.request_fingerprint
     or old.request_payload is distinct from new.request_payload
     or old.retry_generation is distinct from new.retry_generation
     or old.recovery_token_hmac is distinct from new.recovery_token_hmac
     or old.authorized_by is distinct from new.authorized_by
     or old.authorization_reason is distinct from new.authorization_reason
     or old.authorized_at is distinct from new.authorized_at
     or old.expires_at is distinct from new.expires_at
     or old.created_at is distinct from new.created_at
     or old.state <> 'authorized'
     or new.state not in ('consumed', 'revoked') then
    raise exception 'Voice number retry authorization is immutable outside its one terminal transition'
      using errcode = '55000';
  end if;
  return new;
end
$fn$;

drop trigger if exists voice_number_retry_authorizations_immutable
  on public.voice_number_operation_retry_authorizations;
create trigger voice_number_retry_authorizations_immutable
before update or delete on public.voice_number_operation_retry_authorizations
for each row execute function public.prevent_voice_number_retry_authorization_rewrite();

-- -------------------------------------------------------------------------
-- 3. Operations-only price policy and one-time purchase authorization.
-- -------------------------------------------------------------------------

create or replace function public.set_voice_number_spend_policy(
  p_provider text,
  p_monthly_unit_price_cents bigint,
  p_aggregate_monthly_ceiling_cents bigint,
  p_purchase_enabled boolean,
  p_actor_reference text
)
returns table (
  provider text,
  currency text,
  monthly_unit_price_cents bigint,
  aggregate_monthly_ceiling_cents bigint,
  purchase_enabled boolean,
  revision bigint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_policy public.voice_number_spend_policies%rowtype;
begin
  if p_provider is null
     or p_provider <> 'signalwire'
     or p_monthly_unit_price_cents not between 1 and 999999999
     or p_aggregate_monthly_ceiling_cents not between p_monthly_unit_price_cents and 999999999
     or p_purchase_enabled is null
     or p_actor_reference is null
     or pg_catalog.length(pg_catalog.btrim(p_actor_reference)) not between 3 and 320 then
    raise exception 'Voice number spend policy input is invalid' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('voice-number-spend:' || p_provider, 91240517)
  );
  insert into public.voice_number_spend_policies as policy (
    provider, currency, monthly_unit_price_cents, aggregate_monthly_ceiling_cents,
    purchase_enabled, revision, updated_by, created_at, updated_at
  ) values (
    p_provider, 'USD', p_monthly_unit_price_cents, p_aggregate_monthly_ceiling_cents,
    p_purchase_enabled, 1, pg_catalog.btrim(p_actor_reference), v_now, v_now
  )
  on conflict on constraint voice_number_spend_policies_pkey do update
    set monthly_unit_price_cents = excluded.monthly_unit_price_cents,
        aggregate_monthly_ceiling_cents = excluded.aggregate_monthly_ceiling_cents,
        purchase_enabled = excluded.purchase_enabled,
        revision = policy.revision + 1,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
  returning * into v_policy;

  return query select v_policy.provider, v_policy.currency,
    v_policy.monthly_unit_price_cents, v_policy.aggregate_monthly_ceiling_cents,
    v_policy.purchase_enabled, v_policy.revision, v_policy.updated_at;
end
$fn$;

create or replace function public.record_voice_number_candidate_observation(
  p_provider text,
  p_candidate_number text,
  p_voice_capable boolean,
  p_search_fingerprint text,
  p_provider_result jsonb,
  p_monthly_unit_price_cents bigint,
  p_spend_policy_revision bigint,
  p_price_evidence_source text,
  p_actor_reference text
)
returns table (
  observation_id uuid,
  observed_at timestamptz,
  expires_at timestamptz,
  monthly_unit_price_cents bigint,
  spend_policy_revision bigint,
  price_evidence_source text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_policy public.voice_number_spend_policies%rowtype;
  v_existing public.voice_number_candidate_observations%rowtype;
  v_observation public.voice_number_candidate_observations%rowtype;
begin
  if p_provider is distinct from 'signalwire'
     or p_candidate_number is null
     or p_candidate_number !~ '^\+[1-9][0-9]{7,14}$'
     or p_voice_capable is distinct from true
     or p_search_fingerprint is null
     or p_search_fingerprint !~ '^[a-f0-9]{64}$'
     or p_provider_result is null
     or pg_catalog.jsonb_typeof(p_provider_result) <> 'object'
     or pg_catalog.octet_length(p_provider_result::text) > 8192
     or p_provider_result->>'provider' is distinct from 'signalwire'
     or p_provider_result->>'number' is distinct from p_candidate_number
     or p_provider_result->'voice_capable' is distinct from 'true'::jsonb
     or exists (
       select 1 from pg_catalog.jsonb_object_keys(p_provider_result) as keys(key_name)
        where key_name not in (
          'provider', 'number', 'voice_capable', 'region', 'city', 'capabilities'
        )
     )
     or p_price_evidence_source is distinct from 'signalwire_dashboard'
     or p_actor_reference is null
     or pg_catalog.length(pg_catalog.btrim(p_actor_reference)) not between 3 and 320 then
    raise exception 'Voice number candidate observation input is invalid' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('voice-number-spend:signalwire', 91240517)
  );
  select * into strict v_policy
    from public.voice_number_spend_policies
   where provider = 'signalwire'
   for share;
  if not v_policy.purchase_enabled
     or p_monthly_unit_price_cents is distinct from v_policy.monthly_unit_price_cents
     or p_spend_policy_revision is distinct from v_policy.revision then
    raise exception 'Observed dashboard price does not match the enabled current spend policy'
      using errcode = '42501';
  end if;

  select * into v_existing
    from public.voice_number_candidate_observations
   where search_fingerprint = p_search_fingerprint
   for share;
  if found then
    if v_existing.provider is distinct from p_provider
       or v_existing.candidate_number is distinct from p_candidate_number
       or v_existing.voice_capable is distinct from p_voice_capable
       or v_existing.provider_result is distinct from p_provider_result
       or v_existing.monthly_unit_price_cents is distinct from p_monthly_unit_price_cents
       or v_existing.spend_policy_revision is distinct from p_spend_policy_revision
       or v_existing.price_evidence_source is distinct from p_price_evidence_source
       or v_existing.observed_by is distinct from pg_catalog.btrim(p_actor_reference) then
      raise exception 'Candidate observation fingerprint was reused with different immutable evidence'
        using errcode = '23505';
    end if;
    return query select v_existing.id, v_existing.observed_at, v_existing.expires_at,
      v_existing.monthly_unit_price_cents, v_existing.spend_policy_revision,
      v_existing.price_evidence_source;
    return;
  end if;

  insert into public.voice_number_candidate_observations (
    provider, candidate_number, voice_capable, search_fingerprint, provider_result,
    currency, monthly_unit_price_cents, aggregate_monthly_ceiling_cents,
    spend_policy_revision, price_evidence_source, observed_by,
    observed_at, expires_at, created_at
  ) values (
    'signalwire', p_candidate_number, true, p_search_fingerprint, p_provider_result,
    'USD', v_policy.monthly_unit_price_cents, v_policy.aggregate_monthly_ceiling_cents,
    v_policy.revision, 'signalwire_dashboard', pg_catalog.btrim(p_actor_reference),
    v_now, v_now + interval '15 minutes', v_now
  ) returning * into v_observation;

  return query select v_observation.id, v_observation.observed_at, v_observation.expires_at,
    v_observation.monthly_unit_price_cents, v_observation.spend_policy_revision,
    v_observation.price_evidence_source;
end
$fn$;

create or replace function public.authorize_voice_number_purchase(
  p_account_id uuid,
  p_provider text,
  p_candidate_number text,
  p_candidate_observation_id uuid,
  p_monthly_unit_price_cents bigint,
  p_aggregate_monthly_ceiling_cents bigint,
  p_spend_policy_revision bigint,
  p_confirmation_key text,
  p_actor_reference text
)
returns table (
  authorization_id uuid,
  candidate_observation_id uuid,
  authorized_at timestamptz,
  expires_at timestamptz,
  spend_policy_revision bigint,
  price_evidence_source text,
  price_observed_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_policy public.voice_number_spend_policies%rowtype;
  v_observation public.voice_number_candidate_observations%rowtype;
  v_existing public.voice_number_purchase_authorizations%rowtype;
  v_authorization public.voice_number_purchase_authorizations%rowtype;
begin
  if p_account_id is null
     or p_provider is null
     or p_provider <> 'signalwire'
     or p_candidate_number is null
     or p_candidate_number !~ '^\+[1-9][0-9]{7,14}$'
     or p_candidate_observation_id is null
     or p_confirmation_key is null
     or p_confirmation_key !~ '^[A-Za-z0-9][A-Za-z0-9:._/+\-]{15,249}$'
     or p_actor_reference is null
     or pg_catalog.length(pg_catalog.btrim(p_actor_reference)) not between 3 and 320 then
    raise exception 'Voice number purchase authorization input is invalid' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_account_id::text, 91240518)
  );
  perform 1 from public.accounts where id = p_account_id for update;
  if not found then
    raise exception 'Voice number purchase account does not exist' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('voice-number-spend:' || p_provider, 91240517)
  );
  select * into strict v_policy
    from public.voice_number_spend_policies
   where provider = p_provider
   for share;
  if not v_policy.purchase_enabled
     or p_monthly_unit_price_cents is distinct from v_policy.monthly_unit_price_cents
     or p_aggregate_monthly_ceiling_cents is distinct from v_policy.aggregate_monthly_ceiling_cents
     or p_spend_policy_revision is distinct from v_policy.revision then
    raise exception 'Exact current AI Voice recurring charge has not been enabled and authorized'
      using errcode = '42501';
  end if;

  select * into strict v_observation
    from public.voice_number_candidate_observations
   where id = p_candidate_observation_id
   for share;
  if v_observation.provider is distinct from p_provider
     or v_observation.candidate_number is distinct from p_candidate_number
     or not v_observation.voice_capable
     or v_observation.expires_at <= v_now
     or v_observation.monthly_unit_price_cents is distinct from p_monthly_unit_price_cents
     or v_observation.aggregate_monthly_ceiling_cents is distinct from p_aggregate_monthly_ceiling_cents
     or v_observation.spend_policy_revision is distinct from p_spend_policy_revision
     or v_observation.price_evidence_source is distinct from 'signalwire_dashboard'
     or v_observation.observed_at < v_now - interval '15 minutes' then
    raise exception 'Purchase authorization requires a fresh exact candidate and dashboard-price observation'
      using errcode = '42501';
  end if;

  select * into v_existing
    from public.voice_number_purchase_authorizations
   where confirmation_key = p_confirmation_key
   for update;
  if found then
    if v_existing.account_id is distinct from p_account_id
       or v_existing.provider is distinct from p_provider
       or v_existing.candidate_observation_id is distinct from p_candidate_observation_id
       or v_existing.candidate_number is distinct from p_candidate_number
       or v_existing.monthly_unit_price_cents is distinct from p_monthly_unit_price_cents
       or v_existing.aggregate_monthly_ceiling_cents is distinct from p_aggregate_monthly_ceiling_cents
       or v_existing.spend_policy_revision is distinct from p_spend_policy_revision
       or v_existing.authorized_by is distinct from pg_catalog.btrim(p_actor_reference) then
      raise exception 'Voice number confirmation key was already used with different immutable input'
        using errcode = '23505';
    end if;
    return query select v_existing.id, v_existing.candidate_observation_id,
      v_existing.authorized_at, v_existing.expires_at, v_existing.spend_policy_revision,
      v_existing.price_evidence_source, v_existing.price_observed_at;
    return;
  end if;

  if exists (
    select 1 from public.voice_number_inventory i
     where i.account_id = p_account_id and i.lifecycle_state <> 'released'
  ) or exists (
    select 1 from public.voice_number_provisioning_operations o
     where o.account_id = p_account_id
       and o.state in ('pending', 'claimed', 'request_started', 'indeterminate')
  ) then
    raise exception 'Account already has live or unresolved AI Voice number state'
      using errcode = '55000';
  end if;

  insert into public.voice_number_purchase_authorizations (
    account_id, provider, candidate_observation_id, candidate_number,
    currency, monthly_unit_price_cents,
    aggregate_monthly_ceiling_cents, spend_policy_revision, confirmation_key,
    authorized_by, price_evidence_source, price_observed_at, authorized_at, expires_at
  ) values (
    p_account_id, p_provider, v_observation.id, p_candidate_number,
    'USD', p_monthly_unit_price_cents,
    p_aggregate_monthly_ceiling_cents, p_spend_policy_revision, p_confirmation_key,
    pg_catalog.btrim(p_actor_reference), v_observation.price_evidence_source,
    v_observation.observed_at, v_now, least(v_now + interval '15 minutes', v_observation.expires_at)
  ) returning * into v_authorization;

  return query select v_authorization.id, v_authorization.candidate_observation_id,
    v_authorization.authorized_at, v_authorization.expires_at,
    v_authorization.spend_policy_revision, v_authorization.price_evidence_source,
    v_authorization.price_observed_at;
end
$fn$;

-- -------------------------------------------------------------------------
-- 4. Leased operation claim/begin/failure boundaries.
-- -------------------------------------------------------------------------

create or replace function public.authorize_voice_number_operation_retry(
  p_failed_operation_id uuid,
  p_recovery_token_hmac text,
  p_actor_reference text,
  p_reason text
)
returns table (
  retry_authorization_id uuid,
  retry_generation integer,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_account_id uuid;
  v_failed public.voice_number_provisioning_operations%rowtype;
  v_existing public.voice_number_operation_retry_authorizations%rowtype;
  v_authorization public.voice_number_operation_retry_authorizations%rowtype;
  v_generation integer;
begin
  if p_failed_operation_id is null
     or p_recovery_token_hmac is null
     or p_recovery_token_hmac !~ '^[a-f0-9]{64}$'
     or p_actor_reference is null
     or pg_catalog.length(pg_catalog.btrim(p_actor_reference)) not between 3 and 320
     or p_reason is null
     or pg_catalog.length(pg_catalog.btrim(p_reason)) not between 3 and 1000 then
    raise exception 'Voice number retry authorization input is invalid' using errcode = '22023';
  end if;

  select o.account_id into strict v_account_id
    from public.voice_number_provisioning_operations o
   where o.id = p_failed_operation_id;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_account_id::text, 91240518)
  );
  perform 1 from public.accounts where id = v_account_id for update;
  select o.* into strict v_failed
    from public.voice_number_provisioning_operations o
   where o.id = p_failed_operation_id
   for update;
  if v_failed.state <> 'failed'
     or v_failed.operation_type not in ('configure_voice', 'release_number')
     or v_failed.inventory_id is null then
    raise exception 'Only a definitive failed configure/release operation can receive an operator retry'
      using errcode = '55000';
  end if;
  v_generation := v_failed.retry_generation + 1;
  if v_generation > 5 then
    raise exception 'Voice number operation exhausted its bounded operator retry generations'
      using errcode = '54000';
  end if;

  select r.* into v_existing
    from public.voice_number_operation_retry_authorizations r
   where r.recovery_token_hmac = p_recovery_token_hmac
   for update;
  if found then
    if v_existing.failed_operation_id is distinct from v_failed.id
       or v_existing.account_id is distinct from v_failed.account_id
       or v_existing.operation_type is distinct from v_failed.operation_type
       or v_existing.inventory_id is distinct from v_failed.inventory_id
       or v_existing.request_fingerprint is distinct from v_failed.request_fingerprint
       or v_existing.request_payload is distinct from v_failed.request_payload
       or v_existing.retry_generation is distinct from v_generation
       or v_existing.authorized_by is distinct from pg_catalog.btrim(p_actor_reference)
       or v_existing.authorization_reason is distinct from pg_catalog.btrim(p_reason) then
      raise exception 'Voice number recovery token was reused with different immutable input'
        using errcode = '23505';
    end if;
    return query select v_existing.id, v_existing.retry_generation, v_existing.expires_at;
    return;
  end if;

  select r.* into v_existing
    from public.voice_number_operation_retry_authorizations r
   where r.failed_operation_id = v_failed.id
     and r.state = 'authorized'
   for update;
  if found then
    if v_existing.expires_at > v_now then
      raise exception 'A fresh operator retry authorization already exists for this failed operation'
        using errcode = '55000';
    end if;
    update public.voice_number_operation_retry_authorizations
       set state = 'revoked', revoked_at = v_now
     where id = v_existing.id;
  end if;

  insert into public.voice_number_operation_retry_authorizations (
    account_id, failed_operation_id, operation_type, inventory_id,
    request_fingerprint, request_payload, retry_generation, recovery_token_hmac,
    authorized_by, authorization_reason, authorized_at, expires_at, created_at
  ) values (
    v_failed.account_id, v_failed.id, v_failed.operation_type, v_failed.inventory_id,
    v_failed.request_fingerprint, v_failed.request_payload, v_generation, p_recovery_token_hmac,
    pg_catalog.btrim(p_actor_reference), pg_catalog.btrim(p_reason),
    v_now, v_now + interval '15 minutes', v_now
  ) returning * into v_authorization;

  return query select v_authorization.id, v_authorization.retry_generation,
    v_authorization.expires_at;
end
$fn$;

create or replace function public.reserve_voice_number_identity_cleanup(
  p_operation_id uuid,
  p_identity_kind text,
  p_provider_number_id text,
  p_e164_number text,
  p_reservation_key text,
  p_actor_reference text,
  p_reason text
)
returns table (
  reservation_id uuid,
  reserve_status text,
  lease_token uuid,
  lease_expires_at timestamptz,
  final_disposition text,
  finalized_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_account_id uuid;
  v_operation public.voice_number_provisioning_operations%rowtype;
  v_inventory public.voice_number_inventory%rowtype;
  v_reservation public.voice_number_identity_cleanup_reservations%rowtype;
  v_existing_reservation boolean := false;
  v_token uuid;
begin
  if p_operation_id is null
     or p_identity_kind is null
     or p_identity_kind not in ('expected', 'observed', 'discovered')
     or p_provider_number_id is null
     or p_provider_number_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or p_e164_number is null
     or p_e164_number !~ '^\+[1-9][0-9]{7,14}$'
     or p_reservation_key is null
     or p_reservation_key !~ '^[A-Za-z0-9][A-Za-z0-9:._/+\-]{15,249}$'
     or p_actor_reference is null
     or pg_catalog.length(pg_catalog.btrim(p_actor_reference)) not between 3 and 320
     or p_reason is null
     or pg_catalog.length(pg_catalog.btrim(p_reason)) not between 3 and 1000 then
    raise exception 'Voice number cleanup reservation input is invalid' using errcode = '22023';
  end if;

  select o.account_id into strict v_account_id
    from public.voice_number_provisioning_operations o where o.id = p_operation_id;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_account_id::text, 91240518)
  );
  perform pg_catalog.pg_advisory_xact_lock(1280265031, 2108);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('voice-cleanup-id:' || p_provider_number_id, 91240519)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('voice-cleanup-number:' || p_e164_number, 91240520)
  );
  perform 1 from public.accounts where id = v_account_id for update;
  select o.* into strict v_operation
    from public.voice_number_provisioning_operations o
   where o.id = p_operation_id
   for update;

  -- A terminal reservation is immutable evidence. Return that evidence before
  -- checking mutable inventory ownership so a worker can replay after a crash
  -- even when the identity has since been assigned legitimately elsewhere.
  select r.* into v_reservation
    from public.voice_number_identity_cleanup_reservations r
   where r.reservation_key = p_reservation_key
   for update;
  v_existing_reservation := found;
  if v_existing_reservation then
    if v_reservation.account_id is distinct from v_operation.account_id
       or v_reservation.operation_id is distinct from v_operation.id
       or v_reservation.identity_kind is distinct from p_identity_kind
       or v_reservation.provider_number_id is distinct from p_provider_number_id
       or v_reservation.e164_number is distinct from p_e164_number
       or v_reservation.authorization_reason is distinct from pg_catalog.btrim(p_reason) then
      raise exception 'Cleanup reservation key was reused with different immutable input'
        using errcode = '23505';
    end if;
    if v_reservation.state <> 'reserved' then
      return query select v_reservation.id, 'finalized'::text,
        null::uuid, null::timestamptz, v_reservation.state, v_reservation.finalized_at;
      return;
    end if;
  end if;

  if v_operation.state <> 'indeterminate' then
    raise exception 'Only an indeterminate AI Voice operation can reserve cleanup identity'
      using errcode = '55000';
  end if;

  if p_identity_kind = 'expected' then
    if v_operation.operation_type = 'release_number' then
      if v_operation.inventory_id is null
         or v_operation.request_payload->>'provider' is distinct from 'signalwire'
         or v_operation.request_payload->>'provider_number_id' is distinct from p_provider_number_id
         or v_operation.request_payload->>'number' is distinct from p_e164_number then
        raise exception 'Expected cleanup identity is not the exact indeterminate release resource'
          using errcode = '22000';
      end if;
      select i.* into strict v_inventory
        from public.voice_number_inventory i
       where i.id = v_operation.inventory_id
         and i.account_id = v_operation.account_id
         and i.provider_number_id = p_provider_number_id
         and i.e164_number = p_e164_number
         and i.lifecycle_state in ('release_pending', 'release_indeterminate', 'suspended')
       for update;
    elsif v_operation.operation_type = 'purchase_number' then
      if v_operation.request_payload->>'number' is distinct from p_e164_number
         or v_operation.observed_provider_object_id is not distinct from p_provider_number_id
         or v_operation.provider_object_id is not distinct from p_provider_number_id then
        raise exception 'Expected purchase cleanup identity is not a distinct exact-request resource'
          using errcode = '22000';
      end if;
    else
      raise exception 'Expected cleanup identity is not the exact indeterminate release resource'
        using errcode = '22000';
    end if;
  elsif p_identity_kind = 'observed' then
    if v_operation.operation_type <> 'purchase_number'
       or v_operation.observed_provider_object_id is distinct from p_provider_number_id
       or v_operation.observed_provider_result->>'number' is distinct from p_e164_number then
      raise exception 'Observed cleanup identity is not exact purchase-response evidence'
        using errcode = '22000';
    end if;
  else
    if v_operation.observed_provider_object_id is not distinct from p_provider_number_id
       or v_operation.request_payload->>'provider_number_id' is not distinct from p_provider_number_id
       or v_operation.provider_object_id is not distinct from p_provider_number_id then
      raise exception 'Discovered cleanup identity is not distinct from a durable reconciliation identity'
        using errcode = '22000';
    end if;
    if v_operation.operation_type <> 'purchase_number'
       or not exists (
      select 1
        from public.voice_number_identity_cleanup_reservations anchor
       where anchor.operation_id = v_operation.id
         and anchor.provider = 'signalwire'
          and anchor.e164_number = p_e164_number
          and anchor.identity_kind in ('expected', 'observed')
          and anchor.state = 'reserved'
          and (
            (
              anchor.identity_kind = 'expected'
              and v_operation.request_payload->>'number' = anchor.e164_number
              and v_operation.observed_provider_object_id is distinct from anchor.provider_number_id
              and v_operation.provider_object_id is distinct from anchor.provider_number_id
            )
            or (
              anchor.identity_kind = 'observed'
              and v_operation.observed_provider_object_id = anchor.provider_number_id
              and v_operation.observed_provider_result->>'provider' = 'signalwire'
              and v_operation.observed_provider_result->>'id' = anchor.provider_number_id
              and v_operation.observed_provider_result->>'number' = anchor.e164_number
            )
          )
    ) then
      raise exception 'Discovered cleanup identity requires a reserved exact-purchase cleanup anchor'
        using errcode = '42501';
    end if;
  end if;

  -- Provider POST may return an identity not knowable before the response.
  -- While any other purchase request is in flight, no orphan cleanup may
  -- reserve or delete any SignalWire identity. Stale recovery first moves the
  -- purchase to durable indeterminate quarantine under the same global lock.
  if exists (
    select 1
      from public.voice_number_provisioning_operations in_flight
     where in_flight.id <> v_operation.id
       and in_flight.provider = 'signalwire'
       and in_flight.operation_type = 'purchase_number'
       and in_flight.state = 'request_started'
  )
  or exists (
    select 1
      from public.messaging_number_provisioning_operations in_flight
      join public.messaging_registration_applications application
        on application.id = in_flight.application_id
     where application.provider = 'signalwire'
       and in_flight.operation_type = 'purchase_number'
       and in_flight.state = 'request_started'
  ) then
    raise exception 'Cleanup cannot begin while another SignalWire purchase response is in flight'
      using errcode = '55000';
  end if;

  perform 1
    from public.sms_sender_numbers s
   where s.provider = 'signalwire'
     and s.provisioning_status <> 'released'
     and (s.provider_number_id = p_provider_number_id or s.e164_number = p_e164_number);
  if found then
    raise exception 'Cleanup identity is still referenced by the SMS rail'
      using errcode = '42501';
  end if;
  perform 1
    from public.voice_number_inventory i
   where i.provider = 'signalwire'
     and i.lifecycle_state <> 'released'
     and (i.provider_number_id = p_provider_number_id or i.e164_number = p_e164_number)
     and not (
       v_operation.operation_type = 'release_number'
       and i.id = v_operation.inventory_id
     );
  if found then
    raise exception 'Cleanup identity is still referenced by another live AI Voice inventory row'
      using errcode = '42501';
  end if;
  if public.unresolved_voice_number_identity_conflict(
       v_operation.id, p_provider_number_id, p_e164_number
     ) then
    raise exception 'Cleanup identity belongs to another unresolved SignalWire operation'
      using errcode = '55000';
  end if;
  if public.unresolved_messaging_number_identity_conflict(
       null, p_provider_number_id, p_e164_number
     ) then
    raise exception 'Cleanup identity belongs to an unresolved messaging operation'
      using errcode = '55000';
  end if;

  if v_existing_reservation then
    if v_reservation.lease_expires_at > v_now then
      -- A reservation lease is exclusive carrier-mutation authority. A
      -- same-key concurrent caller may observe when to retry, but it must not
      -- receive the current worker's bearer token or issue a second DELETE.
      return query select v_reservation.id, 'busy'::text,
        null::uuid, v_reservation.lease_expires_at,
        null::text, null::timestamptz;
      return;
    end if;
    v_token := pg_catalog.gen_random_uuid();
    update public.voice_number_identity_cleanup_reservations r
       set lease_token = v_token, reserved_at = v_now,
           lease_expires_at = v_now + interval '5 minutes', updated_at = v_now
     where r.id = v_reservation.id
     returning * into strict v_reservation;
    return query select v_reservation.id, 'reclaimed'::text,
      v_reservation.lease_token, v_reservation.lease_expires_at,
      null::text, null::timestamptz;
    return;
  end if;

  if exists (
    select 1 from public.voice_number_identity_cleanup_reservations r
     where r.provider = 'signalwire' and r.state = 'reserved'
       and (
         r.provider_number_id = p_provider_number_id
         or (
           r.e164_number = p_e164_number
           and r.operation_id <> v_operation.id
         )
       )
  ) then
    raise exception 'Cleanup identity is already reserved by another reconciliation'
      using errcode = '55000';
  end if;
  if p_identity_kind = 'discovered'
     and (
       select pg_catalog.count(*)
         from public.voice_number_identity_cleanup_reservations r
        where r.account_id = v_operation.account_id
          and r.operation_id = v_operation.id
           and r.provider = 'signalwire'
           and r.identity_kind = 'discovered'
           and r.e164_number = p_e164_number
     ) >= 10 then
    raise exception 'Pending discovered cleanup reservation limit reached'
      using errcode = '54000';
  end if;
  if p_identity_kind = 'expected'
     and v_operation.operation_type = 'purchase_number'
     and (
       select pg_catalog.count(*)
         from public.voice_number_identity_cleanup_reservations r
        where r.account_id = v_operation.account_id
          and r.operation_id = v_operation.id
          and r.provider = 'signalwire'
          and r.identity_kind = 'expected'
          and r.e164_number = p_e164_number
     ) >= 10 then
    raise exception 'Purchase cleanup anchor safety limit reached'
      using errcode = '54000';
  end if;
  if (
    select pg_catalog.count(*)
      from public.voice_number_identity_cleanup_reservations r
     where r.account_id = v_operation.account_id
       and r.operation_id = v_operation.id
       and r.provider = 'signalwire'
       and r.e164_number = p_e164_number
  ) >= 11 then
    raise exception 'Voice cleanup identity lifetime safety limit reached'
      using errcode = '54000';
  end if;
  v_token := pg_catalog.gen_random_uuid();
  insert into public.voice_number_identity_cleanup_reservations (
    account_id, operation_id, provider, identity_kind,
    provider_number_id, e164_number, reservation_key,
    lease_token, lease_expires_at, state, authorized_by,
    authorization_reason, reserved_at, created_at, updated_at
  ) values (
    v_operation.account_id, v_operation.id, 'signalwire', p_identity_kind,
    p_provider_number_id, p_e164_number, p_reservation_key,
    v_token, v_now + interval '5 minutes', 'reserved',
    pg_catalog.btrim(p_actor_reference), pg_catalog.btrim(p_reason),
    v_now, v_now, v_now
  ) returning * into strict v_reservation;
  return query select v_reservation.id, 'reserved'::text,
    v_reservation.lease_token, v_reservation.lease_expires_at,
    null::text, null::timestamptz;
end
$fn$;

create or replace function public.enumerate_pending_voice_number_identity_cleanups(
  p_operation_id uuid,
  p_anchor_reservation_id uuid,
  p_limit integer
)
returns table (
  reservation_id uuid,
  identity_kind text,
  provider_number_id text,
  e164_number text,
  reservation_key text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_account_id uuid;
  v_operation public.voice_number_provisioning_operations%rowtype;
  v_anchor public.voice_number_identity_cleanup_reservations%rowtype;
  v_anchor_number text;
  v_pending_count integer;
begin
  if p_operation_id is null or p_anchor_reservation_id is null
     or p_limit is null or p_limit not between 1 and 10 then
    raise exception 'Pending AI Voice cleanup enumeration input is invalid'
      using errcode = '22023';
  end if;

  select o.account_id into strict v_account_id
    from public.voice_number_provisioning_operations o
   where o.id = p_operation_id;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_account_id::text, 91240518)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('voice-cleanup-operation:' || p_operation_id::text, 91240521)
  );
  perform 1 from public.accounts where id = v_account_id for update;
  select o.* into strict v_operation
    from public.voice_number_provisioning_operations o
   where o.id = p_operation_id
     and o.account_id = v_account_id
   for update;

  if v_operation.state <> 'indeterminate' then
    raise exception 'Pending cleanup enumeration requires an indeterminate AI Voice operation'
      using errcode = '55000';
  end if;

  select anchor.* into v_anchor
    from public.voice_number_identity_cleanup_reservations anchor
   where anchor.id = p_anchor_reservation_id
     and anchor.account_id = v_operation.account_id
     and anchor.operation_id = v_operation.id
     and anchor.provider = 'signalwire'
     and anchor.identity_kind in ('expected', 'observed')
     and anchor.state = 'reserved'
   for update;
  if not found then
    raise exception 'Pending discovered cleanup enumeration requires a valid reserved exact-operation anchor'
      using errcode = '42501';
  end if;
  if (
       v_anchor.identity_kind = 'expected'
       and not (
         (
           v_operation.operation_type = 'release_number'
           and v_operation.request_payload->>'provider' = 'signalwire'
           and v_operation.request_payload->>'provider_number_id' = v_anchor.provider_number_id
           and v_operation.request_payload->>'number' = v_anchor.e164_number
         )
         or (
           v_operation.operation_type = 'purchase_number'
           and v_operation.request_payload->>'number' = v_anchor.e164_number
           and v_operation.observed_provider_object_id is distinct from v_anchor.provider_number_id
           and v_operation.provider_object_id is distinct from v_anchor.provider_number_id
         )
       )
     )
      or (
        v_anchor.identity_kind = 'observed'
        and (
          v_operation.operation_type <> 'purchase_number'
          or v_operation.observed_provider_object_id is distinct from v_anchor.provider_number_id
          or v_operation.observed_provider_result->>'provider' is distinct from 'signalwire'
         or v_operation.observed_provider_result->>'id' is distinct from v_anchor.provider_number_id
         or v_operation.observed_provider_result->>'number' is distinct from v_anchor.e164_number
       )
     ) then
    raise exception 'Pending discovered cleanup anchor contradicts durable operation evidence'
      using errcode = '22000';
  end if;
  v_anchor_number := v_anchor.e164_number;

  select pg_catalog.count(*)::integer into strict v_pending_count
    from public.voice_number_identity_cleanup_reservations r
   where r.account_id = v_operation.account_id
     and r.operation_id = v_operation.id
     and r.provider = 'signalwire'
     and r.identity_kind = 'discovered'
     and r.e164_number = v_anchor_number
     and r.state = 'reserved';
  if v_pending_count > p_limit then
    raise exception 'Pending discovered cleanup enumeration exceeds its bounded limit'
      using errcode = '54000';
  end if;

  return query
  select r.id, r.identity_kind, r.provider_number_id, r.e164_number,
         r.reservation_key
    from public.voice_number_identity_cleanup_reservations r
   where r.account_id = v_operation.account_id
     and r.operation_id = v_operation.id
     and r.provider = 'signalwire'
     and r.identity_kind = 'discovered'
     and r.e164_number = v_anchor_number
     and r.state = 'reserved'
   order by r.created_at, r.id
   limit p_limit;
end
$fn$;

create or replace function public.enumerate_purchase_voice_number_cleanup_anchors(
  p_operation_id uuid,
  p_limit integer
)
returns table (
  reservation_id uuid,
  identity_kind text,
  provider_number_id text,
  e164_number text,
  reservation_key text,
  reservation_state text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_account_id uuid;
  v_operation public.voice_number_provisioning_operations%rowtype;
  v_expected_number text;
  v_pending_count integer;
begin
  if p_operation_id is null or p_limit is null or p_limit not between 1 and 10 then
    raise exception 'Pending purchase cleanup anchor enumeration input is invalid'
      using errcode = '22023';
  end if;

  select o.account_id into strict v_account_id
    from public.voice_number_provisioning_operations o
   where o.id = p_operation_id;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_account_id::text, 91240518)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('voice-cleanup-operation:' || p_operation_id::text, 91240521)
  );
  perform 1 from public.accounts where id = v_account_id for update;
  select o.* into strict v_operation
    from public.voice_number_provisioning_operations o
   where o.id = p_operation_id
     and o.account_id = v_account_id
   for update;

  v_expected_number := v_operation.request_payload->>'number';
  if v_operation.state <> 'indeterminate'
     or v_operation.operation_type <> 'purchase_number'
     or v_expected_number is null
     or v_expected_number !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Pending purchase cleanup anchors require an exact indeterminate purchase request'
      using errcode = '55000';
  end if;

  select pg_catalog.count(*)::integer into strict v_pending_count
    from public.voice_number_identity_cleanup_reservations anchor
   where anchor.account_id = v_operation.account_id
     and anchor.operation_id = v_operation.id
     and anchor.provider = 'signalwire'
     and anchor.identity_kind = 'expected'
     and anchor.e164_number = v_expected_number
     and anchor.state in ('reserved', 'released', 'confirmed_absent')
     and v_operation.observed_provider_object_id is distinct from anchor.provider_number_id
     and v_operation.provider_object_id is distinct from anchor.provider_number_id;
  if v_pending_count > p_limit then
    raise exception 'Pending purchase cleanup anchor enumeration exceeds its bounded limit'
      using errcode = '54000';
  end if;

  return query
  select anchor.id, anchor.identity_kind, anchor.provider_number_id,
         anchor.e164_number, anchor.reservation_key, anchor.state
    from public.voice_number_identity_cleanup_reservations anchor
   where anchor.account_id = v_operation.account_id
     and anchor.operation_id = v_operation.id
     and anchor.provider = 'signalwire'
     and anchor.identity_kind = 'expected'
     and anchor.e164_number = v_expected_number
     and anchor.state in ('reserved', 'released', 'confirmed_absent')
     and v_operation.observed_provider_object_id is distinct from anchor.provider_number_id
     and v_operation.provider_object_id is distinct from anchor.provider_number_id
   order by anchor.created_at, anchor.id
   limit p_limit;
end
$fn$;

create or replace function public.finalize_voice_number_identity_cleanup(
  p_reservation_id uuid,
  p_lease_token uuid,
  p_disposition text,
  p_finalization_evidence jsonb,
  p_actor_reference text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_account_id uuid;
  v_operation_id uuid;
  v_reservation public.voice_number_identity_cleanup_reservations%rowtype;
begin
  if p_reservation_id is null or p_lease_token is null
     or p_disposition is null or p_disposition not in ('released', 'confirmed_absent')
     or p_finalization_evidence is null
     or pg_catalog.jsonb_typeof(p_finalization_evidence) <> 'object'
     or pg_catalog.octet_length(p_finalization_evidence::text) > 8192
     or p_actor_reference is null
     or pg_catalog.length(pg_catalog.btrim(p_actor_reference)) not between 3 and 320 then
    raise exception 'Voice number cleanup finalization input is invalid' using errcode = '22023';
  end if;
  select r.account_id, r.operation_id into strict v_account_id, v_operation_id
    from public.voice_number_identity_cleanup_reservations r where r.id = p_reservation_id;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_account_id::text, 91240518)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('voice-cleanup-operation:' || v_operation_id::text, 91240521)
  );
  perform 1 from public.accounts where id = v_account_id for update;
  perform 1
    from public.voice_number_provisioning_operations o
   where o.id = v_operation_id
     and o.account_id = v_account_id
   for update;
  select r.* into strict v_reservation
    from public.voice_number_identity_cleanup_reservations r
   where r.id = p_reservation_id
   for update;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('voice-cleanup-id:' || v_reservation.provider_number_id, 91240519)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('voice-cleanup-number:' || v_reservation.e164_number, 91240520)
  );
  if v_reservation.state <> 'reserved'
     or v_reservation.lease_token is distinct from p_lease_token then
    if v_reservation.state = p_disposition then
      return true;
    end if;
    raise exception 'Voice number cleanup lease is not current' using errcode = '55000';
  end if;
  if p_finalization_evidence->>'provider' is distinct from 'signalwire'
     or p_finalization_evidence->>'provider_number_id' is distinct from v_reservation.provider_number_id
     or p_finalization_evidence->>'number' is distinct from v_reservation.e164_number
     or p_finalization_evidence->>'disposition' is distinct from p_disposition
     or p_finalization_evidence->'cleanup_confirmed' is distinct from 'true'::jsonb
     or exists (
       select 1 from pg_catalog.jsonb_object_keys(p_finalization_evidence) as keys(key_name)
        where key_name not in (
          'provider', 'provider_number_id', 'number', 'disposition', 'cleanup_confirmed'
        )
     ) then
    raise exception 'Voice number cleanup evidence does not match the reserved identity'
      using errcode = '22000';
  end if;
  if v_reservation.identity_kind in ('expected', 'observed')
     and exists (
       select 1
         from public.voice_number_identity_cleanup_reservations pending
        where pending.account_id = v_reservation.account_id
          and pending.operation_id = v_reservation.operation_id
          and pending.provider = v_reservation.provider
          and pending.identity_kind = 'discovered'
          and pending.e164_number = v_reservation.e164_number
          and pending.state = 'reserved'
     ) then
    raise exception 'Voice number cleanup anchor cannot finalize while discovered cleanup remains reserved'
      using errcode = '55000';
  end if;
  update public.voice_number_identity_cleanup_reservations r
     set state = p_disposition, lease_token = null, lease_expires_at = null,
         finalized_at = v_now, finalization_evidence = p_finalization_evidence,
         finalized_by = pg_catalog.btrim(p_actor_reference), updated_at = v_now
   where r.id = v_reservation.id;
  return true;
end
$fn$;

create or replace function public.claim_voice_number_operation(
  p_account_id uuid,
  p_operation_type text,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_request_payload jsonb,
  p_purchase_authorization_id uuid default null,
  p_retry_authorization_id uuid default null,
  p_recovery_token_hmac text default null
)
returns table (
  claim_status text,
  operation_id uuid,
  claim_token uuid,
  operation_state text,
  inventory_id uuid,
  provider_object_id text,
  provider_result jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_existing public.voice_number_provisioning_operations%rowtype;
  v_operation public.voice_number_provisioning_operations%rowtype;
  v_authorization public.voice_number_purchase_authorizations%rowtype;
  v_observation public.voice_number_candidate_observations%rowtype;
  v_retry_authorization public.voice_number_operation_retry_authorizations%rowtype;
  v_failed_operation public.voice_number_provisioning_operations%rowtype;
  v_policy public.voice_number_spend_policies%rowtype;
  v_inventory public.voice_number_inventory%rowtype;
  v_token uuid;
  v_committed_spend bigint := 0;
begin
  if p_account_id is null
     or p_operation_type is null
     or p_operation_type not in ('purchase_number', 'configure_voice', 'release_number')
     or p_idempotency_key is null
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9:._/+\-]{7,249}$'
     or p_request_fingerprint is null
     or p_request_fingerprint !~ '^[a-f0-9]{64}$'
     or p_request_payload is null
     or pg_catalog.jsonb_typeof(p_request_payload) <> 'object'
     or pg_catalog.octet_length(p_request_payload::text) > 32768 then
    raise exception 'Voice number operation claim input is invalid' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_account_id::text, 91240518)
  );
  perform 1 from public.accounts where id = p_account_id for update;
  if not found then
    raise exception 'Voice number operation account does not exist' using errcode = 'P0002';
  end if;

  select * into v_existing
    from public.voice_number_provisioning_operations
   where idempotency_key = p_idempotency_key
   for update;
  if found then
    if v_existing.account_id is distinct from p_account_id
       or v_existing.operation_type is distinct from p_operation_type
       or v_existing.request_fingerprint is distinct from p_request_fingerprint
       or v_existing.request_payload is distinct from p_request_payload
       or v_existing.purchase_authorization_id is distinct from p_purchase_authorization_id
       or v_existing.retry_authorization_id is distinct from p_retry_authorization_id then
      raise exception 'Voice number idempotency key was already used with different immutable input'
        using errcode = '23505';
    end if;
    if v_existing.retry_authorization_id is not null then
      select r.* into strict v_retry_authorization
        from public.voice_number_operation_retry_authorizations r
       where r.id = v_existing.retry_authorization_id
       for share;
      if p_recovery_token_hmac is distinct from v_retry_authorization.recovery_token_hmac then
        raise exception 'Voice number retry replay requires the exact recovery token binding'
          using errcode = '42501';
      end if;
    elsif p_recovery_token_hmac is not null then
      raise exception 'Voice number non-retry replay cannot carry a recovery token'
        using errcode = '22023';
    end if;
    if v_existing.state = 'succeeded' then
      return query select 'succeeded'::text, v_existing.id, null::uuid,
        v_existing.state, v_existing.inventory_id,
        v_existing.provider_object_id, v_existing.provider_result;
      return;
    elsif v_existing.state in ('failed', 'cancelled') then
      return query select 'terminal'::text, v_existing.id, null::uuid,
        v_existing.state, v_existing.inventory_id,
        v_existing.provider_object_id, v_existing.provider_result;
      return;
    elsif v_existing.state = 'indeterminate' then
      return query select 'needs_reconciliation'::text, v_existing.id, null::uuid,
        v_existing.state, v_existing.inventory_id,
        v_existing.provider_object_id, v_existing.provider_result;
      return;
    elsif v_existing.state in ('claimed', 'request_started')
      and v_existing.lease_expires_at > v_now then
      return query select 'in_progress'::text, v_existing.id, null::uuid,
        v_existing.state, v_existing.inventory_id,
        v_existing.provider_object_id, v_existing.provider_result;
      return;
    elsif v_existing.state = 'request_started' then
      update public.voice_number_provisioning_attempts a
         set outcome = 'indeterminate', error_code = 'lease_expired_after_request',
             finished_at = v_now
       where a.operation_id = v_existing.id and a.outcome is null;
      update public.voice_number_provisioning_operations o
         set state = 'indeterminate', claim_token = null, lease_expires_at = null,
             indeterminate_at = v_now, error_code = 'lease_expired_after_request',
             error_detail = 'Provider request began but no definitive response was recorded.',
             updated_at = v_now
       where o.id = v_existing.id;
      if v_existing.inventory_id is not null then
        update public.voice_number_inventory i
           set lifecycle_state = case when v_existing.operation_type = 'release_number'
                 then 'release_indeterminate' else 'suspended' end,
               suspended_at = coalesce(i.suspended_at, v_now), updated_at = v_now
         where i.id = v_existing.inventory_id and i.account_id = p_account_id;
      end if;
      return query select 'needs_reconciliation'::text, v_existing.id, null::uuid,
        'indeterminate'::text, v_existing.inventory_id,
        v_existing.provider_object_id, v_existing.provider_result;
      return;
    elsif v_existing.state = 'claimed' then
      update public.voice_number_provisioning_attempts a
         set outcome = 'lease_expired', error_code = 'lease_expired_before_request',
             finished_at = v_now
       where a.operation_id = v_existing.id and a.outcome is null;
      update public.voice_number_provisioning_operations o
         set state = 'pending', claim_token = null, lease_expires_at = null,
             updated_at = v_now
       where o.id = v_existing.id;
      if v_existing.attempt_count >= 5 then
        update public.voice_number_provisioning_operations o
           set state = 'failed', claim_token = null, lease_expires_at = null,
               error_code = 'attempts_exhausted_before_request',
               error_detail = 'Five provider leases expired before any provider request began.',
               failed_at = v_now, updated_at = v_now
         where o.id = v_existing.id
         returning * into strict v_existing;
        return query select 'terminal'::text, v_existing.id, null::uuid,
          v_existing.state, v_existing.inventory_id,
          v_existing.provider_object_id, v_existing.provider_result;
        return;
      end if;
    end if;
  end if;

  if exists (
    select 1 from public.voice_number_provisioning_operations o
     where o.account_id = p_account_id
       and o.state in ('pending', 'claimed', 'request_started', 'indeterminate')
       and (v_existing.id is null or o.id <> v_existing.id)
  ) then
    raise exception 'An unresolved AI Voice number operation must be reconciled first'
      using errcode = '55000';
  end if;

  if v_existing.id is null then
    if p_operation_type = 'purchase_number' then
      if p_purchase_authorization_id is null
         or p_retry_authorization_id is not null
         or p_recovery_token_hmac is not null
         or coalesce(p_request_payload->>'number', '') !~ '^\+[1-9][0-9]{7,14}$'
         or coalesce(p_request_payload->>'monthly_price_cents', '') !~ '^[1-9][0-9]{0,8}$'
         or coalesce(p_request_payload->>'monthly_spend_ceiling_cents', '') !~ '^[1-9][0-9]{0,8}$'
         or coalesce(p_request_payload->>'spend_policy_revision', '') !~ '^[1-9][0-9]{0,9}$'
         or p_request_payload->>'currency' is distinct from 'USD' then
        raise exception 'Purchase claim lacks an exact recurring-charge snapshot'
          using errcode = '22023';
      end if;

      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('voice-number-spend:signalwire', 91240517)
      );
      select * into strict v_policy
        from public.voice_number_spend_policies
       where provider = 'signalwire'
       for update;
      select * into strict v_authorization
        from public.voice_number_purchase_authorizations
       where id = p_purchase_authorization_id
       for update;
      select * into strict v_observation
        from public.voice_number_candidate_observations
       where id = v_authorization.candidate_observation_id
       for share;
      if not v_policy.purchase_enabled
         or v_authorization.state <> 'authorized'
         or v_authorization.expires_at <= v_now
         or v_observation.expires_at <= v_now
         or v_observation.observed_at < v_now - interval '15 minutes'
         or v_authorization.account_id is distinct from p_account_id
         or v_authorization.provider is distinct from 'signalwire'
         or v_authorization.candidate_number is distinct from (p_request_payload->>'number')
         or v_authorization.monthly_unit_price_cents is distinct from (p_request_payload->>'monthly_price_cents')::bigint
         or v_authorization.aggregate_monthly_ceiling_cents is distinct from (p_request_payload->>'monthly_spend_ceiling_cents')::bigint
         or v_authorization.spend_policy_revision is distinct from (p_request_payload->>'spend_policy_revision')::bigint
         or v_authorization.monthly_unit_price_cents is distinct from v_policy.monthly_unit_price_cents
         or v_authorization.aggregate_monthly_ceiling_cents is distinct from v_policy.aggregate_monthly_ceiling_cents
         or v_authorization.spend_policy_revision is distinct from v_policy.revision then
        raise exception 'Purchase claim does not match a fresh exact-price authorization and current policy'
          using errcode = '42501';
      end if;
      if exists (
        select 1 from public.voice_number_inventory i
         where i.account_id = p_account_id and i.lifecycle_state <> 'released'
      ) then
        raise exception 'Account already has an unreleased AI Voice number'
          using errcode = '55000';
      end if;
      perform pg_catalog.pg_advisory_xact_lock(1280265031, 2108);
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'voice-cleanup-number:' || (p_request_payload->>'number'),
          91240520
        )
      );
      if public.unresolved_messaging_number_identity_conflict(
           null, null, p_request_payload->>'number'
         ) then
        raise exception 'Candidate number already belongs to an unresolved messaging operation'
          using errcode = '55000';
      end if;
      perform 1 from public.sms_sender_numbers s
       where s.provider = 'signalwire'
         and s.provisioning_status <> 'released'
         and s.e164_number = (p_request_payload->>'number');
      if found then
        raise exception 'Candidate number is already referenced by the live SMS rail'
          using errcode = '42501';
      end if;
      if exists (
        select 1 from public.voice_number_identity_cleanup_reservations r
         where r.provider = 'signalwire'
           and r.state = 'reserved'
           and r.e164_number = (p_request_payload->>'number')
      ) then
        raise exception 'Candidate number is reserved for unresolved provider identity cleanup'
          using errcode = '55000';
      end if;
      if public.unresolved_voice_number_identity_conflict(
           v_existing.id, null, p_request_payload->>'number'
         ) then
        raise exception 'Candidate number already belongs to an unresolved SignalWire operation'
          using errcode = '55000';
      end if;

      select coalesce(pg_catalog.sum(o.monthly_unit_price_cents), 0)
        into v_committed_spend
        from public.voice_number_provisioning_operations o
       where o.provider = 'signalwire'
         and o.operation_type = 'purchase_number'
         and (
           o.state in ('pending', 'claimed', 'request_started', 'indeterminate')
           or (
             o.state = 'succeeded'
             and exists (
               select 1 from public.voice_number_inventory i
                where i.id = o.inventory_id and i.lifecycle_state <> 'released'
             )
           )
         );
      if v_committed_spend + v_policy.monthly_unit_price_cents
         > v_policy.aggregate_monthly_ceiling_cents then
        raise exception 'AI Voice number purchase would exceed the aggregate recurring-spend ceiling'
          using errcode = '54000';
      end if;

      insert into public.voice_number_provisioning_operations (
        account_id, provider, operation_type, purchase_authorization_id,
        idempotency_key, request_fingerprint, request_payload,
        monthly_unit_price_cents, aggregate_monthly_ceiling_cents,
        spend_policy_revision
      ) values (
        p_account_id, 'signalwire', p_operation_type, p_purchase_authorization_id,
        p_idempotency_key, p_request_fingerprint, p_request_payload,
        v_policy.monthly_unit_price_cents, v_policy.aggregate_monthly_ceiling_cents,
        v_policy.revision
      ) returning * into v_operation;
      update public.voice_number_purchase_authorizations
         set state = 'consumed', consumed_operation_id = v_operation.id,
             consumed_at = v_now
       where id = v_authorization.id and state = 'authorized';
      if not found then
        raise exception 'Voice number purchase authorization was consumed concurrently'
          using errcode = '55000';
      end if;
    else
      if p_purchase_authorization_id is not null
         or (p_retry_authorization_id is null) <> (p_recovery_token_hmac is null)
         or (p_recovery_token_hmac is not null and p_recovery_token_hmac !~ '^[a-f0-9]{64}$')
         or coalesce(p_request_payload->>'voice_number_id', '')
            !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         or p_request_payload->>'provider' is distinct from 'signalwire'
         or coalesce(p_request_payload->>'provider_number_id', '')
            !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         or coalesce(p_request_payload->>'number', '') !~ '^\+[1-9][0-9]{7,14}$' then
        raise exception 'Voice configuration/release claim lacks an exact provider and inventory identity'
          using errcode = '22023';
      end if;
      select * into strict v_inventory
        from public.voice_number_inventory
       where id = (p_request_payload->>'voice_number_id')::uuid
         and account_id = p_account_id
         and provider = 'signalwire'
         and lifecycle_state <> 'released'
       for update;
      if p_request_payload->>'provider_number_id' is distinct from v_inventory.provider_number_id
         or p_request_payload->>'number' is distinct from v_inventory.e164_number then
        raise exception 'Voice configuration/release provider identity does not match the claimed inventory row'
          using errcode = '22000';
      end if;
      if p_operation_type = 'configure_voice'
         and v_inventory.lifecycle_state not in ('purchased', 'configuring', 'active', 'suspended') then
        raise exception 'AI Voice number is not configurable in its current lifecycle state'
          using errcode = '55000';
      end if;
      if p_operation_type = 'release_number' then
        perform 1
          from public.sms_sender_numbers s
         where s.provider = 'signalwire'
           and s.provisioning_status <> 'released'
           and (
             s.provider_number_id = v_inventory.provider_number_id
             or s.e164_number = v_inventory.e164_number
           )
         for update;
        if found then
          raise exception 'AI Voice release is blocked because SMS still references the provider resource or number'
            using errcode = '42501';
        end if;
      end if;
      if p_retry_authorization_id is null then
        if exists (
          select 1
            from public.voice_number_provisioning_operations prior
           where prior.account_id = p_account_id
             and prior.operation_type = p_operation_type
             and prior.inventory_id = v_inventory.id
             and prior.state = 'failed'
        ) then
          raise exception 'A definitive failed AI Voice operation requires a fresh MFA/operator retry authorization'
            using errcode = '42501';
        end if;
      else
        select r.* into strict v_retry_authorization
          from public.voice_number_operation_retry_authorizations r
         where r.id = p_retry_authorization_id
         for update;
        select prior.* into strict v_failed_operation
          from public.voice_number_provisioning_operations prior
         where prior.id = v_retry_authorization.failed_operation_id
         for update;
        if v_retry_authorization.state <> 'authorized'
           or v_retry_authorization.expires_at <= v_now
           or v_retry_authorization.recovery_token_hmac is distinct from p_recovery_token_hmac
           or v_retry_authorization.account_id is distinct from p_account_id
           or v_retry_authorization.operation_type is distinct from p_operation_type
           or v_retry_authorization.inventory_id is distinct from v_inventory.id
           or v_retry_authorization.request_fingerprint is distinct from p_request_fingerprint
           or v_retry_authorization.request_payload is distinct from p_request_payload
           or v_failed_operation.state <> 'failed'
           or v_retry_authorization.retry_generation is distinct from v_failed_operation.retry_generation + 1 then
          raise exception 'AI Voice retry claim does not match a fresh exact operator recovery authorization'
            using errcode = '42501';
        end if;
      end if;
      insert into public.voice_number_provisioning_operations (
        account_id, provider, operation_type, inventory_id,
        idempotency_key, request_fingerprint, request_payload,
        retry_authorization_id, retry_of_operation_id, retry_generation
      ) values (
        p_account_id, 'signalwire', p_operation_type, v_inventory.id,
        p_idempotency_key, p_request_fingerprint, p_request_payload,
        v_retry_authorization.id, v_failed_operation.id,
        coalesce(v_retry_authorization.retry_generation, 0)
      ) returning * into v_operation;
      if v_retry_authorization.id is not null then
        update public.voice_number_operation_retry_authorizations
           set state = 'consumed', consumed_operation_id = v_operation.id,
               consumed_at = v_now
         where id = v_retry_authorization.id and state = 'authorized';
        if not found then
          raise exception 'Voice number retry authorization was consumed concurrently'
            using errcode = '55000';
        end if;
      end if;
    end if;
  else
    select * into strict v_operation
      from public.voice_number_provisioning_operations where id = v_existing.id for update;
  end if;

  if v_operation.attempt_count >= 5 then
    update public.voice_number_provisioning_operations
       set state = 'failed', claim_token = null, lease_expires_at = null,
           error_code = 'attempts_exhausted_before_request',
           error_detail = 'Five provider leases expired before any provider request began.',
           failed_at = v_now, updated_at = v_now
     where id = v_operation.id and state = 'pending'
     returning * into strict v_operation;
    return query select 'terminal'::text, v_operation.id, null::uuid,
      v_operation.state, v_operation.inventory_id,
      v_operation.provider_object_id, v_operation.provider_result;
    return;
  end if;
  v_token := pg_catalog.gen_random_uuid();
  update public.voice_number_provisioning_operations
     set state = 'claimed', attempt_count = attempt_count + 1,
         claim_token = v_token, lease_expires_at = v_now + interval '5 minutes',
         request_started_at = null, error_code = null, error_detail = null,
         updated_at = v_now
   where id = v_operation.id and state = 'pending'
   returning * into strict v_operation;
  insert into public.voice_number_provisioning_attempts (
    operation_id, attempt_number, claim_token, claimed_at
  ) values (v_operation.id, v_operation.attempt_count, v_token, v_now);

  return query select 'claimed'::text, v_operation.id, v_token,
    v_operation.state, v_operation.inventory_id,
    v_operation.provider_object_id, v_operation.provider_result;
end
$fn$;

create or replace function public.begin_voice_number_operation(
  p_operation_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_account_id uuid;
  v_operation public.voice_number_provisioning_operations%rowtype;
  v_authorization public.voice_number_purchase_authorizations%rowtype;
  v_observation public.voice_number_candidate_observations%rowtype;
  v_policy public.voice_number_spend_policies%rowtype;
  v_inventory public.voice_number_inventory%rowtype;
  v_committed_spend bigint := 0;
  v_begin_error text;
  v_sms_conflict boolean := false;
begin
  select account_id into strict v_account_id
    from public.voice_number_provisioning_operations where id = p_operation_id;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_account_id::text, 91240518)
  );
  perform 1 from public.accounts where id = v_account_id for update;
  select * into strict v_operation
    from public.voice_number_provisioning_operations
   where id = p_operation_id
   for update;
  if v_operation.state <> 'claimed'
     or v_operation.claim_token is distinct from p_claim_token
     or v_operation.lease_expires_at <= v_now then
    raise exception 'AI Voice number operation claim is no longer valid'
      using errcode = '55000';
  end if;

  if v_operation.operation_type = 'purchase_number' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('voice-number-spend:signalwire', 91240517)
    );
    select * into v_authorization
      from public.voice_number_purchase_authorizations
     where id = v_operation.purchase_authorization_id
     for update;
    if v_authorization.id is not null then
      select * into v_observation
        from public.voice_number_candidate_observations
       where id = v_authorization.candidate_observation_id
       for share;
    end if;
    select * into v_policy
      from public.voice_number_spend_policies
     where provider = 'signalwire'
     for update;
    perform pg_catalog.pg_advisory_xact_lock(1280265031, 2108);
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'voice-cleanup-number:' || (v_operation.request_payload->>'number'),
        91240520
      )
    );
    perform 1 from public.sms_sender_numbers s
     where s.provider = 'signalwire'
       and s.provisioning_status <> 'released'
       and s.e164_number = (v_operation.request_payload->>'number');
    v_sms_conflict := found;
    select coalesce(pg_catalog.sum(o.monthly_unit_price_cents), 0)
      into v_committed_spend
      from public.voice_number_provisioning_operations o
     where o.provider = 'signalwire'
       and o.operation_type = 'purchase_number'
       and (
         o.state in ('pending', 'claimed', 'request_started', 'indeterminate')
         or (
           o.state = 'succeeded'
           and exists (
             select 1 from public.voice_number_inventory i
              where i.id = o.inventory_id and i.lifecycle_state <> 'released'
           )
         )
       );
    v_begin_error := case
      when v_authorization.id is null then 'purchase_authorization_missing'
      when v_authorization.state <> 'consumed'
        or v_authorization.consumed_operation_id is distinct from v_operation.id
        then 'purchase_authorization_not_consumed_by_operation'
      when v_authorization.expires_at <= v_now then 'purchase_authorization_expired'
      when v_observation.id is null then 'candidate_observation_missing'
      when v_observation.expires_at <= v_now
        or v_observation.observed_at < v_now - interval '15 minutes'
        then 'candidate_observation_expired'
      when v_observation.candidate_number is distinct from (v_operation.request_payload->>'number')
        or not v_observation.voice_capable
        or v_observation.monthly_unit_price_cents is distinct from v_operation.monthly_unit_price_cents
        or v_observation.spend_policy_revision is distinct from v_operation.spend_policy_revision
        then 'candidate_observation_drift'
      when v_policy.provider is null or not v_policy.purchase_enabled then 'purchase_policy_disabled'
      when v_authorization.monthly_unit_price_cents is distinct from v_operation.monthly_unit_price_cents
        or v_authorization.aggregate_monthly_ceiling_cents is distinct from v_operation.aggregate_monthly_ceiling_cents
        or v_authorization.spend_policy_revision is distinct from v_operation.spend_policy_revision
        then 'purchase_operation_price_drift'
      when v_policy.monthly_unit_price_cents is distinct from v_operation.monthly_unit_price_cents
        or v_policy.aggregate_monthly_ceiling_cents is distinct from v_operation.aggregate_monthly_ceiling_cents
        or v_policy.revision is distinct from v_operation.spend_policy_revision
        then 'purchase_policy_changed'
      when v_sms_conflict then 'sms_rail_already_references_number'
      when public.unresolved_messaging_number_identity_conflict(
        null, null, v_operation.request_payload->>'number'
      ) then 'messaging_operation_identity_conflict'
      when public.unresolved_voice_number_identity_conflict(
        v_operation.id, null, v_operation.request_payload->>'number'
      ) then 'voice_operation_identity_conflict'
      when exists (
        select 1 from public.voice_number_identity_cleanup_reservations r
         where r.provider = 'signalwire'
           and r.state = 'reserved'
      ) then 'provider_identity_cleanup_active'
      when v_committed_spend > v_policy.aggregate_monthly_ceiling_cents
        then 'purchase_aggregate_ceiling_exceeded'
      else null
    end;
    if v_begin_error is not null then
      update public.voice_number_provisioning_attempts
         set outcome = 'authorization_invalidated', error_code = v_begin_error,
             finished_at = v_now
       where operation_id = v_operation.id
         and claim_token = p_claim_token
         and outcome is null;
      update public.voice_number_provisioning_operations
         set state = 'cancelled', claim_token = null, lease_expires_at = null,
             error_code = v_begin_error,
             error_detail = 'Purchase authorization or current spend policy failed the immediate pre-provider check.',
             updated_at = v_now
       where id = v_operation.id;
      return false;
    end if;
  elsif v_operation.operation_type = 'release_number' then
    select * into strict v_inventory
      from public.voice_number_inventory
     where id = v_operation.inventory_id
       and account_id = v_account_id
     for update;
    perform 1
      from public.sms_sender_numbers s
     where s.provider = 'signalwire'
       and s.provisioning_status <> 'released'
       and (
         s.provider_number_id = v_inventory.provider_number_id
         or s.e164_number = v_inventory.e164_number
       )
     for update;
    if found then
      update public.voice_number_provisioning_attempts
         set outcome = 'safety_conflict', error_code = 'sms_rail_still_references_number',
             finished_at = v_now
       where operation_id = v_operation.id
         and claim_token = p_claim_token
         and outcome is null;
      update public.voice_number_provisioning_operations
         set state = 'cancelled', claim_token = null, lease_expires_at = null,
             error_code = 'sms_rail_still_references_number',
             error_detail = 'SMS inventory still references the exact provider resource or E.164 number.',
             updated_at = v_now
       where id = v_operation.id;
      return false;
    end if;
  end if;

  update public.voice_number_provisioning_operations
     set state = 'request_started', request_started_at = v_now,
         lease_expires_at = v_now + interval '5 minutes', updated_at = v_now
   where id = p_operation_id;
  update public.voice_number_provisioning_attempts
     set request_started_at = v_now
   where operation_id = p_operation_id and claim_token = p_claim_token and outcome is null;

  if v_operation.inventory_id is not null then
    update public.voice_number_inventory
       set lifecycle_state = case when v_operation.operation_type = 'release_number'
             then 'release_pending' else 'configuring' end,
           suspended_at = null, updated_at = v_now
     where id = v_operation.inventory_id and account_id = v_account_id;
  end if;
  return true;
end
$fn$;

create or replace function public.reject_voice_number_operation(
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
as $fn$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_account_id uuid;
  v_operation public.voice_number_provisioning_operations%rowtype;
begin
  if p_error_code is null or p_error_code !~ '^[a-z][a-z0-9_]{2,99}$' then
    raise exception 'Voice number provider rejection code is invalid' using errcode = '22023';
  end if;
  select account_id into strict v_account_id
    from public.voice_number_provisioning_operations where id = p_operation_id;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_account_id::text, 91240518)
  );
  perform 1 from public.accounts where id = v_account_id for update;
  select * into strict v_operation
    from public.voice_number_provisioning_operations where id = p_operation_id for update;
  if v_operation.state <> 'request_started'
     or v_operation.claim_token is distinct from p_claim_token then
    raise exception 'AI Voice number rejection does not match an open provider request'
      using errcode = '55000';
  end if;
  if v_operation.operation_type = 'release_number'
     and p_error_code ~ '(^|_)http_404$' then
    update public.voice_number_provisioning_operations
       set state = 'indeterminate', claim_token = null, lease_expires_at = null,
           error_code = 'release_absence_requires_confirmation',
           error_detail = 'Provider DELETE returned 404; confirm exact resource absence before release succeeds.',
           indeterminate_at = v_now, updated_at = v_now
     where id = p_operation_id;
    update public.voice_number_provisioning_attempts
       set outcome = 'indeterminate', error_code = 'release_absence_requires_confirmation',
           finished_at = v_now
     where operation_id = p_operation_id and claim_token = p_claim_token and outcome is null;
    update public.voice_number_inventory
       set lifecycle_state = 'release_indeterminate',
           suspended_at = coalesce(suspended_at, v_now), updated_at = v_now
     where id = v_operation.inventory_id and account_id = v_account_id;
    return true;
  end if;
  update public.voice_number_provisioning_operations
     set state = 'failed', claim_token = null, lease_expires_at = null,
         error_code = p_error_code, error_detail = pg_catalog.left(p_error_detail, 2000),
         failed_at = v_now, updated_at = v_now
   where id = p_operation_id;
  update public.voice_number_provisioning_attempts
     set outcome = 'provider_rejected', error_code = p_error_code, finished_at = v_now
   where operation_id = p_operation_id and claim_token = p_claim_token and outcome is null;
  if v_operation.inventory_id is not null then
    update public.voice_number_inventory
       set lifecycle_state = 'suspended', suspended_at = coalesce(suspended_at, v_now),
           updated_at = v_now
     where id = v_operation.inventory_id and account_id = v_account_id;
  end if;
  return true;
end
$fn$;

create or replace function public.mark_voice_number_operation_indeterminate(
  p_operation_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_error_detail text,
  p_observed_provider_object_id text default null,
  p_observed_provider_result jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_account_id uuid;
  v_operation public.voice_number_provisioning_operations%rowtype;
begin
  if p_error_code is null or p_error_code !~ '^[a-z][a-z0-9_]{2,99}$' then
    raise exception 'Voice number indeterminate error code is invalid' using errcode = '22023';
  end if;
  if (p_observed_provider_object_id is null) <> (p_observed_provider_result is null)
     or (
       p_observed_provider_result is not null
       and (
         p_observed_provider_object_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         or pg_catalog.jsonb_typeof(p_observed_provider_result) <> 'object'
         or pg_catalog.octet_length(p_observed_provider_result::text) > 65536
         or p_observed_provider_result->>'provider' is distinct from 'signalwire'
         or p_observed_provider_result->>'id' is distinct from p_observed_provider_object_id
         or coalesce(p_observed_provider_result->>'number', '') !~ '^\+[1-9][0-9]{7,14}$'
         or exists (
           select 1
             from pg_catalog.jsonb_object_keys(p_observed_provider_result) as keys(key_name)
            where key_name not in (
              'provider', 'id', 'number', 'voice_capable', 'released',
              'call_handler', 'call_request_url', 'call_request_method',
              'call_status_callback_url', 'call_status_callback_method'
            )
         )
       )
     ) then
    raise exception 'Voice number observed provider identity/result is not sanitized canonical evidence'
      using errcode = '22023';
  end if;
  select account_id into strict v_account_id
    from public.voice_number_provisioning_operations where id = p_operation_id;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_account_id::text, 91240518)
  );
  perform 1 from public.accounts where id = v_account_id for update;
  select * into strict v_operation
    from public.voice_number_provisioning_operations where id = p_operation_id for update;
  if v_operation.state <> 'request_started'
     or v_operation.claim_token is distinct from p_claim_token then
    raise exception 'AI Voice number indeterminate result does not match an open provider request'
      using errcode = '55000';
  end if;
  update public.voice_number_provisioning_operations
     set state = 'indeterminate', claim_token = null, lease_expires_at = null,
         error_code = p_error_code, error_detail = pg_catalog.left(p_error_detail, 2000),
         observed_provider_object_id = p_observed_provider_object_id,
         observed_provider_result = p_observed_provider_result,
         observed_provider_recorded_at = case when p_observed_provider_object_id is null
           then null else v_now end,
         observed_provider_recorded_by = case when p_observed_provider_object_id is null
           then null else 'provider_operation_response' end,
         indeterminate_at = v_now, updated_at = v_now
   where id = p_operation_id;
  update public.voice_number_provisioning_attempts
     set outcome = 'indeterminate', error_code = p_error_code, finished_at = v_now
   where operation_id = p_operation_id and claim_token = p_claim_token and outcome is null;
  if v_operation.inventory_id is not null then
    update public.voice_number_inventory
       set lifecycle_state = case when v_operation.operation_type = 'release_number'
             then 'release_indeterminate' else 'suspended' end,
           suspended_at = coalesce(suspended_at, v_now), updated_at = v_now
     where id = v_operation.inventory_id and account_id = v_account_id;
  end if;
  return true;
end
$fn$;

create or replace function public.record_voice_number_reconciliation_observation(
  p_operation_id uuid,
  p_observed_provider_object_id text,
  p_observed_provider_result jsonb,
  p_actor_reference text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_account_id uuid;
  v_operation public.voice_number_provisioning_operations%rowtype;
begin
  if p_operation_id is null
     or p_observed_provider_object_id is null
     or p_observed_provider_object_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or p_observed_provider_result is null
     or pg_catalog.jsonb_typeof(p_observed_provider_result) <> 'object'
     or pg_catalog.octet_length(p_observed_provider_result::text) > 65536
     or p_observed_provider_result->>'provider' is distinct from 'signalwire'
     or p_observed_provider_result->>'id' is distinct from p_observed_provider_object_id
     or coalesce(p_observed_provider_result->>'number', '') !~ '^\+[1-9][0-9]{7,14}$'
     or exists (
       select 1 from pg_catalog.jsonb_object_keys(p_observed_provider_result) as keys(key_name)
        where key_name not in (
          'provider', 'id', 'number', 'voice_capable', 'released',
          'call_handler', 'call_request_url', 'call_request_method',
          'call_status_callback_url', 'call_status_callback_method'
        )
     )
     or p_actor_reference is null
     or pg_catalog.length(pg_catalog.btrim(p_actor_reference)) not between 3 and 320 then
    raise exception 'Voice number reconciliation observation input is invalid' using errcode = '22023';
  end if;
  select o.account_id into strict v_account_id
    from public.voice_number_provisioning_operations o where o.id = p_operation_id;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_account_id::text, 91240518)
  );
  select o.* into strict v_operation
    from public.voice_number_provisioning_operations o
   where o.id = p_operation_id
   for update;
  if v_operation.state <> 'indeterminate' then
    raise exception 'Only an indeterminate AI Voice operation accepts reconciliation observation'
      using errcode = '55000';
  end if;
  if v_operation.observed_provider_object_id is not null then
    if v_operation.observed_provider_object_id is distinct from p_observed_provider_object_id
       or v_operation.observed_provider_result is distinct from p_observed_provider_result then
      raise exception 'A different provider identity is already durably observed for this operation'
        using errcode = '23505';
    end if;
    return true;
  end if;
  update public.voice_number_provisioning_operations o
     set observed_provider_object_id = p_observed_provider_object_id,
         observed_provider_result = p_observed_provider_result,
         observed_provider_recorded_at = v_now,
         observed_provider_recorded_by = pg_catalog.btrim(p_actor_reference),
         updated_at = v_now
   where o.id = v_operation.id;
  return true;
end
$fn$;

create or replace function public.recover_stale_voice_number_operations(
  p_batch_size integer default 25
)
returns table (
  operation_id uuid,
  recovery_status text,
  operation_state text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_candidate record;
  v_operation public.voice_number_provisioning_operations%rowtype;
begin
  if p_batch_size is null or p_batch_size not between 1 and 100 then
    raise exception 'Voice number stale-operation batch size is invalid' using errcode = '22023';
  end if;

  for v_candidate in
    select o.id, o.account_id
      from public.voice_number_provisioning_operations o
     where o.state in ('claimed', 'request_started')
       and o.lease_expires_at <= v_now
     order by o.lease_expires_at, o.id
     limit p_batch_size
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_candidate.account_id::text, 91240518)
    );
    perform 1 from public.accounts where id = v_candidate.account_id for update;
    select o.* into v_operation
      from public.voice_number_provisioning_operations o
     where o.id = v_candidate.id
       and o.state in ('claimed', 'request_started')
       and o.lease_expires_at <= v_now
     for update;
    if not found then
      continue;
    end if;

    if v_operation.state = 'request_started' then
      update public.voice_number_provisioning_attempts a
         set outcome = 'indeterminate', error_code = 'lease_expired_after_request',
             finished_at = v_now
       where a.operation_id = v_operation.id and a.outcome is null;
      update public.voice_number_provisioning_operations o
         set state = 'indeterminate', claim_token = null, lease_expires_at = null,
             indeterminate_at = v_now, error_code = 'lease_expired_after_request',
             error_detail = 'Provider request began but no definitive response was recorded.',
             updated_at = v_now
       where o.id = v_operation.id;
      if v_operation.inventory_id is not null then
        update public.voice_number_inventory i
           set lifecycle_state = case when v_operation.operation_type = 'release_number'
                 then 'release_indeterminate' else 'suspended' end,
               suspended_at = coalesce(i.suspended_at, v_now), updated_at = v_now
         where i.id = v_operation.inventory_id
           and i.account_id = v_operation.account_id;
      end if;
      operation_id := v_operation.id;
      recovery_status := 'needs_reconciliation';
      operation_state := 'indeterminate';
      return next;
    else
      update public.voice_number_provisioning_attempts a
         set outcome = 'lease_expired', error_code = 'lease_expired_before_request',
             finished_at = v_now
       where a.operation_id = v_operation.id and a.outcome is null;
      if v_operation.attempt_count >= 5 then
        update public.voice_number_provisioning_operations o
           set state = 'failed', claim_token = null, lease_expires_at = null,
               error_code = 'attempts_exhausted_before_request',
               error_detail = 'Five provider leases expired before any provider request began.',
               failed_at = v_now, updated_at = v_now
         where o.id = v_operation.id;
        operation_id := v_operation.id;
        recovery_status := 'terminal_failed';
        operation_state := 'failed';
      else
        update public.voice_number_provisioning_operations o
           set state = 'pending', claim_token = null, lease_expires_at = null,
               updated_at = v_now
         where o.id = v_operation.id;
        operation_id := v_operation.id;
        recovery_status := 'requeued';
        operation_state := 'pending';
      end if;
      return next;
    end if;
  end loop;
end
$fn$;

-- -------------------------------------------------------------------------
-- 5. Exact provider-result application and reconciliation.
-- -------------------------------------------------------------------------

create or replace function public.apply_voice_number_operation_success(
  p_operation_id uuid,
  p_provider_object_id text,
  p_provider_result jsonb
)
returns uuid
language plpgsql
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_operation public.voice_number_provisioning_operations%rowtype;
  v_inventory public.voice_number_inventory%rowtype;
  v_number text;
  v_provider_number_id text;
  v_call_url text;
  v_status_url text;
begin
  if p_provider_result is null
     or pg_catalog.jsonb_typeof(p_provider_result) <> 'object'
     or pg_catalog.octet_length(p_provider_result::text) > 65536 then
    raise exception 'AI Voice provider result must be a bounded JSON object'
      using errcode = '22023';
  end if;
  select * into strict v_operation
    from public.voice_number_provisioning_operations where id = p_operation_id for update;

  if v_operation.operation_type = 'purchase_number' then
    v_number := p_provider_result->>'number';
    v_provider_number_id := p_provider_result->>'id';
    if v_number is distinct from (v_operation.request_payload->>'number')
       or v_number !~ '^\+[1-9][0-9]{7,14}$'
       or v_provider_number_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or p_provider_object_id is distinct from v_provider_number_id
       or p_provider_result->>'provider' is distinct from 'signalwire'
       or p_provider_result->'voice_capable' is distinct from 'true'::jsonb then
      raise exception 'Purchased AI Voice number does not match the claimed candidate and voice capability'
        using errcode = '22000';
    end if;
    if exists (
      select 1 from public.voice_number_inventory i
       where i.provider = 'signalwire'
         and i.lifecycle_state <> 'released'
         and (i.e164_number = v_number or i.provider_number_id = v_provider_number_id)
         and (i.account_id <> v_operation.account_id
              or i.e164_number <> v_number
              or i.provider_number_id <> v_provider_number_id)
    ) then
      raise exception 'Purchased AI Voice number collides with another live inventory identity'
        using errcode = '23505';
    end if;
    select * into v_inventory
      from public.voice_number_inventory i
     where i.account_id = v_operation.account_id
       and i.provider = 'signalwire'
       and i.e164_number = v_number
       and i.provider_number_id = v_provider_number_id
       and i.lifecycle_state <> 'released'
     for update;
    if not found then
      insert into public.voice_number_inventory (
        account_id, provider, provider_number_id, e164_number, purpose,
        lifecycle_state, voice_capable, last_provider_sync_at, created_at, updated_at
      ) values (
        v_operation.account_id, 'signalwire', v_provider_number_id, v_number, 'ai_voice',
        'purchased', true, v_now, v_now, v_now
      ) returning * into v_inventory;
    end if;
  elsif v_operation.operation_type = 'configure_voice' then
    select * into strict v_inventory
      from public.voice_number_inventory
     where id = v_operation.inventory_id and account_id = v_operation.account_id
     for update;
    v_call_url := v_operation.request_payload->>'call_request_url';
    v_status_url := v_operation.request_payload->>'call_status_callback_url';
    if p_provider_result->>'id' is distinct from v_inventory.provider_number_id
       or p_provider_result->>'number' is distinct from v_inventory.e164_number
       or p_provider_object_id is distinct from v_inventory.provider_number_id
       or p_provider_result->>'provider' is distinct from 'signalwire'
       or p_provider_result->'voice_capable' is distinct from 'true'::jsonb
       or pg_catalog.lower(coalesce(p_provider_result->>'call_handler', '')) <> 'laml_webhooks'
       or p_provider_result->>'call_request_method' is distinct from 'POST'
       or p_provider_result->>'call_request_url' is distinct from v_call_url
       or p_provider_result->>'call_status_callback_url' is distinct from v_status_url
       or p_provider_result->>'call_status_callback_method' is distinct from 'POST'
       or v_call_url !~ '^https://[^[:space:]]+/api/voice/ai$'
       or v_status_url !~ '^https://[^[:space:]]+/api/voice/provider-status$'
       or v_operation.request_payload->>'call_handler' is distinct from 'laml_webhooks'
       or v_operation.request_payload->>'call_request_method' is distinct from 'POST'
       or v_operation.request_payload->>'call_status_callback_method' is distinct from 'POST' then
      raise exception 'Voice configuration response does not confirm the exact number and production POST routes'
        using errcode = '22000';
    end if;
    update public.voice_number_inventory
       set lifecycle_state = 'active', voice_capable = true,
           call_handler = 'laml_webhooks', call_request_url = v_call_url,
           call_request_method = 'POST', call_status_callback_url = v_status_url,
           call_status_callback_method = 'POST',
           provider_verified_at = v_now, last_provider_sync_at = v_now,
           last_provider_check_attempt_at = v_now,
           last_provider_check_error_code = null,
           provider_readiness_state = 'ready', provider_readiness_reason = null,
           provider_readiness_changed_at = v_now,
           last_provider_observation = p_provider_result,
           activated_at = coalesce(activated_at, v_now),
           suspended_at = null, released_at = null, updated_at = v_now
     where id = v_inventory.id
     returning * into strict v_inventory;
    update public.accounts
       set call_tracking_number = v_inventory.e164_number
     where id = v_operation.account_id
       and call_tracking_number is distinct from v_inventory.e164_number;

  else
    select * into strict v_inventory
      from public.voice_number_inventory
     where id = v_operation.inventory_id and account_id = v_operation.account_id
     for update;
    if p_provider_result->>'id' is distinct from v_inventory.provider_number_id
       or p_provider_result->>'number' is distinct from v_inventory.e164_number
       or p_provider_object_id is distinct from v_inventory.provider_number_id
       or p_provider_result->>'provider' is distinct from 'signalwire'
       or p_provider_result->'released' is distinct from 'true'::jsonb then
      raise exception 'Voice number release response does not confirm the exact provider resource'
        using errcode = '22000';
    end if;
    update public.voice_number_inventory
       set lifecycle_state = 'released', suspended_at = coalesce(suspended_at, v_now),
           released_at = v_now, last_provider_sync_at = v_now, updated_at = v_now
     where id = v_inventory.id
     returning * into strict v_inventory;
    update public.accounts
       set call_tracking_number = null
     where id = v_operation.account_id
       and call_tracking_number = v_inventory.e164_number;
  end if;
  return v_inventory.id;
end
$fn$;

create or replace function public.complete_voice_number_operation(
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
as $fn$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_account_id uuid;
  v_operation public.voice_number_provisioning_operations%rowtype;
  v_inventory_id uuid;
begin
  select account_id into strict v_account_id
    from public.voice_number_provisioning_operations where id = p_operation_id;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_account_id::text, 91240518)
  );
  perform 1 from public.accounts where id = v_account_id for update;
  select * into strict v_operation
    from public.voice_number_provisioning_operations where id = p_operation_id for update;
  if v_operation.state <> 'request_started'
     or v_operation.claim_token is distinct from p_claim_token then
    raise exception 'AI Voice number operation is not at its completion boundary'
      using errcode = '55000';
  end if;
  v_inventory_id := public.apply_voice_number_operation_success(
    p_operation_id, p_provider_object_id, p_provider_result
  );
  update public.voice_number_provisioning_operations
     set state = 'succeeded', inventory_id = v_inventory_id,
         claim_token = null, lease_expires_at = null,
         provider_object_id = p_provider_object_id,
         provider_result = p_provider_result, completed_at = v_now, updated_at = v_now
   where id = p_operation_id;
  update public.voice_number_provisioning_attempts
     set outcome = 'succeeded', finished_at = v_now
   where operation_id = p_operation_id and claim_token = p_claim_token and outcome is null;
  return true;
end
$fn$;

create or replace function public.resolve_voice_number_operation(
  p_operation_id uuid,
  p_resolution text,
  p_provider_object_id text,
  p_provider_result jsonb,
  p_error_code text,
  p_error_detail text,
  p_expected_identity_disposition text,
  p_observed_identity_disposition text,
  p_reconciliation_evidence jsonb,
  p_actor_reference text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_account_id uuid;
  v_operation public.voice_number_provisioning_operations%rowtype;
  v_inventory_id uuid;
  v_expected_provider_object_id text;
  v_expected_number text;
  v_observed_number text;
  v_observed_matches_expected boolean := false;
begin
  if p_resolution is null
     or p_resolution not in ('succeeded', 'failed')
     or p_expected_identity_disposition is null
     or p_expected_identity_disposition not in ('retained', 'released', 'confirmed_absent')
     or p_observed_identity_disposition is null
     or p_observed_identity_disposition not in (
       'not_observed', 'same_as_expected', 'released', 'confirmed_absent'
     )
     or p_reconciliation_evidence is null
     or pg_catalog.jsonb_typeof(p_reconciliation_evidence) <> 'object'
     or pg_catalog.octet_length(p_reconciliation_evidence::text) > 8192
     or p_actor_reference is null
     or pg_catalog.length(pg_catalog.btrim(p_actor_reference)) not between 3 and 320 then
    raise exception 'AI Voice number reconciliation input is invalid' using errcode = '22023';
  end if;
  select account_id into strict v_account_id
    from public.voice_number_provisioning_operations where id = p_operation_id;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_account_id::text, 91240518)
  );
  perform 1 from public.accounts where id = v_account_id for update;
  select * into strict v_operation
    from public.voice_number_provisioning_operations where id = p_operation_id for update;
  if v_operation.state <> 'indeterminate' then
    raise exception 'Only an indeterminate AI Voice number operation can be reconciled'
      using errcode = '55000';
  end if;

  v_expected_number := v_operation.request_payload->>'number';
  v_expected_provider_object_id := case
    when v_operation.operation_type = 'purchase_number' then p_provider_object_id
    else v_operation.request_payload->>'provider_number_id'
  end;
  v_observed_number := v_operation.observed_provider_result->>'number';
  v_observed_matches_expected := v_operation.observed_provider_object_id is not null
    and (
      (v_operation.operation_type = 'purchase_number'
        and p_resolution = 'succeeded'
        and v_operation.observed_provider_object_id = p_provider_object_id
        and v_observed_number = v_expected_number
        and p_provider_result->'voice_capable' = 'true'::jsonb)
      or (v_operation.operation_type <> 'purchase_number'
        and v_operation.observed_provider_object_id = v_expected_provider_object_id
        and v_observed_number = v_expected_number)
    );

  if (
       v_operation.operation_type in ('purchase_number', 'configure_voice')
       and p_resolution = 'succeeded'
       and p_expected_identity_disposition <> 'retained'
     )
     or (
       v_operation.operation_type = 'purchase_number'
       and p_resolution = 'failed'
       and p_expected_identity_disposition not in ('released', 'confirmed_absent')
     )
     or (
       v_operation.operation_type = 'configure_voice'
       and p_resolution = 'failed'
       and p_expected_identity_disposition <> 'retained'
     )
     or (
       v_operation.operation_type = 'release_number'
       and p_resolution = 'succeeded'
       and p_expected_identity_disposition not in ('released', 'confirmed_absent')
     )
     or (
       v_operation.operation_type = 'release_number'
       and p_resolution = 'failed'
       and p_expected_identity_disposition <> 'retained'
     ) then
    raise exception 'AI Voice reconciliation expected-identity disposition contradicts the operation result'
      using errcode = '22000';
  end if;

  if (v_operation.observed_provider_object_id is null
       and p_observed_identity_disposition <> 'not_observed')
     or (v_operation.observed_provider_object_id is not null
       and p_observed_identity_disposition = 'not_observed')
     or (p_observed_identity_disposition = 'same_as_expected'
       and not v_observed_matches_expected)
     or (v_operation.observed_provider_object_id is not null
       and not v_observed_matches_expected
       and p_observed_identity_disposition not in ('released', 'confirmed_absent')) then
    raise exception 'AI Voice reconciliation does not clean up every observed provider identity'
      using errcode = '22000';
  end if;

  if p_reconciliation_evidence->>'provider' is distinct from 'signalwire'
     or p_reconciliation_evidence->>'operation_id' is distinct from v_operation.id::text
     or p_reconciliation_evidence->>'expected_number' is distinct from v_expected_number
     or p_reconciliation_evidence->>'expected_provider_object_id'
          is distinct from v_expected_provider_object_id
     or p_reconciliation_evidence->>'observed_provider_object_id'
          is distinct from v_operation.observed_provider_object_id
     or p_reconciliation_evidence->>'observed_number' is distinct from v_observed_number
     or p_reconciliation_evidence->>'expected_disposition'
          is distinct from p_expected_identity_disposition
     or p_reconciliation_evidence->>'observed_disposition'
          is distinct from p_observed_identity_disposition
     or p_reconciliation_evidence->'cleanup_confirmed' is distinct from 'true'::jsonb
     or exists (
       select 1
         from pg_catalog.jsonb_object_keys(p_reconciliation_evidence) as keys(key_name)
        where key_name not in (
          'provider', 'operation_id', 'expected_number', 'expected_provider_object_id',
          'observed_provider_object_id', 'observed_number', 'expected_disposition',
          'observed_disposition', 'cleanup_confirmed'
        )
     ) then
    raise exception 'AI Voice reconciliation evidence is incomplete or does not match durable identities'
      using errcode = '22000';
  end if;

  if p_expected_identity_disposition in ('released', 'confirmed_absent')
     and v_expected_provider_object_id is not null
     and not exists (
       select 1
         from public.voice_number_identity_cleanup_reservations r
        where r.operation_id = v_operation.id
          and r.provider = 'signalwire'
          and r.provider_number_id = v_expected_provider_object_id
          and r.e164_number = v_expected_number
          and r.state = p_expected_identity_disposition
     ) then
    raise exception 'Expected provider identity cleanup lacks a finalized exact reservation'
      using errcode = '42501';
  end if;
  if p_expected_identity_disposition = 'retained'
     and v_expected_provider_object_id is not null
     and exists (
       select 1
         from public.voice_number_identity_cleanup_reservations r
        where r.operation_id = v_operation.id
          and r.provider = 'signalwire'
          and r.provider_number_id = v_expected_provider_object_id
          and r.e164_number = v_expected_number
          and r.state in ('released', 'confirmed_absent')
     ) then
    raise exception 'Retained provider identity contradicts terminal exact cleanup evidence'
      using errcode = '55000';
  end if;
  if p_observed_identity_disposition in ('released', 'confirmed_absent')
     and not exists (
       select 1
         from public.voice_number_identity_cleanup_reservations r
        where r.operation_id = v_operation.id
          and r.provider = 'signalwire'
          and r.provider_number_id = v_operation.observed_provider_object_id
          and r.e164_number = v_observed_number
          and r.state = p_observed_identity_disposition
     ) then
    raise exception 'Observed provider identity cleanup lacks a finalized exact reservation'
      using errcode = '42501';
  end if;

  if exists (
    select 1
      from public.voice_number_identity_cleanup_reservations r
     where r.operation_id = v_operation.id
       and r.state = 'reserved'
  ) then
    raise exception 'AI Voice reconciliation still has an active identity cleanup reservation'
      using errcode = '42501';
  end if;
  if exists (
    select 1
      from public.voice_number_identity_cleanup_reservations r
     where r.operation_id = v_operation.id
       and r.identity_kind = 'discovered'
       and r.state not in ('released', 'confirmed_absent')
  ) then
    raise exception 'Every discovered provider identity must have terminal cleanup evidence'
      using errcode = '42501';
  end if;

  if p_resolution = 'succeeded' then
    v_inventory_id := public.apply_voice_number_operation_success(
      p_operation_id, p_provider_object_id, p_provider_result
    );
    update public.voice_number_provisioning_operations
       set state = 'succeeded', inventory_id = v_inventory_id,
           provider_object_id = p_provider_object_id,
           provider_result = p_provider_result,
           expected_identity_disposition = p_expected_identity_disposition,
           observed_identity_disposition = p_observed_identity_disposition,
           reconciliation_evidence = p_reconciliation_evidence,
           error_code = null, error_detail = null,
           completed_at = v_now, resolved_at = v_now,
           resolved_by = pg_catalog.btrim(p_actor_reference), updated_at = v_now
     where id = p_operation_id;
  else
    if p_error_code is null or p_error_code !~ '^[a-z][a-z0-9_]{2,99}$' then
      raise exception 'Failed AI Voice reconciliation needs a stable error code'
        using errcode = '22023';
    end if;
    update public.voice_number_provisioning_operations
       set state = 'failed', error_code = p_error_code,
           error_detail = pg_catalog.left(p_error_detail, 2000),
           expected_identity_disposition = p_expected_identity_disposition,
           observed_identity_disposition = p_observed_identity_disposition,
           reconciliation_evidence = p_reconciliation_evidence,
           failed_at = v_now, resolved_at = v_now,
           resolved_by = pg_catalog.btrim(p_actor_reference), updated_at = v_now
     where id = p_operation_id;
    if v_operation.inventory_id is not null then
      update public.voice_number_inventory
         set lifecycle_state = 'suspended', suspended_at = coalesce(suspended_at, v_now),
             updated_at = v_now
       where id = v_operation.inventory_id and account_id = v_account_id;
    end if;
  end if;
  return true;
end
$fn$;

create or replace function public.apply_voice_number_provider_verification(
  p_account_id uuid,
  p_voice_number_id uuid,
  p_observed_provider_object_id text,
  p_observed_result jsonb,
  p_verification_status text,
  p_error_code text
)
returns table (
  voice_number_id uuid,
  lifecycle_state text,
  provider_readiness_state text,
  last_provider_sync_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_inventory public.voice_number_inventory%rowtype;
begin
  if p_account_id is null
     or p_voice_number_id is null
     or p_observed_provider_object_id is null
     or p_observed_provider_object_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or p_verification_status is null
     or p_verification_status not in ('ready', 'drifted', 'missing')
     or (p_verification_status = 'ready' and p_error_code is not null)
     or (p_verification_status <> 'ready'
       and (p_error_code is null or p_error_code !~ '^[a-z][a-z0-9_]{2,99}$'))
     or (p_verification_status = 'missing' and p_observed_result is not null)
     or (p_verification_status <> 'missing' and (
       p_observed_result is null
       or pg_catalog.jsonb_typeof(p_observed_result) <> 'object'
       or pg_catalog.octet_length(p_observed_result::text) > 65536
     )) then
    raise exception 'AI Voice provider verification input is invalid' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_account_id::text, 91240518)
  );
  perform 1 from public.accounts where id = p_account_id for update;
  if not found then
    raise exception 'AI Voice provider verification account is unavailable' using errcode = 'P0002';
  end if;
  select i.* into strict v_inventory
    from public.voice_number_inventory i
   where i.id = p_voice_number_id
     and i.account_id = p_account_id
     and i.provider = 'signalwire'
     and i.lifecycle_state in ('purchased', 'configuring', 'active', 'suspended')
   for update;

  if p_verification_status = 'ready' then
    if v_inventory.lifecycle_state <> 'active'
       or p_observed_provider_object_id is distinct from v_inventory.provider_number_id
       or p_observed_result->>'provider' is distinct from 'signalwire'
       or p_observed_result->>'id' is distinct from v_inventory.provider_number_id
       or p_observed_result->>'number' is distinct from v_inventory.e164_number
       or p_observed_result->'voice_capable' is distinct from 'true'::jsonb
       or pg_catalog.lower(coalesce(p_observed_result->>'call_handler', '')) <> 'laml_webhooks'
       or p_observed_result->>'call_request_url' is distinct from v_inventory.call_request_url
       or p_observed_result->>'call_request_method' is distinct from 'POST'
       or p_observed_result->>'call_status_callback_url' is distinct from v_inventory.call_status_callback_url
       or p_observed_result->>'call_status_callback_method' is distinct from 'POST' then
      raise exception 'Ready verification does not prove the exact active AI Voice provider configuration'
        using errcode = '22000';
    end if;
    update public.voice_number_inventory i
       set voice_capable = true,
           provider_verified_at = v_now,
           last_provider_sync_at = v_now,
           last_provider_check_attempt_at = v_now,
           last_provider_check_error_code = null,
           provider_readiness_state = 'ready',
           provider_readiness_reason = null,
           provider_readiness_changed_at = case
             when i.provider_readiness_state = 'ready' then i.provider_readiness_changed_at
             else v_now end,
           last_provider_observation = p_observed_result,
           updated_at = v_now
     where i.id = v_inventory.id
     returning * into strict v_inventory;
  else
    update public.voice_number_inventory i
       set lifecycle_state = 'suspended', voice_capable = false,
           suspended_at = coalesce(i.suspended_at, v_now),
           last_provider_sync_at = v_now,
           last_provider_check_attempt_at = v_now,
           last_provider_check_error_code = p_error_code,
           provider_readiness_state = p_verification_status,
           provider_readiness_reason = p_error_code,
           provider_readiness_changed_at = v_now,
           last_provider_observation = p_observed_result,
           updated_at = v_now
     where i.id = v_inventory.id
     returning * into strict v_inventory;
    update public.accounts
       set call_tracking_number = null
     where id = p_account_id
       and call_tracking_number = v_inventory.e164_number;
  end if;

  return query select v_inventory.id, v_inventory.lifecycle_state,
    v_inventory.provider_readiness_state, v_inventory.last_provider_sync_at;
end
$fn$;

create or replace function public.record_voice_number_provider_check_attempt(
  p_account_id uuid,
  p_voice_number_id uuid,
  p_check_outcome text,
  p_error_code text
)
returns table (
  voice_number_id uuid,
  lifecycle_state text,
  last_provider_check_attempt_at timestamptz,
  last_provider_check_error_code text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_inventory public.voice_number_inventory%rowtype;
begin
  if p_account_id is null
     or p_voice_number_id is null
     or p_check_outcome is null
     or p_check_outcome not in ('read_error', 'apply_error', 'skipped_nonactive')
     or p_error_code is null
     or p_error_code !~ '^[a-z][a-z0-9_]{2,99}$' then
    raise exception 'AI Voice provider check-attempt input is invalid' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_account_id::text, 91240518)
  );
  perform 1 from public.accounts where id = p_account_id for update;
  if not found then
    raise exception 'AI Voice provider check-attempt account is unavailable' using errcode = 'P0002';
  end if;
  select i.* into strict v_inventory
    from public.voice_number_inventory i
   where i.id = p_voice_number_id
     and i.account_id = p_account_id
     and i.provider = 'signalwire'
     and i.lifecycle_state in ('purchased', 'configuring', 'active', 'suspended')
   for update;
  if p_check_outcome = 'skipped_nonactive'
     and v_inventory.lifecycle_state = 'active' then
    raise exception 'An active AI Voice number cannot be recorded as skipped nonactive'
      using errcode = '22000';
  end if;

  update public.voice_number_inventory i
     set last_provider_check_attempt_at = v_now,
         last_provider_check_error_code = p_error_code,
         updated_at = v_now
   where i.id = v_inventory.id
   returning * into strict v_inventory;
  return query select v_inventory.id, v_inventory.lifecycle_state,
    v_inventory.last_provider_check_attempt_at,
    v_inventory.last_provider_check_error_code;
end
$fn$;

-- -------------------------------------------------------------------------
-- 6. Transition new admissions from SMS sender inventory to voice inventory.
-- -------------------------------------------------------------------------

-- A signed terminal callback can race ahead of admission. Keep a short-lived,
-- provider-call tombstone so the later admission cannot resurrect a call that
-- the provider already declared terminal. The first terminal fact is immutable
-- during the bounded seven-day provider retry window.
create table if not exists public.voice_provider_terminal_call_tombstones (
  provider text not null default 'signalwire' check (provider = 'signalwire'),
  provider_call_id text not null check (
    pg_catalog.length(pg_catalog.btrim(provider_call_id)) between 1 and 255
  ),
  terminal_status text not null check (
    terminal_status in ('completed', 'busy', 'failed', 'no-answer', 'canceled')
  ),
  terminal_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (provider, provider_call_id),
  constraint voice_provider_terminal_tombstone_window check (
    expires_at = terminal_at + interval '7 days'
  )
);
create index if not exists voice_provider_terminal_tombstones_expiry_idx
  on public.voice_provider_terminal_call_tombstones (expires_at);

create or replace function public.prevent_voice_provider_terminal_tombstone_rewrite()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
begin
  if tg_op = 'UPDATE' or old.expires_at > pg_catalog.clock_timestamp() then
    raise exception 'Voice provider terminal tombstones are immutable until retention expires'
      using errcode = '55000';
  end if;
  return old;
end
$fn$;

drop trigger if exists voice_provider_terminal_tombstones_immutable
  on public.voice_provider_terminal_call_tombstones;
create trigger voice_provider_terminal_tombstones_immutable
before update or delete on public.voice_provider_terminal_call_tombstones
for each row execute function public.prevent_voice_provider_terminal_tombstone_rewrite();

create or replace function public.purge_expired_voice_provider_terminal_tombstones(
  p_batch_size integer default 100
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_purged integer := 0;
begin
  if p_batch_size is null or p_batch_size not between 1 and 1000 then
    raise exception 'Voice provider terminal tombstone batch size is invalid' using errcode = '22023';
  end if;
  with expired as (
    select t.provider, t.provider_call_id
      from public.voice_provider_terminal_call_tombstones t
     where t.expires_at <= pg_catalog.clock_timestamp()
     order by t.expires_at, t.provider_call_id
     limit p_batch_size
     for update skip locked
  )
  delete from public.voice_provider_terminal_call_tombstones t
   using expired e
   where t.provider = e.provider
     and t.provider_call_id = e.provider_call_id;
  get diagnostics v_purged = row_count;
  return v_purged;
end
$fn$;

alter table public.voice_call_admissions
  add column if not exists voice_number_id uuid;
alter table public.voice_call_admissions
  add column if not exists provider_terminal_status text;
alter table public.voice_call_admissions
  add column if not exists provider_terminal_at timestamptz;
alter table public.voice_call_admissions
  drop constraint if exists voice_call_admissions_provider_terminal_shape;
alter table public.voice_call_admissions
  add constraint voice_call_admissions_provider_terminal_shape check (
    (provider_terminal_status is null and provider_terminal_at is null)
    or (
      provider_terminal_status in ('completed', 'busy', 'failed', 'no-answer', 'canceled')
      and provider_terminal_at is not null
    )
  );
alter table public.voice_call_admissions
  drop constraint if exists voice_call_admissions_voice_number_id_fkey;
alter table public.voice_call_admissions
  add constraint voice_call_admissions_voice_number_id_fkey
  foreign key (voice_number_id) references public.voice_number_inventory(id) on delete restrict;

alter table public.voice_call_admissions
  drop constraint if exists voice_call_admissions_number_binding_shape;
alter table public.voice_call_admissions
  add constraint voice_call_admissions_number_binding_shape check (
    (
      sender_number_id is null and voice_number_id is null
      and dialed_number is null and route_revision is null
    )
    or (
      pg_catalog.num_nonnulls(sender_number_id, voice_number_id) = 1
      and dialed_number ~ '^\+[1-9][0-9]{7,14}$'
      and route_revision >= 0
    )
  );

create index if not exists voice_call_admissions_voice_number_idx
  on public.voice_call_admissions (voice_number_id, admitted_at desc)
  where voice_number_id is not null;
create index if not exists voice_call_admissions_provider_terminal_idx
  on public.voice_call_admissions (provider, provider_call_id, provider_terminal_at)
  where provider_terminal_at is not null;

-- Retire the old overload: it was bound to sms_sender_numbers and did not carry
-- the signed caller identity required by the current contractor-dispatch rail.
drop function if exists public.claim_voice_call_admission(uuid, text, text, integer);

create or replace function public.claim_voice_call_admission_v2(
  p_account_id uuid,
  p_provider_call_id text,
  p_dialed_number text,
  p_concurrency_limit integer,
  p_caller_number text,
  p_caller_kind text
)
returns table (
  claim_status text,
  admission_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_existing public.voice_call_admissions%rowtype;
  v_open bigint;
  v_id uuid;
  v_voice_number_id uuid;
  v_route_revision bigint;
begin
  if p_account_id is null
     or p_provider_call_id is null
     or pg_catalog.length(pg_catalog.btrim(p_provider_call_id)) = 0
     or pg_catalog.length(p_provider_call_id) > 255
     or p_dialed_number is null
     or p_dialed_number !~ '^\+[1-9][0-9]{7,14}$'
     or p_concurrency_limit is null
     or p_concurrency_limit < 1
     or p_concurrency_limit > 100
     or (p_caller_number is not null and p_caller_number !~ '^\+1[2-9][0-9]{9}$')
     or p_caller_kind is null
     or p_caller_kind not in ('customer', 'owner', 'office', 'crew', 'staff_ambiguous', 'unknown') then
    raise exception 'voice admission claim arguments are invalid'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('signalwire:' || p_provider_call_id, 63190215)
  );
  if exists (
    select 1
      from public.voice_provider_terminal_call_tombstones t
     where t.provider = 'signalwire'
       and t.provider_call_id = p_provider_call_id
       and t.expires_at > pg_catalog.clock_timestamp()
  ) then
    return query select 'call_terminal'::text, null::uuid;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_account_id::text, 84601211)
  );

  select v.id, a.ai_voice_route_revision
    into v_voice_number_id, v_route_revision
    from public.accounts a
    join public.voice_number_inventory v
      on v.account_id = a.id
     and v.e164_number = a.call_tracking_number
   where a.id = p_account_id
     and a.suspended_at is null
     and a.call_tracking_number = p_dialed_number
     and v.provider = 'signalwire'
     and v.purpose = 'ai_voice'
     and v.e164_number = p_dialed_number
     and v.lifecycle_state = 'active'
     and v.voice_capable
     and pg_catalog.lower(v.call_handler) = 'laml_webhooks'
     and v.call_request_method = 'POST'
     and v.call_request_url ~ '^https://[^[:space:]]+/api/voice/ai$'
     and v.call_status_callback_url ~ '^https://[^[:space:]]+/api/voice/provider-status$'
     and v.call_status_callback_method = 'POST'
     and v.provider_readiness_state = 'ready'
     and v.provider_verified_at is not null
     and v.provider_verified_at >= pg_catalog.clock_timestamp() - interval '6 hours'
     and v.provider_verified_at <= pg_catalog.clock_timestamp() + interval '5 minutes'
     and v.last_provider_sync_at is not null
     and v.last_provider_sync_at >= pg_catalog.clock_timestamp() - interval '6 hours'
     and v.last_provider_sync_at <= pg_catalog.clock_timestamp() + interval '5 minutes'
     and v.activated_at is not null
     and v.suspended_at is null
     and v.released_at is null
   for share of a, v;

  if not found then
    return query select 'number_not_ready'::text, null::uuid;
    return;
  end if;

  select a.* into v_existing
    from public.voice_call_admissions a
   where a.provider = 'signalwire'
     and a.provider_call_id = p_provider_call_id;

  if found then
    if v_existing.account_id <> p_account_id then
      raise exception 'voice call id is already bound to another workspace'
        using errcode = '22000';
    end if;
    if v_existing.provider_terminal_at is not null
       or exists (
         select 1 from public.voice_events e
          where e.provider = v_existing.provider
            and e.provider_call_id = v_existing.provider_call_id
       ) then
      return query select 'call_terminal'::text, v_existing.id;
    elsif v_existing.voice_number_id is distinct from v_voice_number_id
       or v_existing.dialed_number is distinct from p_dialed_number
       or v_existing.route_revision is distinct from v_route_revision
       or v_existing.caller_number is distinct from p_caller_number
       or v_existing.caller_kind is distinct from p_caller_kind then
      return query select 'number_not_ready'::text, null::uuid;
    elsif v_existing.admission_state = 'admitted'
      and v_existing.provider_terminal_at is null then
      return query select 'existing'::text, v_existing.id;
    else
      return query select 'busy'::text, v_existing.id;
    end if;
    return;
  end if;

  select pg_catalog.count(*) into v_open
    from public.voice_call_admissions a
   where a.account_id = p_account_id
     and a.provider = 'signalwire'
     and a.provider_terminal_at is null
     and a.admitted_at >= pg_catalog.clock_timestamp() - interval '60 minutes'
     and not exists (
       select 1
         from public.voice_events e
        where e.provider = a.provider
          and e.provider_call_id = a.provider_call_id
     );

  if v_open >= p_concurrency_limit then
    return query select 'at_capacity'::text, null::uuid;
    return;
  end if;

  insert into public.voice_call_admissions (
    account_id, provider, provider_call_id, reservation_id,
    reserved_minutes, admission_state, sender_number_id, voice_number_id,
    dialed_number, route_revision, caller_number, caller_kind
  ) values (
    p_account_id, 'signalwire', p_provider_call_id, null,
    0, 'claimed', null, v_voice_number_id, p_dialed_number, v_route_revision,
    p_caller_number, p_caller_kind
  )
  returning id into v_id;

  return query select 'claimed'::text, v_id;
end
$fn$;

-- Finalization shares the provider+CallSid lock with terminal callbacks. A
-- provider-terminal claim can never transition to admitted, including on an
-- idempotent replay whose reservation values otherwise match.
create or replace function public.finalize_voice_call_admission(
  p_admission_id uuid,
  p_account_id uuid,
  p_provider_call_id text,
  p_reservation_id uuid,
  p_reserved_minutes integer,
  p_overage_key text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
begin
  if p_admission_id is null
     or p_account_id is null
     or p_provider_call_id is null
     or pg_catalog.length(pg_catalog.btrim(p_provider_call_id)) not between 1 and 255
     or p_reserved_minutes is null
     or p_reserved_minutes < 0
     or (p_reservation_id is not null and p_overage_key is not null)
     or (p_reservation_id is null and p_overage_key is null and p_reserved_minutes <> 0)
     or ((p_reservation_id is not null or p_overage_key is not null)
         and p_reserved_minutes = 0) then
    raise exception 'voice admission finalization arguments are invalid'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('signalwire:' || p_provider_call_id, 63190215)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_account_id::text || ':signalwire:' || p_provider_call_id,
      63190217
    )
  );
  if exists (
    select 1
      from public.voice_provider_terminal_call_tombstones t
     where t.provider = 'signalwire'
       and t.provider_call_id = p_provider_call_id
       and t.expires_at > pg_catalog.clock_timestamp()
  ) then
    return false;
  end if;

  update public.voice_call_admissions a
     set reservation_id = p_reservation_id,
         reserved_minutes = p_reserved_minutes,
         overage_key = p_overage_key,
         admission_state = 'admitted'
   where a.id = p_admission_id
     and a.account_id = p_account_id
     and a.provider = 'signalwire'
     and a.provider_call_id = p_provider_call_id
     and a.admission_state = 'claimed'
     and a.provider_terminal_at is null;
  if found then
    return true;
  end if;

  return exists (
    select 1 from public.voice_call_admissions a
     where a.id = p_admission_id
       and a.account_id = p_account_id
       and a.provider = 'signalwire'
       and a.provider_call_id = p_provider_call_id
       and a.admission_state = 'admitted'
       and a.provider_terminal_at is null
       and a.reservation_id is not distinct from p_reservation_id
       and a.reserved_minutes = p_reserved_minutes
       and a.overage_key is not distinct from p_overage_key
  );
end
$fn$;

-- Follow up the deployed contractor-action migration's two FK indexes.
create index if not exists voice_tool_actions_target_job_idx
  on public.voice_tool_actions (target_job_id)
  where target_job_id is not null;
create index if not exists voice_tool_actions_target_lead_idx
  on public.voice_tool_actions (target_lead_id)
  where target_lead_id is not null;

-- -------------------------------------------------------------------------
-- 7. RPC-only/service-only authorization surface.
-- -------------------------------------------------------------------------

alter table public.voice_number_spend_policies enable row level security;
alter table public.voice_number_spend_policies force row level security;
alter table public.voice_number_inventory enable row level security;
alter table public.voice_number_inventory force row level security;
alter table public.voice_number_candidate_observations enable row level security;
alter table public.voice_number_candidate_observations force row level security;
alter table public.voice_number_purchase_authorizations enable row level security;
alter table public.voice_number_purchase_authorizations force row level security;
alter table public.voice_number_provisioning_operations enable row level security;
alter table public.voice_number_provisioning_operations force row level security;
alter table public.voice_number_provisioning_attempts enable row level security;
alter table public.voice_number_provisioning_attempts force row level security;
alter table public.voice_number_operation_retry_authorizations enable row level security;
alter table public.voice_number_operation_retry_authorizations force row level security;
alter table public.voice_provider_terminal_call_tombstones enable row level security;
alter table public.voice_provider_terminal_call_tombstones force row level security;
alter table public.voice_number_identity_cleanup_reservations enable row level security;
alter table public.voice_number_identity_cleanup_reservations force row level security;

revoke all on table public.voice_number_spend_policies
  from public, anon, authenticated, service_role;
revoke all on table public.voice_number_inventory
  from public, anon, authenticated, service_role;
revoke all on table public.voice_number_candidate_observations
  from public, anon, authenticated, service_role;
revoke all on table public.voice_number_purchase_authorizations
  from public, anon, authenticated, service_role;
revoke all on table public.voice_number_provisioning_operations
  from public, anon, authenticated, service_role;
revoke all on table public.voice_number_provisioning_attempts
  from public, anon, authenticated, service_role;
revoke all on table public.voice_number_operation_retry_authorizations
  from public, anon, authenticated, service_role;
revoke all on table public.voice_provider_terminal_call_tombstones
  from public, anon, authenticated, service_role;
revoke all on table public.voice_number_identity_cleanup_reservations
  from public, anon, authenticated, service_role;

grant select on table public.voice_number_spend_policies to service_role;
grant select on table public.voice_number_inventory to service_role;
grant select on table public.voice_number_candidate_observations to service_role;
grant select on table public.voice_number_purchase_authorizations to service_role;
grant select on table public.voice_number_provisioning_operations to service_role;
grant select on table public.voice_number_provisioning_attempts to service_role;
grant select on table public.voice_number_operation_retry_authorizations to service_role;

-- Remove pre-hardening overloads so PostgREST cannot select an unsafe legacy
-- signature after a re-run on an environment that saw an earlier draft.
drop function if exists public.authorize_voice_number_purchase(
  uuid,text,text,bigint,bigint,bigint,text,text
);
drop function if exists public.claim_voice_number_operation(uuid,text,text,text,jsonb,uuid);
drop function if exists public.mark_voice_number_operation_indeterminate(uuid,uuid,text,text);
drop function if exists public.resolve_voice_number_operation(uuid,text,text,jsonb,text,text,text);
drop function if exists public.enumerate_pending_voice_number_identity_cleanups(uuid,integer);

revoke all on function public.prevent_voice_number_attempt_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.prevent_voice_number_authorization_rewrite()
  from public, anon, authenticated, service_role;
revoke all on function public.prevent_voice_number_candidate_observation_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.prevent_voice_number_retry_authorization_rewrite()
  from public, anon, authenticated, service_role;
revoke all on function public.prevent_voice_provider_terminal_tombstone_rewrite()
  from public, anon, authenticated, service_role;
revoke all on function public.purge_expired_voice_provider_terminal_tombstones(integer)
  from public, anon, authenticated, service_role;
revoke all on function public.prevent_reserved_voice_identity_assignment()
  from public, anon, authenticated, service_role;
revoke all on function public.unresolved_voice_number_identity_conflict(uuid,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.unresolved_messaging_number_identity_conflict(uuid,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.prevent_messaging_operation_voice_identity_conflict()
  from public, anon, authenticated, service_role;
revoke all on function public.prevent_voice_operation_identity_conflict()
  from public, anon, authenticated, service_role;
revoke all on function public.apply_voice_number_operation_success(uuid,text,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.set_voice_number_spend_policy(text,bigint,bigint,boolean,text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_voice_number_candidate_observation(text,text,boolean,text,jsonb,bigint,bigint,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.authorize_voice_number_purchase(uuid,text,text,uuid,bigint,bigint,bigint,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.authorize_voice_number_operation_retry(uuid,text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.reserve_voice_number_identity_cleanup(uuid,text,text,text,text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.enumerate_pending_voice_number_identity_cleanups(uuid,uuid,integer)
  from public, anon, authenticated, service_role;
revoke all on function public.enumerate_purchase_voice_number_cleanup_anchors(uuid,integer)
  from public, anon, authenticated, service_role;
revoke all on function public.finalize_voice_number_identity_cleanup(uuid,uuid,text,jsonb,text)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_voice_number_operation(uuid,text,text,text,jsonb,uuid,uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function public.begin_voice_number_operation(uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_voice_number_operation(uuid,uuid,text,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.reject_voice_number_operation(uuid,uuid,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.mark_voice_number_operation_indeterminate(uuid,uuid,text,text,text,jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.record_voice_number_reconciliation_observation(uuid,text,jsonb,text)
  from public, anon, authenticated, service_role;
revoke all on function public.recover_stale_voice_number_operations(integer)
  from public, anon, authenticated, service_role;
revoke all on function public.resolve_voice_number_operation(uuid,text,text,jsonb,text,text,text,text,jsonb,text)
  from public, anon, authenticated, service_role;
revoke all on function public.apply_voice_number_provider_verification(uuid,uuid,text,jsonb,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_voice_number_provider_check_attempt(uuid,uuid,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_voice_call_admission_v2(uuid,text,text,integer,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.finalize_voice_call_admission(uuid,uuid,text,uuid,integer,text)
  from public, anon, authenticated, service_role;

grant execute on function public.set_voice_number_spend_policy(text,bigint,bigint,boolean,text)
  to service_role;
grant execute on function public.record_voice_number_candidate_observation(text,text,boolean,text,jsonb,bigint,bigint,text,text)
  to service_role;
grant execute on function public.authorize_voice_number_purchase(uuid,text,text,uuid,bigint,bigint,bigint,text,text)
  to service_role;
grant execute on function public.authorize_voice_number_operation_retry(uuid,text,text,text)
  to service_role;
grant execute on function public.reserve_voice_number_identity_cleanup(uuid,text,text,text,text,text,text)
  to service_role;
grant execute on function public.enumerate_pending_voice_number_identity_cleanups(uuid,uuid,integer)
  to service_role;
grant execute on function public.enumerate_purchase_voice_number_cleanup_anchors(uuid,integer)
  to service_role;
grant execute on function public.finalize_voice_number_identity_cleanup(uuid,uuid,text,jsonb,text)
  to service_role;
grant execute on function public.claim_voice_number_operation(uuid,text,text,text,jsonb,uuid,uuid,text)
  to service_role;
grant execute on function public.begin_voice_number_operation(uuid,uuid)
  to service_role;
grant execute on function public.complete_voice_number_operation(uuid,uuid,text,jsonb)
  to service_role;
grant execute on function public.reject_voice_number_operation(uuid,uuid,text,text)
  to service_role;
grant execute on function public.mark_voice_number_operation_indeterminate(uuid,uuid,text,text,text,jsonb)
  to service_role;
grant execute on function public.record_voice_number_reconciliation_observation(uuid,text,jsonb,text)
  to service_role;
grant execute on function public.recover_stale_voice_number_operations(integer)
  to service_role;
grant execute on function public.resolve_voice_number_operation(uuid,text,text,jsonb,text,text,text,text,jsonb,text)
  to service_role;
grant execute on function public.apply_voice_number_provider_verification(uuid,uuid,text,jsonb,text,text)
  to service_role;
grant execute on function public.record_voice_number_provider_check_attempt(uuid,uuid,text,text)
  to service_role;
grant execute on function public.claim_voice_call_admission_v2(uuid,text,text,integer,text,text)
  to service_role;
grant execute on function public.finalize_voice_call_admission(uuid,uuid,text,uuid,integer,text)
  to service_role;
grant execute on function public.purge_expired_voice_provider_terminal_tombstones(integer)
  to service_role;

-- Static privilege assertion: future edits must not accidentally expose a
-- purchase/mutation table or RPC to browser roles.
do $assert$
declare
  v_bad text;
begin
  select pg_catalog.string_agg(
           table_name || ':' || grantee || ':' || privilege_type,
           ', ' order by table_name, grantee, privilege_type
         )
    into v_bad
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in (
       'voice_number_spend_policies', 'voice_number_inventory',
       'voice_number_candidate_observations',
       'voice_number_purchase_authorizations',
       'voice_number_provisioning_operations', 'voice_number_provisioning_attempts',
       'voice_number_operation_retry_authorizations',
       'voice_provider_terminal_call_tombstones',
       'voice_number_identity_cleanup_reservations'
     )
     and (
       grantee in ('PUBLIC', 'anon', 'authenticated')
       or (grantee = 'service_role' and privilege_type <> 'SELECT')
     );
  if v_bad is not null then
    raise exception 'AI Voice number browser/direct-mutation grants remain: %', v_bad;
  end if;
end
$assert$;

commit;
