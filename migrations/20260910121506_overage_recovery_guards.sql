-- A lease is an ownership deadline, not evidence that a provider request failed.
-- Stripe's idempotency cache is bounded. Preserve the first attempt and stop
-- dispatch before 23h, leaving a margin below its minimum 24h retention.
begin;

alter table public.workspace_overage_settlements
  add column first_submitted_at timestamptz,
  add column retry_deadline_at timestamptz,
  add column next_attempt_at timestamptz not null default now(),
  add column stripe_account_id text,
  add column request_payload jsonb,
  add column request_version integer,
  add column recovery_reason text check (recovery_reason ~ '^[a-z][a-z0-9_]{2,63}$'),
  add column revision bigint not null default 0;

alter table public.workspace_overage_settlements add constraint overage_original_attempt_shape check (
  first_submitted_at is null or (retry_deadline_at is not null and retry_deadline_at = first_submitted_at + interval '23 hours'
    and request_payload is not null and request_version is not null and request_version = 1 and stripe_account_id is not null
    and stripe_customer_id is not null and stripe_idempotency_key is not null and livemode is not null)
);

-- submitted_at was overwritten on reclaim, so it cannot establish legacy age.
update public.workspace_overage_settlements
set recovery_reason = 'legacy_attempt_unknown'
where state in ('submitted', 'indeterminate') or (state = 'failed' and attempt_count > 0);

create table public.overage_settlement_evidence (
  id bigint generated always as identity primary key,
  settlement_id uuid not null references public.workspace_overage_settlements(id),
  occurred_at timestamptz not null default clock_timestamp(),
  kind text not null,
  claim_token uuid,
  invoice_item_id text,
  details jsonb not null default '{}'::jsonb
);
create index overage_settlement_evidence_settlement_idx
  on public.overage_settlement_evidence(settlement_id, id);
alter table public.overage_settlement_evidence enable row level security;
revoke all on public.overage_settlement_evidence from public, anon, authenticated, service_role;
grant select on public.overage_settlement_evidence to service_role;

create function public.guard_overage_settlement_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.account_id, new.period_start, new.period_end, new.lines,
      new.total_millicents, new.chargeable_cents, new.residual_millicents)
     is distinct from
     (old.account_id, old.period_start, old.period_end, old.lines,
      old.total_millicents, old.chargeable_cents, old.residual_millicents) then
    raise exception 'overage snapshot is immutable' using errcode = '55000';
  end if;
  if old.first_submitted_at is not null and
    (new.first_submitted_at, new.retry_deadline_at, new.stripe_idempotency_key,
     new.stripe_customer_id, new.stripe_account_id, new.livemode,
     new.request_payload, new.request_version)
    is distinct from
    (old.first_submitted_at, old.retry_deadline_at, old.stripe_idempotency_key,
     old.stripe_customer_id, old.stripe_account_id, old.livemode,
     old.request_payload, old.request_version) then
    raise exception 'overage request identity is immutable' using errcode = '55000';
  end if;
  new.revision := old.revision + 1;
  new.updated_at := clock_timestamp();
  insert into public.overage_settlement_evidence(settlement_id, kind, claim_token, invoice_item_id, details)
  values (old.id, 'transition', new.claim_token, new.stripe_invoice_item_id,
    jsonb_build_object('from', old.state, 'to', new.state, 'revision', new.revision,
      'reason', coalesce(new.recovery_reason, new.last_error)));
  return new;
end $$;
create trigger overage_settlement_guard before update on public.workspace_overage_settlements
for each row execute function public.guard_overage_settlement_update();

-- Old callers cannot initialize an incomplete identity or bypass dispatch rules.
create or replace function public.claim_overage_settlement(p_settlement_id uuid, p_stripe_idempotency_key text, p_livemode boolean, p_stripe_customer_id text)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'overage worker upgrade required: use claim_overage_settlement_v2' using errcode = '55000';
end $$;

