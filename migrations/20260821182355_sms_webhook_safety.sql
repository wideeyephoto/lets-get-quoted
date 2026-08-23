-- Provider-scoped SMS webhook inbox, strict inbound routing, and monotonic
-- delivery callbacks.
--
-- This migration is dark: it configures no provider callback and sends no
-- message. The HTTP routes opt into these RPCs only when the application code
-- is deployed. All carrier-authenticated writes cross a service-role-only RPC
-- boundary so receipt deduplication and their effects commit atomically.

begin;

-- -------------------------------------------------------------------------
-- 1. Provider identity on the threaded inbox.
-- -------------------------------------------------------------------------

alter table public.sms_messages add column if not exists provider text;
alter table public.sms_messages add column if not exists sender_number_id uuid
  references public.sms_sender_numbers(id) on delete restrict;
alter table public.sms_messages add column if not exists sms_event_id uuid
  references public.sms_events(id) on delete restrict;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'sms_messages_provider_check'
       and conrelid = 'public.sms_messages'::pg_catalog.regclass
  ) then
    alter table public.sms_messages add constraint sms_messages_provider_check
      check (provider is null or provider in ('twilio', 'signalwire'));
  end if;
end
$$;

create unique index if not exists sms_messages_provider_inbound_uidx
  on public.sms_messages (provider, provider_id)
  where direction = 'inbound'
    and provider is not null
    and provider_id is not null;
create unique index if not exists sms_messages_sms_event_uidx
  on public.sms_messages (sms_event_id)
  where sms_event_id is not null;
create index if not exists sms_messages_sender_number_idx
  on public.sms_messages (sender_number_id, created_at desc)
  where sender_number_id is not null;

-- Owners may still create a provider-neutral outbound transcript row while
-- producers migrate to the durable queue, and may mark inbound rows read. They
-- may never manufacture carrier identity, an inbound row, or rewrite message
-- identity after insert: doing so could pre-empt the global provider/message ID
-- and deny the real callback its inbox row.
create or replace function public.prevent_sms_message_provider_spoofing()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  -- complete_sms_delivery predates these columns but deliberately gives the
  -- transcript row the same UUID as its sms_events row. Hydrate the new
  -- provider identity at the table boundary so old and new function bodies
  -- cannot create two classes of outbound transcript.
  if tg_op = 'INSERT' and new.direction = 'outbound'
     and new.sms_event_id is null then
    select e.id, e.provider, e.sender_number_id
      into new.sms_event_id, new.provider, new.sender_number_id
      from public.sms_events e
     where e.id = new.id
       and e.provider_id is not distinct from new.provider_id;
  end if;

  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' and (
      new.direction <> 'outbound'
      or new.provider_id is not null
      or new.provider is not null
      or new.sender_number_id is not null
      or new.sms_event_id is not null
    ) then
      raise exception 'Browser sessions cannot assign SMS provider identity'
        using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and (
      old.id is distinct from new.id
      or old.account_id is distinct from new.account_id
      or old.phone_number is distinct from new.phone_number
      or old.direction is distinct from new.direction
      or old.body is distinct from new.body
      or old.provider_id is distinct from new.provider_id
      or old.provider is distinct from new.provider
      or old.sender_number_id is distinct from new.sender_number_id
      or old.sms_event_id is distinct from new.sms_event_id
      or old.media_urls is distinct from new.media_urls
      or old.created_at is distinct from new.created_at
    ) then
      raise exception 'Browser sessions can only update SMS read state'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sms_messages_provider_identity_guard
  on public.sms_messages;
create trigger sms_messages_provider_identity_guard
before insert or update on public.sms_messages
for each row execute function public.prevent_sms_message_provider_spoofing();

-- -------------------------------------------------------------------------
-- 2. Durable authenticated-webhook receipts and operator review.
-- -------------------------------------------------------------------------

create table if not exists public.sms_webhook_receipts (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  provider text not null
    check (provider in ('twilio', 'signalwire')),
  webhook_kind text not null
    check (webhook_kind in ('inbound', 'status')),
  -- Logical identity, constructed from provider-native IDs. For inbound this
  -- is the message ID. For status it is message ID + normalized state + error
  -- code, so retries dedupe while a later state for the same message remains a
  -- different receipt.
  receipt_key text not null
    check (pg_catalog.length(receipt_key) between 1 and 700),
  provider_event_id text not null
    check (pg_catalog.length(provider_event_id) between 1 and 255),
  body_sha256 text not null
    check (body_sha256 ~ '^[0-9a-f]{64}$'),
  content_type text,
  request_url text,
  from_number text,
  to_number text,
  provider_status text,
  provider_error_code text,
  processing_state text not null default 'received'
    check (processing_state in ('received', 'processed', 'review', 'ignored', 'failed')),
  disposition text,
  account_id uuid references public.accounts(id) on delete restrict,
  sender_number_id uuid references public.sms_sender_numbers(id) on delete restrict,
  sms_event_id uuid references public.sms_events(id) on delete restrict,
  sms_message_id uuid references public.sms_messages(id) on delete restrict,
  error_message text,
  received_at timestamptz not null default pg_catalog.now(),
  processed_at timestamptz,
  constraint sms_webhook_receipts_processing_shape check (
    (processing_state = 'received' and processed_at is null)
    or (processing_state <> 'received' and processed_at is not null)
  ),
  unique (provider, webhook_kind, receipt_key)
);

