-- Make carrier keyword suppression effective across every number assigned to
-- the same provider Campaign while retaining the existing exact-number ledger.
--
-- The carrier can deliver STOP or START on any Campaign number. The trigger
-- below projects that authenticated, receipt-deduplicated sender preference
-- into one canonical Campaign/recipient row in the same transaction. Final
-- egress takes the same advisory lock before checking both ledgers, so a first
-- STOP row cannot race a provider request as a phantom.

begin;

create table if not exists public.sms_campaign_keyword_preferences (
  provider text not null
    check (provider in ('twilio', 'signalwire')),
  campaign_id text not null
    check (
      pg_catalog.length(campaign_id) between 1 and 255
      and campaign_id = pg_catalog.lower(pg_catalog.btrim(campaign_id))
    ),
  phone_number text not null
    check (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  status text not null check (status in ('opted_in', 'opted_out')),
  source text not null check (source in ('inbound_stop', 'inbound_start')),
  opted_out_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (provider, campaign_id, phone_number),
  constraint sms_campaign_keyword_preferences_state_shape check (
    (status = 'opted_out' and opted_out_at is not null)
    or (status = 'opted_in' and opted_out_at is null)
  )
);

create index if not exists sms_campaign_keyword_opt_out_recipient_idx
  on public.sms_campaign_keyword_preferences (phone_number, provider, campaign_id)
  where status = 'opted_out';

-- Preserve every existing keyword decision when the Campaign ledger first
-- appears. The latest authenticated keyword wins across Campaign numbers;
-- STOP wins an impossible exact-timestamp tie. The effective status remains
-- authoritative: ambiguous dispatch START deliberately stays opted_out until
-- routing can bind it safely, and the Campaign projection must stay blocked too.
with ranked_preferences as (
  select
    sender.provider,
    pg_catalog.lower(pg_catalog.btrim(sender.campaign_id)) as campaign_id,
    preference.phone_number,
    preference.status,
    preference.source,
    preference.opted_out_at,
    preference.updated_at,
    pg_catalog.row_number() over (
      partition by
        sender.provider,
        pg_catalog.lower(pg_catalog.btrim(sender.campaign_id)),
        preference.phone_number
      order by
        preference.updated_at desc,
        case when preference.status = 'opted_out' then 0 else 1 end,
        sender.id
    ) as preference_rank
  from public.sms_sender_keyword_preferences preference
  join public.sms_sender_numbers sender
    on sender.id = preference.sender_number_id
  where nullif(pg_catalog.btrim(sender.campaign_id), '') is not null
)
insert into public.sms_campaign_keyword_preferences (
  provider, campaign_id, phone_number, status, source, opted_out_at, updated_at
)
select
  ranked.provider,
  ranked.campaign_id,
  ranked.phone_number,
  ranked.status,
  ranked.source,
  ranked.opted_out_at,
  ranked.updated_at
from ranked_preferences ranked
where ranked.preference_rank = 1
on conflict (provider, campaign_id, phone_number) do nothing;

alter table public.sms_campaign_keyword_preferences enable row level security;
alter table public.sms_campaign_keyword_preferences force row level security;

revoke all on table public.sms_campaign_keyword_preferences
  from public, anon, authenticated, service_role;
grant select on table public.sms_campaign_keyword_preferences to service_role;

create or replace function public.sync_sms_campaign_keyword_preference()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_provider text;
  v_campaign_id text;
  v_now timestamptz;
begin
  select
    sender.provider,
    nullif(
      pg_catalog.lower(pg_catalog.btrim(sender.campaign_id)),
      ''
    )
    into v_provider, v_campaign_id
    from public.sms_sender_numbers sender
   where sender.id = new.sender_number_id
   for share;

  -- A number without Campaign metadata keeps the historical exact-number
  -- behavior. Dispatch readiness is separately fail-closed at both delivery
  -- boundaries until its active sender has a Campaign id.
  if v_campaign_id is null then
    return new;
  end if;

  -- All callers that can reach this trigger already took the sender lock. The
  -- fixed sender-then-Campaign ordering is repeated at both final egress paths.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'sms-campaign-consent:' || v_provider || ':' || v_campaign_id || ':' || new.phone_number,
      20260906
    )
  );
  v_now := pg_catalog.clock_timestamp();

  insert into public.sms_campaign_keyword_preferences (
    provider, campaign_id, phone_number, status, source,
    opted_out_at, updated_at
  ) values (
    v_provider,
    v_campaign_id,
    new.phone_number,
    new.status,
    new.source,
    case
      when new.status = 'opted_out' then coalesce(new.opted_out_at, v_now)
      else null
    end,
    v_now
  )
  on conflict (provider, campaign_id, phone_number) do update
    set status = excluded.status,
        source = excluded.source,
        opted_out_at = excluded.opted_out_at,
        updated_at = excluded.updated_at;

  return new;