create function public.claim_overage_settlement_v2(
  p_settlement_id uuid, p_stripe_idempotency_key text, p_livemode boolean,
  p_stripe_account_id text, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.workspace_overage_settlements%rowtype; t uuid := gen_random_uuid(); n timestamptz := clock_timestamp();
  observed_item text; observed_count integer;
begin
  select * into s from public.workspace_overage_settlements where id = p_settlement_id for update;
  if not found then raise exception 'overage settlement not found' using errcode = 'P0002'; end if;
  if s.state not in ('closed','indeterminate') or s.recovery_reason is not null
    or s.next_attempt_at > n or s.lease_expires_at > n then return null; end if;
  if s.attempt_count >= 12 or (s.attempt_count > 0 and
    (s.first_submitted_at is null or s.retry_deadline_at <= n + interval '1 minute')) then
    update public.workspace_overage_settlements set recovery_reason = 'retry_window_exhausted' where id = s.id;
    return null;
  end if;
  if p_livemode is null or p_stripe_account_id is null or p_stripe_account_id !~ '^acct_[A-Za-z0-9]+$'
    or p_stripe_idempotency_key is null or p_stripe_idempotency_key !~ '^lgq:billing:v1:overage[.]settle:[0-9a-f]{64}$'
    or p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or (p_payload->>'amount')::numeric is distinct from s.chargeable_cents::numeric
    or s.chargeable_cents <= 0 or s.chargeable_cents > 9007199254740991
    or p_payload->>'currency' is distinct from 'usd'
    or coalesce(p_payload->>'customer','') !~ '^cus_[A-Za-z0-9]{8,}$'
    or p_payload#>>'{metadata,lgq_settlement_id}' is distinct from s.id::text
    or p_payload#>>'{metadata,lgq_account_id}' is distinct from s.account_id::text
    or jsonb_typeof(p_payload->'description') is distinct from 'string'
    or (p_payload - array['customer','amount','currency','description','metadata']) <> '{}'::jsonb then
    raise exception 'invalid overage provider request' using errcode = '22023';
  end if;
  if s.attempt_count > 0 and (s.stripe_idempotency_key, s.livemode, s.stripe_account_id, s.request_payload)
    is distinct from (p_stripe_idempotency_key, p_livemode, p_stripe_account_id, p_payload) then
    update public.workspace_overage_settlements set recovery_reason = 'request_identity_mismatch' where id = s.id;
    return null;
  end if;
  select count(distinct invoice_item_id),min(invoice_item_id) into observed_count,observed_item
    from public.overage_settlement_evidence where settlement_id=s.id and kind='provider_success';
  if observed_count > 1 then
    update public.workspace_overage_settlements set recovery_reason='duplicate_provider_items' where id=s.id;
    return null;
  end if;
  update public.workspace_overage_settlements
  set state = 'submitted', claim_token = t, lease_expires_at = n + interval '5 minutes',
    submitted_at = n, first_submitted_at = coalesce(first_submitted_at,n),
    retry_deadline_at = coalesce(retry_deadline_at,n + interval '23 hours'),
    stripe_idempotency_key = p_stripe_idempotency_key, livemode = p_livemode,
    stripe_account_id = p_stripe_account_id, stripe_customer_id = p_payload->>'customer',
    request_payload = p_payload, request_version = 1, attempt_count = attempt_count + 1, last_error = null
  where id = s.id returning * into s;
  insert into public.overage_settlement_evidence(settlement_id,kind,claim_token)
    values (s.id,'claimed',t);
  return jsonb_build_object('claim_token',t,'payload',s.request_payload,
    'idempotency_key',s.stripe_idempotency_key,'retry_deadline_at',s.retry_deadline_at,
    'lease_expires_at',s.lease_expires_at,'invoice_item_id',observed_item);
end $$;

create or replace function public.reap_overage_settlement_leases(p_limit integer default 50)
returns integer language plpgsql security definer set search_path = '' as $$
declare cnt integer;
begin
  with expired as (
    select id from public.workspace_overage_settlements
    where state = 'submitted' and lease_expires_at <= clock_timestamp()
    order by lease_expires_at,id for update skip locked limit greatest(1,least(coalesce(p_limit,50),500))
  ), changed as (
    update public.workspace_overage_settlements s set state = 'indeterminate', last_error = 'lease_expired',
      recovery_reason = case when s.first_submitted_at is null then 'legacy_attempt_unknown'
        when s.retry_deadline_at <= clock_timestamp() + interval '1 minute' or s.attempt_count >= 12
        then 'retry_window_exhausted' else s.recovery_reason end
    from expired where s.id = expired.id returning s.id
  ) select count(*) into cnt from changed;
  -- Also hold indeterminate rows that age out while waiting between scheduled runs.
  with aged as (
    select id from public.workspace_overage_settlements
    where state = 'indeterminate' and recovery_reason is null and
      (first_submitted_at is null or retry_deadline_at <= clock_timestamp() + interval '1 minute' or attempt_count >= 12)
    order by period_end,id for update skip locked limit greatest(1,least(coalesce(p_limit,50),500))
  ) update public.workspace_overage_settlements s set recovery_reason = 'retry_window_exhausted'
    from aged where s.id = aged.id;
  return cnt;
end $$;

create function public.list_claimable_overage_settlements(p_limit integer default 25, p_accounts uuid[] default null)
returns setof public.workspace_overage_settlements language sql security definer set search_path = '' as $$
  select s.* from public.workspace_overage_settlements s
  where state in ('closed','indeterminate') and chargeable_cents > 0 and recovery_reason is null
    and (p_accounts is null or account_id = any(p_accounts))
    and next_attempt_at <= clock_timestamp() and (lease_expires_at is null or lease_expires_at <= clock_timestamp())
    and attempt_count < 12 and (attempt_count = 0 or
      (first_submitted_at is not null and retry_deadline_at > clock_timestamp() + interval '1 minute'))
  order by next_attempt_at,period_end,id limit greatest(1,least(coalesce(p_limit,25),100));
$$;
create index overage_settlement_eligible_idx on public.workspace_overage_settlements(next_attempt_at,period_end,id)
  where state in ('closed','indeterminate') and recovery_reason is null;

create function public.observe_overage_invoice_item(p_settlement_id uuid, p_claim_token uuid, p_invoice_item_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_invoice_item_id is null or p_invoice_item_id !~ '^ii_[A-Za-z0-9]{8,}$' or p_claim_token is null
    or not exists (select 1 from public.overage_settlement_evidence where settlement_id = p_settlement_id
      and claim_token = p_claim_token and kind = 'claimed') then
    raise exception 'unknown overage observation' using errcode = '55000';
  end if;
  insert into public.overage_settlement_evidence(settlement_id,kind,claim_token,invoice_item_id)
    values(p_settlement_id,'provider_success',p_claim_token,p_invoice_item_id);
  return true;
end $$;

create or replace function public.complete_overage_settlement(p_settlement_id uuid,p_claim_token uuid,p_invoice_item_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare s public.workspace_overage_settlements%rowtype;
begin
  select * into s from public.workspace_overage_settlements where id = p_settlement_id for update;
  if s.state = 'charged' and s.stripe_invoice_item_id = p_invoice_item_id and exists
    (select 1 from public.overage_settlement_evidence where settlement_id = s.id and kind = 'claimed' and claim_token = p_claim_token)
    then return true; end if;
  if not found or p_claim_token is null or s.claim_token is distinct from p_claim_token
    or s.state not in ('submitted','indeterminate') or p_invoice_item_id is null
    or p_invoice_item_id !~ '^ii_[A-Za-z0-9]{8,}$' then
    raise exception 'overage settlement claim is not owned' using errcode = '55000';
  end if;
  update public.workspace_overage_settlements set state='charged',stripe_invoice_item_id=p_invoice_item_id,
    resolved_at=clock_timestamp(),claim_token=null,lease_expires_at=null,last_error=null,recovery_reason=null where id=s.id;
  return true;
end $$;

create or replace function public.fail_overage_settlement(
  p_settlement_id uuid,p_claim_token uuid,p_error_code text,p_indeterminate boolean default false
) returns boolean language plpgsql security definer set search_path = '' as $$
declare s public.workspace_overage_settlements%rowtype;
begin
  if p_error_code is null or p_error_code !~ '^[a-z][a-z0-9_]{2,63}$' then
    raise exception 'overage settlement error code is invalid' using errcode='22023'; end if;
  select * into s from public.workspace_overage_settlements where id=p_settlement_id for update;
  if not found or s.claim_token is distinct from p_claim_token or not (
    (p_claim_token is not null and s.state in ('submitted','indeterminate')) or
    (p_claim_token is null and s.state='closed' and s.attempt_count=0 and p_error_code='no_stripe_customer' and not p_indeterminate)
  ) then raise exception 'overage settlement claim is not owned' using errcode='55000'; end if;
  if p_indeterminate then
    update public.workspace_overage_settlements set state='indeterminate',last_error=p_error_code,
      next_attempt_at=clock_timestamp() + make_interval(secs => least(3600,60 * power(2,least(attempt_count,6))) + floor(random()*30)::integer),
      recovery_reason=case when p_error_code in ('stripe_idempotency_conflict','provider_scope_mismatch') then p_error_code
        when first_submitted_at is null or retry_deadline_at <= clock_timestamp()+interval '1 minute' or attempt_count >= 12
        then 'retry_window_exhausted' else recovery_reason end where id=s.id;
  else
    update public.workspace_overage_settlements set state='failed',last_error=p_error_code,
      resolved_at=clock_timestamp(),claim_token=null,lease_expires_at=null where id=s.id;
  end if;
  return true;
end $$;

-- A read-only Stripe scan happens outside the transaction. Apply compares the
-- revision observed before that scan and requires a drained lease and item facts.
create function public.reconcile_overage_invoice_item(p_settlement_id uuid,p_revision bigint,p_item jsonb,p_stripe_account_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare s public.workspace_overage_settlements%rowtype;
begin
  select * into s from public.workspace_overage_settlements where id=p_settlement_id for update;
  if not found or s.revision <> p_revision or s.state not in ('submitted','indeterminate','failed')
    or s.lease_expires_at > clock_timestamp() then return false; end if;
  if p_item->>'id' is null or p_item->>'id' !~ '^ii_[A-Za-z0-9]{8,}$'
    or p_item->>'customer' is distinct from s.stripe_customer_id
    or p_item->>'currency' is distinct from 'usd'
    or (p_item->>'amount')::numeric is distinct from s.chargeable_cents::numeric
    or (p_item->>'livemode')::boolean is distinct from s.livemode
    or p_item#>>'{metadata,lgq_settlement_id}' is distinct from s.id::text
    or p_item#>>'{metadata,lgq_account_id}' is distinct from s.account_id::text
    or p_stripe_account_id is null
    or (s.stripe_account_id is not null and s.stripe_account_id <> p_stripe_account_id) then
    raise exception 'overage reconciliation evidence mismatch' using errcode='22023'; end if;
  insert into public.overage_settlement_evidence(settlement_id,kind,invoice_item_id,details)
    values(s.id,'reconciled',p_item->>'id',jsonb_build_object('revision',p_revision,'stripe_account_id',p_stripe_account_id));
  update public.workspace_overage_settlements set state='charged',stripe_invoice_item_id=p_item->>'id',
    resolved_at=clock_timestamp(),claim_token=null,lease_expires_at=null,last_error=null,recovery_reason=null where id=s.id;
  return true;
end $$;

-- Defense at the write boundary, including late inserts into a new resource.
-- Close takes the same account settings lock before inspecting the period.
create function public.guard_closed_overage_accrual() returns trigger
language plpgsql security definer set search_path = '' as $$
declare a uuid; p timestamptz;
begin
  a := coalesce(new.account_id,old.account_id); p := coalesce(new.period_start,old.period_start);
  perform 1 from public.workspace_overage_settings where account_id=a for update;
  perform pg_advisory_xact_lock(hashtextextended(a::text || ':' || extract(epoch from p)::text, 90421));
  if tg_op='UPDATE' and (new.account_id,new.period_start,new.period_end,new.resource_code)
    is distinct from (old.account_id,old.period_start,old.period_end,old.resource_code) then
    raise exception 'overage accrual identity is immutable' using errcode='55000'; end if;
  if exists(select 1 from public.workspace_overage_settlements where account_id=a and period_start=p) then
    raise exception 'overage period has already been settled' using errcode='55000'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger overage_accrual_close_guard before insert or update or delete on public.workspace_overage_accruals
for each row execute function public.guard_closed_overage_accrual();

create or replace function public.close_overage_period(p_account_id uuid,p_period_start timestamptz,p_period_end timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.workspace_overage_settlements%rowtype; total bigint; cents bigint; cap bigint; lines jsonb;
begin
  if p_account_id is null or p_period_start is null or p_period_end is null or p_period_end <= p_period_start
    or p_period_end > clock_timestamp() then raise exception 'overage settlement period is invalid' using errcode='22023'; end if;
  -- Stable account lock also serializes two closes before a settlement exists.
  perform 1 from public.workspace_overage_settings where account_id=p_account_id for update;
  perform pg_advisory_xact_lock(hashtextextended(p_account_id::text || ':' || extract(epoch from p_period_start)::text, 90421));
  select * into s from public.workspace_overage_settlements where account_id=p_account_id and period_start=p_period_start;
  if found then return to_jsonb(s)||jsonb_build_object('already_closed',true); end if;
  if exists(select 1 from public.workspace_overage_accruals where account_id=p_account_id and period_start=p_period_start
    and period_end <> p_period_end) then raise exception 'overage period ends disagree' using errcode='22023'; end if;
  -- Voice and text reserve usage before provider completion. Wait for settlement
  -- or release; other resource types accrue their final units directly.
  if exists(select 1 from public.workspace_overage_accrual_events where account_id=p_account_id and period_start=p_period_start
    and resource_code in ('voice_minutes','text_segments') and released_at is null and settled_at is null) then
    return jsonb_build_object('deferred',true,'reason','usage_not_final'); end if;
  select coalesce(sum(a.millicents),0),coalesce(jsonb_agg(jsonb_build_object('resource_code',a.resource_code,'units',a.units,
    'millicents',a.millicents) order by a.millicents desc,a.resource_code),'[]'::jsonb) into total,lines
    from public.workspace_overage_accruals a where account_id=p_account_id and period_start=p_period_start and millicents>0;
  cents := total / 1000;
  select cap_cents into cap from public.workspace_overage_settings where account_id=p_account_id;
  insert into public.workspace_overage_settlements(account_id,period_start,period_end,lines,total_millicents,
    chargeable_cents,residual_millicents,cap_cents_at_close,state,resolved_at)
  values(p_account_id,p_period_start,p_period_end,lines,total,cents,total-cents*1000,cap,
    case when cents=0 then 'nothing_owed' else 'closed' end,case when cents=0 then clock_timestamp() else null end)
    returning * into s;
  return to_jsonb(s)||jsonb_build_object('already_closed',false);
end $$;

create or replace function public.list_unclosed_overage_periods(p_limit integer default 100)
returns table(account_id uuid,period_start timestamptz,period_end timestamptz)
language sql security definer set search_path = '' as $$
  select a.account_id,a.period_start,max(a.period_end) as period_end
  from public.workspace_overage_accruals a
  where not exists(select 1 from public.workspace_overage_settlements s where s.account_id=a.account_id and s.period_start=a.period_start)
    and not exists(select 1 from public.workspace_overage_accrual_events e where e.account_id=a.account_id and e.period_start=a.period_start
      and e.resource_code in ('voice_minutes','text_segments') and e.released_at is null and e.settled_at is null)
  group by a.account_id,a.period_start
  having max(a.period_end)<=clock_timestamp()
  order by max(a.period_end),a.account_id,a.period_start limit greatest(1,least(coalesce(p_limit,100),1000));
$$;

-- Privileged worker APIs are service-only; no new owner/client mutation surface.
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('guard_overage_settlement_update','guard_closed_overage_accrual',
      'claim_overage_settlement_v2','list_claimable_overage_settlements','observe_overage_invoice_item','reconcile_overage_invoice_item')
  loop
    execute format('revoke all on function %s from public,anon,authenticated',f);
    if f::text not like '%guard_%' then execute format('grant execute on function %s to service_role',f); end if;
  end loop;
end $$;
create or replace function public.scan_operational_failures(p_crons jsonb default '[]')
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_now timestamptz; v_count integer;
begin
  if jsonb_typeof(p_crons) <> 'array' then raise exception 'invalid cron configuration'; end if;
  perform pg_advisory_xact_lock(782321905);
  v_now := clock_timestamp();
  with signals as (
    select 'webhook:'||w.id as source_key, 'webhook' as category, w.id::text as reference,
      w.created_at as occurred_at, 'Unresolved webhook failure; inspect the stored source event.' as detail,
      'Open the failure by reference. Reconcile the original provider event, then use its supported replay with the original event ID. Mark resolved only after the expected effect is verified.' as action_required,
      '/admin/failures#webhooks' as admin_path
    from public.webhook_failures w where w.resolved_at is null
    union all
    select 'billing:'||b.id as source_key, 'billing' as category, b.id::text as reference, b.received_at as occurred_at,
      'Billing event '||b.processing_status||'; scope='||b.event_scope||'; attempts='||b.attempt_count as detail,
      'Inspect the billing event and original Stripe event ID. Repair the cause and resume the existing projection worker. Never create another Checkout or grant credits manually to replay an event.' as action_required,
      '/admin/billing-operations' as admin_path
    from public.billing_event_operational_classifications b
    where b.requires_billing_action = true
      and (b.processing_status='failed'
        or (b.processing_status='ignored' and b.projection_result='test_mode_rehearsal_ignored')
        or (b.processing_status='received' and b.received_at < v_now-interval '15 minutes')
        or (b.processing_status='processing' and b.projection_lease_expires_at < v_now-interval '5 minutes'))
    union all
    select c.case_key as source_key, 'billing_configuration' as category, c.case_key as reference,
      min(c.received_at) as occurred_at,
      count(*)::text || ' non-live platform subscription event(s) rejected by billing mode configuration; origin and routing review open.' as detail,
      'Inspect Stripe webhook endpoint configuration and rehearsal provenance. Verify destination environment routing before closing this case.' as action_required,
      '/admin/billing-operations' as admin_path
    from public.billing_event_operational_classifications c
    where c.requires_configuration_review = true
    group by c.case_key
    union all
    select 'settlement:'||s.id as source_key, 'billing' as category, s.id::text as reference,
      coalesce(s.resolved_at, s.updated_at) as occurred_at,
      'Overage settlement '||s.state||'; account='||s.account_id||'; error='||coalesce(s.recovery_reason, s.last_error, 'unknown')||'; chargeable_cents='||s.chargeable_cents as detail,
      'Inspect settlement evidence and the original Stripe account/mode. Reconcile the existing invoice item with the revision-checked tool. Old or unknown attempts must remain held; never replace their key or create an item to discover whether one exists.', '/admin/billing-operations' as admin_path
    from public.workspace_overage_settlements s
    where s.state = 'failed' or s.recovery_reason is not null
      or (s.state = 'submitted' and s.lease_expires_at < v_now - interval '10 minutes')
      or (s.state = 'indeterminate' and s.first_submitted_at < v_now - interval '3 hours')
    union all
    select 'overage-backlog:'||a.account_id, 'billing', a.account_id::text, min(a.period_end),
      'Ended overage periods remain unclosed for over three hourly runs.',
      'Inspect pending usage finalization, inconsistent period ends and close failures. Confirm worker flags and repair the existing period; do not discard late usage.',
      '/admin/billing-operations'
    from public.workspace_overage_accruals a
    where a.period_end < v_now - interval '3 hours'
      and not exists(select 1 from public.workspace_overage_settlements s where s.account_id=a.account_id and s.period_start=a.period_start)
      and not exists(select 1 from public.workspace_overage_settlements s where s.account_id=a.account_id and s.closed_at > v_now - interval '3 hours')
    group by a.account_id
    union all
    select 'sms:'||e.id, 'sms', e.id::text,
      coalesce(e.failed_at,e.indeterminate_at,s.failed_at,s.indeterminate_at,s.available_at,e.created_at),
      'SMS event='||e.status||'; task='||coalesce(s.task_state,'none')||'; attempts='||coalesce(s.attempt_count,0)||'; code='||coalesce(s.last_error_code,'inspect_event'),
      'Inspect the SMS event and provider message ID. For an unknown submission outcome, reconcile provider status before any retry. Resume only the existing supported task; do not compose a replacement message.', '/admin/messaging'
    from public.sms_events e left join public.sms_delivery_tasks s on s.sms_event_id=e.id
    where e.status in ('failed','indeterminate') or s.task_state in ('failed','indeterminate')
      or (s.task_state='queued' and s.available_at < v_now-interval '15 minutes')
      or (s.task_state='leased' and s.lease_expires_at < v_now-interval '5 minutes')
    union all
    select 'dispute:'||p.id||':'||coalesce(p.stripe_dispute_id,'unknown'), 'dispute', p.id::text,
      coalesce(p.disputed_at,p.requested_at), 'Payment dispute requires review; deadline='||coalesce(p.dispute_due_by::text,'not recorded'),
      'Open the payment and its existing Stripe dispute. Check the evidence deadline and submit through the original dispute. Do not refund or create a second charge as a recovery step.', '/admin/money#disputes'
    from public.payments p where p.status='disputed' and coalesce(p.dispute_status,'needs_response') not in ('won','lost','warning_closed')
    union all
    select 'cron:'||(cfg->>'job')||':'||coalesce(s.last_success::text,'never'), 'cron', cfg->>'job',
      coalesce(c.started_at,v_now), case when c.id is null then 'Scheduled worker has no recorded run'
        when c.ok=false then 'Latest scheduled worker run failed; run='||c.id
        else 'Scheduled worker is overdue; last run='||c.id end,
      'Inspect cron_runs for this job and the deployed flags. Read the failure reason. Use the existing authenticated, idempotent worker after repairing the cause; verify its durable result.', '/admin/health'
    from jsonb_array_elements(p_crons) cfg
    left join lateral (select r.id,r.started_at,r.ok from public.cron_runs r where r.job=cfg->>'job' order by r.started_at desc limit 1) c on true
    left join lateral (select max(r.started_at) last_success from public.cron_runs r where r.job=cfg->>'job' and r.ok=true) s on true
    where c.ok=false or c.started_at < v_now-make_interval(mins => (cfg->>'max_gap_minutes')::integer)
      or (c.id is null and coalesce((cfg->>'required')::boolean,true))
  ), recorded as (
    insert into public.operational_alert_findings(source_key,category,reference,occurred_at,detail,action_required,admin_path,last_seen_at)
    select source_key,category,reference,occurred_at,detail,action_required,admin_path,v_now from signals
    on conflict(source_key) do update set last_seen_at=v_now, resolved_at=null,
      detail=excluded.detail, action_required=excluded.action_required,
      delivery_id=case when operational_alert_findings.resolved_at is not null then null else operational_alert_findings.delivery_id end,
      detected_at=case when operational_alert_findings.resolved_at is not null then v_now else operational_alert_findings.detected_at end
    returning source_key
  ) select count(*) into v_count from recorded;
  update public.operational_alert_findings set resolved_at=v_now
    where resolved_at is null and last_seen_at < v_now;
  return v_count;
end;
$$;

revoke all on function public.scan_operational_failures(jsonb) from public, anon, authenticated;
grant execute on function public.scan_operational_failures(jsonb) to service_role;


notify pgrst,'reload schema';
commit;
