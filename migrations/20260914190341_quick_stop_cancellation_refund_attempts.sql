alter table public.extra_stop_requests add column cancellation_refund_requested_cents bigint not null default 0 check(cancellation_refund_requested_cents>=0);
create table public.quick_stop_cancellation_refund_attempts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,
  quick_stop_id uuid not null unique,
  payment_id uuid not null,
  payment_intent text,
  payment_amount_cents bigint not null,
  requested_cents bigint not null check(requested_cents>0),
  already_refunded_cents bigint not null,
  state text not null check(state in ('prepared','submitting','accounted','manual_review')),
  provider_refund_id text unique,
  provider_status text,
  created_at timestamptz not null default clock_timestamp(),
  attempted_at timestamptz,
  completed_at timestamptz
);
alter table public.quick_stop_cancellation_refund_attempts enable row level security;
revoke all on public.quick_stop_cancellation_refund_attempts from public,anon,authenticated;
grant select,update on public.quick_stop_cancellation_refund_attempts to service_role;
create index quick_stop_cancellation_refunds_account_idx on public.quick_stop_cancellation_refund_attempts(account_id);
create index quick_stop_cancellation_refunds_payment_idx on public.quick_stop_cancellation_refund_attempts(payment_id);
create function public.record_quick_stop_cancellation_refund_attempt() returns trigger
language plpgsql security definer set search_path='' as $$
declare p public.payments; ready boolean;
begin
  if new.payment_id is null then raise exception 'Cancellation refund payment missing'; end if;
  select * into p from public.payments where id=new.payment_id and account_id=new.account_id for share;
  if not found then raise exception 'Cancellation refund payment unavailable'; end if;
  ready:=p.status='paid' and p.stripe_payment_intent is not null
    and (not(to_jsonb(p)?'charge_model') or to_jsonb(p)->>'charge_model'='destination')
    and new.cancellation_refund_requested_cents<=round((p.amount-coalesce(p.refunded_amount,0))*100);
  insert into public.quick_stop_cancellation_refund_attempts(account_id,quick_stop_id,payment_id,payment_intent,payment_amount_cents,requested_cents,already_refunded_cents,state)
    values(new.account_id,new.id,p.id,p.stripe_payment_intent,round(p.amount*100),new.cancellation_refund_requested_cents,round(coalesce(p.refunded_amount,0)*100),case when ready then 'prepared' else 'manual_review' end);
  return new;
end $$;
revoke all on function public.record_quick_stop_cancellation_refund_attempt() from public,anon,authenticated;
create trigger record_quick_stop_cancellation_refund_attempt after update on public.extra_stop_requests
  for each row when (new.status is distinct from old.status and new.status in ('customer_canceled','contractor_canceled','no_show_confirmed') and new.cancellation_refund_requested_cents>0)
  execute function public.record_quick_stop_cancellation_refund_attempt();
create function public.claim_quick_stop_cancellation_refund(p_account_id uuid,p_quick_stop_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.quick_stop_cancellation_refund_attempts; p public.payments;
begin
  select * into a from public.quick_stop_cancellation_refund_attempts where account_id=p_account_id and quick_stop_id=p_quick_stop_id for update;
  if not found or a.state<>'prepared' then return null; end if;
  perform 1 from public.extra_stop_requests q where q.id=a.quick_stop_id and q.account_id=a.account_id and q.payment_id=a.payment_id
    and q.status in ('customer_canceled','contractor_canceled','no_show_confirmed') and q.cancellation_refund_requested_cents=a.requested_cents for share;
  if not found then
    update public.quick_stop_cancellation_refund_attempts set state='manual_review' where id=a.id;
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('quick-stop-refund:'||a.payment_id::text,0));
  if exists(select 1 from public.quick_stop_cancellation_refund_attempts other where other.payment_id=a.payment_id and other.id<>a.id and other.state in ('submitting','manual_review')) then
    update public.quick_stop_cancellation_refund_attempts set state='manual_review' where id=a.id;
    return null;
  end if;
  select * into p from public.payments where id=a.payment_id and account_id=a.account_id for share;
  if not found or round(p.amount*100)<>a.payment_amount_cents or p.status<>'paid' or p.stripe_payment_intent is distinct from a.payment_intent
    or round(coalesce(p.refunded_amount,0)*100)<>a.already_refunded_cents
    or a.requested_cents>round((p.amount-coalesce(p.refunded_amount,0))*100)
    or (to_jsonb(p)?'charge_model' and coalesce(to_jsonb(p)->>'charge_model','')<>'destination') then
    update public.quick_stop_cancellation_refund_attempts set state='manual_review' where id=a.id;
    return null;
  end if;
  update public.quick_stop_cancellation_refund_attempts set state='submitting',attempted_at=clock_timestamp() where id=a.id returning * into a;
  return to_jsonb(a);
