-- Paid Voice must deliver the invoice's minutes even when this workspace
-- already has a base-plan/canary allowance. Exact invoice attribution also
-- keeps its refund from consuming a different subscription's allowance.
begin;

-- No active paid Voice subscriptions existed at this production rollout.
-- Stop if that prerequisite changes: importing a live aggregate grant needs
-- explicit reconciliation before switching its renewal basis.
do $$ begin
  if exists(select 1 from public.workspace_purchased_capacity where resource_code='voice_minutes'
    and status<>'canceled' and metadata->>'lgq_checkout_session_id' is not null) then
    raise exception 'paid_voice_existing_subscription_requires_reconciliation';
  end if;
end $$;
update public.workspace_purchased_capacity
  set metadata=metadata||'{"voice_allowance_basis":"legacy_base_period"}'::jsonb
  where resource_code='voice_minutes';

create function public.grant_paid_voice_addon_period(p_livemode boolean,p_contract jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_op public.billing_top_up_purchase_operations%rowtype;
  v_capacity public.workspace_purchased_capacity%rowtype;
  v_account uuid:=(p_contract->>'account_id')::uuid;
  v_start timestamptz:=(p_contract->>'period_start')::timestamptz;
  v_end timestamptz:=(p_contract->>'period_end')::timestamptz;
  v_invoice text:=p_contract->>'invoice_id';
  v_key text;
  v_existing public.usage_credit_lots%rowtype;
begin
  select * into strict v_op from public.billing_top_up_purchase_operations
    where account_id=v_account and livemode=p_livemode and state='checkout_created'
      and provider_object_id=p_contract->>'checkout_session_id';
  select * into strict v_capacity from public.workspace_purchased_capacity
    where account_id=v_account and livemode=p_livemode
      and stripe_subscription_id=p_contract->>'subscription_id' for update;
  if v_op.top_up_id not in ('ai_voice_flex','ai_voice_solo','ai_voice_growth')
    or v_op.top_up_id is distinct from p_contract->>'top_up_id'
    or v_op.stripe_price_id is distinct from p_contract->>'price_id'
    or v_op.resource_code<>'voice_minutes' or v_capacity.resource_code<>'voice_minutes'
    or v_capacity.top_up_id<>v_op.top_up_id or v_capacity.units<>v_op.units
    or v_capacity.metadata->>'lgq_checkout_session_id' is distinct from v_op.provider_object_id
    or v_invoice is null or v_invoice !~ '^in_[A-Za-z0-9]+$'
    or v_start is null or v_end is null or v_end<=v_start
    or v_capacity.current_period_end is distinct from v_end then
    raise exception 'paid_voice_contract_mismatch' using errcode='22023';
  end if;
  perform 1 from public.workspace_entitlements where account_id=v_account and entitlement_state<>'archived' for update;
  if not found then raise exception 'paid_voice_entitlement_unavailable' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_account::text||':voice_minutes',0));
  v_key:='voice-addon-invoice:v1:'||p_livemode::text||':'||v_invoice;
  select * into v_existing from public.usage_credit_lots where account_id=v_account and resource_code='voice_minutes' and idempotency_key=v_key;
  if found then
    if v_existing.granted_units<>v_op.units
      or v_existing.metadata->>'lgq_subscription_id' is distinct from v_capacity.stripe_subscription_id
      or v_existing.metadata->>'lgq_checkout_session_id' is distinct from v_op.provider_object_id
      or (v_existing.metadata->>'period_start')::timestamptz is distinct from v_start
      or (v_existing.metadata->>'period_end')::timestamptz is distinct from v_end then
      raise exception 'paid_voice_invoice_identity_conflict' using errcode='22000';
    end if;
    return v_existing.id;
  end if;
  if v_capacity.status<>'active' then raise exception 'paid_voice_subscription_inactive' using errcode='22023'; end if;
  return public.grant_usage_credits(p_account_id=>v_account,p_resource_code=>'voice_minutes',p_units=>v_op.units,
    p_source_type=>'voice_addon',p_idempotency_key=>v_key,p_catalog_version=>v_capacity.catalog_version,
    p_available_from=>v_start,p_expires_at=>v_end+public.voice_minute_lot_tail(),
    p_metadata=>pg_catalog.jsonb_build_object('schema','paid-voice-invoice.v1','lgq_invoice_id',v_invoice,
      'lgq_subscription_id',v_capacity.stripe_subscription_id,'lgq_checkout_session_id',v_op.provider_object_id,
      'period_start',v_start,'period_end',v_end,'purchased_minutes',v_op.units));
