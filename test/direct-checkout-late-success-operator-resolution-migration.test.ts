import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(
  process.cwd(),
  'migrations',
  '20260816213000_direct_checkout_late_success_operator_resolution.sql',
), 'utf8');

function bodyBetween(start: string, end: string): string {
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end, startAt + start.length);
  expect(startAt).toBeGreaterThanOrEqual(0);
  expect(endAt).toBeGreaterThan(startAt);
  return source.slice(startAt, endAt);
}

function dynamicPatchFor(signature: string): string {
  const signatureAt = source.indexOf(`'${signature}'`);
  expect(signatureAt).toBeGreaterThanOrEqual(0);
  const startAt = source.lastIndexOf('do $$', signatureAt);
  const endAt = source.indexOf('$$;', signatureAt);
  expect(startAt).toBeGreaterThanOrEqual(0);
  expect(endAt).toBeGreaterThan(signatureAt);
  const block = source.slice(startAt, endAt + 3);
  expect(block).toContain('pg_catalog.pg_get_functiondef');
  return block;
}

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('direct Checkout late-success operator-resolution migration', () => {
  it('is staging-first, additive, transactional, and leaves every activation gate alone', () => {
    expect(source).toMatch(/^-- DARK operator resolution/);
    expect(source).toContain('begin;');
    expect(source.trimEnd().endsWith('commit;')).toBe(true);
    expect(source).toContain("where p.charge_model = 'direct'");
    expect(source).toContain('from public.billing_payment_operations o');
    expect(source).toContain('from public.billing_direct_checkout_late_success_tasks t');
    expect(source).toContain('requires zero existing direct payment, operation, and late-success rows');
    expect(source).not.toMatch(/alter\s+table\s+public\.billing_runtime_config/i);
    expect(source).not.toMatch(/vercel|supabase_migrations\.schema_migrations/i);
    expect(source).not.toMatch(/stripe\.(?:checkout|refunds|paymentIntents)|https?:\/\//i);
  });

  it('installs an immutable FORCE-RLS ledger with one settle release per payment', () => {
    expect(source).toContain('create table public.billing_direct_checkout_late_success_resolutions');
    expect(source).toContain("action in ('settle_paid_predecessor', 'retain_hold')");
    expect(source).toContain('task_id uuid not null unique');
    expect(source).not.toContain('payment_id uuid not null unique');
    expect(source).not.toContain('paid_operation_pk uuid not null unique');
    expect(source).toContain('direct_checkout_late_resolution_single_settle_per_payment');
    expect(source).toContain("where action = 'settle_paid_predecessor'");
    expect(source).toContain('enable row level security');
    expect(source).toContain('force row level security');
    expect(source).toContain('direct Checkout late-success resolutions are append-only');
    expect(source).toMatch(/revoke all on table\s+public\.billing_direct_checkout_late_success_resolutions\s+from public, anon, authenticated, service_role;/);
  });

  it('adds separate write-once paid and settle pointers without reparenting current truth', () => {
    expect(source).toContain('add column paid_checkout_operation_pk uuid');
    expect(source).toContain('add column late_checkout_success_resolution_pk uuid');
    expect(source).toContain('payments_paid_checkout_operation_fk');
    expect(source).toContain('payments_late_checkout_success_resolution_fk');
    expect(source).toContain('payments.paid_checkout_operation_pk is immutable once assigned');
    expect(source).toContain('payments.late_checkout_success_resolution_pk is immutable once assigned');

    const settle = bodyBetween(
      'create function public.settle_direct_checkout_late_success_task(',
      'create function public.record_direct_checkout_late_success_manual_disposition(',
    );
    expect(settle).toContain('paid_checkout_operation_pk = v_task.paid_operation_pk');
    expect(settle).toContain('late_checkout_success_resolution_pk = v_resolution.id');
    expect(settle).not.toMatch(/set\s+current_checkout_operation_pk\s*=/i);
    expect(settle).not.toMatch(/set\s+stripe_checkout_session\s*=/i);
    expect(settle).not.toMatch(/set\s+late_checkout_success_task_pk\s*=/i);
    expect(settle).not.toMatch(/checkout_lifecycle\s*=\s*'paid'/i);
  });

  it('derives timezone-stable CAS fingerprints and snapshots a live Auth identity', () => {
    expect(source).toContain('direct_checkout_late_success_evidence_fingerprint_v1');
    expect(source).toContain('direct_checkout_late_success_task_set_fingerprint_v1');
    expect(source).toMatch(/create function public\.direct_checkout_late_success_evidence_sha256[\s\S]*?set timezone to 'UTC'/);
    expect(source).toMatch(/create function public\.direct_checkout_late_success_task_set_sha256[\s\S]*?set timezone to 'UTC'/);
    expect(source).toContain("p_request_sha256 !~ '^[0-9a-f]{64}$'");
    expect(source).toContain("p_task_set_sha256 !~ '^[0-9a-f]{64}$'");
    expect(source).toContain("p_evidence_sha256 !~ '^[0-9a-f]{64}$'");
    expect(source).toContain('from auth.users u');
    expect(source).toContain('actor_user_id uuid not null');
    expect(source).not.toContain('references auth.users(id)');
    expect(source).not.toContain('public.staff');
    expect(source).toContain('a future route must add');
    expect(source).toContain('MFA plus an explicit staff/permission check');
  });

  it('rejects NULL service-RPC inputs and compares durable replays NULL-safely', () => {
    const plan = bodyBetween(
      'create function public.plan_direct_checkout_late_success_operator_resolution(',
      'create function public.settle_direct_checkout_late_success_task(',
    );
    const settle = bodyBetween(
      'create function public.settle_direct_checkout_late_success_task(',
      'create function public.record_direct_checkout_late_success_manual_disposition(',
    );
    const retain = bodyBetween(
      'create function public.record_direct_checkout_late_success_manual_disposition(',
      '-- Financial consumers accept only a fully bound canonical release.',
    );

    expect(plan).toContain('or p_action is null');
    for (const input of [
      'p_request_sha256',
      'p_task_set_sha256',
      'p_evidence_sha256',
    ]) {
      expect(settle).toContain(`or ${input} is null`);
      expect(retain).toContain(`or ${input} is null`);
      expect(settle).toContain(`v_resolution.${input.slice(2)} is distinct from ${input}`);
      expect(retain).toContain(`v_resolution.${input.slice(2)} is distinct from ${input}`);
    }
    expect(retain).toContain('or p_disposition_reason is null');
    expect(retain).toContain(
      'v_resolution.disposition_reason is distinct from p_disposition_reason',
    );
  });

  it('never advertises a second disposition for an already-resolved task', () => {
    const plan = bodyBetween(
      'create function public.plan_direct_checkout_late_success_operator_resolution(',
      'create function public.settle_direct_checkout_late_success_task(',
    );
    expect(plan).toContain(
      'from public.billing_direct_checkout_late_success_resolutions r',
    );
    expect(plan).toContain('v_existing_resolution_action is not null');
    expect(plan).toContain("v_decision := 'reject_task_already_resolved'");
    expect(plan).toContain("v_reason := 'task_already_resolved'");
  });

  it('settles only one reconciled neutralized predecessor and has exact stable replay', () => {
    const settle = bodyBetween(
      'create function public.settle_direct_checkout_late_success_task(',
      'create function public.record_direct_checkout_late_success_manual_disposition(',
    );
    expect(settle).toContain('v_task_count <> 1');
    expect(settle).toContain("v_payment.status::text <> 'processing'");
    expect(settle).toContain("v_task.task_state <> 'successor_neutralized'");
    expect(settle).toContain("v_task.provider_reconciliation_status <> 'reconciled'");
    expect(settle).toContain("v_task.resolution_source = 'never_submitted'");
    expect(settle).toContain("v_task.resolution_source = 'signed_expiration'");
    expect(settle).toContain("v_task.resolution_source = 'stripe_observation'");
    expect(settle).toContain("'already_settled'::text");
    expect(settle).toContain('late-success settle replay conflicts with durable outcome');
    expect(settle).toContain("projection_result = 'direct_payment_late_success_resolved_settled'");
    expect(settle).toContain('late-success settlement task was not atomically enqueued');
  });

  it('uses a dedicated invoice settlement helper and never fabricates an event lease', () => {
    const helper = bodyBetween(
      'create function public.enqueue_one_off_direct_payment_late_success_settlement(',
      '-- Dispatch the exact owned late-resolution transition',
    );
    expect(helper).toContain('late-success settlement invoice arithmetic no longer reconciles');
    expect(helper).toContain('late-success settlement fee allocation no longer matches invoice scope');
    expect(helper).toContain('insert into public.billing_direct_payment_settlement_tasks');
    expect(helper).toContain("v_event.processing_status <> 'processed'");
    expect(helper).not.toMatch(/set\s+processing_status\s*=\s*'processing'/i);
    expect(helper).not.toContain('projection_claim_token =');
  });

  it('retains manual dispositions permanently and does not expose a release pointer', () => {
    const retain = bodyBetween(
      'create function public.record_direct_checkout_late_success_manual_disposition(',
      '-- Financial consumers accept only a fully bound canonical release.',
    );
    expect(retain).toContain("'retain_hold'");
    expect(retain).toContain("'hold_retained'::text");
    expect(retain).toContain("'already_retained'::text");
    expect(retain).toContain("projection_result = 'direct_payment_late_success_hold_retained'");
    expect(retain).not.toMatch(/update\s+public\.payments/i);
  });

  it('keeps Checkout hard-held while releasing only bounded financial consumers', () => {
    expect(source).toContain('direct_checkout_late_success_has_active_hold');
    expect(source).toContain('direct_checkout_late_success_refund_release_is_valid');
    expect(source).toContain('claim_direct_payment_settlement_tasks(integer)');
    expect(source).toContain('record_direct_payment_settlement_feed(uuid,uuid)');
    expect(source).toContain('stage_direct_payment_settlement_sms(uuid,uuid,text,text)');
    expect(source).toContain('compute_direct_charge_refund_plan(uuid,uuid,text,boolean,uuid,text)');
    expect(source).toContain('claim_direct_charge_refund_operation(uuid,uuid,text,boolean,uuid,text,text,bigint,bigint,bigint,bigint,text,text,text,text,text,text,text)');
    expect(source).toContain('begin_direct_charge_refund_submission(uuid,uuid)');
    expect(source).toContain('begin_direct_application_fee_refund_submission(uuid,uuid)');
    expect(source).not.toContain("pg_get_functiondef(\n    'public.prepare_one_off_direct_invoice_payment");
    expect(source).not.toContain("pg_get_functiondef(\n    'public.claim_one_off_direct_checkout_operation");
    expect(source).not.toContain("pg_get_functiondef(\n    'public.complete_one_off_direct_checkout_operation");
    expect(source).not.toContain("pg_get_functiondef(\n    'public.resolve_stripe_connected_payment_projection_binding");
  });

  it('guards every source replacement and exposes only bounded service RPCs', () => {
    const guardReplacement = bodyBetween(
      '-- Full-replace the expiration/payment reciprocal guard.',
      '-- Normal paid projection owns the current generation.',
    );
    expect(guardReplacement).toContain(
      "'public.guard_stripe_connected_checkout_expiration_payment_truth()'",
    );
    expect(guardReplacement).toContain('d8b1b034df109dfb27fc5a353140a98d');
    expect(guardReplacement).toMatch(
      /create or replace function\s+public\.guard_stripe_connected_checkout_expiration_payment_truth\(\)/,
    );

    for (const contract of [
      {
        signature: 'public.project_stripe_connected_payment_event(uuid,uuid,jsonb)',
        hash: 'e581f8243fdfb826ee50ae0b032206a8',
        replacement: 'paid_checkout_operation_pk = v_operation.id',
      },
      {
        signature: 'public.enqueue_one_off_direct_payment_settlement()',
        hash: 'f5f9e6902f772fc593673906dae0ca1a',
        replacement: 'enqueue_one_off_direct_payment_late_success_settlement(',
      },
      {
        signature: 'public.claim_direct_payment_settlement_tasks(integer)',
        hash: 'df320e96938c878461ad0942655ee987',
        replacement: 'direct_checkout_late_success_has_active_hold(',
      },
      {
        signature: 'public.record_direct_payment_settlement_feed(uuid,uuid)',
        hash: 'e7596ee137869302ace925842b849932',
        replacement: 'direct_checkout_late_success_has_active_hold(',
      },
      {
        signature: 'public.stage_direct_payment_settlement_sms(uuid,uuid,text,text)',
        hash: '36a492069e283c4caf0f8f00a03c079c',
        replacement: 'direct_checkout_late_success_has_active_hold(',
      },
      {
        signature: 'public.compute_direct_charge_refund_plan(uuid,uuid,text,boolean,uuid,text)',
        hash: '73eb703fc38d26e72d4cdeab25334313',
        replacement: 'direct_checkout_late_success_refund_release_is_valid(',
      },
      {
        signature: 'public.claim_direct_charge_refund_operation(uuid,uuid,text,boolean,uuid,text,text,bigint,bigint,bigint,bigint,text,text,text,text,text,text,text)',
        hash: '9eb7b146b4d4e7da22d509a6c22c23c2',
        replacement: 'direct_checkout_late_success_refund_release_is_valid(',
      },
      {
        signature: 'public.begin_direct_charge_refund_submission(uuid,uuid)',
        hash: '4cf6cf523dfa076e02f7445b5d531159',
        replacement: 'direct_checkout_late_success_refund_release_is_valid(',
      },
      {
        signature: 'public.begin_direct_application_fee_refund_submission(uuid,uuid)',
        hash: 'ae14901d33ab976b387c2c3033424778',
        replacement: 'direct_checkout_late_success_refund_release_is_valid(',
      },
    ]) {
      const block = dynamicPatchFor(contract.signature);
      expect(block).toContain(contract.hash);
      expect(block).toContain(contract.replacement);
      expect(block).toMatch(/execute (?:v_after|pg_catalog\.replace)/);
    }

    const acl = bodyBetween(
      '-- Private ledgers and helpers expose no Data API surface.',
      'comment on table',
    );
    for (const functionName of [
      'plan_direct_checkout_late_success_operator_resolution',
      'settle_direct_checkout_late_success_task',
      'record_direct_checkout_late_success_manual_disposition',
      'admin_billing_direct_checkout_late_success_resolution_summary',
    ]) {
      expect(acl).toMatch(new RegExp(
        `grant\\s+execute\\s+on\\s+function\\s+public\\.${escaped(functionName)}`
          + `[\\s\\S]*?\\)\\s+to\\s+service_role;`,
        'i',
      ));
    }
    expect(acl.match(
      /grant\s+execute\s+on\s+function[\s\S]*?\)\s+to\s+service_role;/gi,
    )).toHaveLength(4);
    expect(acl).not.toMatch(
      /grant\s+execute\s+on\s+function[\s\S]*?\bto\s+(?:public|anon|authenticated)\b/i,
    );
    expect(source).not.toMatch(/grant\s+(?:select|insert|update|delete)\s+on\s+public\.billing_direct_checkout_late_success_resolutions/i);
  });

  it('publishes the exact bounded admin summary contract', () => {
    expect(source).toContain('admin_billing_direct_checkout_late_success_resolution_summary()');
    expect(source).toContain("'direct_checkout_late_success_resolution_summary_v1'::text");
    for (const column of [
      'total_task_count',
      'affected_payment_count',
      'active_hold_payment_count',
      'released_payment_count',
      'resolution_ready_payment_count',
      'worker_open_count',
      'successor_neutralized_count',
      'manual_review_count',
      'evidence_count',
      'oldest_active_hold_at',
      'fixed_reason_code',
      'fixed_reason_code_count',
      'fixed_reason_codes_truncated',
    ]) expect(source).toContain(column);
  });
});
