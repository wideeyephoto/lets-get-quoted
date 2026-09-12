-- Adds top up projector deferred capacity to scan_operational_failures()
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
        or (b.processing_status='ignored' and b.projection_result='capacity_fulfillment_deferred')
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
