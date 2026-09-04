-- Call-bound step-up authorization for privileged AI Voice staff mutations.
--
-- The application generates a six-digit code and sends only an HMAC digest to
-- these RPCs. Plaintext codes must never cross the database boundary. A
-- verified challenge authorizes only the exact admitted staff call, workspace,
-- and signed caller for at most thirty minutes.

begin;

create table if not exists public.voice_staff_step_up_challenges (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,
  admission_id uuid not null unique
    references public.voice_call_admissions(id) on delete restrict,
  provider text not null default 'signalwire' check (provider = 'signalwire'),
  provider_call_id text not null check (
    pg_catalog.length(pg_catalog.btrim(provider_call_id)) between 1 and 255
  ),
  caller_number text not null check (caller_number ~ '^\+1[2-9][0-9]{9}$'),
  caller_kind text not null check (caller_kind in ('owner', 'office', 'crew')),
  code_digits smallint not null default 6 check (code_digits = 6),
  code_hmac text not null check (code_hmac ~ '^[a-f0-9]{64}$'),
  code_key_id text not null check (
    code_key_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$'
  ),
  state text not null default 'provider_pending' check (
    state in ('provider_pending', 'pending', 'verified', 'invalidated', 'locked')
  ),
  send_count integer not null default 1 check (send_count between 1 and 3),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  last_sent_at timestamptz not null,
  code_expires_at timestamptz not null,
  provider_message_id text check (
    provider_message_id is null
    or (
      pg_catalog.length(provider_message_id) between 3 and 255
      and provider_message_id !~ '[[:cntrl:]]'
    )
  ),
  provider_accepted_at timestamptz,
  verified_at timestamptz,
  verified_until timestamptz,
  invalidated_at timestamptz,
  invalidation_reason text check (
    invalidation_reason is null
    or invalidation_reason ~ '^[a-z][a-z0-9_]{2,99}$'
  ),
  locked_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint voice_staff_step_up_code_window check (
    code_expires_at > last_sent_at
    and code_expires_at <= last_sent_at + interval '10 minutes'
  ),
  constraint voice_staff_step_up_verified_window check (
    (verified_at is null and verified_until is null)
    or (
      verified_at is not null
      and verified_until > verified_at
      and verified_until <= verified_at + interval '30 minutes'
    )
  ),
  constraint voice_staff_step_up_state_shape check (
    (state = 'provider_pending' and provider_message_id is null and provider_accepted_at is null
      and verified_at is null and verified_until is null
      and invalidated_at is null and invalidation_reason is null and locked_at is null)
    or (state = 'pending' and provider_message_id is not null and provider_accepted_at is not null
      and provider_accepted_at <= code_expires_at
      and verified_at is null and verified_until is null
      and invalidated_at is null and invalidation_reason is null and locked_at is null)
    or (state = 'verified' and provider_message_id is not null and provider_accepted_at is not null
      and provider_accepted_at <= code_expires_at
      and verified_at is not null and verified_until is not null
      and invalidated_at is null and invalidation_reason is null and locked_at is null)
    or (state = 'invalidated' and invalidated_at is not null
      and invalidation_reason is not null and locked_at is null)
    or (state = 'locked' and locked_at is not null)
  )
);

create unique index if not exists voice_staff_step_up_call_identity_uidx
  on public.voice_staff_step_up_challenges (
    account_id, provider, provider_call_id, caller_number
  );
create index if not exists voice_staff_step_up_account_idx
  on public.voice_staff_step_up_challenges (account_id, created_at desc);
create index if not exists voice_staff_step_up_status_idx
  on public.voice_staff_step_up_challenges (state, updated_at desc);

-- Append-only send attempts impose a rolling workspace+recipient budget that
-- cannot be reset by presenting a new provider CallSid/admission.
create table if not exists public.voice_staff_step_up_send_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,
  admission_id uuid not null
    references public.voice_call_admissions(id) on delete restrict,
  challenge_id uuid not null
    references public.voice_staff_step_up_challenges(id) on delete restrict,
  caller_number text not null check (caller_number ~ '^\+1[2-9][0-9]{9}$'),
  send_count integer not null check (send_count between 1 and 3),
  provider_message_id text check (
    provider_message_id is null
    or (
      pg_catalog.length(provider_message_id) between 3 and 255
      and provider_message_id !~ '[[:cntrl:]]'
    )
  ),
  provider_accepted_at timestamptz,
  sent_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  unique (challenge_id, send_count),
  constraint voice_staff_step_up_send_provider_shape check (
    (provider_message_id is null and provider_accepted_at is null)
    or (provider_message_id is not null and provider_accepted_at is not null
      and provider_accepted_at >= sent_at)
  )
);
create index if not exists voice_staff_step_up_send_budget_idx
  on public.voice_staff_step_up_send_events (account_id, caller_number, sent_at desc);
create index if not exists voice_staff_step_up_send_challenge_idx
  on public.voice_staff_step_up_send_events (challenge_id);
create index if not exists voice_staff_step_up_send_admission_idx
  on public.voice_staff_step_up_send_events (admission_id);
create unique index if not exists voice_staff_step_up_provider_message_uidx
  on public.voice_staff_step_up_send_events (provider_message_id)
  where provider_message_id is not null;

