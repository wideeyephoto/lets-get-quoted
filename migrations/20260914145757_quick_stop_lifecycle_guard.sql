-- Scheduling can close while refunds/disputes remain open. This predicate mirrors
-- QUICK_STOP_TRANSITIONS and protects every writer, including older webhooks.
create or replace function public.quick_stop_can_transition(p_from text, p_to text)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select p_to = any(case p_from
    when 'requested' then array['awaiting_contractor','contractor_declined']
    when 'awaiting_contractor' then array['contractor_offer_sent','awaiting_customer_payment','more_information_requested','contractor_declined','offer_expired']
    when 'more_information_requested' then array['awaiting_contractor','contractor_offer_sent','awaiting_customer_payment','contractor_declined','offer_expired']
    when 'contractor_declined' then array['refunded']
    when 'contractor_offer_sent' then array['awaiting_customer_payment','offer_expired','customer_declined','contractor_canceled']
    when 'awaiting_customer_payment' then array['confirmed','offer_expired','customer_declined','customer_canceled','contractor_canceled']
    when 'offer_expired' then array['refunded']
    when 'customer_declined' then array['refunded']
    when 'confirmed' then array['en_route','arrived','completed','customer_canceled','contractor_canceled','no_show_confirmed','refunded','disputed']
    when 'en_route' then array['arrived','completed','customer_canceled','contractor_canceled','no_show_confirmed','refunded','disputed']
    when 'arrived' then array['completed','customer_canceled','contractor_canceled','refunded','disputed']
    when 'completed' then array['no_show_confirmed','refunded','disputed']
    when 'customer_canceled' then array['refunded','disputed']
    when 'contractor_canceled' then array['refunded','disputed']
    when 'no_show_reported' then array['no_show_confirmed','completed','refunded','disputed']
    when 'no_show_confirmed' then array['refunded','disputed']
    when 'refunded' then array['disputed']
    when 'disputed' then array['refunded','completed','no_show_confirmed']
    else array[]::text[] end);
$$;
revoke all on function public.quick_stop_can_transition(text,text) from public, anon;
grant execute on function public.quick_stop_can_transition(text,text) to authenticated, service_role;

create or replace function public.enforce_quick_stop_transition()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if current_user = 'authenticated' and (
      new.status not in ('requested','awaiting_contractor')
      or new.job_id is not null or new.payment_id is not null or new.paid_at is not null
      or coalesce(new.refund_cents,0) <> 0 or new.refund_due_cents is not null
      or new.refund_state <> 'none'
      or new.no_show_confirmed_at is not null or new.no_show_reported_at is not null
    ) then
      raise exception 'Quick Stop booking and payment state is server managed' using errcode = '42501';
    end if;
    return new;
  end if;
  -- Office users can advance field-work states, but payment/refund evidence and
  -- enforcement outcomes are written only by the authorized server operations.
  if current_user = 'authenticated' and (
    new.account_id is distinct from old.account_id
    or new.job_id is distinct from old.job_id
    or new.arrival_date is distinct from old.arrival_date
    or new.arrival_start is distinct from old.arrival_start
    or new.arrival_end is distinct from old.arrival_end
    or new.fee_cents is distinct from old.fee_cents
    or new.diagnostic_fee_cents is distinct from old.diagnostic_fee_cents
    or new.payment_id is distinct from old.payment_id
    or new.paid_at is distinct from old.paid_at
    or new.refund_cents is distinct from old.refund_cents
    or new.refund_due_cents is distinct from old.refund_due_cents
    or new.refund_state is distinct from old.refund_state
    or new.no_show_confirmed_at is distinct from old.no_show_confirmed_at
    or new.no_show_reported_at is distinct from old.no_show_reported_at
    or (new.status is distinct from old.status and new.status not in
      ('contractor_declined','more_information_requested','en_route','arrived','completed'))
    or (new.status is distinct from old.status and old.status in
      ('disputed','refunded','no_show_reported','no_show_confirmed'))
  ) then
    raise exception 'Quick Stop payment and enforcement state is server managed' using errcode = '42501';
  end if;
  if new.status is distinct from old.status
    and not public.quick_stop_can_transition(old.status, new.status) then
    raise exception 'Quick Stop cannot move from % to %', old.status, new.status using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_quick_stop_transition() from public, anon, authenticated;
drop trigger if exists extra_stop_lifecycle_guard on public.extra_stop_requests;
create trigger extra_stop_lifecycle_guard before insert or update on public.extra_stop_requests
for each row execute function public.enforce_quick_stop_transition();

create index if not exists extra_stop_interrupted_offer_idx on public.extra_stop_requests(updated_at,id)
  where status = 'contractor_offer_sent';
