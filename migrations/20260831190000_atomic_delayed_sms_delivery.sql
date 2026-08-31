-- -------------------------------------------------------------------------
-- Atomic Delayed SMS Delivery Support
-- Allows producers to pass p_available_at timestamptz default null to
-- enqueue_sms_delivery, ensuring delayed messages (e.g. TCPA quiet hours)
-- are inserted directly with their future available_at timestamp in a single
-- atomic database operation.
-- -------------------------------------------------------------------------

create or replace function public.enqueue_sms_delivery(
  p_account_id uuid,
  p_phone_number text,
  p_body text,
  p_message_kind text,
  p_billing_category text,
  p_sender_purpose text,
  p_context text,
  p_event_type text,
  p_idempotency_key text,
  p_payment_id uuid default null,
  p_crew_id uuid default null,
  p_sender_number_id uuid default null,
  p_available_at timestamptz default null
)
returns table (
  sms_event_id uuid,
  task_state text,
  created boolean
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone to 'UTC'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_event public.sms_events%rowtype;
  v_inserted boolean := false;
  v_available_at timestamptz := coalesce(p_available_at, v_now);
begin
  if p_account_id is null then
    raise exception 'SMS delivery requires an account'
      using errcode = '22023';
  end if;
  if p_phone_number is null or p_phone_number !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'SMS destination must be E.164'
      using errcode = '22023';
  end if;
  if p_body is null or pg_catalog.length(p_body) not between 1 and 5000 then
    raise exception 'SMS body length is invalid'
      using errcode = '22023';
  end if;
  if p_message_kind is null or p_message_kind !~ '^[a-z][a-z0-9_-]{2,99}$' then
    raise exception 'SMS message kind is invalid'
      using errcode = '22023';
  end if;
  if p_billing_category is null or p_billing_category not in (
    'customer_message', 'crew_message', 'owner_alert',
    'payment_message', 'verification'
  ) then
    raise exception 'SMS billing category is invalid'
      using errcode = '22023';
  end if;
  if p_sender_purpose is null or p_sender_purpose not in (
    'lgq_shared', 'lgq_dispatch', 'contractor_dedicated'
  ) then
    raise exception 'SMS sender purpose is invalid'
      using errcode = '22023';
  end if;
  if p_context is null or p_context !~ '^[a-z][a-z0-9_]{2,63}$'
     or p_event_type is null or p_event_type !~ '^[a-z][a-z0-9_]{2,99}$' then
    raise exception 'SMS context or event type is invalid'
      using errcode = '22023';
  end if;
  if p_idempotency_key is null
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9:._/-]{2,199}$' then
    raise exception 'SMS idempotency key is invalid'
      using errcode = '22023';
  end if;
  if p_context = 'payment' and p_payment_id is null
     or p_context in ('crew', 'subcontractor') and p_crew_id is null
     or p_context not in (
       'payment', 'crew', 'subcontractor', 'owner',
       'customer', 'automation', 'platform'
     ) then
    raise exception 'SMS context target is invalid'
      using errcode = '22023';
  end if;

  insert into public.sms_events (
    account_id, payment_id, event_type, phone_number, status, body,
    context, crew_id, provider, sender_number_id, idempotency_key,
    message_kind, billing_category, sender_purpose, queued_at, updated_at
  ) values (
    p_account_id, p_payment_id, p_event_type, p_phone_number, 'queued', p_body,
    p_context, p_crew_id, null, p_sender_number_id, p_idempotency_key,
    p_message_kind, p_billing_category, p_sender_purpose, v_now, v_now
  )
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning * into v_event;

  if found then
    v_inserted := true;
    insert into public.sms_delivery_tasks (
      sms_event_id, task_state, available_at, created_at, updated_at
    ) values (
      v_event.id, 'queued', v_available_at, v_now, v_now
    );
  else
    select e.* into v_event
      from public.sms_events e
     where e.idempotency_key = p_idempotency_key
     for update;
    if not found then
      raise exception 'SMS idempotency conflict cannot be resolved'
        using errcode = '40001';
    end if;
    if v_event.account_id is distinct from p_account_id
       or v_event.phone_number is distinct from p_phone_number
       or v_event.body is distinct from p_body
       or v_event.message_kind is distinct from p_message_kind
       or v_event.billing_category is distinct from p_billing_category
       or v_event.sender_purpose is distinct from p_sender_purpose
       or v_event.context is distinct from p_context
       or v_event.event_type is distinct from p_event_type
       or v_event.payment_id is distinct from p_payment_id
       or v_event.crew_id is distinct from p_crew_id
       or v_event.sender_number_id is distinct from p_sender_number_id then
      raise exception 'SMS idempotency key was reused with a different payload'
        using errcode = '42200';
    end if;
  end if;

  return query
  select
    v_event.id as sms_event_id,
    'queued'::text as task_state,
    v_inserted as created;
end;
$$;

revoke all on function public.enqueue_sms_delivery(uuid,text,text,text,text,text,text,text,text,uuid,uuid,uuid,timestamptz) from public, anon;
grant execute on function public.enqueue_sms_delivery(uuid,text,text,text,text,text,text,text,text,uuid,uuid,uuid,timestamptz) to authenticated, service_role;