end $$;
revoke all on function public.claim_quick_stop_cancellation_refund(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_quick_stop_cancellation_refund(uuid,uuid) to service_role;
create function public.observe_quick_stop_cancellation_refund(p_account_id uuid,p_id uuid,p_provider_id text,p_status text,p_payment_intent text,p_amount bigint,p_currency text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare a public.quick_stop_cancellation_refund_attempts;
begin
  select * into a from public.quick_stop_cancellation_refund_attempts where id=p_id and account_id=p_account_id for update;
  if not found or a.state<>'submitting' then return false; end if;
  if p_provider_id is null or p_provider_id !~ '^re_[A-Za-z0-9_]+$'
    or p_status is null or p_status not in ('pending','requires_action','succeeded','failed','canceled')
    or p_payment_intent is distinct from a.payment_intent or p_amount is distinct from a.requested_cents or p_currency is distinct from 'usd'
    or (a.provider_refund_id is not null and a.provider_refund_id<>p_provider_id) then return false; end if;
  update public.quick_stop_cancellation_refund_attempts set provider_refund_id=p_provider_id,provider_status=p_status where id=a.id;
  return true;
end $$;
revoke all on function public.observe_quick_stop_cancellation_refund(uuid,uuid,text,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.observe_quick_stop_cancellation_refund(uuid,uuid,text,text,text,bigint,text) to service_role;
create function public.finish_quick_stop_cancellation_refund(p_account_id uuid,p_id uuid,p_accounted boolean)
returns boolean language plpgsql security invoker set search_path='' as $$
declare a public.quick_stop_cancellation_refund_attempts;
begin
  select * into a from public.quick_stop_cancellation_refund_attempts where id=p_id and account_id=p_account_id for update;
  if not found or a.state<>'submitting' then return false; end if;
  if p_accounted then
    if a.provider_status is distinct from 'succeeded' then return false; end if;
    perform 1 from public.payments p where p.id=a.payment_id and p.account_id=a.account_id and p.stripe_payment_intent=a.payment_intent
      and p.status in ('paid','refunded') and round(p.amount*100)=a.payment_amount_cents and round(p.refunded_amount*100)>=a.already_refunded_cents+a.requested_cents for share;
    if not found then return false; end if;
    update public.extra_stop_requests set refund_cents=a.requested_cents where id=a.quick_stop_id and account_id=a.account_id
      and payment_id=a.payment_id and status in ('customer_canceled','contractor_canceled','no_show_confirmed');
    if not found then return false; end if;
  end if;
  update public.quick_stop_cancellation_refund_attempts set state=case when p_accounted then 'accounted' else 'manual_review' end,completed_at=clock_timestamp() where id=a.id;
  return true;
end $$;
revoke all on function public.finish_quick_stop_cancellation_refund(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.finish_quick_stop_cancellation_refund(uuid,uuid,boolean) to service_role;
create function public.guard_quick_stop_refund_attempt_identity() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if row(new.id,new.account_id,new.quick_stop_id,new.payment_id,new.payment_intent,new.payment_amount_cents,new.requested_cents,new.already_refunded_cents)
    is distinct from row(old.id,old.account_id,old.quick_stop_id,old.payment_id,old.payment_intent,old.payment_amount_cents,old.requested_cents,old.already_refunded_cents) then
    raise exception 'Refund attempt identity is immutable'; end if;
  return new;
end $$;
revoke all on function public.guard_quick_stop_refund_attempt_identity() from public,anon,authenticated;
create trigger guard_quick_stop_refund_attempt_identity before update on public.quick_stop_cancellation_refund_attempts
  for each row execute function public.guard_quick_stop_refund_attempt_identity();
notify pgrst,'reload schema';