create or replace function public.prevent_voice_staff_step_up_send_event_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
begin
  if tg_op = 'DELETE'
     or old.account_id is distinct from new.account_id
     or old.admission_id is distinct from new.admission_id
     or old.challenge_id is distinct from new.challenge_id
     or old.caller_number is distinct from new.caller_number
     or old.send_count is distinct from new.send_count
     or old.sent_at is distinct from new.sent_at
     or old.created_at is distinct from new.created_at
     or old.provider_message_id is not null
     or new.provider_message_id is null
     or new.provider_accepted_at is null then
    raise exception 'Voice staff step-up send identity and provider acceptance are immutable'
      using errcode = '55000';
  end if;
  return new;
end
$fn$;

drop trigger if exists voice_staff_step_up_send_events_append_only
  on public.voice_staff_step_up_send_events;
create trigger voice_staff_step_up_send_events_append_only
before update or delete on public.voice_staff_step_up_send_events
for each row execute function public.prevent_voice_staff_step_up_send_event_mutation();

comment on column public.voice_staff_step_up_challenges.code_hmac is
  'Lowercase 64-hex HMAC digest generated outside Postgres; never a plaintext OTP or unsalted hash.';

comment on column public.voice_staff_step_up_challenges.code_digits is
  'The application must generate exactly six decimal digits before HMAC; plaintext is never sent to Postgres.';

-- -------------------------------------------------------------------------
-- Issue/resend. One challenge is permanently bound to one admission.
-- -------------------------------------------------------------------------

