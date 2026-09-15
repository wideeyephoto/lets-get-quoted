-- Durable, platform-only add-on refund reconciliation. No browser grants.
-- Successful refund totals are cumulative per charge. Used/held voice minutes
-- become debt collected from future grants or released holds, never negative lots.
begin;

create table public.addon_refund_jobs (
  id uuid primary key default gen_random_uuid(),
  livemode boolean not null,
  charge_id text not null check (charge_id ~ '^(ch|py)_[A-Za-z0-9]+$'),
  state text not null default 'pending' check (state in ('pending','processing','complete','ignored','review')),
  revision bigint not null default 1,
  claimed_revision bigint,
  claim_token uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (livemode,charge_id)
);
create index addon_refund_jobs_due_idx on public.addon_refund_jobs(next_attempt_at,id)
  where state in ('pending','processing');
create table public.addon_refund_events (
  livemode boolean not null,
  event_id text not null check (event_id ~ '^evt_[A-Za-z0-9]+$'),
  charge_id text not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key(livemode,event_id)
);
create table public.addon_refund_reversals (
  id uuid primary key default gen_random_uuid(),
  livemode boolean not null,
  charge_id text not null,
  account_id uuid not null references public.accounts(id) on delete restrict,
  checkout_session_id text not null,
  subscription_id text,
  invoice_id text,
  top_up_id text not null,
  resource_code text not null,
  purchased_units bigint not null check (purchased_units>0),
  charge_amount bigint not null check (charge_amount>0),
  refunded_amount bigint not null default 0 check (refunded_amount>=0 and refunded_amount<=charge_amount),
  reversed_units bigint not null default 0 check (reversed_units>=0 and reversed_units<=purchased_units),
  revoked_units bigint not null default 0 check (revoked_units>=0),
  debt_units bigint not null default 0 check (debt_units>=0),
  debt_remaining bigint not null default 0 check (debt_remaining>=0 and debt_remaining<=debt_units),
  period_start timestamptz,
  period_end timestamptz,
  cancel_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(livemode,charge_id),
  check (resource_code<>'voice_minutes' or reversed_units=revoked_units+debt_units),
  check ((period_start is null and period_end is null) or period_end>period_start)
);
create index addon_refund_debt_idx on public.addon_refund_reversals(account_id,resource_code,created_at,id)
  where debt_remaining>0;
create index addon_refund_capacity_idx on public.addon_refund_reversals(livemode,subscription_id,period_end)
  where subscription_id is not null;
create table public.addon_refund_debt_offsets (
  reversal_id uuid not null references public.addon_refund_reversals(id) on delete restrict,
  credit_lot_id uuid not null references public.usage_credit_lots(id) on delete restrict,
  units bigint not null check (units>0),
  created_at timestamptz not null default now(),
  primary key(reversal_id,credit_lot_id)
);

alter table public.addon_refund_jobs enable row level security;
alter table public.addon_refund_events enable row level security;
alter table public.addon_refund_reversals enable row level security;
alter table public.addon_refund_debt_offsets enable row level security;
revoke all on public.addon_refund_jobs,public.addon_refund_events,public.addon_refund_reversals,public.addon_refund_debt_offsets from public,anon,authenticated;
grant select,insert,update on public.addon_refund_jobs,public.addon_refund_events,public.addon_refund_reversals,public.addon_refund_debt_offsets to service_role;
-- SECURITY INVOKER needs only these existing-column privileges. updated_at is
-- granted solely to acquire the shared entitlement row lock (FOR UPDATE needs
-- UPDATE on at least one column); the refund code does not rewrite entitlements.
grant update(updated_at) on public.workspace_entitlements to service_role;
grant update(updated_at) on public.workspace_purchased_capacity to service_role;
grant update(revoked_units) on public.usage_credit_lots to service_role;

