-- Read-only operational evidence. Run with a trusted administrative connection.
-- Call identifiers are private operational references; no caller text or phone is returned.
begin transaction read only;

select processing_status, count(*) as receipts, min(received_at) as oldest,
       max(attempt_count) as highest_attempt
  from public.voice_events group by processing_status order by processing_status;

select id, provider_call_id, processing_status, attempt_count, received_at,
       processing_lease_expires_at, next_attempt_at, last_error
  from public.voice_events
 where processing_status in ('received','processing','failed')
 order by received_at limit 50;

select c.id, c.provider_call_id, c.outcome, c.settlement, c.started_at,
       c.answered_at, c.ended_at, c.forwarding_ended_at,
       extract(epoch from (greatest(c.ended_at,c.forwarding_ended_at)-c.answered_at)) as observed_connected_seconds
  from public.voice_calls c
 where (c.outcome='in_progress' and c.ended_at is null and c.started_at<now()-interval '10 minutes')
    or greatest(c.ended_at,c.forwarding_ended_at)>c.answered_at+interval '10 minutes'
 order by c.started_at desc limit 50;

select r.id, r.state, r.created_at, r.expires_at, a.provider_call_id,
       a.provider_terminal_at, c.ended_at
  from public.usage_reservations r
  left join public.voice_call_admissions a on a.reservation_id=r.id
  left join public.voice_calls c on c.provider=a.provider and c.provider_call_id=a.provider_call_id
 where r.resource_code='voice_minutes' and r.state='reserved'
   and (r.expires_at<now() or a.provider_terminal_at is not null or c.ended_at<now()-interval '5 minutes')
 order by r.created_at limit 50;

-- Historical unsnapshotted calls and expected fallback-only calls are separate
-- from new measurement calls with unexplained missing accounting.
select c.id,c.provider_call_id,c.ai_seconds,c.billed_minutes,c.measured_minutes,
       c.absorbed_minutes,c.absorption_reason,a.minute_mode,a.unmetered_reason
  from public.voice_calls c
  join public.voice_call_admissions a on a.provider=c.provider and a.provider_call_id=c.provider_call_id
 where c.ai_seconds>0 and a.minute_mode is not null
   and (c.measured_minutes is null
     or c.measured_minutes<>coalesce(c.billed_minutes,0)+coalesce(c.absorbed_minutes,0)
     or (c.settlement='unmetered' and c.absorption_reason is null))
 order by c.started_at desc limit 50;

select job,started_at,finished_at,ok,summary,error from public.cron_runs
 where job in ('voice-allowance','voice-retention','voice-receipt-recovery')
 order by started_at desc limit 20;
rollback;
