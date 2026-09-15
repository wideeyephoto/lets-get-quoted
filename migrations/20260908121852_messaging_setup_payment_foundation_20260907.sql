-- Local foundation only: no Stripe calls, carrier operations, or live flags.
-- New applications require an independently verified setup payment. Existing
-- applications are not retroactively charged or asserted to have paid.
begin;

-- Database-local mode binding is deliberately unconfigured. Deployment must
-- explicitly set false on a test DB or true on production using an operator
-- migration. App credentials cannot alter it or pay test money into a live DB.
create table public.messaging_setup_payment_policy (
  singleton boolean primary key default true check (singleton),
  livemode boolean
);
insert into public.messaging_setup_payment_policy(singleton, livemode) values (true, null);
alter table public.messaging_setup_payment_policy enable row level security;
alter table public.messaging_setup_payment_policy force row level security;
revoke all on public.messaging_setup_payment_policy from public, anon, authenticated, service_role;

create table public.messaging_setup_orders (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.messaging_registration_applications(id) on delete restrict,
  account_id uuid not null references public.accounts(id) on delete restrict,
  state text not null default 'awaiting_payment'
    check (state in ('awaiting_payment', 'checkout_started', 'open', 'paid', 'expired')),
  amount_cents integer not null default 4999 check (amount_cents = 4999),
  currency text not null default 'usd' check (currency = 'usd'),
  livemode boolean,
  checkout_origin text,
  checkout_started_at timestamptz,
  checkout_expires_at timestamptz,
  checkout_session_id text unique check (checkout_session_id ~ '^cs_[A-Za-z0-9_]+$'),
  payment_intent_id text unique check (payment_intent_id ~ '^pi_[A-Za-z0-9_]+$'),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((checkout_started_at is null and checkout_expires_at is null and checkout_origin is null and livemode is null)
    or (checkout_started_at is not null and checkout_expires_at > checkout_started_at and checkout_origin is not null and livemode is not null)),
  check (state <> 'paid' or (paid_at is not null and payment_intent_id is not null and checkout_session_id is not null)),
  check (state not in ('open', 'expired') or checkout_session_id is not null)
);
create index messaging_setup_orders_account_idx on public.messaging_setup_orders(account_id);
create index messaging_setup_orders_application_idx on public.messaging_setup_orders(application_id);
alter table public.messaging_setup_orders enable row level security;
alter table public.messaging_setup_orders force row level security;
revoke all on public.messaging_setup_orders from public, anon, authenticated, service_role;
grant select on public.messaging_setup_orders to authenticated, service_role;
create policy messaging_setup_orders_owner_read on public.messaging_setup_orders
  for select to authenticated using (public.is_owner(account_id));
create policy messaging_setup_orders_service_read on public.messaging_setup_orders
  for select to service_role using (true);

create function public.create_messaging_setup_order_on_application()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  if new.status <> 'submitted' then
    raise exception 'New applications must start submitted' using errcode = '23514';
  end if;
  insert into public.messaging_setup_orders(application_id, account_id) values (new.id, new.account_id);
  return new;
end;
$$;
revoke all on function public.create_messaging_setup_order_on_application() from public, anon, authenticated, service_role;
create trigger messaging_application_setup_order after insert on public.messaging_registration_applications
  for each row execute function public.create_messaging_setup_order_on_application();

-- Lock ordering is application -> order everywhere. No network calls occur
-- inside these transactions. A single stable order means one Stripe checkout;
-- expired/uncertain old sessions require review, never a blind second charge.
create function public.begin_messaging_setup_checkout(
  p_application_id uuid, p_account_id uuid, p_origin text, p_livemode boolean
) returns setof public.messaging_setup_orders
language plpgsql security definer
set search_path = ''
as $$
declare
  v_application public.messaging_registration_applications%rowtype;
  v_order public.messaging_setup_orders%rowtype;
begin
  select * into strict v_application from public.messaging_registration_applications
    where id = p_application_id and account_id = p_account_id for update;
  if not exists (select 1 from public.messaging_setup_payment_policy where livemode = p_livemode) then
    raise exception 'Setup payment database mode not authorized' using errcode = '23514';
  end if;
  if v_application.status not in ('submitted', 'under_review', 'action_required')
    or not exists (select 1 from public.accounts where id = p_account_id and suspended_at is null) then
    raise exception 'Application cannot start checkout' using errcode = '23514';
  end if;
  if p_livemode is null or p_origin is null or length(p_origin) > 255
    or p_origin !~ '^https://[a-zA-Z0-9.-]+(:[0-9]+)?$'
      and (p_livemode or p_origin !~ '^http://localhost(:[0-9]+)?$') then
    raise exception 'Invalid checkout origin or mode' using errcode = '23514';
  end if;
  select * into strict v_order from public.messaging_setup_orders
    where application_id = p_application_id and account_id = p_account_id for update;
  if v_order.state in ('paid', 'expired') then
    raise exception 'Checkout already terminal' using errcode = '23514';
  end if;
  if v_order.checkout_started_at is not null then
    if v_order.checkout_origin <> p_origin or v_order.livemode <> p_livemode
      or v_order.checkout_expires_at <= now() then
      raise exception 'Checkout needs reconciliation' using errcode = '23514';
    end if;
  else
    update public.messaging_setup_orders set state = 'checkout_started', livemode = p_livemode,
      checkout_origin = p_origin, checkout_started_at = now(),
      checkout_expires_at = date_trunc('second', now()) + interval '23 hours', updated_at = now()
      where id = v_order.id returning * into v_order;
    insert into public.messaging_registration_events(application_id, account_id, event_type, actor_type, metadata)
      values (p_application_id, p_account_id, 'setup_checkout_started', 'system', jsonb_build_object('setup_order_id', v_order.id));
  end if;
  return next v_order;