create function public.ingest_addon_refund_event(p_livemode boolean,p_event_id text,p_charge_id text,p_payload_sha256 text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_row public.addon_refund_events%rowtype; v_inserted boolean;
begin
  insert into public.addon_refund_events(livemode,event_id,charge_id,payload_sha256)
    values(p_livemode,p_event_id,p_charge_id,p_payload_sha256) on conflict do nothing;
  v_inserted:=found;
  select * into strict v_row from public.addon_refund_events where livemode=p_livemode and event_id=p_event_id;
  if v_row.charge_id is distinct from p_charge_id or v_row.payload_sha256 is distinct from p_payload_sha256 then
    raise exception 'refund_event_identity_conflict' using errcode='22000';
  end if;
  if v_inserted then
    insert into public.addon_refund_jobs(livemode,charge_id) values(p_livemode,p_charge_id)
    on conflict(livemode,charge_id) do update set
      revision=addon_refund_jobs.revision+1,
      state=case when addon_refund_jobs.state='processing' then 'processing' else 'pending' end,
      next_attempt_at=now(),updated_at=now();
  end if;
  return v_inserted;
end $$;

create function public.claim_addon_refund_job(p_livemode boolean)
returns setof public.addon_refund_jobs language plpgsql security invoker set search_path='' as $$
declare v_id uuid;
begin
  select id into v_id from public.addon_refund_jobs
    where livemode=p_livemode and ((state='pending' and next_attempt_at<=now()) or (state='processing' and lease_expires_at<=now()))
    order by next_attempt_at,id for update skip locked limit 1;
  if v_id is null then return; end if;
  return query update public.addon_refund_jobs set state='processing',claim_token=gen_random_uuid(),
    claimed_revision=revision,lease_expires_at=now()+interval '5 minutes',attempts=attempts+1,updated_at=now()
    where id=v_id returning *;
end $$;

create function public.finish_addon_refund_job(p_job_id uuid,p_claim_token uuid,p_state text,p_error text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if p_state not in ('pending','complete','ignored','review') or (p_error is not null and p_error !~ '^[a-z][a-z0-9_]{2,63}$') then
    raise exception 'refund_finish_invalid' using errcode='22023';
  end if;
  update public.addon_refund_jobs set
    state=case when revision<>claimed_revision then 'pending' else p_state end,
    next_attempt_at=case when revision<>claimed_revision then now() else now()+interval '5 minutes' end,
    claim_token=null,lease_expires_at=null,last_error=p_error,updated_at=now()
    where id=p_job_id and state='processing' and claim_token=p_claim_token and lease_expires_at>now();
  return found;
end $$;

-- The existing grant/reserve/commit functions use this same workspace/resource
-- advisory lock. An allocation's reserved units are never stolen by a refund.
create function public.collect_addon_refund_debt()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_free bigint; v_take bigint; v_debt record;
begin
  if new.resource_code<>'voice_minutes' then return new; end if;
  if tg_op='UPDATE' and new.reserved_units>=old.reserved_units then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.account_id::text||':'||new.resource_code,0));
  v_free:=new.granted_units-new.consumed_units-new.reserved_units-new.revoked_units;
  for v_debt in select id,debt_remaining from public.addon_refund_reversals
    where account_id=new.account_id and resource_code=new.resource_code and debt_remaining>0
    order by created_at,id for update loop
    exit when v_free<=0;
    v_take:=least(v_free,v_debt.debt_remaining);
    update public.usage_credit_lots set revoked_units=revoked_units+v_take where id=new.id;
    update public.addon_refund_reversals set debt_remaining=debt_remaining-v_take,updated_at=now() where id=v_debt.id;
    insert into public.addon_refund_debt_offsets(reversal_id,credit_lot_id,units) values(v_debt.id,new.id,v_take)
      on conflict(reversal_id,credit_lot_id) do update set units=addon_refund_debt_offsets.units+excluded.units;
    v_free:=v_free-v_take;
  end loop;
  return new;
end $$;
create trigger collect_addon_refund_debt_insert after insert on public.usage_credit_lots
  for each row execute function public.collect_addon_refund_debt();
create trigger collect_addon_refund_debt_release after update of reserved_units on public.usage_credit_lots
  for each row execute function public.collect_addon_refund_debt();