create or replace function public.issue_voice_staff_step_up_challenge(
  p_account_id uuid,
  p_provider_call_id text,
  p_caller_number text,
  p_code_hmac text,
  p_code_key_id text
)
returns table (
  challenge_id uuid,
  issue_status text,
  should_send boolean,
  send_count integer,
  code_expires_at timestamptz,
  retry_after_seconds integer,
  code_key_id text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_admission public.voice_call_admissions%rowtype;
  v_challenge public.voice_staff_step_up_challenges%rowtype;
  v_retry integer;
  v_budget_retry integer := 0;
  v_15_count integer := 0;
  v_24_count integer := 0;
  v_15_oldest timestamptz;
  v_24_oldest timestamptz;
  v_is_new boolean := false;
begin
  if p_account_id is null
     or p_provider_call_id is null
     or pg_catalog.length(pg_catalog.btrim(p_provider_call_id)) not between 1 and 255
     or p_caller_number is null
     or p_caller_number !~ '^\+1[2-9][0-9]{9}$'
     or p_code_hmac is null
     or p_code_hmac !~ '^[a-f0-9]{64}$'
     or p_code_key_id is null
     or p_code_key_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$' then
    raise exception 'Voice staff step-up issue input is invalid' using errcode = '22023';
  end if;

  -- Always acquire recipient then call locks in this order. The first lock
  -- serializes every spoofed/new CallSid that targets the same real phone.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_account_id::text || ':voice-step-up-recipient:' || p_caller_number,
      63190216
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_account_id::text || ':signalwire:' || p_provider_call_id,
      63190217
    )
  );

  select a.* into v_admission
    from public.voice_call_admissions a
   where a.account_id = p_account_id
     and a.provider = 'signalwire'
     and a.provider_call_id = p_provider_call_id
     and a.admission_state = 'admitted'
     and a.provider_terminal_at is null
     and a.caller_number = p_caller_number
     and a.caller_kind in ('owner', 'office', 'crew')
     and a.admitted_at >= v_now - interval '60 minutes'
     and not exists (
       select 1 from public.voice_events e
        where e.provider = a.provider
          and e.provider_call_id = a.provider_call_id
     )
   for share;
  if not found then
    return query select null::uuid, 'call_not_live'::text, false,
      0, null::timestamptz, 0, null::text;
    return;
  end if;

  select * into v_challenge
    from public.voice_staff_step_up_challenges c
   where c.admission_id = v_admission.id
   for update;

  v_is_new := not found;

  if not v_is_new and (
     v_challenge.account_id is distinct from p_account_id
     or v_challenge.provider is distinct from 'signalwire'
     or v_challenge.provider_call_id is distinct from p_provider_call_id
     or v_challenge.caller_number is distinct from p_caller_number
     or v_challenge.caller_kind is distinct from v_admission.caller_kind) then
    raise exception 'Voice staff step-up challenge identity is inconsistent'
      using errcode = '55000';
  end if;

  if not v_is_new and v_challenge.state = 'locked' then
    return query select v_challenge.id, 'locked'::text, false,
      v_challenge.send_count, v_challenge.code_expires_at, 0,
      v_challenge.code_key_id;
    return;
  end if;
  if not v_is_new and v_challenge.state = 'verified' and v_challenge.verified_until > v_now then
    return query select v_challenge.id, 'already_verified'::text, false,
      v_challenge.send_count, v_challenge.code_expires_at, 0,
      v_challenge.code_key_id;
    return;
  end if;

  if not v_is_new then
    v_retry := greatest(
      0,
      pg_catalog.ceil(extract(epoch from (
        v_challenge.last_sent_at + interval '60 seconds' - v_now
      )))::integer
    );
    if v_retry > 0 then
      return query select v_challenge.id, 'cooldown'::text, false,
        v_challenge.send_count, v_challenge.code_expires_at, v_retry,
        v_challenge.code_key_id;
      return;
    end if;
  end if;

  if not v_is_new and (v_challenge.send_count >= 3 or v_challenge.attempt_count >= 5) then
    update public.voice_staff_step_up_challenges
       set state = 'locked', locked_at = coalesce(locked_at, v_now),
           updated_at = v_now
     where id = v_challenge.id
     returning * into strict v_challenge;
    return query select v_challenge.id, 'locked'::text, false,
      v_challenge.send_count, v_challenge.code_expires_at, 0,
      v_challenge.code_key_id;
    return;
  end if;

  select
    pg_catalog.count(*) filter (where e.sent_at > v_now - interval '15 minutes')::integer,
    pg_catalog.count(*) filter (where e.sent_at > v_now - interval '24 hours')::integer,
    pg_catalog.min(e.sent_at) filter (where e.sent_at > v_now - interval '15 minutes'),
    pg_catalog.min(e.sent_at) filter (where e.sent_at > v_now - interval '24 hours')
    into v_15_count, v_24_count, v_15_oldest, v_24_oldest
    from public.voice_staff_step_up_send_events e
   where e.account_id = p_account_id
     and e.caller_number = p_caller_number
     and e.sent_at > v_now - interval '24 hours';
  if v_15_count >= 3 then
    v_budget_retry := greatest(v_budget_retry, pg_catalog.ceil(extract(epoch from (
      v_15_oldest + interval '15 minutes' - v_now
    )))::integer);
  end if;
  if v_24_count >= 10 then
    v_budget_retry := greatest(v_budget_retry, pg_catalog.ceil(extract(epoch from (
      v_24_oldest + interval '24 hours' - v_now
    )))::integer);
  end if;
  if v_budget_retry > 0 then
    return query select case when v_is_new then null::uuid else v_challenge.id end,
      'rate_limited'::text, false,
      case when v_is_new then 0 else v_challenge.send_count end,
      case when v_is_new then null::timestamptz else v_challenge.code_expires_at end,
      v_budget_retry,
      case when v_is_new then null::text else v_challenge.code_key_id end;
    return;
  end if;

  if v_is_new then
    insert into public.voice_staff_step_up_challenges (
      account_id, admission_id, provider, provider_call_id,
      caller_number, caller_kind, code_hmac, code_key_id,
      state, send_count, attempt_count, last_sent_at,
      code_expires_at, created_at, updated_at
    ) values (
      p_account_id, v_admission.id, 'signalwire', p_provider_call_id,
      p_caller_number, v_admission.caller_kind, p_code_hmac, p_code_key_id,
      'provider_pending', 1, 0, v_now, v_now + interval '10 minutes', v_now, v_now
    ) returning * into v_challenge;
  else
    update public.voice_staff_step_up_challenges c
       set code_hmac = p_code_hmac,
           code_key_id = p_code_key_id,
           state = 'provider_pending',
           send_count = c.send_count + 1,
           last_sent_at = v_now,
           code_expires_at = v_now + interval '10 minutes',
           provider_message_id = null,
           provider_accepted_at = null,
           verified_at = null,
           verified_until = null,
           invalidated_at = null,
           invalidation_reason = null,
           locked_at = null,
           updated_at = v_now
     where id = v_challenge.id
     returning * into strict v_challenge;
  end if;

  insert into public.voice_staff_step_up_send_events (
    account_id, admission_id, challenge_id, caller_number, send_count, sent_at, created_at
  ) values (
    p_account_id, v_admission.id, v_challenge.id, p_caller_number,
    v_challenge.send_count, v_now, v_now
  );

  if v_15_count + 1 >= 3 then
    v_budget_retry := greatest(v_budget_retry, pg_catalog.ceil(extract(epoch from (
      coalesce(v_15_oldest, v_now) + interval '15 minutes' - v_now
    )))::integer);
  end if;
  if v_24_count + 1 >= 10 then
    v_budget_retry := greatest(v_budget_retry, pg_catalog.ceil(extract(epoch from (
      coalesce(v_24_oldest, v_now) + interval '24 hours' - v_now
    )))::integer);
  end if;

  return query select v_challenge.id, 'provider_pending'::text, true,
    v_challenge.send_count, v_challenge.code_expires_at,
    greatest(60, v_budget_retry),
    v_challenge.code_key_id;
end
$fn$;

