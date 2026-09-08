-- Read-only operational inspection after the measurement migration is deployed.
-- Use an explicit provider invoice window for financial reconciliation. This
-- rolling 24-hour window is an operational check, not an invoice comparison.
-- Output includes private workspace/call identifiers; keep it out of public logs.
with recent as (
  select a.account_id, a.provider_call_id, a.admitted_at,
    a.allowed_minutes, a.minute_mode, a.reserved_minutes, a.unmetered_reason,
    a.provider_terminal_at, a.reservation_id,
    r.state as reservation_state, r.expires_at as reservation_expires_at,
    case when r.state = 'committed' then coalesce(r.committed_units,r.units)
      when r.state in ('released','expired') then 0 else null end as ledger_minutes,
    c.measured_minutes, c.billed_minutes, c.absorbed_minutes, c.absorption_reason,
    c.settlement, c.ai_seconds, c.forwarding_seconds,
    e.processing_status as receipt_status
  from public.voice_call_admissions a
  left join public.usage_reservations r on r.id=a.reservation_id and r.account_id=a.account_id
  left join public.voice_calls c on c.provider=a.provider and c.provider_call_id=a.provider_call_id
    and c.account_id=a.account_id
  left join public.voice_events e on e.id=c.voice_event_id
  where a.admitted_at >= now()-interval '24 hours'
)
select *,
  case
    when provider_terminal_at < now()-interval '15 minutes' and receipt_status is distinct from 'processed'
      then 'terminal_call_missing_processed_receipt'
    when reservation_state='reserved' and reservation_expires_at < now()-interval '15 minutes'
      then 'overdue_reservation'
    when reservation_id is not null and ledger_minutes is not null and billed_minutes is distinct from ledger_minutes
      then 'history_ledger_difference'
    when measured_minutes is not null and absorbed_minutes is null then 'unresolved_accounting'
    when allowed_minutes is null then 'legacy_admission'
    when absorption_reason='duration_limit_exceeded' then 'carrier_duration_overrun'
    else null
  end as review_reason
from recent
order by admitted_at,provider_call_id;
