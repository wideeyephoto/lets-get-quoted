begin;
-- Also establish the small reconciliation prerequisites for installations that
-- never enabled the optional legacy payment worker. Ambiguous bindings fail the
-- unique index rather than letting either payment path pick an arbitrary visit.
create unique index if not exists extra_stop_requests_payment_unique
  on public.extra_stop_requests(payment_id) where payment_id is not null;
alter table public.extra_stop_events add column if not exists dedupe_key text;
create unique index if not exists extra_stop_events_request_dedupe_unique
  on public.extra_stop_events(request_id,dedupe_key) where dedupe_key is not null;

create or replace function public.protect_quick_stop_system_event_dedupe()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user not in ('postgres','service_role') then
    if tg_op = 'INSERT' and new.dedupe_key is not null then
      raise exception 'system Quick Stop event keys are backend-managed' using errcode='42501';
    elsif tg_op = 'UPDATE' and (old.dedupe_key is not null or new.dedupe_key is not null) then
      raise exception 'system Quick Stop events are immutable' using errcode='42501';
    elsif tg_op = 'DELETE' and old.dedupe_key is not null then
      raise exception 'system Quick Stop events are immutable' using errcode='42501';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.protect_quick_stop_system_event_dedupe() from public,anon,authenticated,service_role;
drop trigger if exists protect_quick_stop_system_event_dedupe_trigger on public.extra_stop_events;
create trigger protect_quick_stop_system_event_dedupe_trigger before insert or update or delete
  on public.extra_stop_events for each row execute function public.protect_quick_stop_system_event_dedupe();

-- Cancellation is final for scheduling immediately. Its financial obligation is
-- a separate durable job, including when settlement arrives after cancellation.
alter table public.extra_stop_requests
  add column if not exists refund_due_cents integer check (refund_due_cents >= 0),
  add column if not exists refund_state text not null default 'none'
    check (refund_state in ('none', 'pending', 'processing', 'retry', 'completed', 'review'));