-- A code is unusable until the provider has definitively accepted its exact
-- send generation. The HMAC/key/generation tuple prevents an old provider
-- response from activating a replacement code after a resend.
create or replace function public.mark_voice_staff_step_up_provider_accepted(
  p_account_id uuid,
  p_provider_call_id text,
  p_caller_number text,
  p_challenge_id uuid,
  p_code_hmac text,
  p_code_key_id text,
  p_send_count integer,
  p_provider_message_id text
)
returns table (
  challenge_id uuid,
  delivery_status text,
  activated boolean,
  send_count integer,
  code_expires_at timestamptz,
  provider_message_id text,
  provider_accepted_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_admission public.voice_call_admissions%rowtype;
  v_challenge public.voice_staff_step_up_challenges%rowtype;
begin
  if p_account_id is null
     or p_provider_call_id is null
     or pg_catalog.length(pg_catalog.btrim(p_provider_call_id)) not between 1 and 255
     or p_caller_number is null
     or p_caller_number !~ '^\+1[2-9][0-9]{9}$'
     or p_challenge_id is null
     or p_code_hmac is null
     or p_code_hmac !~ '^[a-f0-9]{64}$'
     or p_code_key_id is null
     or p_code_key_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$'
     or p_send_count is null
     or p_send_count not between 1 and 3
     or p_provider_message_id is null
     or pg_catalog.length(p_provider_message_id) not between 3 and 255
     or p_provider_message_id ~ '[[:cntrl:]]' then
    raise exception 'Voice staff step-up provider acceptance input is invalid' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_account_id::text || ':signalwire:' || p_provider_call_id,
      63190217
    )
  );

  select a.* into v_admission
    from public.voice_call_admissions a
   where a.account_id = p_account_id
     and a.provider = 'signalwire'
     and a.provider_call_id = p_provider_call_id
     and a.admission_state = 'admitted'
     and a.provider_terminal_at is null
     and a.caller_number = p_caller_number
     and a.caller_kind in ('owner', 'office', 'crew')
     and a.admitted_at >= v_now - interval '60 minutes'
     and not exists (
       select 1 from public.voice_events e
        where e.provider = a.provider
          and e.provider_call_id = a.provider_call_id
     )
   for share;

  select c.* into v_challenge
    from public.voice_staff_step_up_challenges c
   where c.account_id = p_account_id
     and c.provider = 'signalwire'
     and c.provider_call_id = p_provider_call_id
     and c.caller_number = p_caller_number
   for update;
  if not found then
    return query select null::uuid, 'not_found'::text, false,
      0, null::timestamptz, null::text, null::timestamptz;
    return;
  end if;

  if v_challenge.id is distinct from p_challenge_id
     or v_challenge.code_hmac is distinct from p_code_hmac
     or v_challenge.code_key_id is distinct from p_code_key_id
     or v_challenge.send_count is distinct from p_send_count then
    return query select v_challenge.id, 'stale_ack'::text, false,
      v_challenge.send_count, v_challenge.code_expires_at,
      v_challenge.provider_message_id, v_challenge.provider_accepted_at;
    return;
  end if;

  if v_admission.id is null or v_challenge.admission_id is distinct from v_admission.id then
    if v_challenge.state <> 'locked' then
      update public.voice_staff_step_up_challenges
         set state = 'invalidated', invalidated_at = v_now,
             invalidation_reason = 'call_not_live',
             verified_at = null, verified_until = null, updated_at = v_now
       where id = v_challenge.id
       returning * into strict v_challenge;
    end if;
    return query select v_challenge.id, 'call_not_live'::text, false,
      v_challenge.send_count, v_challenge.code_expires_at,
      v_challenge.provider_message_id, v_challenge.provider_accepted_at;
    return;
  end if;

  if v_challenge.state in ('pending', 'verified') then
    if v_challenge.provider_message_id is distinct from p_provider_message_id then
      return query select v_challenge.id, 'stale_ack'::text, false,
        v_challenge.send_count, v_challenge.code_expires_at,
        v_challenge.provider_message_id, v_challenge.provider_accepted_at;
      return;
    end if;
    return query select v_challenge.id, 'already_provider_accepted'::text, true,
      v_challenge.send_count, v_challenge.code_expires_at,
      v_challenge.provider_message_id, v_challenge.provider_accepted_at;
    return;
  end if;
  if v_challenge.state <> 'provider_pending' then
    return query select v_challenge.id, 'inactive'::text, false,
      v_challenge.send_count, v_challenge.code_expires_at,
      v_challenge.provider_message_id, v_challenge.provider_accepted_at;
    return;
  end if;
  if v_challenge.code_expires_at <= v_now then
    update public.voice_staff_step_up_challenges
       set state = 'invalidated', invalidated_at = v_now,
           invalidation_reason = 'delivery_ack_expired', updated_at = v_now
     where id = v_challenge.id
     returning * into strict v_challenge;
    return query select v_challenge.id, 'expired'::text, false,
      v_challenge.send_count, v_challenge.code_expires_at,
      v_challenge.provider_message_id, v_challenge.provider_accepted_at;
    return;
  end if;

  update public.voice_staff_step_up_challenges
     set state = 'pending', provider_message_id = p_provider_message_id,
         provider_accepted_at = v_now, updated_at = v_now
   where id = v_challenge.id
   returning * into strict v_challenge;
  update public.voice_staff_step_up_send_events e
     set provider_message_id = p_provider_message_id, provider_accepted_at = v_now
   where e.challenge_id = v_challenge.id
     and e.send_count = v_challenge.send_count
     and e.provider_message_id is null;
  if not found then
    raise exception 'Voice staff step-up send generation evidence is unavailable'
      using errcode = '55000';
  end if;
  return query select v_challenge.id, 'provider_accepted'::text, true,
    v_challenge.send_count, v_challenge.code_expires_at,
    v_challenge.provider_message_id, v_challenge.provider_accepted_at;
end
$fn$;

-- -------------------------------------------------------------------------
-- Verify, invalidate, and inspect without ever accepting a plaintext code.
-- -------------------------------------------------------------------------

