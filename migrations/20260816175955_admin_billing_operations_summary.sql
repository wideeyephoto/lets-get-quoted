begin;

-- Keep the direct-settlement task ledger private while exposing the bounded,
-- aggregate-only view needed by the read-only staff readiness page.
create or replace function public.admin_billing_direct_payment_settlement_summary()
returns table (
  total_count bigint,
  open_count bigint,
  completed_count bigint,
  dead_letter_count bigint,
  sms_indeterminate_count bigint,
  oldest_open_at timestamptz,
  fixed_error_code text,
  fixed_error_code_count bigint,
  fixed_error_codes_truncated boolean
)
language sql
stable
security definer
set search_path = ''
as $function$
  with task_groups as materialized (
    select
      classified.task_state,
      classified.sms_status,
      classified.fixed_error_code,
      pg_catalog.count(*) as task_count,
      pg_catalog.min(classified.created_at) as oldest_created_at
    from (
      select
        task.task_state,
        task.sms_status,
        task.created_at,
        case
          when task.task_state <> 'dead_letter' then null::pg_catalog.text
          when task.last_error_code in (
            'dispatch_status_invalid',
            'feed_result_invalid',
            'phone_number_invalid',
            'sms_amount_invalid',
            'sms_delivery_unknown_after_lease_expiry',
            'sms_dispatch_shape_invalid',
            'sms_event_id_invalid',
            'sms_existing_nonterminal_outcome',
            'sms_payment_missing',
            'sms_payment_read_failed',
            'sms_payment_scope_changed',
            'sms_phone_invalid',
            'sms_provider_result_unknown',
            'sms_stage_invalid',
            'sms_stage_shape_invalid',
            'sms_stage_status_invalid',
            'worker_attempt_limit_reached',
            'worker_contract_error',
            'worker_database_error',
            'worker_internal_error',
            'worker_lease_expired_attempt_limit',
            'worker_transport_error'
          ) then task.last_error_code
          else 'unrecognized_error_code'::pg_catalog.text
        end as fixed_error_code
      from public.billing_direct_payment_settlement_tasks as task
    ) as classified
    group by
      classified.task_state,
      classified.sms_status,
      classified.fixed_error_code
  ),
  task_summary as (
    select
      coalesce(pg_catalog.sum(groups.task_count), 0::pg_catalog.numeric)::pg_catalog.int8 as total_count,
      coalesce(
        pg_catalog.sum(groups.task_count) filter (
          where groups.task_state in ('ready', 'leased', 'retry_wait')
        ),
        0::pg_catalog.numeric
      )::pg_catalog.int8 as open_count,
      coalesce(
        pg_catalog.sum(groups.task_count) filter (
          where groups.task_state = 'completed'
        ),
        0::pg_catalog.numeric
      )::pg_catalog.int8 as completed_count,
      coalesce(
        pg_catalog.sum(groups.task_count) filter (
          where groups.task_state = 'dead_letter'
        ),
        0::pg_catalog.numeric
      )::pg_catalog.int8 as dead_letter_count,
      coalesce(
        pg_catalog.sum(groups.task_count) filter (
          where groups.sms_status = 'indeterminate'
        ),
        0::pg_catalog.numeric
      )::pg_catalog.int8 as sms_indeterminate_count,
      pg_catalog.min(groups.oldest_created_at) filter (
        where groups.task_state in ('ready', 'leased', 'retry_wait')
      ) as oldest_open_at
    from task_groups as groups
  ),
  fixed_error_codes as (
    select
      groups.fixed_error_code,
      pg_catalog.sum(groups.task_count)::pg_catalog.int8 as fixed_error_code_count
    from task_groups as groups
    where groups.task_state = 'dead_letter'
    group by groups.fixed_error_code
  )
  select
    summary.total_count,
    summary.open_count,
    summary.completed_count,
    summary.dead_letter_count,
    summary.sms_indeterminate_count,
    summary.oldest_open_at,
    codes.fixed_error_code,
    coalesce(codes.fixed_error_code_count, 0::pg_catalog.int8),
    false as fixed_error_codes_truncated
  from task_summary as summary
  left join fixed_error_codes as codes on true
  order by
    codes.fixed_error_code_count desc nulls last,
    codes.fixed_error_code asc nulls last;
$function$;

revoke all on table public.billing_direct_payment_settlement_tasks
  from public, anon, authenticated, service_role;

revoke all on function public.admin_billing_direct_payment_settlement_summary()
  from public, anon, authenticated, service_role;
grant execute on function public.admin_billing_direct_payment_settlement_summary()
  to service_role;

commit;
