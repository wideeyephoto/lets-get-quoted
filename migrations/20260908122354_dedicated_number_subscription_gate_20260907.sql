-- Included primary-number policy, not a new number subscription or SMS wallet.
-- Requires the existing verified base-plan / recurring-capacity projectors.
-- Only new provider authority is gated: paid receipts and reconciliation survive.
begin;

alter table public.billing_subscriptions add column messaging_grace_started_at timestamptz;
alter table public.workspace_purchased_capacity add column messaging_grace_started_at timestamptz;

-- Repeated failed invoices/sweeps must not restart the seven-day clock.
create function public.track_messaging_subscription_grace()
returns trigger language plpgsql set search_path = '' set timezone = 'UTC' as $$
declare failing boolean; first_failure timestamptz;
begin
  if tg_table_name = 'billing_subscriptions' then
    failing := new.status = 'past_due' or (new.latest_invoice_status = 'open'
      and new.latest_invoice_event_type in ('invoice.payment_failed','invoice.payment_action_required'));
    first_failure := least(coalesce(new.last_payment_failed_at, new.provider_state_event_created_at,
      new.current_period_start, clock_timestamp()), clock_timestamp());
  else
    failing := new.status = 'past_due';
    first_failure := least(coalesce(new.current_period_end, clock_timestamp()), clock_timestamp());
  end if;
  if failing then
    new.messaging_grace_started_at := case when tg_op = 'UPDATE'
      then coalesce(old.messaging_grace_started_at, first_failure) else first_failure end;
  else
    new.messaging_grace_started_at := null;
  end if;
  return new;
end;
$$;
revoke all on function public.track_messaging_subscription_grace() from public,anon,authenticated,service_role;
-- Conservative existing-state anchors; no new free week on migration day.
update public.billing_subscriptions set messaging_grace_started_at = least(
    last_payment_failed_at,current_period_start,provider_state_event_created_at,clock_timestamp())
  where status = 'past_due' or (latest_invoice_status = 'open'
    and latest_invoice_event_type in ('invoice.payment_failed','invoice.payment_action_required'));
update public.workspace_purchased_capacity set messaging_grace_started_at = least(current_period_end,updated_at,clock_timestamp()) where status = 'past_due';
create trigger messaging_subscription_grace before insert or update on public.billing_subscriptions
  for each row execute function public.track_messaging_subscription_grace();
create trigger messaging_capacity_grace before insert or update on public.workspace_purchased_capacity
  for each row execute function public.track_messaging_subscription_grace();

