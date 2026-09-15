-- Persist actionable voice anomalies in the existing operator failure inbox.
-- No caller content, provider request, call termination, debit, or replay occurs.
create or replace function public.record_voice_operational_health(
  p_project_id text, p_space_id text
)
returns jsonb language plpgsql security invoker
set search_path = pg_catalog, pg_temp
set statement_timeout = '8s'
set lock_timeout = '2s'
as $fn$
declare
  v_now timestamptz := clock_timestamp();
  v_issues jsonb;
  v_opened integer := 0;
  v_resolved integer := 0;
  v_active integer := 0;
  v_truncated boolean;
begin
  if nullif(btrim(p_project_id),'') is null or length(p_project_id)>255
     or nullif(btrim(p_space_id),'') is null or length(p_space_id)>255 then
    raise exception 'Voice health scope is invalid' using errcode='22023';
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended('voice-operational-health',20260908)) then
    return jsonb_build_object('skipped',1,'failed',0);
  end if;

  with issues as (
    select 'voice_health_receipt'::text kind,e.id::text reference,
      'Receipt requires review: state=' || e.processing_status || ', attempts=' || e.attempt_count
      || '. Inspect receipt/admission/history; use supported recovery without resetting attempts.' as message
    from public.voice_events e
    where e.provider='signalwire' and e.account_id is not null
      and e.provider_project_id=p_project_id and e.provider_space_id=p_space_id
      and e.received_at<v_now-interval '10 minutes'
      and (e.processing_status in ('received','failed')
        or (e.processing_status='processing' and e.processing_lease_expires_at<v_now))
    union all
    select 'voice_health_overdue_call',c.id::text,
      'Call history remains active beyond 10 minutes. Verify provider connection/hangup evidence and reconcile; do not infer a charge.'
    from public.voice_calls c
    where c.provider='signalwire' and c.started_at<v_now-interval '10 minutes'
      and ((c.outcome='in_progress' and c.ended_at is null)
        or (c.forwarding_connected_at is not null and c.forwarding_ended_at is null))
    union all
    select 'voice_health_duration',c.id::text,
      'Observed call history exceeds 600 seconds after answer. Check provider timestamps and all transfer/recording legs; application timestamps alone are not proof.'
    from public.voice_calls c
    where c.provider='signalwire' and c.answered_at is not null
      and greatest(c.ended_at,c.forwarding_ended_at)>c.answered_at+interval '10 minutes'
    union all
    select 'voice_health_reservation',r.id::text,
      'Voice reservation remains held after expiry or terminal call evidence. Inspect settlement and use supported release/reconciliation; never debit twice.'
    from public.usage_reservations r
    left join public.voice_call_admissions a on a.reservation_id=r.id
    left join public.voice_calls c on c.provider=a.provider and c.provider_call_id=a.provider_call_id
    where r.resource_code='voice_minutes' and r.state='reserved'
      and (r.expires_at<v_now or a.provider_terminal_at<v_now-interval '5 minutes'
        or c.ended_at<v_now-interval '5 minutes')
    union all
    select 'voice_health_accounting',c.id::text,
      'Snapshotted metered AI call has missing or inconsistent measured/debited/absorbed minutes. Inspect admission and receipt before settlement recovery.'
    from public.voice_calls c
    join public.voice_call_admissions a on a.provider=c.provider and a.provider_call_id=c.provider_call_id
    where c.provider='signalwire' and c.ai_seconds>0 and c.settlement<>'unsettled'
      and a.minute_mode in ('measure','enforce')
      and (c.measured_minutes is null
        or c.measured_minutes<>coalesce(c.billed_minutes,0)+coalesce(c.absorbed_minutes,0)
        or (c.settlement='unmetered' and c.absorption_reason is null))
  ), bounded as (
    select distinct kind,reference,message from issues i
    where not exists(select 1 from public.webhook_failures f where f.source='ai_voice'
      and f.event_type=i.kind and f.reference_id=i.reference and f.resolved_at is not null)
    order by kind,reference limit 101
  )
  select coalesce(jsonb_agg(to_jsonb(bounded)),'[]'::jsonb) into v_issues from bounded;
  v_truncated := jsonb_array_length(v_issues)>100;

  insert into public.webhook_failures(source,event_type,reference_id,error_message)
  select 'ai_voice',i.kind,i.reference,i.message
  from jsonb_to_recordset(v_issues) as i(kind text,reference text,message text)
  where not exists (select 1 from public.webhook_failures f where f.source='ai_voice'
    and f.event_type=i.kind and f.reference_id=i.reference);
  get diagnostics v_opened = row_count;

  -- Each call/receipt issue has one durable lifetime record. An operator's
  -- explicit resolution is retained, including classified historical probes.
  -- Never auto-resolve from an incomplete scan or a failed database read.
  if not v_truncated then
    update public.webhook_failures f set resolved_at=v_now,resolved_by='voice_health_monitor:condition_cleared'
    where f.source='ai_voice' and f.event_type in ('voice_health_receipt','voice_health_overdue_call',
      'voice_health_duration','voice_health_reservation','voice_health_accounting')
      and f.resolved_at is null
      and (f.event_type<>'voice_health_receipt' or exists(select 1 from public.voice_events e
        where e.id::text=f.reference_id and e.provider_project_id=p_project_id and e.provider_space_id=p_space_id))
      and not exists(select 1 from jsonb_to_recordset(v_issues) as i(kind text,reference text,message text)
        where i.kind=f.event_type and i.reference=f.reference_id);
    get diagnostics v_resolved = row_count;
  end if;
  select count(*) into v_active from public.webhook_failures f
  where f.source='ai_voice' and f.resolved_at is null
    and (f.event_type<>'voice_health_receipt' or exists(select 1 from public.voice_events e
      where e.id::text=f.reference_id and e.provider_project_id=p_project_id and e.provider_space_id=p_space_id))
    and f.event_type in ('voice_health_receipt','voice_health_overdue_call',
      'voice_health_duration','voice_health_reservation','voice_health_accounting');
  return jsonb_build_object('observed',jsonb_array_length(v_issues),'opened',v_opened,
    'resolved',v_resolved,'active',v_active,'truncated',v_truncated,'failed',v_active+v_truncated::integer);
end;
$fn$;

revoke all on function public.record_voice_operational_health(text,text) from public,anon,authenticated;
grant execute on function public.record_voice_operational_health(text,text) to service_role;