end;
$$;
revoke all on function public.begin_messaging_setup_checkout(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.begin_messaging_setup_checkout(uuid, uuid, text, boolean) to service_role;

-- Called only after server-side Stripe retrieval and strict contract validation.
-- Both checkout return reconciliation and signature-verified webhooks use it.
-- Paid is monotonic: delayed open/expired events cannot undo confirmation.
create function public.record_messaging_setup_checkout(
  p_order_id uuid, p_application_id uuid, p_account_id uuid,
  p_session_id text, p_livemode boolean, p_amount_cents integer, p_currency text,
  p_state text, p_payment_intent_id text default null
) returns setof public.messaging_setup_orders
language plpgsql security definer
set search_path = ''
as $$
declare
  v_order public.messaging_setup_orders%rowtype;
  v_previous text;
begin
  perform 1 from public.messaging_registration_applications
    where id = p_application_id and account_id = p_account_id for update;
  if not found then raise exception 'Application binding mismatch' using errcode = '23514'; end if;
  select * into strict v_order from public.messaging_setup_orders
    where id = p_order_id and application_id = p_application_id and account_id = p_account_id for update;
  if p_session_id is null or p_session_id !~ '^cs_[A-Za-z0-9_]+$'
    or p_state is null or p_state not in ('open', 'paid', 'expired')
    or p_livemode is distinct from v_order.livemode
    or p_amount_cents is distinct from v_order.amount_cents
    or p_currency is distinct from v_order.currency
    or v_order.checkout_started_at is null
    or not exists (select 1 from public.messaging_setup_payment_policy where livemode = p_livemode)
    or v_order.checkout_session_id is not null and v_order.checkout_session_id <> p_session_id
    or p_state = 'paid' and (p_payment_intent_id is null or p_payment_intent_id !~ '^pi_[A-Za-z0-9_]+$')
    or v_order.payment_intent_id is not null and p_state = 'paid'
      and v_order.payment_intent_id is distinct from p_payment_intent_id then
    raise exception 'Checkout evidence mismatch' using errcode = '23514';
  end if;
  v_previous := v_order.state;
  if v_previous = 'paid' or v_previous = p_state then return next v_order; return; end if;
  if v_previous = 'expired' and p_state = 'open' then return next v_order; return; end if;
  update public.messaging_setup_orders set
    checkout_session_id = p_session_id, state = p_state,
    payment_intent_id = case when p_state = 'paid' then p_payment_intent_id else payment_intent_id end,
    paid_at = case when p_state = 'paid' then coalesce(paid_at, now()) else paid_at end,
    updated_at = now()
    where id = v_order.id returning * into v_order;
  insert into public.messaging_registration_events(application_id, account_id, event_type, actor_type, metadata)
    values (p_application_id, p_account_id, 'setup_payment_' || p_state, 'provider',
      jsonb_build_object('setup_order_id', v_order.id, 'checkout_session_id', p_session_id,
        'amount_cents', p_amount_cents, 'currency', p_currency, 'livemode', p_livemode));
  return next v_order;
end;
$$;
revoke all on function public.record_messaging_setup_checkout(uuid, uuid, uuid, text, boolean, integer, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_messaging_setup_checkout(uuid, uuid, uuid, text, boolean, integer, text, text, text)
  to service_role;

create function public.require_messaging_setup_payment()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare v_order public.messaging_setup_orders%rowtype;
begin
  if new.id <> old.id or new.account_id <> old.account_id then
    raise exception 'Application ownership is immutable' using errcode = '23514';
  end if;
  select * into v_order from public.messaging_setup_orders where application_id = new.id for update;
  -- No backfill: absence describes an existing manually managed application,
  -- not payment proof. New inserts receive their order atomically above.
  if found and new.status in ('approved', 'provisioning', 'active') and v_order.state <> 'paid' then
    raise exception 'Verified setup payment required' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.require_messaging_setup_payment() from public, anon, authenticated, service_role;
create trigger messaging_application_setup_payment before update on public.messaging_registration_applications
  for each row execute function public.require_messaging_setup_payment();

commit;

;
