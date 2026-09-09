-- Operational evidence only. None of these functions retries business operations.
create table public.operational_alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  payload jsonb not null,
  state text not null default 'pending' check (state in ('pending','sending','accepted','delivered','manual_review')),
  created_at timestamptz not null default now(),
  first_attempt_at timestamptz,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  claim_token uuid,
  lease_expires_at timestamptz,
  provider_id text unique,
  accepted_at timestamptz,
  delivered_at timestamptz,
  checked_at timestamptz,
  provider_status text,
  last_error text,
  check ((state <> 'sending') or (claim_token is not null and lease_expires_at is not null)),
  check ((state not in ('accepted','delivered')) or provider_id is not null)
);
create table public.operational_alert_findings (
  source_key text primary key,
  category text not null,
  reference text not null,
  occurred_at timestamptz not null,
  detected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  detail text not null,
  action_required text not null,
  admin_path text not null,
  delivery_id uuid references public.operational_alert_deliveries(id)
);
alter table public.operational_alert_deliveries enable row level security;
alter table public.operational_alert_findings enable row level security;
revoke all on public.operational_alert_deliveries, public.operational_alert_findings from public, anon, authenticated;
grant select,insert,update,delete on public.operational_alert_deliveries, public.operational_alert_findings to service_role;
create index operational_delivery_ready on public.operational_alert_deliveries(next_attempt_at) where state in ('pending','sending');
create index operational_findings_unqueued on public.operational_alert_findings(category,detected_at) where delivery_id is null;
create index operational_findings_open on public.operational_alert_findings(last_seen_at) where resolved_at is null;

-- A single snapshot avoids partial reads incorrectly closing a failure. No payloads,
-- phone numbers, names, money amounts or free-form provider errors leave this function.
create or replace function public.scan_operational_failures(p_crons jsonb default '[]')
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_now timestamptz := clock_timestamp(); v_count integer;
begin
  if jsonb_typeof(p_crons) <> 'array' then raise exception 'invalid cron configuration'; end if;
  perform pg_advisory_xact_lock(782321905);
  with signals as (
    select 'webhook:'||w.id as source_key, 'webhook' as category, w.id::text as reference,
      w.created_at as occurred_at, 'Unresolved webhook failure; inspect the stored source event.' as detail,
      'Open the failure by reference. Reconcile the original provider event, then use its supported replay with the original event ID. Mark resolved only after the expected effect is verified.' as action_required,
      '/admin/failures#webhooks' as admin_path
    from public.webhook_failures w where w.resolved_at is null
    union all
    select 'billing:'||b.id, 'billing', b.id::text, b.received_at,
      'Billing event '||b.processing_status||'; scope='||b.event_scope||'; attempts='||b.attempt_count,
      'Inspect the billing event and original Stripe event ID. Repair the cause and resume the existing projection worker. Never create another Checkout or grant credits manually to replay an event.', '/admin/billing-operations'
    from public.billing_events b where b.processing_status='failed'
      or (b.processing_status='received' and b.received_at < v_now-interval '15 minutes')
      or (b.processing_status='processing' and b.projection_lease_expires_at < v_now-interval '5 minutes')
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
      delivery_id=case when operational_alert_findings.resolved_at is not null then null else operational_alert_findings.delivery_id end,
      detected_at=case when operational_alert_findings.resolved_at is not null then v_now else operational_alert_findings.detected_at end
    returning source_key
  ) select count(*) into v_count from recorded;
  update public.operational_alert_findings set resolved_at=v_now
    where resolved_at is null and last_seen_at < v_now;
  return v_count;
end $$;

-- Coalesce backlog into one digest per category; no flood of one email per row.
-- Freeze the full send payload before submission so timeout retries are identical.
create or replace function public.queue_operational_alerts(p_recipient text, p_from text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_category text; v_id uuid; v_count integer; v_total integer:=0; v_text text;
begin
  if p_recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(p_from)<3 then
    raise exception 'invalid alert recipient or sender';
  end if;
  perform pg_advisory_xact_lock(782321905);
  for v_category in select distinct category from public.operational_alert_findings where delivery_id is null loop
    v_id:=gen_random_uuid();
    select count(*) into v_count from public.operational_alert_findings where category=v_category and delivery_id is null;
    select string_agg(reference||' | observed='||occurred_at::text||E'\n'||detail||E'\n'||action_required||E'\nhttps://app.letsgetquoted.com'||admin_path,E'\n\n' order by detected_at,source_key)
      into v_text from (select * from public.operational_alert_findings where category=v_category and delivery_id is null order by detected_at,source_key limit 20) f;
    insert into public.operational_alert_deliveries(id,category,payload) values(v_id,v_category,
      jsonb_build_object('from',p_from,'to',jsonb_build_array(p_recipient),
        'subject','[LGQ Ops] '||upper(v_category)||': '||v_count||' failure(s) ['||left(v_id::text,8)||']',
        'text','Operational alert '||v_id||E'\nCaptured: '||clock_timestamp()||E'\n\n'||v_text||
          case when v_count>20 then E'\n\nShowing 20 of '||v_count||' records. All references are retained in operational_alert_findings under this alert ID.' else '' end||
          E'\n\nThis monitor does not charge cards, grant credits, replay webhooks or send customer messages. Resolve the source through its supported recovery path; the next scan records when it clears.'));
    update public.operational_alert_findings set delivery_id=v_id where category=v_category and delivery_id is null;
    v_total:=v_total+1;
  end loop;
  return v_total;
end $$;

create or replace function public.claim_operational_alerts(p_limit integer default 5)
returns setof public.operational_alert_deliveries language plpgsql security invoker set search_path = '' as $$
begin
  -- Resend keeps idempotency keys 24 hours. Unknown outcomes must stop before expiry.
  update public.operational_alert_deliveries set state='manual_review',last_error='idempotency_window_expired',claim_token=null,lease_expires_at=null
    where state in ('pending','sending') and first_attempt_at < now()-interval '23 hours'
      and (lease_expires_at is null or lease_expires_at<now());
  return query with picked as (
    select id from public.operational_alert_deliveries where
      (state='pending' and next_attempt_at<=now()) or (state='sending' and lease_expires_at<now())
    order by created_at for update skip locked limit greatest(1,least(p_limit,5))
  ) update public.operational_alert_deliveries d set state='sending',claim_token=gen_random_uuid(),
      lease_expires_at=now()+interval '3 minutes',first_attempt_at=coalesce(first_attempt_at,now()),attempt_count=attempt_count+1
    from picked where d.id=picked.id returning d.*;
end $$;
revoke all on function public.scan_operational_failures(jsonb), public.queue_operational_alerts(text,text), public.claim_operational_alerts(integer) from public,anon,authenticated;
grant execute on function public.scan_operational_failures(jsonb), public.queue_operational_alerts(text,text), public.claim_operational_alerts(integer) to service_role;
notify pgrst, 'reload schema';
