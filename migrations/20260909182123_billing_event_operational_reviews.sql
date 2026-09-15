-- Preserve historical evidence and distinguish non-live configuration reviews.
-- This migration does not rewrite any historical billing_events or sent deliveries.
create or replace function public.billing_event_review_snapshot(p_event public.billing_events)
returns jsonb language sql stable security invoker set search_path = '' set timezone = 'UTC' as $$
  select jsonb_build_object('id', (p_event).id,
    'provider', (p_event).provider,
    'provider_event_id', (p_event).provider_event_id,
    'event_type', (p_event).event_type,
    'event_scope', (p_event).event_scope,
    'livemode', (p_event).livemode,
    'payload_sha256', (p_event).payload_sha256,
    'received_at', (p_event).received_at,
    'processing_status', (p_event).processing_status,
    'attempt_count', (p_event).attempt_count,
    'next_attempt_at', (p_event).next_attempt_at,
    'last_error', (p_event).last_error,
    'projection_applied', (p_event).projection_applied,
    'account_id', (p_event).account_id,
    'billing_subscription_id', (p_event).billing_subscription_id,
    'projection_result', (p_event).projection_result,
    'projection_schema_version', (p_event).projection_schema_version,
    'processed_at', (p_event).processed_at,
    'projection_claim_token', (p_event).projection_claim_token,
    'projection_lease_expires_at', (p_event).projection_lease_expires_at,
    'provider_object_type', (p_event).payload #>> '{data_object,object}',
    'provider_object_id', (p_event).payload #>> '{data_object,id}');
$$;
revoke all on function public.billing_event_review_snapshot from public, anon, authenticated;
grant execute on function public.billing_event_review_snapshot to service_role;

create table public.billing_event_operational_reviews (
  id uuid primary key default gen_random_uuid(),
  billing_event_id uuid not null references public.billing_events(id),
  revision integer not null check (revision > 0),
  review_kind text not null check (review_kind in ('non_live_configuration_rejection','reopened')),
  source_snapshot jsonb not null,
  recorded_snapshot jsonb not null,
  source_state_fingerprint text not null,
  batch_id uuid not null,
  batch_fingerprint text not null,
  idempotency_key text not null unique,
  reason_code text not null,
  operator_actor text not null,
  reviewed_at timestamptz not null default clock_timestamp(),
  evidence_reference text not null,
  case_key text not null,
  original_delivery_id uuid references public.operational_alert_deliveries(id),
  unique(billing_event_id, revision)
);
alter table public.billing_event_operational_reviews enable row level security;
revoke all on public.billing_event_operational_reviews from public, anon, authenticated;
grant select, insert on public.billing_event_operational_reviews to service_role;
create index billing_reviews_batch on public.billing_event_operational_reviews(batch_id);
create index billing_reviews_case on public.billing_event_operational_reviews(case_key);
create index billing_reviews_delivery on public.billing_event_operational_reviews(original_delivery_id);

create or replace function public.guard_billing_event_operational_reviews_append_only()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'billing_event_operational_reviews is append-only';
end;
$$;
revoke all on function public.guard_billing_event_operational_reviews_append_only from public, anon, authenticated;
create trigger trg_guard_billing_event_operational_reviews_append_only
before update or delete on public.billing_event_operational_reviews
for each row execute function public.guard_billing_event_operational_reviews_append_only();

create view public.billing_event_operational_classifications with (security_invoker=true) as
with classified as (
  select b.*, r.id review_id, r.revision review_revision, r.batch_id, r.case_key,
    r.evidence_reference, r.reviewed_at,
    coalesce(r.review_kind='non_live_configuration_rejection'
      and b.provider='stripe' and b.event_scope='platform_subscription' and b.livemode=false
      and r.recorded_snapshot=public.billing_event_review_snapshot(b)
      and r.source_state_fingerprint=encode(sha256(convert_to(r.recorded_snapshot::text,'UTF8')),'hex'),false) reviewed
  from public.billing_events b
  left join lateral (
    select * from public.billing_event_operational_reviews r
    where r.billing_event_id=b.id order by revision desc limit 1
  ) r on true
)
select c.*,
  case when reviewed then 'non_live_configuration_rejection' else 'actionable_billing' end operational_class,
  not reviewed requires_billing_action,
  reviewed requires_configuration_review,
  not reviewed and (processing_status in ('received','processing','failed')
    or (processing_status='ignored' and projection_result='test_mode_rehearsal_ignored')) operationally_unresolved,
  not reviewed and ((processing_status='failed' and next_attempt_at is null)
    or (processing_status='ignored' and projection_result='test_mode_rehearsal_ignored')) operationally_terminal
from classified c;
revoke all on public.billing_event_operational_classifications from public, anon, authenticated;
grant select on public.billing_event_operational_classifications to service_role;

create or replace function public.apply_billing_event_operational_reviews(
  p_manifest jsonb, p_actor text, p_batch_id uuid, p_idempotency_key text,
  p_evidence_reference text,
  p_case_key text default 'billing_config:platform_subscription:non_live',
  p_review_kind text default 'non_live_configuration_rejection',
  p_reason_code text default 'non_live_configuration_rejection_review_open'
)
-- Narrow capability: service_role has no direct UPDATE privilege on the inbox.
-- Row locks and exact-state checks run under the existing projection RPC ownership model.
returns jsonb language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare
  v_input jsonb; v_expected jsonb; v_current jsonb; v_event public.billing_events%rowtype;
  v_fingerprint text; v_existing integer; v_total integer; v_inserted integer := 0;
  v_transition_keys text[] := array['processing_status','processed_at','last_error','projection_applied','projection_schema_version','projection_result'];
begin
  if p_manifest is null or jsonb_typeof(p_manifest)<>'array' or jsonb_array_length(p_manifest)=0 then
    raise exception 'invalid manifest';
  end if;
  if nullif(trim(p_actor),'') is null or p_batch_id is null or nullif(trim(p_idempotency_key),'') is null
     or nullif(trim(p_evidence_reference),'') is null or nullif(trim(p_case_key),'') is null
     or nullif(trim(p_reason_code),'') is null or p_review_kind is null
     or p_review_kind not in ('non_live_configuration_rejection','reopened') then raise exception 'review metadata required'; end if;
  v_total := jsonb_array_length(p_manifest);
  if v_total > 1000 or (select count(distinct (e->>'id')::uuid) from jsonb_array_elements(p_manifest) e)<>v_total then
    raise exception 'duplicate or invalid manifest IDs';
  end if;
  -- The scanner, queue, reviewers and runtime rejection share this transaction lock.
  perform pg_advisory_xact_lock(782321905);
  select encode(sha256(convert_to(jsonb_build_object('manifest',jsonb_agg(e order by e->>'id'),
    'actor',p_actor,'key',p_idempotency_key,'evidence',p_evidence_reference,'case',p_case_key,
    'kind',p_review_kind,'reason',p_reason_code)::text,'UTF8')),'hex')
    into v_fingerprint from jsonb_array_elements(p_manifest) e;
  select count(*) into v_existing from public.billing_event_operational_reviews where batch_id=p_batch_id;
  if v_existing>0 then
    if v_existing<>v_total or exists(select 1 from public.billing_event_operational_reviews where batch_id=p_batch_id and batch_fingerprint<>v_fingerprint) then
      raise exception 'idempotency conflict';
    end if;
    return jsonb_build_object('ok',true,'idempotent',true,'applied_count',v_existing,'batch_id',p_batch_id);
  end if;
  for v_input in select e from jsonb_array_elements(p_manifest) e order by e->>'id' loop
    if jsonb_typeof(v_input)<>'object' or not (v_input ?& array['id','provider','provider_event_id','event_type','event_scope','livemode','payload_sha256','received_at','processing_status','attempt_count','next_attempt_at','last_error','projection_applied','account_id','billing_subscription_id','projection_result','projection_schema_version','processed_at','projection_claim_token','projection_lease_expires_at','provider_object_type','provider_object_id']) then
      raise exception 'complete source snapshot required';
    end if;
    select * into v_event from public.billing_events where id=(v_input->>'id')::uuid for update;
    if not found then raise exception 'missing manifest event'; end if;
    v_expected := public.billing_event_review_snapshot(jsonb_populate_record(null::public.billing_events,
      v_input || jsonb_build_object('payload',jsonb_build_object('data_object',
        jsonb_build_object('id',v_input->>'provider_object_id','object',v_input->>'provider_object_type')))));
    v_current := public.billing_event_review_snapshot(v_event);
    if v_event.provider is distinct from 'stripe' or v_event.event_scope is distinct from 'platform_subscription'
       or v_event.livemode is distinct from false then raise exception 'cannot_classify_live_or_foreign_event'; end if;
    if p_review_kind='reopened' then
      if v_expected<>v_current then raise exception 'source state drift'; end if;
    else
      -- Accept an exact unprojected terminal failure or the already-released legacy ignore transition.
      if v_expected->>'processing_status' is distinct from 'failed'
         or v_expected->>'last_error' is distinct from 'billing_mode_configuration_invalid'
         or v_expected->>'attempt_count' is distinct from '1'
         or v_expected->>'next_attempt_at' is not null
         or v_expected->>'projection_applied' is not null or v_expected->>'projection_result' is not null
         or v_expected->>'projection_schema_version' is not null or v_expected->>'processed_at' is not null
         or v_expected->>'account_id' is not null or v_expected->>'billing_subscription_id' is not null
         or v_expected->>'projection_claim_token' is not null or v_expected->>'projection_lease_expires_at' is not null then
        raise exception 'contract violation in original failure';
      end if;
      if v_current<>v_expected and (
        v_event.processing_status='ignored' and v_event.projection_result='test_mode_rehearsal_ignored'
        and v_event.processed_at is not null and v_event.projection_applied=false
        and v_event.projection_schema_version='stripe_subscription_projection_v1'
        and v_event.last_error is null and (v_current-v_transition_keys)=(v_expected-v_transition_keys)
      ) is not true then raise exception 'source state drift'; end if;
    end if;
    insert into public.billing_event_operational_reviews(
      billing_event_id,revision,review_kind,source_snapshot,recorded_snapshot,source_state_fingerprint,
      batch_id,batch_fingerprint,idempotency_key,reason_code,operator_actor,evidence_reference,case_key,original_delivery_id)
    select v_event.id,coalesce(max(revision),0)+1,p_review_kind,v_expected,v_current,
      encode(sha256(convert_to(v_current::text,'UTF8')),'hex'),p_batch_id,v_fingerprint,
      p_idempotency_key||':'||v_event.id::text,p_reason_code,p_actor,p_evidence_reference,p_case_key,
      (select delivery_id from public.operational_alert_findings where source_key='billing:'||v_event.id)
    from public.billing_event_operational_reviews where billing_event_id=v_event.id;
    v_inserted:=v_inserted+1;
  end loop;
  return jsonb_build_object('ok',true,'applied_count',v_inserted,'batch_id',p_batch_id);
end;
$$;
revoke all on function public.apply_billing_event_operational_reviews from public, anon, authenticated;
grant execute on function public.apply_billing_event_operational_reviews to service_role;

-- A mode rejection and its audit evidence commit together, or neither does.
-- Keep the existing RPC result for compatibility with the active production worker.
create or replace function public.ignore_test_mode_stripe_billing_subscription_event(p_billing_event_id uuid,p_claim_token uuid)
returns text language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_event public.billing_events%rowtype; v_before jsonb; v_after jsonb;
begin
  if p_billing_event_id is null or p_claim_token is null then raise exception 'invalid claim'; end if;
  perform pg_advisory_xact_lock(782321905);
  select * into v_event from public.billing_events where id=p_billing_event_id for update;
  if not found or v_event.provider is distinct from 'stripe' or v_event.event_scope is distinct from 'platform_subscription'
    or v_event.livemode is distinct from false
    or v_event.processing_status is distinct from 'processing'
    or v_event.projection_claim_token is distinct from p_claim_token
    or v_event.projection_lease_expires_at is null or v_event.projection_lease_expires_at<=clock_timestamp()
    or v_event.projection_applied is not null or v_event.account_id is not null or v_event.billing_subscription_id is not null
  then raise exception 'non-live subscription claim is not owned or eligible'; end if;
  v_before:=public.billing_event_review_snapshot(v_event);
  update public.billing_events set processing_status='ignored',processed_at=clock_timestamp(),
    next_attempt_at=null,last_error='billing_mode_mismatch_rejected',projection_claim_token=null,
    projection_lease_expires_at=null,projection_schema_version='stripe_subscription_projection_v1',
    projection_applied=false,projection_result='test_mode_rehearsal_ignored'
    where id=v_event.id returning * into v_event;
  v_after:=public.billing_event_review_snapshot(v_event);
  insert into public.billing_event_operational_reviews(
    billing_event_id,revision,review_kind,source_snapshot,recorded_snapshot,source_state_fingerprint,
    batch_id,batch_fingerprint,idempotency_key,reason_code,operator_actor,evidence_reference,case_key)
  select v_event.id,coalesce(max(revision),0)+1,'non_live_configuration_rejection',v_before,v_after,
    encode(sha256(convert_to(v_after::text,'UTF8')),'hex'),gen_random_uuid(),
    encode(sha256(convert_to(v_before::text,'UTF8')),'hex'),'runtime-mode-rejection:'||v_event.id||':'||p_claim_token,
    'billing_mode_mismatch_rejected','subscription_projection_worker',
    'signed_inbox:'||v_event.provider_event_id,'billing_config:platform_subscription:non_live'
  from public.billing_event_operational_reviews where billing_event_id=v_event.id;
  return 'test_mode_rehearsal_ignored';
end;
$$;
revoke all on function public.ignore_test_mode_stripe_billing_subscription_event(uuid,uuid) from public, anon, authenticated;
grant execute on function public.ignore_test_mode_stripe_billing_subscription_event(uuid,uuid) to service_role;

-- 4. Patched operational findings index and queue_operational_alerts
-- Fix: all 4 sites must check delivery_id IS NULL AND resolved_at IS NULL
drop index if exists public.operational_findings_unqueued;
create index operational_findings_unqueued on public.operational_alert_findings(category, detected_at) where delivery_id is null and resolved_at is null;

create or replace function public.queue_operational_alerts(p_recipient text, p_from text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_category text; v_id uuid; v_count integer; v_total integer:=0; v_text text;
begin
  if p_recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(p_from)<3 then
    raise exception 'invalid alert recipient or sender';
  end if;
  perform pg_advisory_xact_lock(782321905);
  for v_category in select distinct category from public.operational_alert_findings where delivery_id is null and resolved_at is null loop
    v_id:=gen_random_uuid();
    select count(*) into v_count from public.operational_alert_findings where category=v_category and delivery_id is null and resolved_at is null;
    select string_agg(reference||' | observed='||occurred_at::text||E'\n'||detail||E'\n'||action_required||E'\nhttps://app.letsgetquoted.com'||admin_path,E'\n\n' order by detected_at,source_key)
      into v_text from (select * from public.operational_alert_findings where category=v_category and delivery_id is null and resolved_at is null order by detected_at,source_key limit 20) f;
    insert into public.operational_alert_deliveries(id,category,payload) values(v_id,v_category,
      jsonb_build_object('from',p_from,'to',jsonb_build_array(p_recipient),
        'subject','[LGQ Ops] '||upper(v_category)||': '||v_count||' failure(s) ['||left(v_id::text,8)||']',
        'text','Operational alert '||v_id||E'\nCaptured: '||clock_timestamp()||E'\n\n'||v_text||
          case when v_count>20 then E'\n\nShowing 20 of '||v_count||' records. All references are retained in operational_alert_findings under this alert ID.' else '' end||
          E'\n\nThis monitor does not charge cards, grant credits, replay webhooks or send customer messages. Resolve the source through its supported recovery path; the next scan records when it clears.'));
    update public.operational_alert_findings set delivery_id=v_id where category=v_category and delivery_id is null and resolved_at is null;
    v_total:=v_total+1;
  end loop;
  return v_total;
end;
$$;

-- 5. Patched scan_operational_failures using shared classification reader
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

revoke all on function public.scan_operational_failures(jsonb), public.queue_operational_alerts(text,text) from public, anon, authenticated;
grant execute on function public.scan_operational_failures(jsonb), public.queue_operational_alerts(text,text) to service_role;
notify pgrst, 'reload schema';