create function public.messaging_primary_number_entitlement(p_account_id uuid, p_livemode boolean)
returns jsonb language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare e record; s record; c record; paid boolean := false; until_at timestamptz; now_at timestamptz := clock_timestamp();
begin
  if p_account_id is null or p_livemode is null then
    return jsonb_build_object('entitled',false,'source','none','reason','invalid_scope');
  end if;
  if not exists(select 1 from public.accounts where id=p_account_id and suspended_at is null) then
    return jsonb_build_object('entitled',false,'source','none','reason','account_unavailable');
  end if;
  select * into e from public.workspace_entitlements where account_id=p_account_id;
  if not found or e.entitlement_state not in ('active','grace') or e.catalog_version <> '2026-08-18-preview' then
    return jsonb_build_object('entitled',false,'source','none','reason','subscription_required');
  end if;
  if e.plan_code in ('solo','growth','scale') then
    -- A browser flag, account label or trial cannot substitute for the immutable
    -- activated Checkout operation bound by the verified Stripe projector.
    select b.* into s from public.billing_subscriptions b
      where b.account_id=p_account_id and b.livemode=p_livemode and b.provider='stripe'
        -- Agreement versions are immutable evidence; current workspace limits
        -- may legitimately have advanced since the original paid agreement.
        and b.plan_code=e.plan_code and b.catalog_version in ('2026-08-15-preview','2026-08-18-preview')
        and b.status in ('active','past_due')
        and b.current_period_end=e.period_end and b.current_period_start=e.period_start
      order by b.created_at desc limit 1 for share;
    if found then
      -- The projector deliberately uses the same metadata key for two ledgers.
      -- Never confuse a paid initial Checkout with an unactivated plan change.
      if coalesce(s.metadata->>'operation_source','checkout')='checkout' then
        select exists(select 1 from public.billing_subscription_checkout_operations o
          where o.id::text=s.metadata->>'checkout_operation_pk' and o.account_id=s.account_id
            and o.livemode=s.livemode and o.plan_code=s.plan_code and o.catalog_version=s.catalog_version
            and o.provider_customer_id=s.provider_customer_id and o.state='activated'
            and o.metadata->>'provider_subscription_id'=s.provider_subscription_id) into paid;
      elsif s.metadata->>'operation_source'='plan_change'
        and to_regclass('public.billing_subscription_plan_change_operations') is not null then
        select exists(select 1 from public.billing_subscription_plan_change_operations o
          where o.id::text=s.metadata->>'checkout_operation_pk' and o.account_id=s.account_id
            and o.livemode=s.livemode and o.plan_code=s.plan_code and o.catalog_version=s.catalog_version
            and o.provider_customer_id=s.provider_customer_id and o.provider_subscription_id=s.provider_subscription_id
            and o.state='activated') into paid;
      end if;
      if not paid then return jsonb_build_object('entitled',false,'source','none','reason','subscription_required'); end if;
      until_at := least(s.current_period_end, coalesce(s.cancel_at,s.current_period_end));
      if e.billing_status='past_due' or s.messaging_grace_started_at is not null then
        -- Stripe may advance its period while collection is still failing.
        until_at := s.messaging_grace_started_at + interval '7 days';
        if until_at is not null then until_at := least(until_at, coalesce(s.cancel_at,until_at)); end if;
      elsif e.billing_status <> 'active' or s.status <> 'active'
        or s.latest_invoice_status='uncollectible' then
        until_at := null;
      end if;
      if until_at is not null and until_at > now_at then
        return jsonb_build_object('entitled',true,'source','base_plan','plan_code',e.plan_code,
          'primary_numbers',1,'valid_until',until_at,'grace_until',s.messaging_grace_started_at + interval '7 days');
      end if;
    end if;
  elsif e.plan_code='flex' and e.billing_status='free' then
    -- Exact recurring SKU; a one-time minute pack, another tier's discounted
    -- Voice SKU or test purchase is not a Flex primary-number subscription.
    select capacity.* into c from public.workspace_purchased_capacity capacity
      join public.billing_events receipt on receipt.id=capacity.billing_event_id
        and receipt.account_id=capacity.account_id and receipt.livemode=capacity.livemode
        and receipt.processing_status='processed' and receipt.event_scope='platform_top_up'
      where capacity.account_id=p_account_id and capacity.livemode=p_livemode and capacity.top_up_id='ai_voice_flex'
        and capacity.resource_code='voice_minutes' and capacity.units=100 and capacity.unit_amount_cents=6900
        and capacity.catalog_version=e.catalog_version and capacity.status in ('active','past_due')
      order by capacity.current_period_end desc nulls last limit 1 for share of capacity;
    if found then
      until_at := case when c.status='active' then c.current_period_end
        else c.messaging_grace_started_at + interval '7 days' end;
      if until_at is not null and until_at > now_at then
        return jsonb_build_object('entitled',true,'source','flex_voice','plan_code','flex',
          'primary_numbers',1,'valid_until',until_at,'grace_until',c.messaging_grace_started_at + interval '7 days');
      end if;
    end if;
  end if;
  -- Enterprise/extra-line order forms need their own reviewed grant, not a guess.
  return jsonb_build_object('entitled',false,'source','none','reason','subscription_required');