create function public.apply_addon_refund(p_job_id uuid,p_claim_token uuid,p_contract jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_job public.addon_refund_jobs%rowtype;
  v_op public.billing_top_up_purchase_operations%rowtype;
  v_row public.addon_refund_reversals%rowtype;
  v_capacity public.workspace_purchased_capacity%rowtype;
  v_lot public.usage_credit_lots%rowtype;
  v_account uuid:=(p_contract->>'account_id')::uuid;
  v_session text:=p_contract->>'checkout_session_id';
  v_sub text:=p_contract->>'subscription_id';
  v_invoice text:=p_contract->>'invoice_id';
  v_start timestamptz:=(p_contract->>'period_start')::timestamptz;
  v_end timestamptz:=(p_contract->>'period_end')::timestamptz;
  v_amount bigint:=(p_contract->>'charge_amount')::bigint;
  v_refunded bigint:=(p_contract->>'refunded_amount')::bigint;
  v_target bigint; v_delta bigint; v_take bigint:=0; v_count bigint;
begin
  select * into strict v_job from public.addon_refund_jobs where id=p_job_id for update;
  if v_job.state<>'processing' or v_job.claim_token is distinct from p_claim_token or v_job.lease_expires_at<=now() then
    raise exception 'refund_claim_lost' using errcode='40001';
  end if;
  select * into strict v_op from public.billing_top_up_purchase_operations
    where account_id=v_account and livemode=v_job.livemode and provider_object_id=v_session and state='checkout_created';
  if v_op.top_up_id not in ('voice_minutes_100','ai_voice_flex','ai_voice_solo','ai_voice_growth','storage_100gb','office_user')
    or v_op.top_up_id is distinct from p_contract->>'top_up_id'
    or v_op.stripe_price_id is distinct from p_contract->>'price_id'
    or v_amount is null or v_amount<=0 or v_refunded is null or v_refunded<0 or v_refunded>v_amount then
    raise exception 'refund_contract_mismatch' using errcode='22023';
  end if;
  -- Match the subscription through the durable purchase, never an email or amount.
  if v_op.top_up_id<>'voice_minutes_100' then
    select * into strict v_capacity from public.workspace_purchased_capacity
      where account_id=v_account and livemode=v_job.livemode and stripe_subscription_id=v_sub and top_up_id=v_op.top_up_id for update;
    if v_invoice is null or v_invoice !~ '^in_[A-Za-z0-9]+$' or v_start is null or v_end is null or v_end<=v_start then
      raise exception 'refund_period_invalid' using errcode='22023';
    end if;
  elsif v_sub is not null or v_invoice is not null then
    raise exception 'refund_one_off_identity_invalid' using errcode='22023';
  end if;
  perform 1 from public.workspace_entitlements where account_id=v_account for update;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_account::text||':'||v_op.resource_code,0));
  insert into public.addon_refund_reversals(livemode,charge_id,account_id,checkout_session_id,subscription_id,invoice_id,
    top_up_id,resource_code,purchased_units,charge_amount,period_start,period_end)
    values(v_job.livemode,v_job.charge_id,v_account,v_session,v_sub,v_invoice,v_op.top_up_id,v_op.resource_code,v_op.units,v_amount,v_start,v_end)
    on conflict(livemode,charge_id) do nothing;
  select * into strict v_row from public.addon_refund_reversals where livemode=v_job.livemode and charge_id=v_job.charge_id for update;
  if v_row.account_id<>v_account or v_row.checkout_session_id<>v_session or v_row.subscription_id is distinct from v_sub
    or v_row.invoice_id is distinct from v_invoice or v_row.charge_amount<>v_amount
    or v_row.period_start is distinct from v_start or v_row.period_end is distinct from v_end then
    raise exception 'refund_identity_conflict' using errcode='22000';
  end if;
  -- A stale provider read cannot undo a newer successful refund.
  v_refunded:=greatest(v_refunded,v_row.refunded_amount);
  v_target:=pg_catalog.floor(v_op.units::numeric*v_refunded/v_amount)::bigint;
  v_delta:=v_target-v_row.reversed_units;
  if v_delta>0 and v_op.resource_code='voice_minutes' then
    if v_sub is null then
      select count(*) into v_count from public.usage_credit_lots where account_id=v_account and resource_code='voice_minutes'
        and source_type='purchase' and metadata->>'lgq_checkout_session_id'=v_session;
      if v_count<>1 then raise exception 'refund_credit_grant_not_resolved' using errcode='P0002'; end if;
      select * into strict v_lot from public.usage_credit_lots where account_id=v_account and resource_code='voice_minutes'
        and source_type='purchase' and metadata->>'lgq_checkout_session_id'=v_session for update;
    else
      -- Allowance windows follow the base workspace period, not invoice line
      -- boundaries. The window containing the paid service start owns this grant.
      select count(*) into v_count from public.usage_credit_lots where account_id=v_account and resource_code='voice_minutes'
        and source_type='voice_addon' and (metadata->>'period_start')::timestamptz<=v_start
        and (metadata->>'period_end')::timestamptz>v_start;
      if v_count<>1 then raise exception 'refund_credit_grant_not_resolved' using errcode='P0002'; end if;
      select * into strict v_lot from public.usage_credit_lots where account_id=v_account and resource_code='voice_minutes'
        and source_type='voice_addon' and (metadata->>'period_start')::timestamptz<=v_start
        and (metadata->>'period_end')::timestamptz>v_start for update;
      if coalesce((v_lot.metadata->>'purchased_minutes')::bigint,0)<v_op.units then
        raise exception 'refund_allowance_attribution_ambiguous' using errcode='22023';
      end if;
    end if;
    v_take:=least(v_delta,v_lot.granted_units-v_lot.consumed_units-v_lot.reserved_units-v_lot.revoked_units);
    update public.usage_credit_lots set revoked_units=revoked_units+v_take where id=v_lot.id;
  end if;
  update public.addon_refund_reversals set refunded_amount=v_refunded,reversed_units=v_target,
    revoked_units=revoked_units+v_take,
    debt_units=debt_units+case when v_op.resource_code='voice_minutes' then v_delta-v_take else 0 end,
    debt_remaining=debt_remaining+case when v_op.resource_code='voice_minutes' then v_delta-v_take else 0 end,
    cancel_required=(v_sub is not null and v_refunded=v_amount),updated_at=now()
    where id=v_row.id returning * into v_row;
  if v_row.cancel_required then
    perform public.apply_purchased_capacity_provider_state(v_job.livemode,v_sub,'canceled',v_capacity.current_period_end);
  end if;
  return jsonb_build_object('reversal_id',v_row.id,'reversed_units',v_row.reversed_units,'debt_remaining',v_row.debt_remaining,
    'cancel_subscription',case when v_row.cancel_required then v_sub else null end);