create or replace function public.verify_voice_staff_step_up_challenge(
  p_account_id uuid,
  p_provider_call_id text,
  p_caller_number text,
  p_code_hmac text,
  p_code_key_id text
)
returns table (
  challenge_id uuid,
  verification_status text,
  attempt_count integer,
  attempts_remaining integer,
  verified_until timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_admission public.voice_call_admissions%rowtype;
  v_challenge public.voice_staff_step_up_challenges%rowtype;
begin
  if p_account_id is null
     or p_provider_call_id is null
     or pg_catalog.length(pg_catalog.btrim(p_provider_call_id)) not between 1 and 255
     or p_caller_number is null
     or p_caller_number !~ '^\+1[2-9][0-9]{9}$'
     or p_code_hmac is null
     or p_code_hmac !~ '^[a-f0-9]{64}$'
     or p_code_key_id is null
     or p_code_key_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$' then
    raise exception 'Voice staff step-up verification input is invalid' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_account_id::text || ':signalwire:' || p_provider_call_id,
      63190217
    )
  );

  select a.* into v_admission
    from public.voice_call_admissions a
   where a.account_id = p_account_id
     and a.provider = 'signalwire'
     and a.provider_call_id = p_provider_call_id
     and a.admission_state = 'admitted'
     and a.provider_terminal_at is null
     and a.caller_number = p_caller_number
     and a.caller_kind in ('owner', 'office', 'crew')
     and a.admitted_at >= v_now - interval '60 minutes'
     and not exists (
       select 1 from public.voice_events e
        where e.provider = a.provider
          and e.provider_call_id = a.provider_call_id
     )
   for share;

  select * into v_challenge
    from public.voice_staff_step_up_challenges c
   where c.account_id = p_account_id
     and c.provider = 'signalwire'
     and c.provider_call_id = p_provider_call_id
     and c.caller_number = p_caller_number
   for update;
  if not found then
    return query select null::uuid, 'not_found'::text, 0, 5, null::timestamptz;
    return;
  end if;

  if v_admission.id is null or v_challenge.admission_id is distinct from v_admission.id then
    if v_challenge.state <> 'locked' then
      update public.voice_staff_step_up_challenges
         set state = 'invalidated', invalidated_at = v_now,
             invalidation_reason = 'call_not_live',
             verified_at = null, verified_until = null, updated_at = v_now
       where id = v_challenge.id
       returning * into strict v_challenge;
    end if;
    return query select v_challenge.id, 'call_not_live'::text,
      v_challenge.attempt_count, 5 - v_challenge.attempt_count, null::timestamptz;
    return;
  end if;

  if v_challenge.state = 'locked' then
    return query select v_challenge.id, 'locked'::text,
      v_challenge.attempt_count, 0, null::timestamptz;
    return;
  end if;
  if v_challenge.state = 'verified' and v_challenge.verified_until > v_now then
    return query select v_challenge.id, 'already_verified'::text,
      v_challenge.attempt_count, 5 - v_challenge.attempt_count,
      v_challenge.verified_until;
    return;
  end if;
  if v_challenge.state = 'provider_pending' then
    return query select v_challenge.id,
      case when v_challenge.code_expires_at <= v_now then 'expired' else 'not_provider_accepted' end,
      v_challenge.attempt_count, 5 - v_challenge.attempt_count, null::timestamptz;
    return;
  end if;
  if v_challenge.state = 'invalidated' then
    return query select v_challenge.id, 'invalidated'::text,
      v_challenge.attempt_count, 5 - v_challenge.attempt_count, null::timestamptz;
    return;
  end if;
  if v_challenge.code_expires_at <= v_now then
    return query select v_challenge.id, 'expired'::text,
      v_challenge.attempt_count, 5 - v_challenge.attempt_count, null::timestamptz;
    return;
  end if;

  if v_challenge.code_key_id is distinct from p_code_key_id
     or v_challenge.code_hmac is distinct from p_code_hmac then
    update public.voice_staff_step_up_challenges c
       set attempt_count = c.attempt_count + 1,
           state = case when c.attempt_count + 1 >= 5 then 'locked' else c.state end,
           locked_at = case when c.attempt_count + 1 >= 5 then v_now else c.locked_at end,
           updated_at = v_now
     where id = v_challenge.id
     returning * into strict v_challenge;
    return query select v_challenge.id,
      case when v_challenge.state = 'locked' then 'locked' else 'invalid' end,
      v_challenge.attempt_count,
      greatest(0, 5 - v_challenge.attempt_count),
      null::timestamptz;
    return;
  end if;

  update public.voice_staff_step_up_challenges
     set state = 'verified', verified_at = v_now,
         verified_until = v_now + interval '30 minutes',
         invalidated_at = null, invalidation_reason = null,
         locked_at = null, updated_at = v_now
   where id = v_challenge.id
   returning * into strict v_challenge;
  return query select v_challenge.id, 'verified'::text,
    v_challenge.attempt_count, 5 - v_challenge.attempt_count,
    v_challenge.verified_until;
end
$fn$;