end $$;
revoke all on function public.grant_paid_voice_addon_period(boolean,jsonb) from public,anon,authenticated;
grant execute on function public.grant_paid_voice_addon_period(boolean,jsonb) to service_role;

-- Preserve the legacy overlap guard and included/canary allowance, while
-- real checkout purchases are granted only from a verified paid invoice.
do $$
declare v_before text; v_after text;
begin
  v_before:=pg_get_functiondef('public.grant_voice_minute_allowance(uuid,timestamptz,timestamptz)'::regprocedure);
  v_after:=replace(v_before, 'and l.source_type = ''voice_addon''',
    'and l.source_type = ''voice_addon'' and l.metadata->>''lgq_invoice_id'' is null');
  v_after:=replace(v_after, 'and c.status = ''active'';',
    'and c.status = ''active'' and c.billing_event_id is null and c.metadata->>''lgq_checkout_session_id'' is null;');
  if v_after=v_before or v_after not like '%lgq_invoice_id%' or v_after not like '%c.billing_event_id is null%' then
    raise exception 'voice_allowance_source_contract_drift';
  end if;
  execute v_after;
end $$;

-- Prefer the exact paid invoice lot. Legacy aggregate allowances remain
-- readable for historical refunds, but may never match an invoice-owned lot.
do $$
declare v_before text; v_after text; v_old text; v_new text;
begin
  v_before:=pg_get_functiondef('public.apply_addon_refund(uuid,uuid,jsonb)'::regprocedure);
  v_old:=$old$      -- Allowance windows follow the base workspace period, not invoice line
      -- boundaries. The window containing the paid service start owns this grant.$old$;
  v_new:=$new$      select * into v_lot from public.usage_credit_lots where account_id=v_account and resource_code='voice_minutes'
        and source_type='voice_addon' and metadata->>'lgq_invoice_id'=v_invoice
        and metadata->>'lgq_subscription_id'=v_sub and metadata->>'lgq_checkout_session_id'=v_session for update;
      if found then
        if v_lot.granted_units<>v_op.units or (v_lot.metadata->>'period_start')::timestamptz is distinct from v_start
          or (v_lot.metadata->>'period_end')::timestamptz is distinct from v_end then
          raise exception 'refund_invoice_grant_identity_conflict' using errcode='22023';
        end if;
      else
        if v_capacity.metadata->>'voice_allowance_basis' is distinct from 'legacy_base_period' then
          raise exception 'refund_credit_grant_not_resolved' using errcode='P0002';
        end if;$new$;
  if strpos(v_before,v_old)=0 then raise exception 'refund_voice_source_contract_drift'; end if;
  v_after:=replace(v_before,v_old,v_new);
  v_after:=replace(v_after,'and source_type=''voice_addon'' and (metadata->>''period_start'')',
    'and source_type=''voice_addon'' and metadata->>''lgq_invoice_id'' is null and (metadata->>''period_start'')');
  v_old:=$old$        raise exception 'refund_allowance_attribution_ambiguous' using errcode='22023';
      end if;$old$;
  if strpos(v_after,v_old)=0 then raise exception 'refund_voice_end_contract_drift'; end if;
  v_after:=replace(v_after,v_old,v_old||E'\n      end if;');
  execute v_after;
end $$;
commit;