create index if not exists sms_webhook_receipts_provider_event_idx
  on public.sms_webhook_receipts (
    provider, webhook_kind, provider_event_id, received_at desc
  );
create index if not exists sms_webhook_receipts_open_idx
  on public.sms_webhook_receipts (received_at, id)
  where processing_state in ('received', 'failed');
create index if not exists sms_webhook_receipts_account_idx
  on public.sms_webhook_receipts (account_id, received_at desc)
  where account_id is not null;
create index if not exists sms_webhook_receipts_sender_idx
  on public.sms_webhook_receipts (sender_number_id, received_at desc)
  where sender_number_id is not null;
create index if not exists sms_webhook_receipts_event_idx
  on public.sms_webhook_receipts (sms_event_id)
  where sms_event_id is not null;
create index if not exists sms_webhook_receipts_message_idx
  on public.sms_webhook_receipts (sms_message_id)
  where sms_message_id is not null;

create table if not exists public.sms_operator_review_items (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  webhook_receipt_id uuid not null unique
    references public.sms_webhook_receipts(id) on delete restrict,
  reason text not null check (reason in (
    'unknown_destination', 'ambiguous_destination',
    'shared_destination_unroutable', 'unmatched_status',
    'unsupported_status', 'invalid_payload', 'restart_without_consent'
  )),
  review_state text not null default 'open'
    check (review_state in ('open', 'resolved', 'dismissed')),
  severity text not null default 'warning'
    check (severity in ('info', 'warning', 'critical')),
  provider text not null
    check (provider in ('twilio', 'signalwire')),
  account_id uuid references public.accounts(id) on delete restrict,
  sender_number_id uuid references public.sms_sender_numbers(id) on delete restrict,
  sms_event_id uuid references public.sms_events(id) on delete restrict,
  provider_event_id text,
  from_number text,
  to_number text,
  message_body text,
  media_urls text[],
  provider_status text,
  provider_error_code text,
  resolution_note text,
  resolution_actor text,
  created_at timestamptz not null default pg_catalog.now(),
  resolved_at timestamptz,
  constraint sms_operator_review_resolution_shape check (
    (review_state = 'open' and resolved_at is null)
    or (review_state <> 'open' and resolved_at is not null)
  )
);

-- Keep the file safely repeatable for databases that created the review table
-- from an earlier dark revision of this same migration.
alter table public.sms_operator_review_items
  add column if not exists resolution_actor text;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'sms_operator_review_resolution_actor_check'
       and conrelid = 'public.sms_operator_review_items'::pg_catalog.regclass
  ) then
    alter table public.sms_operator_review_items
      add constraint sms_operator_review_resolution_actor_check
      check (
        resolution_actor is null
        or pg_catalog.length(pg_catalog.btrim(resolution_actor)) between 3 and 320
      );
  end if;
end
$$;

create index if not exists sms_operator_review_open_idx
  on public.sms_operator_review_items (severity, created_at, id)
  where review_state = 'open';
create index if not exists sms_operator_review_account_idx
  on public.sms_operator_review_items (account_id, created_at desc)
  where account_id is not null;
create index if not exists sms_operator_review_sender_idx
  on public.sms_operator_review_items (sender_number_id, created_at desc)
  where sender_number_id is not null;
create index if not exists sms_operator_review_event_idx
  on public.sms_operator_review_items (sms_event_id)
  where sms_event_id is not null;