create or replace function public.invalidate_voice_staff_step_up_challenge(
  p_account_id uuid,
  p_provider_call_id text,
  p_caller_number text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_account_id is null
     or p_provider_call_id is null
     or pg_catalog.length(pg_catalog.btrim(p_provider_call_id)) not between 1 and 255
     or p_caller_number is null
     or p_caller_number !~ '^\+1[2-9][0-9]{9}$'
     or p_reason is null
     or p_reason !~ '^[a-z][a-z0-9_]{2,99}$' then
    raise exception 'Voice staff step-up invalidation input is invalid' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_account_id::text || ':signalwire:' || p_provider_call_id,
      63190217
    )
  );
  update public.voice_staff_step_up_challenges
     set state = case when state = 'locked' then state else 'invalidated' end,
         invalidated_at = case when state = 'locked' then invalidated_at else v_now end,
         invalidation_reason = case when state = 'locked' then invalidation_reason else p_reason end,
         verified_at = case when state = 'locked' then verified_at else null end,
         verified_until = case when state = 'locked' then verified_until else null end,
         updated_at = v_now
   where account_id = p_account_id
     and provider = 'signalwire'
     and provider_call_id = p_provider_call_id
     and caller_number = p_caller_number;
  return found;
end
$fn$;

create or replace function public.get_voice_staff_step_up_status(
  p_account_id uuid,
  p_provider_call_id text,
  p_caller_number text
)
returns table (
  challenge_id uuid,
  status text,
  send_count integer,
  attempt_count integer,
  attempts_remaining integer,
  code_expires_at timestamptz,
  verified_until timestamptz,
  retry_after_seconds integer,
  code_key_id text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_challenge public.voice_staff_step_up_challenges%rowtype;
  v_live boolean := false;
  v_status text;
  v_retry integer := 0;
begin
  if p_account_id is null
     or p_provider_call_id is null
     or pg_catalog.length(pg_catalog.btrim(p_provider_call_id)) not between 1 and 255
     or p_caller_number is null
     or p_caller_number !~ '^\+1[2-9][0-9]{9}$' then
    raise exception 'Voice staff step-up status input is invalid' using errcode = '22023';
  end if;
  select * into v_challenge
    from public.voice_staff_step_up_challenges c
   where c.account_id = p_account_id
     and c.provider = 'signalwire'
     and c.provider_call_id = p_provider_call_id
     and c.caller_number = p_caller_number;
  if not found then
    return query select null::uuid, 'not_found'::text, 0, 0, 5,
      null::timestamptz, null::timestamptz, 0, null::text;
    return;
  end if;

  select exists (
    select 1 from public.voice_call_admissions a
     where a.id = v_challenge.admission_id
       and a.account_id = p_account_id
       and a.provider = 'signalwire'
       and a.provider_call_id = p_provider_call_id
       and a.admission_state = 'admitted'
       and a.provider_terminal_at is null
       and a.caller_number = p_caller_number
       and a.caller_kind = v_challenge.caller_kind
       and a.caller_kind in ('owner', 'office', 'crew')
       and a.admitted_at >= v_now - interval '60 minutes'
       and not exists (
         select 1 from public.voice_events e
          where e.provider = a.provider
            and e.provider_call_id = a.provider_call_id
       )
  ) into v_live;

  v_retry := greatest(
    0,
    pg_catalog.ceil(extract(epoch from (
      v_challenge.last_sent_at + interval '60 seconds' - v_now
    )))::integer
  );
  v_status := case
    when not v_live then 'call_not_live'
    when v_challenge.state = 'locked' then 'locked'
    when v_challenge.state = 'verified' and v_challenge.verified_until > v_now then 'verified'
    when v_challenge.state = 'invalidated' then 'invalidated'
    when v_challenge.code_expires_at <= v_now then 'expired'
    when v_challenge.state = 'provider_pending' then 'provider_pending'
    else 'pending'
  end;

  return query select v_challenge.id, v_status,
    v_challenge.send_count, v_challenge.attempt_count,
    greatest(0, 5 - v_challenge.attempt_count),
    v_challenge.code_expires_at,
    case when v_status = 'verified' then v_challenge.verified_until else null end,
    case when v_status in ('provider_pending', 'pending') then v_retry else 0 end,
    v_challenge.code_key_id;
end
$fn$;

-- Number-level provider status is a liveness signal, not a billing receipt.
-- Terminal callbacks close the exact admission and its authorization under the
-- same call lock; nonterminal callbacks are acknowledged without mutation.
create or replace function public.close_voice_staff_step_up_from_provider_status(
  p_provider_call_id text,
  p_call_status text
)
returns table (
  close_status text,
  account_id uuid,
  admission_id uuid,
  challenge_invalidated boolean,
  provider_terminal_status text,
  provider_terminal_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_account_id uuid;
  v_admission public.voice_call_admissions%rowtype;
  v_tombstone public.voice_provider_terminal_call_tombstones%rowtype;
  v_affected integer := 0;
  v_terminal boolean;
begin
  if p_provider_call_id is null
     or pg_catalog.length(pg_catalog.btrim(p_provider_call_id)) not between 1 and 255
     or p_call_status is null
     or p_call_status is distinct from pg_catalog.lower(pg_catalog.btrim(p_call_status))
     or p_call_status !~ '^[a-z][a-z0-9-]{1,31}$' then
    raise exception 'Voice provider terminal status input is invalid' using errcode = '22023';
  end if;

  v_terminal := p_call_status in ('completed', 'busy', 'failed', 'no-answer', 'canceled');
  if not v_terminal then
    return query select 'nonterminal'::text, null::uuid, null::uuid, false,
      null::text, null::timestamptz;
    return;
  end if;

  -- This provider+CallSid lock is also acquired by admission before it checks
  -- the tombstone. Whichever transaction wins makes the race deterministic.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('signalwire:' || p_provider_call_id, 63190215)
  );
  delete from public.voice_provider_terminal_call_tombstones t
   where t.provider = 'signalwire'
     and t.provider_call_id = p_provider_call_id
     and t.expires_at <= v_now;
  insert into public.voice_provider_terminal_call_tombstones (
    provider, provider_call_id, terminal_status, terminal_at, expires_at, created_at
  ) values (
    'signalwire', p_provider_call_id, p_call_status, v_now,
    v_now + interval '7 days', v_now
  ) on conflict (provider, provider_call_id) do nothing;
  select t.* into strict v_tombstone
    from public.voice_provider_terminal_call_tombstones t
   where t.provider = 'signalwire'
     and t.provider_call_id = p_provider_call_id;

  select a.account_id into v_account_id
    from public.voice_call_admissions a
   where a.provider = 'signalwire'
     and a.provider_call_id = p_provider_call_id;
  if not found then
    return query select 'tombstoned'::text, null::uuid, null::uuid, false,
      v_tombstone.terminal_status, v_tombstone.terminal_at;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_account_id::text || ':signalwire:' || p_provider_call_id,
      63190217
    )
  );
  select a.* into v_admission
    from public.voice_call_admissions a
   where a.account_id = v_account_id
     and a.provider = 'signalwire'
     and a.provider_call_id = p_provider_call_id
   for update;
  if not found then
    return query select 'tombstoned'::text, null::uuid, null::uuid, false,
      v_tombstone.terminal_status, v_tombstone.terminal_at;
    return;
  end if;

  if v_admission.provider_terminal_at is null then
    update public.voice_call_admissions a
       set provider_terminal_status = v_tombstone.terminal_status,
           provider_terminal_at = v_tombstone.terminal_at
     where a.id = v_admission.id
     returning a.* into strict v_admission;
    close_status := 'closed';
  else
    close_status := 'already_closed';
  end if;

  update public.voice_staff_step_up_challenges c
     set state = 'invalidated', invalidated_at = v_now,
         invalidation_reason = 'provider_terminal',
         verified_at = null, verified_until = null, updated_at = v_now
   where c.admission_id = v_admission.id
     and c.state <> 'locked';
  get diagnostics v_affected = row_count;

  return query select close_status, v_admission.account_id, v_admission.id,
    v_affected > 0, v_admission.provider_terminal_status,
    v_admission.provider_terminal_at;