end;
$$;
revoke all on function public.messaging_primary_number_entitlement(uuid,boolean) from public,anon,authenticated;
grant execute on function public.messaging_primary_number_entitlement(uuid,boolean) to service_role;

create function public.require_messaging_primary_number_entitlement(p_account_id uuid,p_livemode boolean)
returns void language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
begin
  if (public.messaging_primary_number_entitlement(p_account_id,p_livemode)->>'entitled')::boolean is not true then
    raise exception 'Qualifying dedicated-number subscription required' using errcode='P5106';
  end if;
end;
$$;
revoke all on function public.require_messaging_primary_number_entitlement(uuid,boolean) from public,anon,authenticated,service_role;

create function public.guard_messaging_commercial_operation()
returns trigger language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare account uuid; needed boolean := false;
begin
  if tg_table_name='messaging_setup_orders' then
    if new.checkout_started_at is not null and old.checkout_started_at is null then
      perform public.require_messaging_primary_number_entitlement(new.account_id,new.livemode);
    end if;
    return new;
  elsif tg_table_name='messaging_managed_registration_operations' then
    -- Only INSERT can authorize a managed POST; later receipt/poll writes stay open.
    perform public.require_messaging_primary_number_entitlement(new.account_id,true);
    return new;
  elsif tg_table_name='sms_delivery_tasks' then
    if new.request_started_at is not null and old.request_started_at is null then
      select account_id, sender_purpose='contractor_dedicated' into account,needed
        from public.sms_events where id=new.sms_event_id;
      if needed then perform public.require_messaging_primary_number_entitlement(account,true); end if;
    end if;
    return new;
  end if;

  -- Claim and pre-egress recheck. Receipt completion is deliberately not gated.
  needed := tg_op='INSERT';
  if tg_op='UPDATE' then needed := new.state in ('claimed','request_started') and new.state is distinct from old.state; end if;
  if needed then
    perform public.require_messaging_primary_number_entitlement(new.account_id,true);
    if new.operation_type='purchase_number' then
      -- Serialize primary-number claims even across different applications.
      perform pg_advisory_xact_lock(hashtextextended('messaging-primary:'||new.account_id::text,0));
      if exists(select 1 from public.sms_sender_numbers where account_id=new.account_id
          and purpose='contractor_dedicated' and provisioning_status<>'released')
        or exists(select 1 from public.messaging_number_provisioning_operations where account_id=new.account_id
          and id<>new.id and operation_type='purchase_number'
          and state in ('pending','claimed','request_started','indeterminate','succeeded')) then
        raise exception 'Primary number already owned or reserved; extra lines require a reviewed quote' using errcode='P5107';
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_messaging_commercial_operation() from public,anon,authenticated,service_role;
create trigger messaging_commercial_checkout before update on public.messaging_setup_orders
  for each row execute function public.guard_messaging_commercial_operation();
create trigger messaging_commercial_registry before insert on public.messaging_managed_registration_operations
  for each row execute function public.guard_messaging_commercial_operation();
create trigger messaging_commercial_number before insert or update on public.messaging_number_provisioning_operations
  for each row execute function public.guard_messaging_commercial_operation();
create trigger messaging_commercial_sms before update on public.sms_delivery_tasks
  for each row execute function public.guard_messaging_commercial_operation();

-- These unused defaults were never approved. Do not rewrite historical values,
-- create a subscription, alter credit balances or mark any number released.
alter table public.accounts alter column dedicated_number_monthly_cents set default 0;
alter table public.accounts alter column dedicated_number_allowance_segments set default 0;
comment on column public.accounts.dedicated_number_monthly_cents is 'Legacy unused prototype; primary number comes from base-plan/Flex Voice subscription. Not billing authority.';
comment on column public.accounts.dedicated_number_allowance_segments is 'Legacy unused prototype; existing workspace SMS credit ledger is authoritative.';
commit;

;