end;
$$;

revoke all on function public.sync_sms_campaign_keyword_preference()
  from public, anon, authenticated, service_role;

drop trigger if exists sms_sender_keyword_preferences_sync_campaign
  on public.sms_sender_keyword_preferences;
create trigger sms_sender_keyword_preferences_sync_campaign
after insert or update of status, source, opted_out_at, updated_at
on public.sms_sender_keyword_preferences
for each row execute function public.sync_sms_campaign_keyword_preference();

-- Effective keyword suppression for one exact sender. A sender with Campaign
-- metadata uses the canonical Campaign row as the authority. The legacy exact-
-- number row remains authoritative only when the sender has no Campaign, so a
-- number reassignment cannot drag an old Campaign's STOP into the new Campaign.
create or replace function public.sms_recipient_keyword_opted_out(
  p_sender_number_id uuid,
  p_phone_number text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_sender public.sms_sender_numbers%rowtype;
  v_campaign_id text;
begin
  if p_sender_number_id is null
     or p_phone_number is null
     or p_phone_number !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'SMS recipient keyword lookup arguments are invalid'
      using errcode = '22023';
  end if;

  select sender.* into v_sender
    from public.sms_sender_numbers sender
   where sender.id = p_sender_number_id;

  -- A stale or fabricated sender id must never turn into permission to text.
  if v_sender.id is null then
    return true;
  end if;

  v_campaign_id := nullif(
    pg_catalog.lower(pg_catalog.btrim(v_sender.campaign_id)),
    ''
  );
  if v_campaign_id is not null then
    return exists (
      select 1
        from public.sms_campaign_keyword_preferences preference
       where preference.provider = v_sender.provider
         and preference.campaign_id = v_campaign_id
         and preference.phone_number = p_phone_number
         and (
           preference.status = 'opted_out'
           or preference.opted_out_at is not null
         )
    );
  end if;

  return exists (
    select 1
      from public.sms_sender_keyword_preferences preference
     where preference.sender_number_id = v_sender.id
       and preference.phone_number = p_phone_number
       and (
         preference.status = 'opted_out'
         or preference.opted_out_at is not null
       )
  );
end;
$$;

revoke all on function public.sms_recipient_keyword_opted_out(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.sms_recipient_keyword_opted_out(uuid, text)
  to service_role;

-- Producer-side conservative precheck. Final delivery still resolves one exact
-- sender and repeats the effective check at the no-return boundary.
create or replace function public.sms_account_recipient_opted_out(
  p_account_id uuid,
  p_phone_number text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
begin
  if p_account_id is null
     or p_phone_number is null
     or p_phone_number !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'SMS account recipient lookup arguments are invalid'
      using errcode = '22023';
  end if;

  if exists (
    select 1
      from public.sms_consent consent
     where consent.account_id = p_account_id
       and consent.phone_number = p_phone_number
       and (
         consent.status = 'opted_out'
         or consent.opted_out_at is not null
       )
  ) then
    return true;
  end if;

  return exists (
    select 1
      from public.sms_sender_numbers sender
     where (
       (sender.purpose = 'contractor_dedicated' and sender.account_id = p_account_id)
       or (
         sender.purpose in ('lgq_shared', 'lgq_dispatch')
         and sender.account_id is null
       )
     )
       and sender.provisioning_status = 'active'
       and sender.assignment_state = 'assigned'
       and sender.inbound_ready
       and sender.suspended_at is null
       and public.sms_recipient_keyword_opted_out(sender.id, p_phone_number)
  );
end;
$$;

revoke all on function public.sms_account_recipient_opted_out(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.sms_account_recipient_opted_out(uuid, text)
  to service_role;

-- The 2026-09-04 TTL replacement accidentally copied an older stage function
-- and dropped the suspended-account and consent-scope gates. Preserve its TTL,
-- restore both gates, retain exact-purpose sender selection, and add the
-- effective sender-or-Campaign keyword veto.
create or replace function public.stage_sms_delivery(
  p_sms_event_id uuid,
  p_claim_token uuid,
  p_provider text
)
returns table (
  dispatch_status text,
  sender_number_id uuid,
  sender_e164 text,
  provider_number_id text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_task public.sms_delivery_tasks%rowtype;
  v_event public.sms_events%rowtype;
  v_sender public.sms_sender_numbers%rowtype;
  v_required_scope text;
begin
  if p_provider is null or p_provider not in ('twilio', 'signalwire') then
    raise exception 'SMS provider is invalid'
      using errcode = '22023';
  end if;

  select task.* into v_task
    from public.sms_delivery_tasks task
   where task.sms_event_id = p_sms_event_id
   for update;
  select event.* into v_event
    from public.sms_events event
   where event.id = p_sms_event_id
   for update;

  if v_task.sms_event_id is null or v_event.id is null
     or v_task.task_state <> 'leased'
     or v_task.claim_token is distinct from p_claim_token
     or v_task.lease_expires_at <= v_now
     or v_task.request_started_at is not null
     or v_event.status <> 'queued' then
    raise exception 'SMS delivery lease is stale or invalid'
      using errcode = '55000';
  end if;

  if v_task.available_at < v_now - interval '24 hours'
     or v_task.created_at < v_now - interval '24 hours' then
    update public.sms_events event
       set status = 'cancelled', error_reason = 'sms_delivery_expired',
           cancelled_at = v_now, updated_at = v_now
     where event.id = v_event.id;
    update public.sms_delivery_tasks task
       set task_state = 'cancelled', claim_token = null,
           lease_expires_at = null, last_error_code = 'sms_delivery_expired',
           cancelled_at = v_now, updated_at = v_now
     where task.sms_event_id = v_event.id;
    update public.sms_delivery_attempts attempt
       set outcome = 'cancelled', error_code = 'sms_delivery_expired',
           finished_at = v_now
     where attempt.claim_token = p_claim_token and attempt.outcome is null;
    return query select 'cancelled'::text, null::uuid, null::text, null::text;
    return;
  end if;

  if exists (
    select 1
      from public.accounts account
     where account.id = v_event.account_id
       and account.suspended_at is not null
  ) then
    update public.sms_events event
       set status = 'cancelled', error_reason = 'account_suspended_closed',
           cancelled_at = v_now, updated_at = v_now
     where event.id = v_event.id;
    update public.sms_delivery_tasks task
       set task_state = 'cancelled', claim_token = null,
           lease_expires_at = null, last_error_code = 'account_suspended_closed',
           cancelled_at = v_now, updated_at = v_now
     where task.sms_event_id = v_event.id;
    update public.sms_delivery_attempts attempt
       set outcome = 'cancelled', error_code = 'account_suspended_closed',
           finished_at = v_now
     where attempt.claim_token = p_claim_token and attempt.outcome is null;
    return query select 'cancelled'::text, null::uuid, null::text, null::text;
    return;
  end if;

  if not exists (
    select 1
      from public.sms_consent consent
     where consent.account_id = v_event.account_id
       and consent.phone_number = v_event.phone_number
       and consent.status = 'opted_in'
       and consent.consented_at is not null
       and consent.opted_out_at is null
  ) then
    update public.sms_events event
       set status = 'cancelled', error_reason = 'sms_consent_not_current',
           cancelled_at = v_now, updated_at = v_now
     where event.id = v_event.id;
    update public.sms_delivery_tasks task
       set task_state = 'cancelled', claim_token = null,
           lease_expires_at = null, last_error_code = 'sms_consent_not_current',
           cancelled_at = v_now, updated_at = v_now
     where task.sms_event_id = v_event.id;
    update public.sms_delivery_attempts attempt
       set outcome = 'cancelled', error_code = 'sms_consent_not_current',
           finished_at = v_now
     where attempt.claim_token = p_claim_token and attempt.outcome is null;
    return query select 'cancelled'::text, null::uuid, null::text, null::text;
    return;
  end if;

  v_required_scope := case v_event.billing_category
    when 'customer_message' then 'customer'
    when 'payment_message' then 'customer'
    when 'verification' then 'customer'
    when 'crew_message' then 'crew'
    when 'owner_alert' then 'owner'
    else null
  end;
  if v_required_scope is null or not exists (
    select 1
      from public.sms_consent_scopes scope
     where scope.account_id = v_event.account_id
       and scope.phone_number = v_event.phone_number
       and scope.consent_scope = v_required_scope
  ) then
    update public.sms_events event
       set status = 'cancelled', error_reason = 'sms_consent_scope_not_current',
           cancelled_at = v_now, updated_at = v_now
     where event.id = v_event.id;
    update public.sms_delivery_tasks task
       set task_state = 'cancelled', claim_token = null,
           lease_expires_at = null,
           last_error_code = 'sms_consent_scope_not_current',
           cancelled_at = v_now, updated_at = v_now
     where task.sms_event_id = v_event.id;
    update public.sms_delivery_attempts attempt
       set outcome = 'cancelled', error_code = 'sms_consent_scope_not_current',
           finished_at = v_now
     where attempt.claim_token = p_claim_token and attempt.outcome is null;
    return query select 'cancelled'::text, null::uuid, null::text, null::text;
    return;
  end if;

  if v_event.sender_number_id is not null then
    select sender.* into v_sender
      from public.sms_sender_numbers sender
     where sender.id = v_event.sender_number_id
       and sender.provider = p_provider
       and sender.purpose = v_event.sender_purpose
       and (
         (sender.purpose = 'contractor_dedicated'
           and sender.account_id = v_event.account_id)
         or (sender.purpose in ('lgq_shared', 'lgq_dispatch')
           and sender.account_id is null)
       )
       and sender.provisioning_status = 'active'
       and sender.assignment_state = 'assigned'
       and sender.inbound_ready
       and sender.suspended_at is null
     for share;
  else
    select sender.* into v_sender
      from public.sms_sender_numbers sender
     where sender.provider = p_provider
       and sender.purpose = v_event.sender_purpose
       and (
         (sender.purpose = 'contractor_dedicated'
           and sender.account_id = v_event.account_id)
         or (sender.purpose in ('lgq_shared', 'lgq_dispatch')
           and sender.account_id is null)
       )
       and sender.provisioning_status = 'active'
       and sender.assignment_state = 'assigned'
       and sender.inbound_ready
       and sender.suspended_at is null
     order by sender.activated_at, sender.id
     limit 1
     for share;
  end if;

  if v_sender.id is null
     or (
       v_sender.purpose = 'lgq_dispatch'
       and (
         nullif(pg_catalog.btrim(v_sender.campaign_id), '') is null
         or pg_catalog.length(pg_catalog.btrim(v_sender.campaign_id)) > 255
       )
     ) then
    return query select 'blocked_sender'::text, null::uuid, null::text, null::text;
    return;
  end if;

  if public.sms_recipient_keyword_opted_out(v_sender.id, v_event.phone_number) then
    update public.sms_events event
       set status = 'cancelled', error_reason = 'sms_sender_opted_out',
           cancelled_at = v_now, updated_at = v_now
     where event.id = v_event.id;
    update public.sms_delivery_tasks task
       set task_state = 'cancelled', claim_token = null,
           lease_expires_at = null, last_error_code = 'sms_sender_opted_out',
           cancelled_at = v_now, updated_at = v_now
     where task.sms_event_id = v_event.id;
    update public.sms_delivery_attempts attempt
       set outcome = 'cancelled', error_code = 'sms_sender_opted_out',
           finished_at = v_now
     where attempt.claim_token = p_claim_token and attempt.outcome is null;
    return query select 'cancelled'::text, null::uuid, null::text, null::text;
    return;
  end if;

  update public.sms_events event
     set provider = p_provider,
         sender_number_id = v_sender.id,
         updated_at = v_now
   where event.id = v_event.id;

  return query
  select 'ready'::text, v_sender.id, v_sender.e164_number,
         v_sender.provider_number_id;
end;
$$;

revoke all on function public.stage_sms_delivery(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.stage_sms_delivery(uuid, uuid, text)
  to service_role;

-- The provider socket opens only after this function commits. Lock sender then
-- Campaign, re-prove exact-purpose inventory and consent, and persist usage plus
-- request_started_at in that same transaction.
create or replace function public.mark_sms_delivery_request_started_with_usage(
  p_sms_event_id uuid,
  p_claim_token uuid,
  p_usage_kind text,
  p_reservation_id uuid,
  p_finalization_key text,
  p_overage_key text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_event public.sms_events%rowtype;
  v_task public.sms_delivery_tasks%rowtype;
  v_sender public.sms_sender_numbers%rowtype;
  v_consent public.sms_consent%rowtype;
  v_reservation public.usage_reservations%rowtype;
  v_overage public.workspace_overage_accrual_events%rowtype;
  v_campaign_id text;
  v_required_scope text;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_usage_kind not in ('reservation', 'overage', 'unmetered')
     or (p_usage_kind = 'reservation' and (
       p_reservation_id is null
       or p_finalization_key is null
       or p_overage_key is not null))
     or (p_usage_kind = 'overage' and (
       p_reservation_id is not null
       or p_finalization_key is not null
       or p_overage_key is null))
     or (p_usage_kind = 'unmetered' and (
       p_reservation_id is not null
       or p_finalization_key is not null
       or p_overage_key is not null)) then
    raise exception 'SMS text-usage evidence is malformed' using errcode = '22023';
  end if;

  select event.* into v_event
    from public.sms_events event
   where event.id = p_sms_event_id
   for update;
  select task.* into v_task
    from public.sms_delivery_tasks task
   where task.sms_event_id = p_sms_event_id
   for update;

  if v_event.id is null or v_task.sms_event_id is null
     or v_event.status <> 'queued'
     or v_task.task_state <> 'leased'
     or v_task.claim_token is distinct from p_claim_token
     or v_task.lease_expires_at <= v_now
     or v_task.request_started_at is not null then
    raise exception 'SMS delivery usage boundary is stale or invalid'
      using errcode = '55000';
  end if;

  select sender.* into v_sender
    from public.sms_sender_numbers sender
   where sender.id = v_event.sender_number_id
     and sender.provider = v_event.provider
     and sender.purpose = v_event.sender_purpose
     and (
       (sender.purpose = 'contractor_dedicated'
         and sender.account_id = v_event.account_id)
       or (sender.purpose in ('lgq_shared', 'lgq_dispatch')
         and sender.account_id is null)
     )
     and sender.provisioning_status = 'active'
     and sender.assignment_state = 'assigned'
     and sender.inbound_ready
     and sender.suspended_at is null
     and (
       sender.purpose <> 'lgq_dispatch'
       or (
         nullif(pg_catalog.btrim(sender.campaign_id), '') is not null
         and pg_catalog.length(pg_catalog.btrim(sender.campaign_id)) <= 255
       )
     )
   for share;
  if not found then
    raise exception 'SMS sender became unavailable before provider request'
      using errcode = 'P5102';
  end if;

  -- Existing inbound ordering begins with this exact sender/recipient lock.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'sms-sender-consent:' || v_sender.id::text || ':' || v_event.phone_number,
      20260821
    )
  );

  v_campaign_id := nullif(
    pg_catalog.lower(pg_catalog.btrim(v_sender.campaign_id)),
    ''
  );
  if v_campaign_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'sms-campaign-consent:' || v_sender.provider || ':' || v_campaign_id || ':' || v_event.phone_number,
        20260906
      )
    );
  end if;

  -- A suspension committed before the no-return boundary wins. A concurrent
  -- suspension waits on this shared row lock and is ordered after the boundary.
  perform 1
    from public.accounts account
   where account.id = v_event.account_id
     and account.suspended_at is null
   for share;
  if not found then
    raise exception 'SMS account became unavailable before provider request'
      using errcode = 'P5102';
  end if;

  select consent.* into v_consent
    from public.sms_consent consent
   where consent.account_id = v_event.account_id
     and consent.phone_number = v_event.phone_number
   for share;
  if not found
     or v_consent.status <> 'opted_in'
     or v_consent.consented_at is null
     or v_consent.opted_out_at is not null then
    raise exception 'SMS consent became unavailable before provider request'
      using errcode = 'P5101';
  end if;

  v_required_scope := case v_event.billing_category
    when 'customer_message' then 'customer'
    when 'payment_message' then 'customer'
    when 'verification' then 'customer'
    when 'crew_message' then 'crew'
    when 'owner_alert' then 'owner'
    else null
  end;
  if v_required_scope is null then
    raise exception 'SMS consent scope became unavailable before provider request'
      using errcode = 'P5101';
  end if;
  perform 1
    from public.sms_consent_scopes scope
   where scope.account_id = v_event.account_id
     and scope.phone_number = v_event.phone_number
     and scope.consent_scope = v_required_scope
   for share;
  if not found then
    raise exception 'SMS consent scope became unavailable before provider request'
      using errcode = 'P5101';
  end if;

  if public.sms_recipient_keyword_opted_out(v_sender.id, v_event.phone_number) then
    raise exception 'SMS recipient keyword preference became opted out before provider request'
      using errcode = 'P5103';
  end if;

  if p_usage_kind = 'reservation' then
    select reservation.* into v_reservation
      from public.usage_reservations reservation
     where reservation.id = p_reservation_id;
    if not found
       or v_reservation.account_id <> v_event.account_id
       or v_reservation.resource_code <> 'text_segments'
       or v_reservation.operation_type <> 'text_send'
       or v_reservation.state <> 'reserved'
       or p_finalization_key <> v_reservation.idempotency_key || ':commit' then
      raise exception 'SMS text reservation does not match this delivery'
        using errcode = '22000';
    end if;
  elsif p_usage_kind = 'overage' then
    select overage.* into v_overage
      from public.workspace_overage_accrual_events overage
     where overage.account_id = v_event.account_id
       and overage.idempotency_key = p_overage_key;
    if not found
       or v_overage.resource_code <> 'text_segments'
       or v_overage.released_at is not null then
      raise exception 'SMS text overage does not match this delivery'
        using errcode = '22000';
    end if;
  end if;

  update public.sms_events event
     set text_usage_kind = p_usage_kind,
         text_usage_reservation_id = p_reservation_id,
         text_usage_finalization_key = p_finalization_key,
         text_usage_overage_key = p_overage_key,
         text_usage_state = case p_usage_kind
           when 'reservation' then 'held'
           when 'overage' then 'accrued'
           else 'unmetered'
         end,
         text_usage_last_error = null,
         text_usage_updated_at = v_now
   where event.id = p_sms_event_id;

  perform public.mark_sms_delivery_request_started(p_sms_event_id, p_claim_token);
  return true;
end;
$$;

revoke all on function public.mark_sms_delivery_request_started_with_usage(
  uuid, uuid, text, uuid, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.mark_sms_delivery_request_started_with_usage(
  uuid, uuid, text, uuid, text, text
) to service_role;

-- Keep the synchronous shared-number courtesy response behind the same final
-- sender/Campaign suppression boundary. The HTTP route's earlier read remains a
-- fast fail-closed check; this receipt claim is the race-free authority.
create or replace function public.record_sms_shared_notice_reply(
  p_webhook_receipt_id uuid,
  p_egress_result text,
  p_response_body_sha256 text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_receipt public.sms_webhook_receipts%rowtype;
  v_sender public.sms_sender_numbers%rowtype;
  v_consent public.sms_consent%rowtype;
  v_result public.sms_shared_notice_replies%rowtype;
  v_campaign_id text;
  v_effective_egress_result text := p_egress_result;
  v_effective_body_sha256 text := p_response_body_sha256;
  v_recipient_opted_out boolean := false;
begin
  if p_webhook_receipt_id is null
     or p_egress_result not in ('twiml', 'suppressed')
     or p_response_body_sha256 is null
     or p_response_body_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'SMS shared notice reply result is invalid' using errcode = '22023';
  end if;

  select receipt.* into v_receipt
    from public.sms_webhook_receipts receipt
   where receipt.id = p_webhook_receipt_id
   for share;

  if v_receipt.id is null
     or v_receipt.webhook_kind <> 'inbound'
     or v_receipt.processing_state not in ('processed', 'review')
     or v_receipt.sender_number_id is null
     or v_receipt.from_number is null
     or v_receipt.from_number !~ '^\+[1-9][0-9]{7,14}$'
     or v_receipt.to_number is null then
    raise exception 'SMS shared notice reply is not bound to an exact inbound sender'
      using errcode = '55000';
  end if;

  if v_receipt.disposition is not null
     and v_receipt.disposition like 'keyword\_%' then
    raise exception 'SMS shared notice reply may not answer a compliance keyword'
      using errcode = '55000';
  end if;

  select sender.* into v_sender
    from public.sms_sender_numbers sender
   where sender.id = v_receipt.sender_number_id
     and sender.provider = v_receipt.provider
     and sender.e164_number = v_receipt.to_number
     and sender.purpose in ('lgq_shared', 'lgq_dispatch')
     and sender.account_id is null
     and sender.provisioning_status = 'active'
     and sender.assignment_state = 'assigned'
     and sender.inbound_ready
     and sender.activated_at is not null
     and sender.suspended_at is null
   for share;

  if v_sender.id is null then
    raise exception 'SMS shared notice reply is not bound to an active LGQ platform sender'
      using errcode = '55000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'sms-sender-consent:' || v_sender.id::text || ':' || v_receipt.from_number,
      20260821
    )
  );

  v_campaign_id := nullif(
    pg_catalog.lower(pg_catalog.btrim(v_sender.campaign_id)),
    ''
  );
  if v_campaign_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'sms-campaign-consent:' || v_sender.provider || ':' || v_campaign_id || ':' || v_receipt.from_number,
        20260906
      )
    );
  end if;

  if v_receipt.account_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      public.sms_inbound_recipient_lock_key(
        v_receipt.account_id,
        v_receipt.from_number
      )
    );
  end if;

  v_recipient_opted_out := public.sms_recipient_keyword_opted_out(
    v_sender.id,
    v_receipt.from_number
  );

  -- Dispatch is never allowed to emit ordinary Campaign traffic without a
  -- canonical Campaign id, even if an inventory row was accidentally activated.
  v_recipient_opted_out := v_recipient_opted_out
    or (
      v_sender.purpose = 'lgq_dispatch'
      and (
        v_campaign_id is null
        or pg_catalog.length(v_campaign_id) > 255
      )
    );

  if v_receipt.account_id is not null then
    select consent.* into v_consent
      from public.sms_consent consent
     where consent.account_id = v_receipt.account_id
       and consent.phone_number = v_receipt.from_number
     for share;

    v_recipient_opted_out := v_recipient_opted_out
      or v_consent.id is null
      or v_consent.status <> 'opted_in'
      or v_consent.opted_out_at is not null;
  end if;

  if v_recipient_opted_out then
    v_effective_egress_result := 'suppressed';
    -- SHA-256 of the exact EMPTY_TWIML returned by the route.
    v_effective_body_sha256 :=
      'f94774d9eace296b75aeb622792d92dd74b7873a3b10ade1f415c0d399cfac07';
  end if;

  insert into public.sms_shared_notice_replies (
    webhook_receipt_id, egress_result, response_body_sha256
  ) values (
    p_webhook_receipt_id, v_effective_egress_result, v_effective_body_sha256
  ) on conflict (webhook_receipt_id) do nothing
  returning * into v_result;

  return v_result.webhook_receipt_id is not null
    and v_effective_egress_result = 'twiml';
end;
$$;

revoke all on function public.record_sms_shared_notice_reply(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.record_sms_shared_notice_reply(uuid, text, text)
  to service_role;

commit;