end
$fn$;

-- A terminal post-conversation event invalidates pending or verified step-up
-- state. The row update also serializes with the contractor-action wrapper.
create or replace function public.invalidate_voice_staff_step_up_on_call_end()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_account_id uuid;
begin
  select a.account_id into v_account_id
    from public.voice_call_admissions a
   where a.provider = new.provider
     and a.provider_call_id = new.provider_call_id;
  if found then
    -- Use the same transaction lock as issue, verify, and mutation. If a call
    -- end and a privileged action race, exactly one linearizes first.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        v_account_id::text || ':signalwire:' || new.provider_call_id,
        63190217
      )
    );
  end if;
  update public.voice_staff_step_up_challenges
     set state = case when state = 'locked' then state else 'invalidated' end,
         invalidated_at = case when state = 'locked' then invalidated_at else v_now end,
         invalidation_reason = case when state = 'locked' then invalidation_reason else 'call_ended' end,
         verified_at = case when state = 'locked' then verified_at else null end,
         verified_until = case when state = 'locked' then verified_until else null end,
         updated_at = v_now
   where provider = new.provider
     and provider_call_id = new.provider_call_id;
  return new;
end
$fn$;

drop trigger if exists voice_events_invalidate_staff_step_up
  on public.voice_events;
create trigger voice_events_invalidate_staff_step_up
after insert on public.voice_events
for each row execute function public.invalidate_voice_staff_step_up_on_call_end();

-- -------------------------------------------------------------------------
-- Wrap the existing privileged mutation function. The deployed implementation
-- is retained under an internal name with every role grant removed.
-- -------------------------------------------------------------------------

do $rename$
begin
  if pg_catalog.to_regprocedure(
       'public.apply_voice_contractor_action_after_step_up(uuid,text,text,text,uuid,uuid,jsonb)'
     ) is null then
    if pg_catalog.to_regprocedure(
         'public.apply_voice_contractor_action(uuid,text,text,text,uuid,uuid,jsonb)'
       ) is null then
      raise exception 'Required voice contractor action function is missing';
    end if;
    execute 'alter function public.apply_voice_contractor_action(uuid,text,text,text,uuid,uuid,jsonb) rename to apply_voice_contractor_action_after_step_up';
  end if;
end
$rename$;

revoke all on function public.apply_voice_contractor_action_after_step_up(
  uuid,text,text,text,uuid,uuid,jsonb
) from public, anon, authenticated, service_role;