end $$;

-- Partial capacity refunds affect only the paid service period they refunded.
-- New paid periods restore the subscribed quantity. Historical refunds never
-- reduce a later period; full refunds cancel the subscription independently.
create or replace function public.workspace_purchased_capacity_units(p_account_id uuid,p_resource_code text)
returns bigint language sql stable security definer set search_path='' as $$
  select coalesce(sum(greatest(0,c.units-case when c.resource_code in ('storage_gb','office_users') then
    coalesce((select sum(r.reversed_units) from public.addon_refund_reversals r
      where r.livemode=c.livemode and r.subscription_id=c.stripe_subscription_id and r.period_end=c.current_period_end),0)
    else 0 end)),0)::bigint
  from public.workspace_purchased_capacity c
  where c.account_id=p_account_id and c.resource_code=p_resource_code and c.status in ('active','past_due');
$$;

revoke all on function public.ingest_addon_refund_event(boolean,text,text,text),public.claim_addon_refund_job(boolean),
  public.finish_addon_refund_job(uuid,uuid,text,text),public.apply_addon_refund(uuid,uuid,jsonb),public.collect_addon_refund_debt()
  from public,anon,authenticated;
grant execute on function public.ingest_addon_refund_event(boolean,text,text,text),public.claim_addon_refund_job(boolean),
  public.finish_addon_refund_job(uuid,uuid,text,text),public.apply_addon_refund(uuid,uuid,jsonb),public.collect_addon_refund_debt()
  to service_role;
commit;
