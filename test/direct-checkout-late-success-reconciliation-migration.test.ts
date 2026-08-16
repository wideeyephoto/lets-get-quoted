import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL(
  '../migrations/20260816194056_direct_checkout_late_success_reconciliation.sql',
  import.meta.url,
));
const sql = readFileSync(migrationPath, 'utf8').toLowerCase();

function sliceBetween(start: string, end: string): string {
  const startIndex = sql.indexOf(start);
  const endIndex = sql.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return sql.slice(startIndex, endIndex);
}

describe('direct Checkout late-success reconciliation migration', () => {
  it('installs an orthogonal, write-once payment hold without erasing provider truth', () => {
    expect(sql).toContain('create table public.billing_direct_checkout_late_success_tasks');
    expect(sql).toContain('add column late_checkout_success_task_pk uuid');
    expect(sql).toContain('payments_late_checkout_success_task_fk');
    expect(sql).toContain("late_checkout_success_task_pk is null\n    or charge_model = 'direct'");
    expect(sql).toContain('protect_payment_late_checkout_success_hold_trigger');
    expect(sql).toContain('direct checkout late-success payment hold is immutable');
    expect(sql).not.toContain('set stripe_checkout_session = null');
    expect(sql).not.toContain('stripe_checkout_session is null\n      and paid_at is null');
  });

  it('supports a skeleton task before provider reads and a durable exact action afterward', () => {
    for (const fact of [
      'provider_event_id text check',
      'late_success_projection jsonb check',
      'prepared_action text check',
      'prepared_current_operation_pk uuid',
      'prepared_current_session_id text check',
      'prepared_current_session_expires_at timestamptz',
      'expire_operation_id text check',
      'prepared_at timestamptz',
      'validated late-success paid evidence is immutable',
      'direct checkout late-success provider action is immutable',
    ]) {
      expect(sql).toContain(fact);
    }
    expect(sql).toContain('provider_event_id is null');
    expect(sql).toContain('late_success_projection is null');
    expect(sql).toContain("prepared_action = 'retrieve_then_expire'");
  });

  it('treats JSON nulls and nullable finalization inputs as invalid, never as a passed predicate', () => {
    const projectionValidator = sliceBetween(
      'create function public.direct_checkout_late_success_projection_is_valid(',
      'create function public.direct_checkout_late_success_observation_is_valid(',
    );
    const observationValidator = sliceBetween(
      'create function public.direct_checkout_late_success_observation_is_valid(',
      'create function public.protect_direct_checkout_late_success_task()',
    );
    expect(projectionValidator).toContain('return coalesce((');
    expect(observationValidator).toContain('return coalesce((');
    expect(projectionValidator).not.toContain('pg_catalog.coalesce');
    expect(observationValidator).not.toContain('pg_catalog.coalesce');
    expect(projectionValidator).toContain('), false);');
    expect(observationValidator).toContain('), false);');

    const prepare = sliceBetween(
      'create function public.prepare_stripe_connected_checkout_late_success_resolution(',
      'create function public.finalize_stripe_connected_checkout_late_success_resolution(',
    );
    expect(prepare).toMatch(/direct_checkout_late_success_projection_is_valid\([\s\S]*\) is not true then/);

    const finalize = sliceBetween(
      'create function public.finalize_stripe_connected_checkout_late_success_resolution(',
      'create function public.fail_stripe_connected_checkout_late_success_resolution(',
    );
    expect(finalize).toContain('or p_outcome is null');
    expect(finalize).toContain('or p_reason_code is null');
    expect(finalize).toMatch(/direct_checkout_late_success_observation_is_valid\([\s\S]*\) is not true/);
  });

  it('plans and blocks an expired or already-held generation before Stripe evidence is loaded', () => {
    const planner = sliceBetween(
      'create function public.plan_stripe_connected_payment_projection(',
      'create function public.prepare_stripe_connected_checkout_late_success_resolution(',
    );
    const eventLock = planner.indexOf('from public.billing_events e');
    const accountLock = planner.indexOf('from public.accounts a', eventLock);
    const paymentLock = planner.indexOf('from public.payments p', accountLock);
    const operationLock = planner.indexOf(
      'from public.billing_payment_operations locked_operation',
      paymentLock,
    );
    const taskLock = planner.indexOf(
      'from public.billing_direct_checkout_late_success_tasks t',
      operationLock,
    );
    expect(accountLock).toBeGreaterThan(eventLock);
    expect(paymentLock).toBeGreaterThan(accountLock);
    expect(operationLock).toBeGreaterThan(paymentLock);
    expect(taskLock).toBeGreaterThan(operationLock);
    expect(planner).toContain('order by locked_operation.checkout_generation');
    expect(planner).toContain('extensions.digest');
    expect(planner).toContain("v_paid.checkout_lifecycle = 'expired_unpaid'");
    expect(planner).toContain("x.observed_payment_method_types = array['card']::text[]");
    expect(planner).toContain('with recursive lineage as');
    expect(planner).toContain('set late_checkout_success_task_pk = v_task.id');
    expect(planner).toContain("'late_predecessor'::text");
  });

  it('keeps submitted provider creation retryable and terminalizes only fixed outcomes', () => {
    const prepare = sliceBetween(
      'create function public.prepare_stripe_connected_checkout_late_success_resolution(',
      'create function public.finalize_stripe_connected_checkout_late_success_resolution(',
    );
    expect(prepare).toContain("v_current.state in ('submitted', 'indeterminate')");
    expect(prepare).toContain('successor provider identity is not durable yet');
    expect(prepare).toContain("v_action := 'retrieve_then_expire'");
    expect(prepare).toContain('set prepared_action = v_action');
    expect(prepare).toContain("task_state not in ('successor_neutralized', 'manual_review')");

    const finalize = sliceBetween(
      'create function public.finalize_stripe_connected_checkout_late_success_resolution(',
      'create function public.fail_stripe_connected_checkout_late_success_resolution(',
    );
    expect(finalize).toContain('direct_checkout_late_success_observation_is_valid');
    expect(finalize).toContain("projection_applied = false");
    expect(finalize).toContain("'direct_payment_additional_paid_truth_manual_review'");
    expect(finalize).not.toContain("set status = 'paid'");
    expect(finalize).not.toContain('stripe_payment_intent =');
  });

  it('fences presentation, generation, settlement, and new refund egress', () => {
    for (const consumer of [
      'prepare_one_off_direct_invoice_payment',
      'claim_one_off_direct_checkout_operation',
      'begin_one_off_direct_checkout_submission',
      'complete_one_off_direct_checkout_operation',
      'resolve_stripe_connected_payment_projection_binding',
      'project_stripe_connected_payment_event',
      'enqueue_one_off_direct_payment_settlement',
      'claim_direct_payment_settlement_tasks',
      'record_direct_payment_settlement_feed',
      'stage_direct_payment_settlement_sms',
      'compute_direct_charge_refund_plan',
      'claim_direct_charge_refund_operation',
      'begin_direct_charge_refund_submission',
      'begin_direct_application_fee_refund_submission',
      'claim_next_due_stripe_connected_payment_event',
    ]) {
      expect(sql).toContain(consumer);
    }
    expect(sql.match(/pg_catalog\.pg_get_functiondef/g)).toHaveLength(15);
    expect(sql).toContain('return v_payment.late_checkout_success_task_pk is null');
    expect(sql).toContain('create function public.confirm_one_off_direct_checkout_presentation');
    expect(sql).toContain('predecessor.checkout_generation < v_operation.checkout_generation');
    expect(sql).toContain("last_error_code = 'late_success_payment_hold'");
    expect(sql).toContain('connected payment attempt-cap task source contract drifted');
    expect(sql).toContain("reason_code = 'projection_retry_attempt_limit'");

    const attemptCap = sliceBetween(
      '-- the connected-payment selector owns the durable eight-attempt cap',
      '-- the staff readiness page needs to distinguish an active hard hold',
    );
    const replacement = attemptCap.slice(attemptCap.indexOf('v_new text := $replacement$'));
    const accountLock = replacement.indexOf('from public.accounts a');
    const paymentLock = replacement.indexOf('from public.payments p', accountLock);
    const operationLock = replacement.indexOf(
      'from public.billing_payment_operations locked_operation',
      paymentLock,
    );
    const taskLock = replacement.indexOf(
      'from public.billing_direct_checkout_late_success_tasks t',
      operationLock,
    );
    const taskUpdate = replacement.indexOf(
      'update public.billing_direct_checkout_late_success_tasks t',
      taskLock,
    );
    const eventUpdate = replacement.indexOf('update public.billing_events e', taskUpdate);
    expect(accountLock).toBeGreaterThanOrEqual(0);
    expect(paymentLock).toBeGreaterThan(accountLock);
    expect(operationLock).toBeGreaterThan(paymentLock);
    expect(taskLock).toBeGreaterThan(operationLock);
    expect(replacement.indexOf("'lgq.direct_checkout_late_success_task_id'", taskLock))
      .toBeLessThan(taskUpdate);
    expect(eventUpdate).toBeGreaterThan(taskUpdate);
  });

  it('exposes only a bounded, aggregate-only staff summary for the private hold ledger', () => {
    const summary = sliceBetween(
      'create function public.admin_billing_direct_checkout_late_success_summary()',
      '-- the task ledger is not a data api surface',
    );
    expect(summary).toContain('language sql\nstable\nsecurity definer\nset search_path = \'\'');
    for (const column of [
      'total_count bigint',
      'held_payment_count bigint',
      'worker_open_count bigint',
      'successor_neutralized_count bigint',
      'manual_review_count bigint',
      'evidence_count bigint',
      'oldest_held_at timestamptz',
      'fixed_reason_code text',
      'fixed_reason_code_count bigint',
      'fixed_reason_codes_truncated boolean',
    ]) {
      expect(summary).toContain(column);
    }
    for (const reason of [
      'successor_never_submitted',
      'successor_signed_expired_unpaid',
      'successor_expired_unpaid',
      'additional_paid_truth_operator_required',
      'successor_additional_paid_truth',
      'successor_contract_mismatch',
      'late_success_successor_expire_indeterminate',
      'projection_retry_attempt_limit',
      'unrecognized_error_code',
    ]) {
      expect(summary).toContain(`'${reason}'`);
    }
    expect(summary).toContain('from public.billing_direct_checkout_late_success_tasks as task');
    expect(summary).toContain('with task_groups as materialized');
    expect(summary).toContain("where groups.task_state in ('successor_neutralized', 'manual_review')");
    expect(summary).toContain('group by groups.fixed_reason_code');
    expect(summary).not.toContain(' limit ');
    expect(summary).not.toMatch(/\b(?:insert into|update\s+public\.|delete from|truncate|merge into)\b/);
    expect(sql).toContain(
      'revoke all on function public.admin_billing_direct_checkout_late_success_summary()',
    );
    expect(sql).toContain(
      'grant execute on function public.admin_billing_direct_checkout_late_success_summary()\n  to service_role;',
    );
    expect(sql).not.toContain(
      'grant select on table public.billing_direct_checkout_late_success_tasks',
    );
  });

  it('is dark, private, service-only, and transactionally complete', () => {
    expect(sql.startsWith('-- dark late-success reconciliation')).toBe(true);
    expect(sql).toContain('alter table public.billing_direct_checkout_late_success_tasks force row level security');
    expect(sql).toContain('revoke all on table public.billing_direct_checkout_late_success_tasks');
    expect(sql).toContain('from public, anon, authenticated, service_role');
    for (const rpc of [
      'plan_stripe_connected_payment_projection',
      'prepare_stripe_connected_checkout_late_success_resolution',
      'finalize_stripe_connected_checkout_late_success_resolution',
      'fail_stripe_connected_checkout_late_success_resolution',
      'confirm_one_off_direct_checkout_presentation',
      'admin_billing_direct_checkout_late_success_summary',
    ]) {
      expect(sql).toContain(`grant execute on function public.${rpc}`);
    }
    expect(sql).not.toContain('create policy');
    expect(sql).not.toContain('http_post');
    expect(sql).not.toContain('net.http');
    expect(sql).not.toContain('alter role');
    expect(sql).not.toContain('alter database');
    expect(sql.trimEnd().endsWith('commit;')).toBe(true);
  });
});