create or replace function public.apply_voice_contractor_action(
  p_account_id uuid,
  p_provider_call_id text,
  p_caller_number text,
  p_function_name text,
  p_target_job_id uuid,
  p_target_lead_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $fn$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_admission public.voice_call_admissions%rowtype;
  v_challenge public.voice_staff_step_up_challenges%rowtype;
begin
  if p_account_id is null
     or p_provider_call_id is null
     or pg_catalog.length(pg_catalog.btrim(p_provider_call_id)) not between 1 and 255
     or p_caller_number is null
     or p_caller_number !~ '^\+1[2-9][0-9]{9}$' then
    raise exception 'Voice privileged action call identity is invalid'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_account_id::text || ':signalwire:' || p_provider_call_id,
      63190217
    )
  );

  select a.* into v_admission
    from public.voice_call_admissions a
   where a.account_id = p_account_id
     and a.provider = 'signalwire'
     and a.provider_call_id = p_provider_call_id
     and a.admission_state = 'admitted'
     and a.provider_terminal_at is null
     and a.caller_number = p_caller_number
     and a.caller_kind in ('owner', 'office', 'crew')
     and a.admitted_at >= v_now - interval '60 minutes'
     and not exists (
       select 1 from public.voice_events e
        where e.provider = a.provider
          and e.provider_call_id = a.provider_call_id
     )
   for share;
  if not found then
    raise exception 'voice privileged action requires the same live admitted staff call'
      using errcode = '42501';
  end if;

  select c.* into v_challenge
    from public.voice_staff_step_up_challenges c
   where c.admission_id = v_admission.id
     and c.account_id = p_account_id
     and c.provider = 'signalwire'
     and c.provider_call_id = p_provider_call_id
     and c.caller_number = p_caller_number
     and c.caller_kind = v_admission.caller_kind
     and c.state = 'verified'
     and c.verified_at is not null
     and c.verified_until > v_now
     and c.verified_until <= c.verified_at + interval '30 minutes'
   for share;
  if not found then
    raise exception 'voice privileged action requires a verified step-up challenge'
      using errcode = '42501';
  end if;

  return public.apply_voice_contractor_action_after_step_up(
    p_account_id,
    p_provider_call_id,
    p_caller_number,
    p_function_name,
    p_target_job_id,
    p_target_lead_id,
    p_payload
  );
end
$fn$;

-- -------------------------------------------------------------------------
-- RPC-only/service-role-only authorization surface.
-- -------------------------------------------------------------------------

alter table public.voice_staff_step_up_challenges enable row level security;
alter table public.voice_staff_step_up_challenges force row level security;
alter table public.voice_staff_step_up_send_events enable row level security;
alter table public.voice_staff_step_up_send_events force row level security;
revoke all on table public.voice_staff_step_up_challenges
  from public, anon, authenticated, service_role;
revoke all on table public.voice_staff_step_up_send_events
  from public, anon, authenticated, service_role;

revoke all on function public.issue_voice_staff_step_up_challenge(uuid,text,text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.verify_voice_staff_step_up_challenge(uuid,text,text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.mark_voice_staff_step_up_provider_accepted(uuid,text,text,uuid,text,text,integer,text)
  from public, anon, authenticated, service_role;
revoke all on function public.invalidate_voice_staff_step_up_challenge(uuid,text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_voice_staff_step_up_status(uuid,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.close_voice_staff_step_up_from_provider_status(text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.invalidate_voice_staff_step_up_on_call_end()
  from public, anon, authenticated, service_role;
revoke all on function public.prevent_voice_staff_step_up_send_event_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.apply_voice_contractor_action(uuid,text,text,text,uuid,uuid,jsonb)
  from public, anon, authenticated, service_role;

grant execute on function public.issue_voice_staff_step_up_challenge(uuid,text,text,text,text)
  to service_role;
grant execute on function public.verify_voice_staff_step_up_challenge(uuid,text,text,text,text)
  to service_role;
grant execute on function public.mark_voice_staff_step_up_provider_accepted(uuid,text,text,uuid,text,text,integer,text)
  to service_role;
grant execute on function public.invalidate_voice_staff_step_up_challenge(uuid,text,text,text)
  to service_role;
grant execute on function public.get_voice_staff_step_up_status(uuid,text,text)
  to service_role;
grant execute on function public.close_voice_staff_step_up_from_provider_status(text,text)
  to service_role;
grant execute on function public.apply_voice_contractor_action(uuid,text,text,text,uuid,uuid,jsonb)
  to service_role;

do $assert$
declare
  v_bad text;
begin
  select pg_catalog.string_agg(
           grantee || ':' || privilege_type,
           ', ' order by grantee, privilege_type
         )
    into v_bad
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('voice_staff_step_up_challenges', 'voice_staff_step_up_send_events')
     and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role');
  if v_bad is not null then
    raise exception 'Voice staff step-up direct table grants remain: %', v_bad;
  end if;

  if pg_catalog.has_function_privilege(
       'service_role',
       'public.apply_voice_contractor_action_after_step_up(uuid,text,text,text,uuid,uuid,jsonb)',
       'EXECUTE'
     ) then
    raise exception 'Unchecked voice contractor action remains executable by service_role';
  end if;
end
$assert$;

commit;
