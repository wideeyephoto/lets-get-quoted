import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = fileURLToPath(new URL(
  '../migrations/20260816221500_legacy_destination_checkout_generation_foundation.sql',
  import.meta.url,
));
const sql = readFileSync(migrationPath, 'utf8').toLowerCase();

function sliceBetween(start: string, end: string): string {
  const startAt = sql.indexOf(start);
  const endAt = sql.indexOf(end, startAt + start.length);
  expect(startAt).toBeGreaterThanOrEqual(0);
  expect(endAt).toBeGreaterThan(startAt);
  return sql.slice(startAt, endAt);
}

const rpcNames = [
  'claim_legacy_destination_checkout_operation',
  'begin_legacy_destination_checkout_submission',
  'complete_legacy_destination_checkout_operation',
  'confirm_legacy_destination_checkout_presentation',
  'mark_legacy_destination_checkout_indeterminate',
  'quarantine_legacy_destination_checkout_operation',
  'classify_legacy_destination_checkout_event',
] as const;

describe('legacy destination Checkout generation foundation migration', () => {
  it('is a dark additive transaction with an explicit fail-closed history preflight', () => {
    expect(sql.startsWith('-- dark serialized generations')).toBe(true);
    expect(sql).toContain('begin;');
    expect(sql.trimEnd().endsWith('commit;')).toBe(true);
    expect(sql).toContain("where p.charge_model = 'destination'");
    expect(sql).toContain('and p.stripe_checkout_session is not null');
    expect(sql).toContain(
      'legacy destination checkout session history requires an explicit provider-audited backfill',
    );
    expect(sql).toContain(
      'legacy destination payment has an unexpected direct checkout lineage pointer',
    );
    expect(sql).not.toContain('insert into public.payments');
    expect(sql).not.toMatch(/alter\s+table\s+public\.billing_runtime_config/);
    expect(sql).not.toMatch(/lgq_legacy_destination_checkout_generation_enabled/);
    expect(sql).not.toMatch(/https?:\/\/|net\.http|stripe\.checkout\.sessions/);
  });

  it('uses separate private FORCE-RLS append-only operation and event ledgers', () => {
    for (const table of [
      'legacy_destination_checkout_operations',
      'legacy_destination_checkout_event_receipts',
    ]) {
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`alter table public.${table} force row level security`);
      expect(sql).toMatch(new RegExp(
        `revoke all on table public\\.${table}\\s+from public, anon, authenticated, service_role;`,
      ));
      expect(sql).not.toMatch(new RegExp(`create policy[^;]+on public\\.${table}`));
      expect(sql).not.toMatch(new RegExp(
        `grant (?:select|insert|update|delete|all)[^;]*on (?:table )?public\\.${table}`,
      ));
    }
    expect(sql).toContain('legacy destination checkout generations are append-only');
    expect(sql).toContain('legacy destination checkout signed-event receipts are append-only');
    const paymentGuard = sliceBetween(
      'create function public.protect_legacy_destination_checkout_payment_lineage()',
      'create trigger protect_legacy_destination_checkout_payment_lineage_trigger',
    );
    expect(paymentGuard.slice(0, paymentGuard.indexOf('as $$')))
      .not.toContain('security definer');
    expect(paymentGuard.slice(0, paymentGuard.indexOf('as $$')))
      .toContain('security invoker');
    expect(paymentGuard).toContain('pg_catalog.pg_get_userbyid(c.relowner)');
    expect(paymentGuard).toContain("c.oid = pg_catalog.to_regclass('public.payments')");
    expect(paymentGuard).toContain(
      'current_user is distinct from v_payments_owner',
    );
    expect(paymentGuard.indexOf('current_user is distinct from v_payments_owner'))
      .toBeGreaterThan(paymentGuard.indexOf(
        'if old.current_legacy_destination_checkout_operation_pk is distinct from',
      ));
    expect(paymentGuard.indexOf('current_user is distinct from v_payments_owner'))
      .toBeLessThan(paymentGuard.indexOf('v_context is null'));
    expect(paymentGuard).toContain(
      'new.current_legacy_destination_checkout_operation_pk is not null',
    );
  });

  it('pins exact generation, predecessor, operation, Session, and idempotency identities', () => {
    for (const fact of [
      'unique (payment_id, checkout_generation)',
      'predecessor_operation_pk uuid',
      'legacy_destination_checkout_operation_predecessor_fk',
      'operation_id text not null unique',
      'ach_stripe_idempotency_key text not null unique',
      'card_stripe_idempotency_key text not null unique',
      'request_fingerprint text not null',
      'legacy_destination_checkout_operation_session_unique',
      'current_legacy_destination_checkout_operation_pk uuid',
      'legacy_destination_checkout_paid_hold_operation_pk uuid',
      'legacy_destination_checkout_paid_hold_at timestamptz',
      'legacy destination historical-paid hold is immutable',
    ]) expect(sql).toContain(fact);
    expect(sql).toContain("request_fingerprint ~ '^[0-9a-f]{64}$'");
    expect(sql).toContain("state in ('claimed', 'submitted', 'completed', 'indeterminate', 'quarantined')");
  });

  it('exposes only the seven fixed service-role RPC contracts', () => {
    for (const rpc of rpcNames) {
      const body = sliceBetween(
        `create function public.${rpc}(`,
        '$$;',
      );
      expect(body).toContain('security definer');
      expect(body).toContain("set search_path = ''");
      expect(body).toContain("set timezone to 'utc'");
      expect(sql).toContain(`grant execute on function public.${rpc}(`);
    }
    expect(sql.match(/^grant execute on function public\./gm))
      .toHaveLength(7);
    expect(sql).not.toMatch(
      /grant execute on function public\.[^;]+\bto (?:public|anon|authenticated)\b/,
    );
  });

  it('keeps every mutation transaction payment-first then generation-ordered', () => {
    const boundaries = [
      ['claim_legacy_destination_checkout_operation', 'begin_legacy_destination_checkout_submission'],
      ['begin_legacy_destination_checkout_submission', 'complete_legacy_destination_checkout_operation'],
      ['complete_legacy_destination_checkout_operation', 'confirm_legacy_destination_checkout_presentation'],
      ['confirm_legacy_destination_checkout_presentation', 'mark_legacy_destination_checkout_indeterminate'],
      ['mark_legacy_destination_checkout_indeterminate', 'quarantine_legacy_destination_checkout_operation'],
      ['quarantine_legacy_destination_checkout_operation', 'classify_legacy_destination_checkout_event'],
      ['classify_legacy_destination_checkout_event', 'revoke all on function public.claim_legacy_destination_checkout_operation'],
    ] as const;

    for (const [name, next] of boundaries) {
      const body = sliceBetween(
        `create function public.${name}(`,
        next.startsWith('revoke') ? next : `create function public.${next}(`,
      );
      const payment = body.indexOf('from public.payments p');
      const ordered = body.indexOf('from public.legacy_destination_checkout_operations o', payment);
      expect(payment).toBeGreaterThanOrEqual(0);
      expect(ordered).toBeGreaterThan(payment);
      expect(body.slice(ordered, ordered + 220)).toContain(
        'order by o.checkout_generation, o.id',
      );
    }
  });

  it('permits replacement only from exact signed current expired-unpaid evidence', () => {
    const claim = sliceBetween(
      'create function public.claim_legacy_destination_checkout_operation(',
      'create function public.begin_legacy_destination_checkout_submission(',
    );
    expect(claim).toContain("v_current.state = 'completed'");
    expect(claim).toContain("v_current.checkout_session_status = 'expired'");
    expect(claim).toContain("v_current.checkout_payment_status = 'unpaid'");
    expect(claim).toContain("r.event_type = 'checkout.session.expired'");
    expect(claim).toContain("r.classification = 'current_failure'");
    for (const blocked of [
      "v_status := 'submitted'",
      "v_status := 'indeterminate'",
      "v_status := 'quarantined'",
      "v_status := 'complete_unpaid'",
    ]) expect(claim).toContain(blocked);
    expect(sql).toContain('it performs no stripe or network call');
  });

  it('records exact signed events with NULL-safe replay and atomic history rules', () => {
    const classify = sliceBetween(
      'create function public.classify_legacy_destination_checkout_event(',
      'revoke all on function public.claim_legacy_destination_checkout_operation(',
    );
    expect(classify).toContain('or p_event_type is null');
    expect(classify).toContain('or p_outcome is null');
    for (const input of [
      'event_type',
      'event_object_id',
      'payment_id',
      'checkout_session_id',
      'payment_intent_id',
      'livemode',
      'outcome',
      'checkout_session_status',
      'checkout_payment_status',
      'observed_at',
    ]) expect(classify).toContain(`v_receipt.${input} is distinct from p_${input}`);
    expect(classify).toContain("v_classification := 'current_success'");
    expect(classify).toContain("v_classification := 'current_failure'");
    expect(classify).toContain("v_classification := 'current_nonterminal_noop'");
    expect(classify).toContain("v_classification := 'historical_failure_noop'");
    expect(classify).toContain("v_classification := 'historical_paid_hold'");
    expect(classify).toMatch(/'replay'::text,[\s\S]{0,260}false::boolean/);
    expect(classify).toContain('legacy_destination_checkout_paid_hold_operation_pk = v_operation.id');
    expect(classify.indexOf('legacy_destination_checkout_paid_hold_operation_pk = v_operation.id'))
      .toBeLessThan(classify.indexOf('insert into public.legacy_destination_checkout_event_receipts'));
    expect(classify).toContain("set status = 'paid'");
    expect(classify).toContain("set status = 'failed'");
  });

  it('does not source-patch older migrations or activate provider/configuration state', () => {
    expect(sql).not.toContain('pg_catalog.pg_get_functiondef');
    expect(sql).not.toContain('pg_catalog.replace(');
    expect(sql).not.toMatch(/execute\s+v_(?:before|after)/);
    expect(sql).not.toMatch(/create\s+extension|alter\s+role|set\s+app\./);
    expect(sql).not.toMatch(/insert\s+into\s+(?:cron\.|vault\.|supabase_migrations\.)/);
    expect(sql).not.toMatch(/delete\s+from|truncate\s+table|drop\s+table/);
  });
});
