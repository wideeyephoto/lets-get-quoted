
-- Durable customer-facing message intents.
create table public.customer_email_sends (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  kind text not null check (kind in ('appointment_reminder', 'selection_reminder', 'booking_confirmation', 'rebook_invite', 'review_request', 'campaign')),
  recipient text not null,
  payload jsonb not null,
  fallback_payload jsonb,
  provider_scope text not null,
  state text not null check (state in ('sending','retry_wait','accepted','manual_review','cancelled')),
  phase text not null default 'primary' check (phase in ('primary','fallback')),
  first_attempt_at timestamptz not null default now(),
  attempts integer not null default 1 check (attempts between 1 and 3),
  lease_token uuid,
  lease_until timestamptz,
  next_retry_at timestamptz,
  provider_id text unique,
  accepted_at timestamptz,
  last_error text,
  resolved_by text,
  resolution text,
  resolved_at timestamptz,
  idempotency_key text not null unique,
  unique(account_id, idempotency_key),
  check (state <> 'sending' or (lease_token is not null and lease_until is not null)),
  check (state <> 'accepted' or (provider_id is not null and accepted_at is not null))
);
alter table public.customer_email_sends enable row level security;
revoke all on public.customer_email_sends from public, anon, authenticated;
grant select, insert, update, delete on public.customer_email_sends to service_role;
create index customer_email_sends_attention_idx on public.customer_email_sends(state, first_attempt_at)
  where state in ('sending','retry_wait','manual_review');

create function public.claim_customer_email_send(p_account_id uuid, p_kind text, p_idempotency_key text, p_payload jsonb, p_provider_scope text, p_job_id uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as \$\$
declare
  v_row public.customer_email_sends;
  v_recipient text := lower(btrim(p_payload->>'to'));
  v_id uuid := gen_random_uuid();
  v_token uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
begin
  if p_payload is null or v_recipient is null or p_provider_scope is null then
    raise exception 'Missing required fields';
  end if;

  insert into public.customer_email_sends (id, account_id, job_id, kind, recipient, payload, provider_scope, state, lease_token, lease_until, idempotency_key)
  values (v_id, p_account_id, p_job_id, p_kind, v_recipient, p_payload, p_provider_scope, 'sending', v_token, v_now + interval '5 minutes', p_idempotency_key)
  on conflict (idempotency_key) do update set
    state = 'sending',
    phase = 'primary',
    attempts = public.customer_email_sends.attempts + 1,
    lease_token = v_token,
    lease_until = v_now + interval '5 minutes',
    last_error = null,
    next_retry_at = null
  where public.customer_email_sends.account_id = p_account_id
    and public.customer_email_sends.state = 'retry_wait'
    and (public.customer_email_sends.next_retry_at is null or public.customer_email_sends.next_retry_at <= v_now)
  returning * into v_row;

  if not found then
    select * into v_row from public.customer_email_sends where idempotency_key = p_idempotency_key and account_id = p_account_id;
    if not found then raise exception 'Unexpected write failure'; end if;
    if v_row.state = 'sending' and v_row.lease_until > v_now then
      return jsonb_build_object('action', 'busy');
    end if;
    if v_row.state = 'accepted' then
      return jsonb_build_object('action', 'already_sent', 'provider_id', v_row.provider_id);
    end if;
    if v_row.state in ('manual_review', 'cancelled') then
      return jsonb_build_object('action', 'review');
    end if;

    update public.customer_email_sends set
      state = 'sending',
      phase = 'primary',
      attempts = attempts + 1,
      lease_token = v_token,
      lease_until = v_now + interval '5 minutes',
      last_error = null,
      next_retry_at = null
    where id = v_row.id
    returning * into v_row;
  end if;

  return jsonb_build_object('action', 'send', 'id', v_row.id, 'token', v_row.lease_token, 'payload', v_row.payload, 'key', v_row.idempotency_key, 'phase', v_row.phase, 'retry_before', v_row.lease_until);
end \$\$;
revoke all on function public.claim_customer_email_send(uuid, text, text, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_customer_email_send(uuid, text, text, jsonb, text, uuid) to service_role;

create function public.fallback_customer_email_send(p_id uuid, p_account_id uuid, p_token uuid, p_error_name text default null, p_error_message text default null)
returns jsonb language plpgsql security invoker set search_path = '' as \$\$
declare
  v_row public.customer_email_sends;
  v_now timestamptz := clock_timestamp();
begin
  update public.customer_email_sends set
    phase = 'fallback',
    lease_until = v_now + interval '5 minutes'
  where id = p_id and account_id = p_account_id and lease_token = p_token and state = 'sending'
  returning * into v_row;
  if not found then return null; end if;
  return jsonb_build_object('action', 'send', 'id', v_row.id, 'token', v_row.lease_token, 'payload', coalesce(v_row.fallback_payload, v_row.payload), 'key', v_row.idempotency_key, 'phase', v_row.phase, 'retry_before', v_row.lease_until);
end \$\$;
revoke all on function public.fallback_customer_email_send(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.fallback_customer_email_send(uuid, uuid, uuid, text, text) to service_role;

create function public.finish_customer_email_send(p_id uuid, p_account_id uuid, p_token uuid, p_provider_id text, p_error text, p_source text default null, p_error_name text default null, p_retry_seconds integer default null, p_run_token text default null)
returns boolean language plpgsql security invoker set search_path = '' as \$\$
declare
  v_row public.customer_email_sends;
begin
  select * into v_row from public.customer_email_sends where id = p_id and account_id = p_account_id and lease_token = p_token and state = 'sending' for update;
  if not found then return false; end if;

  if p_error is null and p_provider_id is not null then
    update public.customer_email_sends set
      state = 'accepted', provider_id = p_provider_id, accepted_at = clock_timestamp(),
      lease_token = null, lease_until = null, next_retry_at = null
    where id = p_id;
  elsif v_row.attempts >= 3 then
    update public.customer_email_sends set
      state = 'manual_review', last_error = coalesce(p_error, 'Delivery failed'),
      lease_token = null, lease_until = null, next_retry_at = null
    where id = p_id;
  else
    update public.customer_email_sends set
      state = 'retry_wait', last_error = coalesce(p_error, 'Delivery failed'),
      lease_token = null, lease_until = null, next_retry_at = clock_timestamp() + (power(3, v_row.attempts) * interval '1 minute')
    where id = p_id;
  end if;
  return true;
end \$\$;
revoke all on function public.finish_customer_email_send(uuid, uuid, uuid, text, text, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.finish_customer_email_send(uuid, uuid, uuid, text, text, text, text, integer, text) to service_role;
notify pgrst, 'reload schema';