-- A STOP to a shared LGQ sender has a platform-sender scope, not a contractor
-- scope. Preserve that fact explicitly rather than pretending a shared number
-- belongs to whichever account touched the phone most recently.
create table if not exists public.sms_sender_keyword_preferences (
  sender_number_id uuid not null
    references public.sms_sender_numbers(id) on delete restrict,
  phone_number text not null
    check (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  status text not null check (status in ('opted_in', 'opted_out')),
  source text not null check (source in ('inbound_stop', 'inbound_start')),
  opted_out_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (sender_number_id, phone_number),
  constraint sms_sender_keyword_preferences_state_shape check (
    (status = 'opted_out' and opted_out_at is not null)
    or (status = 'opted_in' and opted_out_at is null)
  )
);

create index if not exists sms_sender_keyword_opt_out_idx
  on public.sms_sender_keyword_preferences (phone_number, sender_number_id)
  where status = 'opted_out';

-- -------------------------------------------------------------------------
-- 3. One atomic inbound ingest: dedupe, route by To, and store or review.
-- -------------------------------------------------------------------------

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
    -- A logical receipt key is immutable evidence, not merely a dedupe hint.
    -- Refuse a key replayed with different signed bytes or routing identity;
    -- otherwise an attacker/provider bug could smuggle a second callback under
    -- the first receipt's already-processed outcome.
    if v_existing.provider_event_id is distinct from p_provider_event_id
       or v_existing.body_sha256 is distinct from p_body_sha256
       or v_existing.from_number is distinct from p_from_number
       or v_existing.to_number is distinct from p_to_number
       or v_existing.content_type is distinct from pg_catalog.left(p_content_type, 255)
       or v_existing.request_url is distinct from pg_catalog.left(p_request_url, 2000) then
      raise exception 'SMS inbound receipt key was replayed with different immutable evidence'
        using errcode = 'P5120';
    end if;
    -- A carrier retry must never produce a second keyword auto-reply. The
    -- original transaction already applied the preference and stored its
    -- disposition; all later deliveries are unconditionally duplicates.
    return query
    select 'duplicate'::text, v_existing.id, v_existing.account_id,
           v_existing.sender_number_id, s.purpose
      from public.sms_webhook_receipts r
      left join public.sms_sender_numbers s on s.id = r.sender_number_id
     where r.id = v_existing.id;
    return;
  end if;

  -- Provider is part of the key. The same E.164 number may exist in two
  -- provider projects during a migration; a callback signed by one provider
  -- can never claim the other provider's inventory row.
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

  v_routed_account_id := v_sender.account_id;

  -- A platform/shared number can carry traffic for more than one downstream
  -- business. A keyword may be projected into an account only when the exact
  -- sender-number + contact pair has provider-accepted outbound history for
  -- exactly one account. This is an aggregate over the complete durable ledger,
  -- never a newest-conversation or newest-consent guess. Ordinary shared-number
  -- replies remain quarantined below even when this keyword-only association is
  -- available.
  if v_sender.purpose = 'lgq_shared' and v_routed_account_id is null then
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

  update public.sms_webhook_receipts
     set sender_number_id = v_sender.id,
         account_id = v_routed_account_id
   where id = v_receipt.id;

  if p_keyword in ('stop', 'start') then
    -- Serialize the first preference INSERT as well as later updates with the
    -- delivery worker's final request-boundary check. A row lock cannot protect
    -- a preference that does not exist yet; this deterministic advisory key can.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'sms-sender-consent:' || v_sender.id::text || ':' || p_from_number,
        20260821
      )
    );
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
        v_reason := 'restart_without_consent';
        insert into public.sms_operator_review_items (
          webhook_receipt_id, reason, severity, provider, account_id,
          sender_number_id, provider_event_id, from_number, to_number,
          message_body
        ) values (
          v_receipt.id, v_reason, 'info', p_provider, v_routed_account_id,
          v_sender.id, p_provider_event_id, p_from_number, p_to_number,
          pg_catalog.left(p_message_body, 5000)
        );
      end if;
    else
      -- Shared LGQ senders have a platform scope. Never mutate contractor-
      -- scoped consent rows from a reply to the platform number. The sender-
      -- scoped preference above is enforced by stage_sms_delivery immediately
      -- before egress.
      null;
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

  if v_sender.purpose <> 'contractor_dedicated'
     or v_sender.account_id is null then
    insert into public.sms_operator_review_items (
      webhook_receipt_id, reason, severity, provider, sender_number_id,
      provider_event_id, from_number, to_number, message_body, media_urls
    ) values (
      v_receipt.id, 'shared_destination_unroutable', 'warning', p_provider,
      v_sender.id, p_provider_event_id, p_from_number, p_to_number,
      pg_catalog.left(p_message_body, 5000), p_media_urls
    );
    update public.sms_webhook_receipts
       set processing_state = 'review',
           disposition = 'shared_destination_unroutable',
           processed_at = v_now
     where id = v_receipt.id;
    return query select 'review'::text, v_receipt.id, null::uuid,
                        v_sender.id, v_sender.purpose;
    return;
  end if;

  insert into public.sms_messages (
    account_id, phone_number, direction, body, provider_id, media_urls,
    provider, sender_number_id, read_at, created_at
  ) values (
    v_sender.account_id, p_from_number, 'inbound',
    coalesce(p_message_body, ''), p_provider_event_id,
    p_media_urls, p_provider, v_sender.id, null, v_now
  ) returning id into v_message_id;

  update public.sms_webhook_receipts
     set processing_state = 'processed', disposition = 'routed',
         sms_message_id = v_message_id, processed_at = v_now
   where id = v_receipt.id;
  return query select 'routed'::text, v_receipt.id, v_sender.account_id,
                      v_sender.id, v_sender.purpose;
end;
$$;