create table public.quick_stop_refund_tasks (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.extra_stop_requests(id),
  account_id uuid not null references public.accounts(id),
  payment_id uuid not null references public.payments(id),
  target_cents integer not null check (target_cents > 0),
  state text not null default 'pending' check (state in ('pending','processing','retry','completed','review')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  stripe_payment_intent text,
  attempt_cents integer check (attempt_cents > 0),
  first_attempt_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((attempt_cents is null) = (first_attempt_at is null)),
  check ((attempt_cents is null) = (stripe_payment_intent is null))
);
alter table public.quick_stop_refund_tasks enable row level security;
revoke all on public.quick_stop_refund_tasks from public, anon, authenticated;
grant select, insert, update on public.quick_stop_refund_tasks to service_role;
create index quick_stop_refund_due_idx on public.quick_stop_refund_tasks(next_attempt_at, id)
  where state in ('pending','processing','retry');

-- Provider calls cannot hold a SQL transaction open. A durable reservation
-- serializes manual and automatic refunds across that boundary. Unknown manual
-- results never expire automatically into a second provider request.
create table public.quick_stop_manual_refund_reservations (
  payment_id uuid primary key references public.payments(id),
  account_id uuid not null references public.accounts(id),
  token uuid not null default gen_random_uuid(),
  target_cents integer not null check(target_cents>0),
  state text not null default 'active' check(state in ('active','unknown')),
  created_at timestamptz not null default now()
);
alter table public.quick_stop_manual_refund_reservations enable row level security;
revoke all on public.quick_stop_manual_refund_reservations from public,anon,authenticated;
grant select,insert,update,delete on public.quick_stop_manual_refund_reservations to service_role;

-- The older optional worker uses a different persisted Stripe key. Retained
-- tasks, including dead letters with unknown provider outcomes, must be drained
-- or reconciled before either the new worker or manual refunds can send money.
-- Dynamic SQL keeps this migration usable where that optional table is absent.
create function public.quick_stop_has_unresolved_legacy_refund(p_payment_id uuid)
returns boolean language plpgsql stable security invoker set search_path = '' as $$
declare v_exists boolean;
begin
  if pg_catalog.to_regclass('public.quick_stop_payment_tasks') is null then return false; end if;
  execute 'select exists(select 1 from public.quick_stop_payment_tasks where payment_id=$1 and task_state<>''completed'')'
    into v_exists using p_payment_id;
  return v_exists;
end $$;
revoke all on function public.quick_stop_has_unresolved_legacy_refund(uuid) from public,anon,authenticated;
grant execute on function public.quick_stop_has_unresolved_legacy_refund(uuid) to service_role;

create function public.begin_quick_stop_manual_refund(p_account_id uuid,p_payment_id uuid,p_target_cents integer,p_expected_refunded_cents integer default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare r public.extra_stop_requests%rowtype; v_token uuid; v_gross numeric;
  v_refunded integer; v_status text; v_charge_model text;
begin
  select amount*100,round(coalesce(refunded_amount,0)*100)::integer,status::text,charge_model
    into v_gross,v_refunded,v_status,v_charge_model from public.payments
    where id=p_payment_id and account_id=p_account_id for update;
  if not found then raise exception 'Payment not found'; end if;
  select * into r from public.extra_stop_requests where payment_id=p_payment_id and account_id=p_account_id for update;
  if not found then return null; end if;
  if v_status is distinct from 'paid' or v_charge_model is distinct from 'destination'
    or (p_expected_refunded_cents is not null and p_expected_refunded_cents is distinct from v_refunded) then
    raise exception 'The payment changed before the refund was reserved. Refresh and try again';
  end if;
  if p_target_cents is null or p_target_cents<=0 or p_target_cents>v_gross then raise exception 'Invalid manual refund target'; end if;
  if p_target_cents<=v_refunded then raise exception 'The requested refund target has already been met'; end if;
  if public.quick_stop_has_unresolved_legacy_refund(p_payment_id) then
    raise exception 'An earlier Quick Stop refund needs reconciliation before another refund can be issued';
  end if;
  if exists(select 1 from public.quick_stop_refund_tasks where payment_id=p_payment_id and state<>'completed')
    or exists(select 1 from public.quick_stop_manual_refund_reservations where payment_id=p_payment_id) then
    raise exception 'This Quick Stop already has a refund in progress or awaiting review';
  end if;
  insert into public.quick_stop_manual_refund_reservations(payment_id,account_id,target_cents)
    values(p_payment_id,p_account_id,p_target_cents) returning token into v_token;
  update public.extra_stop_requests set refund_state='processing',
    refund_due_cents=greatest(coalesce(refund_due_cents,0),p_target_cents),updated_at=now() where id=r.id;
  return v_token;
end $$;

create function public.finish_quick_stop_manual_refund(p_account_id uuid,p_payment_id uuid,p_token uuid,p_succeeded boolean)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare r public.extra_stop_requests%rowtype; v_target integer; v_refunded integer;
begin
  select round(coalesce(refunded_amount,0)*100)::integer into v_refunded from public.payments
    where id=p_payment_id and account_id=p_account_id for update;
  select * into r from public.extra_stop_requests where payment_id=p_payment_id and account_id=p_account_id for update;
  select target_cents into v_target from public.quick_stop_manual_refund_reservations
    where payment_id=p_payment_id and account_id=p_account_id and token=p_token for update;
  if not found then return false; end if;
  if p_succeeded and v_refunded>=v_target then
    delete from public.quick_stop_manual_refund_reservations where payment_id=p_payment_id and token=p_token;
    update public.quick_stop_refund_tasks set state='pending',next_attempt_at=now(),last_error=null,updated_at=now()
      where request_id=r.id and state='review' and last_error='manual_refund_active';
    update public.extra_stop_requests set refund_cents=greatest(coalesce(refund_cents,0),v_refunded),
      refund_state=coalesce((select state from public.quick_stop_refund_tasks where request_id=r.id),'completed'),
      updated_at=now() where id=r.id;
  else
    update public.quick_stop_manual_refund_reservations set state='unknown' where payment_id=p_payment_id;
    insert into public.quick_stop_refund_tasks(request_id,account_id,payment_id,target_cents,state,last_error)
      values(r.id,p_account_id,p_payment_id,greatest(v_target,coalesce(r.refund_due_cents,0)),'review','manual_provider_result_unknown')
      on conflict(request_id) do update set state='review',
        target_cents=greatest(public.quick_stop_refund_tasks.target_cents,excluded.target_cents),
        last_error='manual_provider_result_unknown',updated_at=now();
    update public.extra_stop_requests set refund_state='review',
      refund_due_cents=greatest(coalesce(refund_due_cents,0),v_target),updated_at=now() where id=r.id;
  end if;
  -- An applied review record is not a successfully released reservation. The
  -- caller requesting success must surface missing local refund evidence.
  return p_succeeded is not true or v_refunded>=v_target;
end $$;

-- Service role only. One obligation per request; replay cannot raise a partial
-- cancellation refund to 100% merely because its payment webhook was redelivered.
create function public.queue_quick_stop_refund(p_request_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare r public.extra_stop_requests%rowtype; v_target integer; v_task uuid;
begin
  select * into r from public.extra_stop_requests where id=p_request_id;
  -- Existing webhook code locks payment before request; preserve that order.
  if r.payment_id is not null then perform 1 from public.payments where id=r.payment_id for update; end if;
  select * into r from public.extra_stop_requests where id=p_request_id for update;
  if not found then raise exception 'Quick Stop not found'; end if;
  if r.status not in ('offer_expired','customer_canceled','customer_declined',
      'contractor_canceled','contractor_declined','no_show_confirmed','refunded') then
    raise exception 'Quick Stop still has a fulfillable appointment';
  end if;
  v_target := coalesce(r.refund_due_cents, r.fee_cents, 0);
  if r.payment_id is null or v_target <= 0 then return null; end if;
  if not exists (select 1 from public.payments p where p.id=r.payment_id and p.account_id=r.account_id) then
    raise exception 'Quick Stop payment account mismatch';
  end if;
  insert into public.quick_stop_refund_tasks(request_id,account_id,payment_id,target_cents,state,last_error)
    values(r.id,r.account_id,r.payment_id,v_target,
      case when public.quick_stop_has_unresolved_legacy_refund(r.payment_id)
        or exists(select 1 from public.quick_stop_manual_refund_reservations where payment_id=r.payment_id) then 'review' else 'pending' end,
      case when public.quick_stop_has_unresolved_legacy_refund(r.payment_id) then 'legacy_refund_unresolved'
        when exists(select 1 from public.quick_stop_manual_refund_reservations where payment_id=r.payment_id) then 'manual_refund_active' else null end)
    on conflict(request_id) do update set
      target_cents=greatest(public.quick_stop_refund_tasks.target_cents,excluded.target_cents),
      state=case when excluded.last_error='legacy_refund_unresolved' or excluded.target_cents>public.quick_stop_refund_tasks.target_cents then 'review' else public.quick_stop_refund_tasks.state end,
      last_error=case when excluded.last_error='legacy_refund_unresolved' then excluded.last_error
        when excluded.target_cents>public.quick_stop_refund_tasks.target_cents then 'refund_obligation_increased' else public.quick_stop_refund_tasks.last_error end;
  select id into v_task from public.quick_stop_refund_tasks where request_id=r.id;
  update public.extra_stop_requests set refund_due_cents=v_target,
    refund_state=(select state from public.quick_stop_refund_tasks where id=v_task)
    where id=r.id;
  return v_task;
end $$;

-- Confirmation and calendar activation share the same lock/commit. A customer
-- cancellation cannot archive the job between these two effects and have it
-- reactivated by a late continuation of the webhook handler.
create function public.confirm_quick_stop_payment(p_payment_id uuid)
returns setof public.extra_stop_requests language plpgsql security invoker set search_path = '' as $$
declare p public.payments%rowtype; r public.extra_stop_requests%rowtype;
begin
  select * into p from public.payments where id=p_payment_id for update;
  if not found then return; end if;
  select * into r from public.extra_stop_requests where payment_id=p_payment_id for update;
  if not found or r.status <> 'awaiting_customer_payment' then return; end if;
  if p.status is distinct from 'paid' or p.paid_at is null or p.stripe_payment_intent is null or p.charge_model is distinct from 'destination'
    or p.account_id is distinct from r.account_id or p.job_id is distinct from r.job_id
    or r.job_id is null or r.fee_cents is null or r.fee_cents <> round(p.amount*100) then
    raise exception 'Quick Stop confirmation requires matching captured payment evidence';
  end if;
  update public.jobs set status='in_progress' where id=r.job_id and account_id=r.account_id
    and status in ('new_lead','in_progress');
  if not found then raise exception 'Quick Stop calendar job cannot be confirmed'; end if;
  return query update public.extra_stop_requests set status='confirmed',paid_at=p.paid_at,updated_at=now()
    where id=r.id returning *;
end $$;

-- The request lock protects eligibility, timeline evidence, cancellation, job
-- archival and the refund obligation in one transaction. Losing calls do nothing.
create function public.cancel_quick_stop_request(
  p_account_id uuid, p_request_id uuid, p_expected_status text, p_kind text,
  p_refund_pct integer, p_reason text, p_require_reporting_window boolean default false
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare r public.extra_stop_requests%rowtype; v_status text; v_end timestamptz;
  v_zone text; v_due integer; v_now timestamptz := clock_timestamp();
begin
  if p_kind is null or p_kind not in ('customer_cancel','contractor_cancel','no_show')
     or p_refund_pct is null or p_refund_pct < 0 or p_refund_pct > 100 then
    raise exception 'Invalid cancellation';
  end if;
  -- Enforcement takes the account lock before a request lock. Take it first
  -- here too so cancellation plus enforcement can commit together without an
  -- account/request lock-order inversion with a concurrent replay.
  if p_kind='no_show' then perform 1 from public.accounts where id=p_account_id for update; end if;
  select * into r from public.extra_stop_requests where id=p_request_id and account_id=p_account_id;
  if r.payment_id is not null then perform 1 from public.payments where id=r.payment_id for update; end if;
  select * into r from public.extra_stop_requests
    where id=p_request_id and account_id=p_account_id for update;
  if not found then raise exception 'Quick Stop not found'; end if;
  v_status := case p_kind when 'no_show' then 'no_show_confirmed'
    when 'contractor_cancel' then 'contractor_canceled' else 'customer_canceled' end;
  if r.status=v_status then return false; end if;
  if r.status is distinct from p_expected_status then return false; end if;
  if (p_kind='customer_cancel' and r.status not in ('awaiting_customer_payment','confirmed','en_route','arrived'))
    or (p_kind='contractor_cancel' and r.status not in ('contractor_offer_sent','awaiting_customer_payment','confirmed','en_route','arrived'))
    or (p_kind='no_show' and r.status not in ('confirmed','en_route','completed','disputed','no_show_reported')) then
    raise exception 'This Quick Stop cannot be canceled from its current state';
  end if;
  if p_kind='no_show' then
    if r.paid_at is null or r.payment_id is null or r.job_id is null or r.arrived_at is not null
      or r.arrival_date is null or r.arrival_start is null or r.arrival_end is null
      or r.arrival_start >= r.arrival_end
      or not exists(select 1 from public.payments p where p.id=r.payment_id and p.account_id=r.account_id
        and p.status in ('paid','refunded') and p.paid_at is not null) then
      raise exception 'No-show requires a paid scheduled visit that never arrived';
    end if;
    select coalesce(nullif(btrim(timezone),''),'America/New_York') into v_zone
      from public.accounts where id=p_account_id;
    if v_zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=v_zone) then
      raise exception 'Invalid account time zone';
    end if;
    v_end := public.quick_stop_window_instant(r.arrival_date,r.arrival_end,v_zone);
    if v_end is null or public.quick_stop_window_instant(r.arrival_date,r.arrival_start,v_zone) is null
      or public.quick_stop_window_instant(r.arrival_date,r.arrival_start,v_zone)>=v_end then
      raise exception 'Invalid arrival instant';
    end if;
    if v_now < v_end or (p_require_reporting_window and
      (r.status not in ('confirmed','en_route') or v_now > v_end + interval '2 hours')) then
      raise exception 'No-show cannot be reported outside the reporting window';
    end if;
  end if;
  -- An unpaid offer cancellation still owes 100% of a charge that settles later.
  v_due := case when r.payment_id is null then 0
    when p_kind <> 'customer_cancel' or r.paid_at is null then coalesce(r.fee_cents,0)
    else round(coalesce(r.fee_cents,0)::numeric*p_refund_pct/100)::integer end;
  update public.extra_stop_requests set status=v_status, refund_due_cents=v_due,
    refund_state=case when v_due>0 then 'pending' else 'none' end,
    cancel_reason=p_reason, updated_at=v_now,
    canceled_at=case when p_kind <> 'no_show' then v_now else canceled_at end,
    no_show_confirmed_at=case when p_kind='no_show' then v_now else no_show_confirmed_at end,
    no_show_reported_at=case when p_kind='no_show' then coalesce(no_show_reported_at,v_now) else no_show_reported_at end
    where id=r.id;
  if r.job_id is not null then
    update public.jobs set status='archived' where id=r.job_id and account_id=r.account_id;
  end if;
  if v_due>0 then perform public.queue_quick_stop_refund(r.id); end if;
  if p_kind='no_show' then perform public.apply_quick_stop_no_show_lock(p_account_id,r.id); end if;
  return true;
end $$;

create function public.claim_quick_stop_refunds(p_limit integer default 25, p_account_id uuid default null, p_request_id uuid default null)
returns setof public.quick_stop_refund_tasks language plpgsql security invoker set search_path = '' as $$
declare stale record;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then raise exception 'Invalid refund batch size'; end if;
  -- Recover a process crash after manual reservation but before its finally
  -- block. The result is uncertain, so surface review instead of releasing it.
  for stale in select m.* from public.quick_stop_manual_refund_reservations m
    where m.state='active' and m.created_at<now()-interval '5 minutes'
      and (p_account_id is null or m.account_id=p_account_id)
    order by m.created_at,m.payment_id limit p_limit loop
    perform public.finish_quick_stop_manual_refund(stale.account_id,stale.payment_id,stale.token,false);
  end loop;
  return query
    with due as (
      select t.id from public.quick_stop_refund_tasks t
      join public.payments p on p.id=t.payment_id and p.account_id=t.account_id
      where t.state in ('pending','processing','retry') and t.next_attempt_at<=now()
        and not exists(select 1 from public.quick_stop_manual_refund_reservations m where m.payment_id=t.payment_id)
        and not public.quick_stop_has_unresolved_legacy_refund(t.payment_id)
        and (t.lease_until is null or t.lease_until<now())
        and p.status in ('paid','refunded') and p.stripe_payment_intent is not null
        and (p_account_id is null or t.account_id=p_account_id)
        and (p_request_id is null or t.request_id=p_request_id)
      order by t.next_attempt_at,t.id limit p_limit for update of t skip locked
    ) update public.quick_stop_refund_tasks t set state='processing', attempts=t.attempts+1,
      lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',updated_at=now()
      from due where t.id=due.id returning t.*;
end $$;

-- Save the exact provider request BEFORE egress. A lease replay never invents
-- a new amount/key. Unknown results older than Stripe's retention need review.
create function public.prepare_quick_stop_refund(p_task_id uuid,p_lease_token uuid,p_payment_intent text,p_amount_cents integer)
returns setof public.quick_stop_refund_tasks language plpgsql security invoker set search_path = '' as $$
begin
  return query update public.quick_stop_refund_tasks t
    set stripe_payment_intent=coalesce(t.stripe_payment_intent,p_payment_intent),
      attempt_cents=coalesce(t.attempt_cents,p_amount_cents),
      first_attempt_at=coalesce(t.first_attempt_at,clock_timestamp()),updated_at=now()
    where t.id=p_task_id and t.lease_token=p_lease_token and t.state='processing' and t.lease_until>now()
      and not public.quick_stop_has_unresolved_legacy_refund(t.payment_id)
      and p_amount_cents>0 and p_amount_cents<=t.target_cents
      and (t.stripe_payment_intent is null or t.stripe_payment_intent=p_payment_intent)
      and (t.attempt_cents is null or t.attempt_cents=p_amount_cents)
    returning t.*;
end $$;

-- Staff may re-read a reviewed task after resolving the provider side. This
-- claim is used by a read-only provider executor; it never authorizes new money.
create function public.claim_quick_stop_refund_review(p_account_id uuid,p_request_id uuid)
returns setof public.quick_stop_refund_tasks language plpgsql security invoker set search_path = '' as $$
begin
  return query update public.quick_stop_refund_tasks set state='processing',
    lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',updated_at=now()
    where account_id=p_account_id and request_id=p_request_id and state='review'
      and (lease_until is null or lease_until<now()) returning *;
end $$;

create function public.finish_quick_stop_refund(p_task_id uuid,p_lease_token uuid,p_state text,p_refunded_cents integer default 0,p_error text default null)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare t public.quick_stop_refund_tasks%rowtype; v_request_id uuid; v_payment_id uuid; v_amount numeric; v_fee numeric;
begin
  if p_state is null or p_state not in ('completed','retry','review')
    or p_refunded_cents is null or p_refunded_cents<0 then raise exception 'Invalid refund outcome'; end if;
  select request_id,payment_id into v_request_id,v_payment_id from public.quick_stop_refund_tasks where id=p_task_id;
  perform 1 from public.payments where id=v_payment_id for update;
  perform 1 from public.extra_stop_requests where id=v_request_id for update;
  select * into t from public.quick_stop_refund_tasks where id=p_task_id for update;
  if not found or t.lease_token is distinct from p_lease_token or t.state <> 'processing' then return false; end if;
  if p_state='completed' then
    select amount,platform_fee into v_amount,v_fee from public.payments
      where id=t.payment_id and account_id=t.account_id and status in ('paid','refunded')
      and charge_model='destination' for update;
    if not found or p_refunded_cents<t.target_cents or p_refunded_cents>round(v_amount*100) then
      raise exception 'Refund completion requires exact provider evidence';
    end if;
    update public.payments set refunded_amount=greatest(coalesce(refunded_amount,0),p_refunded_cents/100.0),
      status=case when p_refunded_cents>=round(v_amount*100) then 'refunded' else status end,
      refunded_at=case when p_refunded_cents>round(coalesce(refunded_amount,0)*100) then now() else refunded_at end,
      platform_fee_refunded=greatest(coalesce(platform_fee_refunded,0),round(coalesce(v_fee,0)*p_refunded_cents/(v_amount*100),2))
      where id=t.payment_id;
    update public.extra_stop_requests set refund_cents=greatest(coalesce(refund_cents,0),p_refunded_cents),
      refund_state='completed',updated_at=now() where id=t.request_id;
    delete from public.quick_stop_manual_refund_reservations where payment_id=t.payment_id and target_cents<=p_refunded_cents;
  else
    update public.extra_stop_requests set refund_state=p_state,updated_at=now() where id=t.request_id;
  end if;
  update public.quick_stop_refund_tasks set state=p_state,last_error=p_error,
    lease_token=null,lease_until=null,
    next_attempt_at=now()+make_interval(secs=>least(3600,60*power(2,least(attempts,6)))::integer),
    updated_at=now() where id=t.id;
  return true;
end $$;

revoke all on function public.queue_quick_stop_refund(uuid) from public,anon,authenticated;
revoke all on function public.cancel_quick_stop_request(uuid,uuid,text,text,integer,text,boolean) from public,anon,authenticated;
revoke all on function public.claim_quick_stop_refunds(integer,uuid,uuid) from public,anon,authenticated;
revoke all on function public.prepare_quick_stop_refund(uuid,uuid,text,integer) from public,anon,authenticated;
revoke all on function public.finish_quick_stop_refund(uuid,uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.queue_quick_stop_refund(uuid) to service_role;
revoke all on function public.confirm_quick_stop_payment(uuid) from public,anon,authenticated;
grant execute on function public.confirm_quick_stop_payment(uuid) to service_role;
grant execute on function public.cancel_quick_stop_request(uuid,uuid,text,text,integer,text,boolean) to service_role;
grant execute on function public.claim_quick_stop_refunds(integer,uuid,uuid) to service_role;
grant execute on function public.prepare_quick_stop_refund(uuid,uuid,text,integer) to service_role;
grant execute on function public.finish_quick_stop_refund(uuid,uuid,text,integer,text) to service_role;
revoke all on function public.claim_quick_stop_refund_review(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_quick_stop_refund_review(uuid,uuid) to service_role;
revoke all on function public.begin_quick_stop_manual_refund(uuid,uuid,integer,integer) from public,anon,authenticated;
revoke all on function public.finish_quick_stop_manual_refund(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.begin_quick_stop_manual_refund(uuid,uuid,integer,integer) to service_role;
grant execute on function public.finish_quick_stop_manual_refund(uuid,uuid,uuid,boolean) to service_role;

-- Supersede the feature-gated legacy reconciliation entrypoint as well.
create or replace function public.reconcile_legacy_quick_stop_payment(p_payment_id uuid)
returns table (
  reconcile_status text,
  quick_stop_request_id uuid,
  late_refund_task_id uuid,
  late_refund_task_state text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set timezone = 'UTC'
as $$
declare
  v_payment public.payments%rowtype;
  v_request public.extra_stop_requests%rowtype;
  v_job public.jobs%rowtype;
  v_event public.extra_stop_events%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_gross_cents bigint;
  v_refunded_cents bigint;
  v_refund_cents bigint;
  v_task_key text;
  v_event_key text;
  v_idempotency_key text;
  v_snapshot jsonb;
  v_fingerprint text;
begin
  if p_payment_id is null then
    raise exception 'payment ID is required' using errcode = '22023';
  end if;

  select p.* into v_payment
    from public.payments p
   where p.id = p_payment_id
   for update;
  if not found then
    raise exception 'payment was not found' using errcode = 'P0002';
  end if;
  if v_payment.charge_model is distinct from 'destination' then
    raise exception 'legacy Quick Stop reconciliation requires a destination payment'
      using errcode = '22000';
  end if;
  if v_payment.status not in ('paid', 'refunded') then
    raise exception 'legacy Quick Stop reconciliation requires settled payment truth'
      using errcode = '55000';
  end if;
  if v_payment.status = 'paid' and v_payment.paid_at is null then
    raise exception 'paid legacy Quick Stop payment is missing its settlement timestamp'
      using errcode = '22000';
  end if;

  select r.* into v_request
    from public.extra_stop_requests r
   where r.payment_id = p_payment_id
   for update;
  if not found then
    return query select 'not_quick_stop'::text, null::uuid, null::uuid, null::text;
    return;
  end if;

  if v_request.account_id is distinct from v_payment.account_id then
    raise exception 'Quick Stop and payment account scopes do not match'
      using errcode = '23514';
  end if;
  if v_request.job_id is null
     or v_request.job_id is distinct from v_payment.job_id
     or v_payment.kind::text is distinct from 'deposit' then
    raise exception 'Quick Stop and payment job scopes do not match'
      using errcode = '23514';
  end if;

  v_gross_cents := (v_payment.amount * 100)::bigint;
  v_refunded_cents := (coalesce(v_payment.refunded_amount, 0) * 100)::bigint;
  if v_gross_cents <= 0
     or v_payment.amount is distinct from v_gross_cents::numeric / 100
     or v_refunded_cents < 0
     or coalesce(v_payment.refunded_amount, 0)
        is distinct from v_refunded_cents::numeric / 100
     or v_refunded_cents > v_gross_cents then
    raise exception 'Quick Stop payment amount cannot be represented exactly in cents'
      using errcode = '22000';
  end if;
  if v_request.fee_cents is null
     or v_request.fee_cents::bigint is distinct from v_gross_cents then
    raise exception 'Quick Stop fee and payment amount do not match'
      using errcode = '22000';
  end if;

  -- Every nonfulfillable state uses the durable obligation queue, including
  -- cancellation before settlement. Preserve a previously decided partial tier.
  if v_request.status in ('offer_expired','customer_canceled','customer_declined',
      'contractor_canceled','contractor_declined','no_show_confirmed','refunded') then
    perform public.queue_quick_stop_refund(v_request.id);
    return query select
      case when t.state='completed' then 'refund_reconciled' else 'refund_queued' end::text,
      v_request.id, case when t.state='completed' then null::uuid else t.id end,
      case t.state when 'pending' then 'ready' when 'processing' then 'leased'
        when 'retry' then 'retry_wait' when 'review' then 'dead_letter' else t.state end::text
      from public.quick_stop_refund_tasks t where t.request_id=v_request.id;
    if not found then
      return query select 'not_actionable'::text,v_request.id,null::uuid,null::text;
    end if;
    return;
  end if;
  if v_request.status in ('awaiting_customer_payment', 'confirmed') then
    if v_payment.status <> 'paid' then
      raise exception 'a refunded payment cannot confirm a Quick Stop'
        using errcode = '55000';
    end if;
    if v_request.job_id is null then
      raise exception 'paid Quick Stop has no calendar job'
        using errcode = '55000';
    end if;
    select j.* into v_job
      from public.jobs j
     where j.id = v_request.job_id
       and j.account_id = v_request.account_id
     for update;
    if not found then
      raise exception 'paid Quick Stop calendar job is unavailable'
        using errcode = '55000';
    end if;

    -- A fresh confirmation may activate only a tentative/live job. A replay of
    -- an already-confirmed payment must remain idempotent after the appointment
    -- has naturally moved to complete or archived.
    if v_request.status = 'awaiting_customer_payment' then
      if v_job.status not in ('new_lead', 'in_progress') then
        raise exception 'paid Quick Stop calendar job is unavailable'
          using errcode = '55000';
      end if;

      if v_job.status = 'new_lead' then
        update public.jobs j
           set status = 'in_progress'
         where j.id = v_job.id
           and j.account_id = v_request.account_id
           and j.status = 'new_lead';
        if not found then
          raise exception 'Quick Stop calendar job changed during confirmation'
            using errcode = '40001';
        end if;
      end if;
    end if;

    if v_request.status = 'awaiting_customer_payment' then
      update public.extra_stop_requests r
         set status = 'confirmed',
             paid_at = coalesce(r.paid_at, v_payment.paid_at, v_now),
             updated_at = v_now
       where r.id = v_request.id
         and r.status = 'awaiting_customer_payment';
      if not found then
        raise exception 'Quick Stop changed during confirmation'
          using errcode = '40001';
      end if;
    end if;

    v_event_key := 'quick_stop_payment.confirmed.v1:' || p_payment_id::text;
    insert into public.extra_stop_events (
      account_id, request_id, actor, from_status, to_status, meta, dedupe_key
    ) values (
      v_request.account_id,
      v_request.id,
      'stripe',
      'awaiting_customer_payment',
      'confirmed',
      pg_catalog.jsonb_build_object(
        'paymentId', p_payment_id,
        'reason', 'legacy_destination_payment_settled'
      ),
      v_event_key
    )
    on conflict (request_id, dedupe_key) where dedupe_key is not null do nothing;

    select e.* into v_event
      from public.extra_stop_events e
     where e.request_id = v_request.id
       and e.dedupe_key = v_event_key;
    if not found
       or v_event.account_id is distinct from v_request.account_id
       or v_event.actor is distinct from 'stripe'
       or v_event.from_status is distinct from 'awaiting_customer_payment'
       or v_event.to_status is distinct from 'confirmed'
       or v_event.meta is distinct from pg_catalog.jsonb_build_object(
         'paymentId', p_payment_id,
         'reason', 'legacy_destination_payment_settled'
       ) then
      raise exception 'Quick Stop confirmation event dedupe conflict'
        using errcode = '23505';
    end if;

    return query select
      case when v_request.status = 'confirmed' then 'already_confirmed' else 'confirmed' end,
      v_request.id,
      null::uuid,
      null::text;
    return;
  end if;

  return query select 'not_actionable'::text, v_request.id, null::uuid, null::text;
end
$$;

revoke all on function public.reconcile_legacy_quick_stop_payment(uuid) from public,anon,authenticated;
grant execute on function public.reconcile_legacy_quick_stop_payment(uuid) to service_role;

commit;
