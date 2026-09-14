create function public.reconcile_quick_stop_cancellation_refund(p_account_id uuid,p_payment_id uuid,p_id uuid,p_provider_id text,p_status text,p_payment_intent text,p_amount bigint,p_currency text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare a public.quick_stop_cancellation_refund_attempts; p public.payments;
begin
  select * into a from public.quick_stop_cancellation_refund_attempts where id=p_id and account_id=p_account_id and payment_id=p_payment_id for update;
  if not found or a.attempted_at is null or a.state='prepared' then return false; end if;
  if p_provider_id is null or p_provider_id !~ '^re_[A-Za-z0-9_]+$'
    or p_status is null or p_status not in ('pending','requires_action','succeeded','failed','canceled')
    or p_payment_intent is distinct from a.payment_intent or p_amount is distinct from a.requested_cents or p_currency is distinct from 'usd'
    or (a.provider_refund_id is not null and a.provider_refund_id<>p_provider_id) then return false; end if;
  select * into p from public.payments where id=a.payment_id and account_id=a.account_id for share;
  if not found or p.stripe_payment_intent is distinct from a.payment_intent or p.amount is null or round(p.amount*100)<>a.payment_amount_cents
    or (to_jsonb(p)?'charge_model' and coalesce(to_jsonb(p)->>'charge_model','')<>'destination') then return false; end if;
  -- Terminal negative evidence wins over older reads. Uncertain observations
  -- cannot reopen an accounted attempt or authorize another provider call.
  if a.provider_status in ('failed','canceled') and p_status not in ('failed','canceled') then return true; end if;
  if a.state='accounted' and p_status in ('pending','requires_action') then return true; end if;
  if p_status='succeeded' then
    if p.status not in ('paid','refunded') or round(coalesce(p.refunded_amount,0)*100)<a.already_refunded_cents+a.requested_cents then return false; end if;
    if a.state='accounted' then return true; end if;
    update public.extra_stop_requests set refund_cents=a.requested_cents
      where id=a.quick_stop_id and account_id=a.account_id and payment_id=a.payment_id
      and cancellation_refund_requested_cents=a.requested_cents
      and status in ('customer_canceled','contractor_canceled','no_show_confirmed','refunded');
    if not found then
      update public.quick_stop_cancellation_refund_attempts set state='manual_review',provider_refund_id=p_provider_id,provider_status=p_status where id=a.id;
      return true;
    end if;
    update public.quick_stop_cancellation_refund_attempts set state='accounted',provider_refund_id=p_provider_id,provider_status=p_status,completed_at=clock_timestamp() where id=a.id;
  else
    if p_status in ('failed','canceled') and a.state='accounted' then
      update public.extra_stop_requests set refund_cents=0 where id=a.quick_stop_id and account_id=a.account_id
        and payment_id=a.payment_id and refund_cents=a.requested_cents;
    end if;
    update public.quick_stop_cancellation_refund_attempts set provider_refund_id=p_provider_id,provider_status=p_status,
      state=case when p_status in ('failed','canceled','requires_action') then 'manual_review' else state end
      where id=a.id;
  end if;
  return true;
end $$;
revoke all on function public.reconcile_quick_stop_cancellation_refund(uuid,uuid,uuid,text,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.reconcile_quick_stop_cancellation_refund(uuid,uuid,uuid,text,text,text,bigint,text) to service_role;

create or replace function public.observe_quick_stop_cancellation_refund(p_account_id uuid,p_id uuid,p_provider_id text,p_status text,p_payment_intent text,p_amount bigint,p_currency text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare a public.quick_stop_cancellation_refund_attempts;
begin
  select * into a from public.quick_stop_cancellation_refund_attempts where id=p_id and account_id=p_account_id for update;
  if not found then return false; end if;
  if p_provider_id is null or p_provider_id !~ '^re_[A-Za-z0-9_]+$'
    or p_status is null or p_status not in ('pending','requires_action','succeeded','failed','canceled')
    or p_payment_intent is distinct from a.payment_intent or p_amount is distinct from a.requested_cents or p_currency is distinct from 'usd'
    or (a.provider_refund_id is not null and a.provider_refund_id<>p_provider_id) then return false; end if;
  -- A late SDK response must not overwrite a stronger verified webhook result.
  if a.state='accounted' then
    if p_status in ('failed','canceled') then
      update public.quick_stop_cancellation_refund_attempts set state='manual_review',provider_status=p_status where id=a.id;
      update public.extra_stop_requests set refund_cents=0 where id=a.quick_stop_id and account_id=a.account_id
        and payment_id=a.payment_id and refund_cents=a.requested_cents;
    end if;
    return a.provider_refund_id=p_provider_id;
  end if;
  if a.provider_status in ('failed','canceled') or a.state<>'submitting' then return false; end if;
  update public.quick_stop_cancellation_refund_attempts set provider_refund_id=p_provider_id,provider_status=p_status where id=a.id;
  return true;
end $$;
revoke all on function public.observe_quick_stop_cancellation_refund(uuid,uuid,text,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.observe_quick_stop_cancellation_refund(uuid,uuid,text,text,text,bigint,text) to service_role;

create or replace function public.finish_quick_stop_cancellation_refund(p_account_id uuid,p_id uuid,p_accounted boolean)
returns boolean language plpgsql security invoker set search_path='' as $$
declare a public.quick_stop_cancellation_refund_attempts;
begin
  select * into a from public.quick_stop_cancellation_refund_attempts where id=p_id and account_id=p_account_id for update;
  if not found then return false; end if;
  if a.state='accounted' then return true; end if;
  if a.state<>'submitting' then return false; end if;
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
notify pgrst,'reload schema';