-- Invalid-but-authenticated payloads still belong in the durable inbox. This
-- is separate from signature failures: an authenticated carrier changing a
-- field name is an operator-visible integration problem, not hostile traffic.
create or replace function public.record_sms_webhook_review(
  p_provider text,
  p_webhook_kind text,
  p_provider_event_id text,
  p_receipt_key text,
  p_body_sha256 text,
  p_content_type text,
  p_request_url text,
  p_reason text,
  p_from_number text default null,
  p_to_number text default null,
  p_message_body text default null,
  p_provider_status text default null,
  p_provider_error_code text default null
)
returns table (
  review_disposition text,
  webhook_receipt_id uuid,
  duplicate boolean
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_receipt_id uuid;
  v_existing public.sms_webhook_receipts%rowtype;
begin
  if p_provider not in ('twilio', 'signalwire')
     or p_webhook_kind not in ('inbound', 'status')
     or p_reason not in (
       'unknown_destination', 'ambiguous_destination',
       'shared_destination_unroutable', 'unmatched_status',
       'unsupported_status', 'invalid_payload', 'restart_without_consent'
     )
     or p_provider_event_id is null
     or pg_catalog.length(p_provider_event_id) not between 1 and 255
     or p_receipt_key is null
     or pg_catalog.length(p_receipt_key) not between 1 and 700
     or p_body_sha256 is null
     or p_body_sha256 !~ '^[0-9a-f]{64}$'
     or pg_catalog.length(coalesce(p_message_body, '')) > 5000 then
    raise exception 'SMS webhook review arguments are invalid'
      using errcode = '22023';
  end if;

  insert into public.sms_webhook_receipts (
    provider, webhook_kind, receipt_key, provider_event_id, body_sha256,
    content_type, request_url, from_number, to_number, provider_status,
    provider_error_code, processing_state, disposition, processed_at
  ) values (
    p_provider, p_webhook_kind, p_receipt_key, p_provider_event_id,
    p_body_sha256, pg_catalog.left(p_content_type, 255),
    pg_catalog.left(p_request_url, 2000), p_from_number, p_to_number,
    pg_catalog.left(p_provider_status, 100),
    pg_catalog.left(p_provider_error_code, 255),
    'review', p_reason, v_now
  )
  on conflict (provider, webhook_kind, receipt_key) do nothing
  returning id into v_receipt_id;

  if v_receipt_id is null then
    select r.* into v_existing
      from public.sms_webhook_receipts r
     where r.provider = p_provider
       and r.webhook_kind = p_webhook_kind
       and r.receipt_key = p_receipt_key
     for update;
    if v_existing.provider_event_id is distinct from p_provider_event_id
       or v_existing.body_sha256 is distinct from p_body_sha256
       or v_existing.content_type is distinct from pg_catalog.left(p_content_type, 255)
       or v_existing.request_url is distinct from pg_catalog.left(p_request_url, 2000)
       or v_existing.from_number is distinct from p_from_number
       or v_existing.to_number is distinct from p_to_number
       or v_existing.provider_status is distinct from pg_catalog.left(p_provider_status, 100)
       or v_existing.provider_error_code is distinct from pg_catalog.left(p_provider_error_code, 255)
       or v_existing.disposition is distinct from p_reason then
      raise exception 'SMS review receipt key was replayed with different immutable evidence'
        using errcode = 'P5121';
    end if;
    return query select 'duplicate'::text, v_existing.id, true;
    return;
  end if;

  insert into public.sms_operator_review_items (
    webhook_receipt_id, reason, severity, provider, provider_event_id,
    from_number, to_number, message_body, provider_status,
    provider_error_code
  ) values (
    v_receipt_id, p_reason,
    case when p_reason in ('unknown_destination', 'ambiguous_destination')
      then 'critical' else 'warning' end,
    p_provider, p_provider_event_id, p_from_number, p_to_number,
    pg_catalog.left(p_message_body, 5000),
    pg_catalog.left(p_provider_status, 100),
    pg_catalog.left(p_provider_error_code, 255)
  );
  return query select 'review'::text, v_receipt_id, false;
end;
$$;

-- -------------------------------------------------------------------------
-- 4. Provider-scoped, monotonic status projection.
-- -------------------------------------------------------------------------

create or replace function public.apply_sms_delivery_status_webhook(
  p_provider text,
  p_provider_event_id text,
  p_provider_status text,
  p_provider_error_code text,
  p_receipt_key text,
  p_body_sha256 text,
  p_content_type text,
  p_request_url text
)
returns table (
  status_disposition text,
  webhook_receipt_id uuid,
  sms_event_id uuid,
  previous_status text,
  projected_status text
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
  v_event public.sms_events%rowtype;
  v_target text;
  v_disposition text;
  v_current_rank integer;
  v_target_rank integer;
  v_status text;
  v_error_code text;
  v_reconciling boolean := false;
begin
  if p_provider not in ('twilio', 'signalwire')
     or p_provider_event_id is null
     or pg_catalog.length(p_provider_event_id) not between 1 and 255
     or p_provider_status is null
     or pg_catalog.length(p_provider_status) not between 1 and 100
     or p_receipt_key is null
     or pg_catalog.length(p_receipt_key) not between 1 and 700
     or p_body_sha256 is null
     or p_body_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'SMS status webhook arguments are invalid'
      using errcode = '22023';
  end if;

  insert into public.sms_webhook_receipts (
    provider, webhook_kind, receipt_key, provider_event_id, body_sha256,
    content_type, request_url, provider_status, provider_error_code
  ) values (
    p_provider, 'status', p_receipt_key, p_provider_event_id,
    p_body_sha256, pg_catalog.left(p_content_type, 255),
    pg_catalog.left(p_request_url, 2000),
    pg_catalog.lower(p_provider_status),
    pg_catalog.left(p_provider_error_code, 255)
  )
  on conflict (provider, webhook_kind, receipt_key) do nothing
  returning * into v_receipt;

  if v_receipt.id is null then
    select r.* into v_existing
      from public.sms_webhook_receipts r
     where r.provider = p_provider
       and r.webhook_kind = 'status'
       and r.receipt_key = p_receipt_key
     for update;
    if v_existing.provider_event_id is distinct from p_provider_event_id
       or v_existing.body_sha256 is distinct from p_body_sha256
       or v_existing.content_type is distinct from pg_catalog.left(p_content_type, 255)
       or v_existing.request_url is distinct from pg_catalog.left(p_request_url, 2000)
       or v_existing.provider_status is distinct from pg_catalog.lower(p_provider_status)
       or v_existing.provider_error_code is distinct from pg_catalog.left(p_provider_error_code, 255) then
      raise exception 'SMS status receipt key was replayed with different immutable evidence'
        using errcode = 'P5122';
    end if;
    -- A status callback may beat complete_sms_delivery by milliseconds. Its
    -- first authenticated delivery is retained for review; a carrier retry or
    -- the narrow operator-resolution RPC may re-run only that exact stored
    -- receipt after provider identity becomes visible. Every other duplicate
    -- is inert.
    if v_existing.processing_state = 'review'
       and v_existing.disposition = 'unmatched_status'
       and v_existing.sms_event_id is null then
      v_receipt := v_existing;
      v_reconciling := true;
    else
      return query select 'duplicate'::text, v_existing.id,
                          v_existing.sms_event_id, null::text,
                          v_existing.provider_status;
      return;
    end if;
  end if;

  -- Reconciliation always projects the immutable stored receipt, never the
  -- bytes from a later duplicate request sharing its logical key.
  v_status := coalesce(v_receipt.provider_status, pg_catalog.lower(p_provider_status));
  v_error_code := v_receipt.provider_error_code;
  v_target := case v_status
    when 'queued' then 'queued'
    when 'accepted' then 'queued'
    when 'scheduled' then 'queued'
    when 'initiated' then 'sending'
    when 'sending' then 'sending'
    when 'sent' then 'sent'
    when 'delivered' then 'delivered'
    when 'failed' then 'failed'
    when 'undelivered' then 'failed'
    else null
  end;

  if v_target is null then
    insert into public.sms_operator_review_items (
      webhook_receipt_id, reason, severity, provider, provider_event_id,
      provider_status, provider_error_code
    ) values (
      v_receipt.id, 'unsupported_status', 'warning', p_provider,
      p_provider_event_id, pg_catalog.left(v_status, 100),
      pg_catalog.left(v_error_code, 255)
    ) on conflict do nothing;
    update public.sms_webhook_receipts
       set processing_state = 'review', disposition = 'unsupported_status',
           processed_at = v_now
     where id = v_receipt.id;
    return query select 'review'::text, v_receipt.id, null::uuid,
                        null::text, null::text;
    return;
  end if;

  select e.* into v_event
    from public.sms_events e
   where e.provider = p_provider
     and e.provider_id = p_provider_event_id
   for update;

  if v_event.id is null then
    insert into public.sms_operator_review_items (
      webhook_receipt_id, reason, severity, provider, provider_event_id,
      provider_status, provider_error_code
    ) values (
      v_receipt.id, 'unmatched_status', 'warning', p_provider,
      p_provider_event_id, pg_catalog.left(v_status, 100),
      pg_catalog.left(v_error_code, 255)
    ) on conflict do nothing;
    update public.sms_webhook_receipts
       set processing_state = 'review', disposition = 'unmatched_status',
           processed_at = v_now
     where id = v_receipt.id;
    return query select 'review'::text, v_receipt.id, null::uuid,
                        null::text, null::text;
    return;
  end if;

  update public.sms_webhook_receipts
     set sms_event_id = v_event.id,
         account_id = v_event.account_id,
         sender_number_id = v_event.sender_number_id
   where id = v_receipt.id;

  -- Delivery lifecycle ranks. Failure is a terminal branch, not a rank;
  -- indeterminate is uncertainty and can be resolved by any carrier fact.
  v_current_rank := case v_event.status
    when 'pending' then 0
    when 'queued' then 1
    when 'sending' then 2
    when 'sent' then 3
    when 'delivered' then 4
    else null
  end;
  v_target_rank := case v_target
    when 'queued' then 1
    when 'sending' then 2
    when 'sent' then 3
    when 'delivered' then 4
    else null
  end;

  if v_event.status in ('delivered', 'failed', 'opted_out', 'cancelled', 'suppressed') then
    v_disposition := 'ignored_terminal';
  elsif v_target = 'failed' then
    update public.sms_events e
       set status = 'failed',
           error_reason = coalesce(
             nullif(pg_catalog.left(v_error_code, 500), ''),
             v_status
           ),
           failed_at = v_now,
           indeterminate_at = null,
           updated_at = v_now
     where e.id = v_event.id;
    v_disposition := 'applied';
  elsif v_target in ('queued', 'sending')
        and (v_event.provider_id is not null
             or v_event.provider_accepted_at is not null
             or v_event.status = 'indeterminate') then
    -- Finding the event by provider ID is already acceptance evidence. A
    -- delayed queued/sending callback may be retained, but it can never reopen
    -- an accepted or uncertain delivery as retryable work.
    v_disposition := 'ignored_stale';
  elsif v_event.status <> 'indeterminate'
        and v_current_rank is not null
        and v_target_rank <= v_current_rank then
    v_disposition := 'ignored_stale';
  elsif v_target = 'delivered' then
    update public.sms_events e
       set status = 'delivered', delivered_at = v_now,
           provider_accepted_at = coalesce(e.provider_accepted_at, v_now),
           sent_at = coalesce(e.sent_at, v_now),
           error_reason = null, indeterminate_at = null, updated_at = v_now
     where e.id = v_event.id;
    v_disposition := 'applied';
  elsif v_target = 'sent' then
    update public.sms_events e
       set status = 'sent',
           provider_accepted_at = coalesce(e.provider_accepted_at, v_now),
           sent_at = coalesce(e.sent_at, v_now),
           error_reason = null, indeterminate_at = null, updated_at = v_now
     where e.id = v_event.id;
    v_disposition := 'applied';
  elsif v_target = 'sending' then
    update public.sms_events e
       set status = 'sending',
           send_started_at = coalesce(e.send_started_at, v_now),
           error_reason = null, updated_at = v_now
     where e.id = v_event.id;
    v_disposition := 'applied';
  elsif v_target = 'queued' then
    update public.sms_events e
       set status = 'queued',
           queued_at = coalesce(e.queued_at, v_now),
           error_reason = null, updated_at = v_now
     where e.id = v_event.id;
    v_disposition := 'applied';
  else
    v_disposition := 'ignored_stale';
  end if;

  -- The immutable attempt remains indeterminate as historical evidence, while
  -- the task becomes terminal when an authoritative later carrier fact resolves
  -- the uncertainty. Lower queued/sending callbacks above never touch it.
  if v_disposition = 'applied' and v_event.status = 'indeterminate' then
    if v_target in ('sent', 'delivered') then
      update public.sms_delivery_tasks t
         set task_state = 'completed', claim_token = null,
             lease_expires_at = null, last_error_code = null,
             completed_at = v_now, failed_at = null,
             indeterminate_at = null, cancelled_at = null,
             updated_at = v_now
       where t.sms_event_id = v_event.id
         and t.task_state = 'indeterminate';
    elsif v_target = 'failed' then
      update public.sms_delivery_tasks t
         set task_state = 'failed', claim_token = null,
             lease_expires_at = null,
             last_error_code = 'carrier_status_failed',
             completed_at = null, failed_at = v_now,
             indeterminate_at = null, cancelled_at = null,
             updated_at = v_now
       where t.sms_event_id = v_event.id
         and t.task_state = 'indeterminate';
    end if;
  end if;

  update public.sms_webhook_receipts
     set processing_state = case
           when v_disposition = 'applied' then 'processed' else 'ignored' end,
         disposition = v_disposition,
         processed_at = v_now
   where id = v_receipt.id;

  if v_reconciling then
    update public.sms_operator_review_items r
       set review_state = 'resolved',
           resolution_note = 'Automatically reconciled after outbound provider identity became available.',
           resolved_at = v_now
     where r.webhook_receipt_id = v_receipt.id
       and r.reason = 'unmatched_status'
       and r.review_state = 'open';
  end if;

  return query select v_disposition, v_receipt.id, v_event.id,
                      v_event.status,
                      case when v_disposition = 'applied' then v_target
                           else v_event.status end;
end;
$$;

-- -------------------------------------------------------------------------
-- 5. Service-only storage and RPCs.
-- -------------------------------------------------------------------------

create or replace function public.resolve_sms_operator_review_item(
  p_review_item_id uuid,
  p_resolution text,
  p_resolution_note text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_review public.sms_operator_review_items%rowtype;
  v_receipt public.sms_webhook_receipts%rowtype;
  v_reconcile_disposition text;
  v_reconcile_event_id uuid;
begin
  if p_review_item_id is null
     or p_resolution not in ('resolved', 'dismissed')
     or p_resolution_note is null
     or pg_catalog.length(pg_catalog.btrim(p_resolution_note)) not between 3 and 2000 then
    raise exception 'SMS operator review resolution is invalid'
      using errcode = '22023';
  end if;

  select r.* into v_review
    from public.sms_operator_review_items r
   where r.id = p_review_item_id
     and r.review_state = 'open';
  if v_review.id is null then
    return false;
  end if;

  -- Status reconciliation locks receipt then review in the same order as the
  -- callback RPC, avoiding a retry/operator deadlock.
  select w.* into v_receipt
    from public.sms_webhook_receipts w
   where w.id = v_review.webhook_receipt_id
   for update;
  select r.* into v_review
    from public.sms_operator_review_items r
   where r.id = p_review_item_id
     and r.review_state = 'open'
   for update;
  if v_review.id is null then
    return false;
  end if;

  -- Resolving an early status callback means reapplying its exact stored
  -- carrier fact. The item stays open if complete_sms_delivery has not exposed
  -- provider identity yet; operators cannot mark delivery evidence resolved by
  -- annotation alone.
  if p_resolution = 'resolved' and v_review.reason = 'unmatched_status' then
    select s.status_disposition, s.sms_event_id
      into v_reconcile_disposition, v_reconcile_event_id
      from public.apply_sms_delivery_status_webhook(
        v_receipt.provider,
        v_receipt.provider_event_id,
        v_receipt.provider_status,
        v_receipt.provider_error_code,
        v_receipt.receipt_key,
        v_receipt.body_sha256,
        v_receipt.content_type,
        v_receipt.request_url
      ) s;
    if v_reconcile_event_id is null
       or v_reconcile_disposition not in (
         'applied', 'ignored_stale', 'ignored_terminal'
       ) then
      return false;
    end if;
    -- apply_sms_delivery_status_webhook closes the open review row atomically.
    update public.sms_operator_review_items r
       set resolution_note = pg_catalog.btrim(p_resolution_note)
     where r.id = p_review_item_id
       and r.review_state = 'resolved';
    return true;
  end if;

  update public.sms_operator_review_items r
     set review_state = p_resolution,
         resolution_note = pg_catalog.btrim(p_resolution_note),
         resolved_at = pg_catalog.clock_timestamp()
   where r.id = p_review_item_id
     and r.review_state = 'open';
  return found;
end;
$$;

-- Manual identity recovery for the one state an automatic callback replay
-- cannot solve: the provider accepted the request, LGQ lost the response before
-- saving its message id, and a later authenticated status callback therefore
-- has no event binding. This function never queues, claims, or sends work. It
-- only binds immutable provider evidence to an already-indeterminate attempt.
create or replace function public.reconcile_sms_unmatched_status(
  p_review_item_id uuid,
  p_sms_event_id uuid,
  p_resolution_note text,
  p_resolution_actor text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_receipt_id uuid;
  v_review public.sms_operator_review_items%rowtype;
  v_receipt public.sms_webhook_receipts%rowtype;
  v_event public.sms_events%rowtype;
  v_task public.sms_delivery_tasks%rowtype;
  v_reconcile_disposition text;
  v_reconcile_event_id uuid;
begin
  if p_review_item_id is null
     or p_sms_event_id is null
     or p_resolution_note is null
     or pg_catalog.length(pg_catalog.btrim(p_resolution_note)) not between 3 and 2000
     or p_resolution_actor is null
     or pg_catalog.length(pg_catalog.btrim(p_resolution_actor)) not between 3 and 320 then
    raise exception 'SMS unmatched status reconciliation arguments are invalid'
      using errcode = '22023';
  end if;

  -- Discover only the receipt id before locking. The validated mutation locks
  -- receipt -> review -> event -> task in one order and holds no external work.
  select r.webhook_receipt_id into v_receipt_id
    from public.sms_operator_review_items r
   where r.id = p_review_item_id;
  if v_receipt_id is null then
    raise exception 'SMS unmatched status review does not exist'
      using errcode = '55000';
  end if;

  select w.* into v_receipt
    from public.sms_webhook_receipts w
   where w.id = v_receipt_id
   for update;
  select r.* into v_review
    from public.sms_operator_review_items r
   where r.id = p_review_item_id
   for update;
  select e.* into v_event
    from public.sms_events e
   where e.id = p_sms_event_id
   for update;
  select t.* into v_task
    from public.sms_delivery_tasks t
   where t.sms_event_id = p_sms_event_id
   for update;

  if v_review.id is null
     or v_receipt.id is null
     or v_event.id is null
     or v_task.sms_event_id is null then
    raise exception 'SMS unmatched status recovery target is incomplete'
      using errcode = '55000';
  end if;
  if v_review.review_state <> 'open'
     or v_review.reason <> 'unmatched_status'
     or v_review.webhook_receipt_id <> v_receipt.id
     or v_review.sms_event_id is not null
     or v_receipt.webhook_kind <> 'status'
     or v_receipt.processing_state <> 'review'
     or v_receipt.disposition <> 'unmatched_status'
     or v_receipt.sms_event_id is not null then
    raise exception 'SMS unmatched status review is not open and unbound'
      using errcode = '55000';
  end if;
  if v_review.provider <> v_receipt.provider
     or v_review.provider_event_id is distinct from v_receipt.provider_event_id
     or v_event.provider is distinct from v_receipt.provider then
    raise exception 'SMS unmatched status provider does not match the event'
      using errcode = '55000';
  end if;
  if v_event.provider_id is not null then
    raise exception 'SMS recovery event already has provider identity'
      using errcode = '55000';
  end if;
  if v_event.status <> 'indeterminate'
     or v_task.task_state <> 'indeterminate' then
    raise exception 'SMS recovery event and task must both be indeterminate'
      using errcode = '55000';
  end if;

  -- The unique (provider, provider_id) index rejects a carrier id already bound
  -- to any other event. That 23505 is deliberately not caught or normalized.
  update public.sms_events e
     set provider_id = v_receipt.provider_event_id,
         provider_accepted_at = coalesce(e.provider_accepted_at, v_now),
         updated_at = v_now
   where e.id = v_event.id
     and e.provider_id is null
     and e.status = 'indeterminate';
  if not found then
    raise exception 'SMS recovery event changed before provider binding'
      using errcode = '55000';
  end if;

  -- Re-run only the immutable stored callback through the existing monotonic
  -- projector. No caller-supplied status, error, URL, or body participates.
  select s.status_disposition, s.sms_event_id
    into v_reconcile_disposition, v_reconcile_event_id
    from public.apply_sms_delivery_status_webhook(
      v_receipt.provider,
      v_receipt.provider_event_id,
      v_receipt.provider_status,
      v_receipt.provider_error_code,
      v_receipt.receipt_key,
      v_receipt.body_sha256,
      v_receipt.content_type,
      v_receipt.request_url
    ) s;
  if v_reconcile_event_id is distinct from v_event.id
     or v_reconcile_disposition not in ('applied', 'ignored_stale') then
    raise exception 'SMS unmatched status receipt could not be projected'
      using errcode = '55000';
  end if;

  -- The projector atomically binds the receipt and closes the open review. Add
  -- the human's exact event choice, identity and reason to that durable row.
  update public.sms_operator_review_items r
     set account_id = v_event.account_id,
         sender_number_id = v_event.sender_number_id,
         sms_event_id = v_event.id,
         review_state = 'resolved',
         resolution_note = pg_catalog.btrim(p_resolution_note),
         resolution_actor = pg_catalog.btrim(p_resolution_actor),
         resolved_at = coalesce(r.resolved_at, v_now)
   where r.id = v_review.id
     and r.review_state = 'resolved';
  if not found then
    raise exception 'SMS unmatched status review did not close atomically'
      using errcode = '55000';
  end if;

  return true;
end;
$$;

alter table public.sms_webhook_receipts enable row level security;
alter table public.sms_webhook_receipts force row level security;
alter table public.sms_operator_review_items enable row level security;
alter table public.sms_operator_review_items force row level security;
alter table public.sms_sender_keyword_preferences enable row level security;
alter table public.sms_sender_keyword_preferences force row level security;

revoke all on table public.sms_webhook_receipts
  from public, anon, authenticated, service_role;
revoke all on table public.sms_operator_review_items
  from public, anon, authenticated, service_role;
revoke all on table public.sms_sender_keyword_preferences
  from public, anon, authenticated, service_role;

-- Staff/operator pages use createAdminClient for read-only visibility. Carrier
-- writes still go through the three RPCs below.
grant select on table public.sms_webhook_receipts to service_role;
grant select on table public.sms_operator_review_items to service_role;
grant select on table public.sms_sender_keyword_preferences to service_role;

revoke all on function public.prevent_sms_message_provider_spoofing()
  from public, anon, authenticated, service_role;

revoke all on function public.ingest_sms_inbound_webhook(
  text,text,text,text,text,text,text,text,text,text[],text
) from public, anon, authenticated, service_role;
revoke all on function public.record_sms_webhook_review(
  text,text,text,text,text,text,text,text,text,text,text,text,text
) from public, anon, authenticated, service_role;
revoke all on function public.apply_sms_delivery_status_webhook(
  text,text,text,text,text,text,text,text
) from public, anon, authenticated, service_role;
revoke all on function public.resolve_sms_operator_review_item(uuid,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.reconcile_sms_unmatched_status(uuid,uuid,text,text)
  from public, anon, authenticated, service_role;

grant execute on function public.ingest_sms_inbound_webhook(
  text,text,text,text,text,text,text,text,text,text[],text
) to service_role;
grant execute on function public.record_sms_webhook_review(
  text,text,text,text,text,text,text,text,text,text,text,text,text
) to service_role;
grant execute on function public.apply_sms_delivery_status_webhook(
  text,text,text,text,text,text,text,text
) to service_role;
grant execute on function public.resolve_sms_operator_review_item(uuid,text,text)
  to service_role;
grant execute on function public.reconcile_sms_unmatched_status(uuid,uuid,text,text)
  to service_role;

commit;
