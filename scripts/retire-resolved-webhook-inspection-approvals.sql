-- Retire obsolete inspection approvals only when the source failure is resolved.
-- Leaves real recovery approvals and historical audit entries intact. The new
-- audit entry preserves the previous card rows for a reversible cleanup.
with candidates as materialized (
  select a.*
  from public.ai_operator_action_requests a
  join public.webhook_failures f on f.id::text = a.payload->>'failureId'
  where a.status = 'pending'
    and a.action_type = 'sre.inspect_webhook_failure'
    and a.category = 'sre_platform'
    and a.is_financial_mutation = false
    and f.resolved_at is not null
  for update of a
), retired as (
  update public.ai_operator_action_requests a
  set status = 'expired',
      expires_at = now(),
      resolved_at = now(),
      resolved_by = 'system:webhook-inspection-cleanup',
      resolution_reason = 'Underlying webhook failure is resolved. Read-only inspection did not require approval; no recovery was executed.'
  from candidates c
  where a.id = c.id and a.status = 'pending'
  returning a.id
), audit as (
  insert into public.ai_operator_logs (
    id, timestamp, category, action_name, severity, reasoning_summary, output_result, status
  )
  select 'audit-webhook-inspection-cleanup-' || gen_random_uuid()::text,
         now(), 'sre_platform', 'sre.resolved_webhook_inspection_approvals_retired', 'info',
         'Retired ' || count(*)::text || ' stale inspection approvals for resolved webhook failures. No recovery was executed.',
         jsonb_build_object('retiredActionIds', jsonb_agg(r.id),
           'previousActionRows', (select jsonb_agg(to_jsonb(c)) from candidates c)),
         'success'
  from retired r
  having count(*) > 0
  returning id
)
select (select count(*) from retired) as retired_cards,
       (select id from audit) as audit_id;
