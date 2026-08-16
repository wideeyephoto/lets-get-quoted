import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  loadAdminBillingOperations,
  summarizeBillingOperationsFixedCodes,
} from '@/lib/admin-billing-operations';

type DbError = { code?: string; message?: string } | null;
type DbResponse = { data: unknown[] | null; count: number | null; error: DbError };
type RpcResponse = { data: unknown; error: DbError };
type Filter = [method: string, column: string, value: unknown];
type QueryCall = {
  table: string;
  columns: string;
  options: { count?: string; head?: boolean } | undefined;
  filters: Filter[];
  order: [column: string, options: unknown] | null;
  limit: number | null;
};
type RpcCall = { functionName: string; args: unknown };

const OPENED_AT = '2026-08-16T12:00:00.000Z';
const DIRECT_SETTLEMENT_RPC = 'admin_billing_direct_payment_settlement_summary';
const LATE_SUCCESS_RPC = 'admin_billing_direct_checkout_late_success_summary';
const DIRECT_ERROR_CODES = [
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
  'worker_transport_error',
] as const;
const LATE_SUCCESS_REASON_CODES = [
  'successor_never_submitted',
  'successor_signed_expired_unpaid',
  'successor_expired_unpaid',
  'late_paid_truth_without_successor',
  'additional_paid_truth_operator_required',
  'successor_additional_paid_truth',
  'successor_unexpireable_state',
  'successor_contract_mismatch',
  'successor_provider_state_indeterminate',
  'provider_metadata_mismatch',
  'provider_mode_mismatch',
  'provider_object_retrieve_failed',
  'provider_object_contract_mismatch',
  'late_success_successor_retrieve_failed',
  'late_success_successor_expire_indeterminate',
  'projection_internal_error',
  'projection_retry_attempt_limit',
] as const;

function hasFilter(call: QueryCall, method: string, column: string, value?: unknown): boolean {
  return call.filters.some((filter) => (
    filter[0] === method
    && filter[1] === column
    && (arguments.length < 4 || JSON.stringify(filter[2]) === JSON.stringify(value))
  ));
}

function readMetric(call: QueryCall): number {
  if (hasFilter(call, 'eq', 'projection_applied', true)) return 3;
  if (hasFilter(call, 'eq', 'processing_status', 'failed')) return 1;
  if (hasFilter(call, 'in', 'processing_status')) return 2;
  if (hasFilter(call, 'eq', 'state', 'indeterminate')) return 1;
  if (hasFilter(call, 'in', 'state')) return 2;
  if (hasFilter(call, 'eq', 'task_state', 'dead_letter')) return 2;
  if (hasFilter(call, 'in', 'task_state')) return 3;
  return 9;
}

function healthyTableResponse(call: QueryCall): Partial<DbResponse> {
  if (call.options?.head) return {};
  if (call.columns === 'received_at') return { data: [{ received_at: '2026-08-16T10:00:00.000Z' }] };
  if (call.columns === 'updated_at') return { data: [{ updated_at: '2026-08-16T11:00:00.000Z' }] };
  if (call.columns === 'created_at') return { data: [{ created_at: OPENED_AT }] };
  if (call.columns === 'last_error_code, dead_lettered_at') {
    return {
      data: [
        { last_error_code: 'worker_attempt_limit_reached' },
        { last_error_code: 'worker_attempt_limit_reached' },
      ],
    };
  }
  return {};
}

function directSummaryRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    total_count: '9',
    open_count: '3',
    completed_count: '4',
    dead_letter_count: '2',
    sms_indeterminate_count: '1',
    oldest_open_at: OPENED_AT,
    fixed_error_code: 'worker_attempt_limit_reached',
    fixed_error_code_count: '2',
    fixed_error_codes_truncated: false,
    ...overrides,
  };
}

function lateSuccessSummaryRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    total_count: '8',
    held_payment_count: '4',
    worker_open_count: '2',
    successor_neutralized_count: '3',
    manual_review_count: '3',
    evidence_count: '7',
    oldest_held_at: OPENED_AT,
    fixed_reason_code: 'successor_expired_unpaid',
    fixed_reason_code_count: '6',
    fixed_reason_codes_truncated: false,
    ...overrides,
  };
}

function rpcOverride(
  functionName: string,
  response: Partial<RpcResponse>,
): (call: RpcCall) => Partial<RpcResponse> {
  return (call) => (call.functionName === functionName ? response : {});
}

function fakeAdmin(
  resolver: (call: QueryCall) => Partial<DbResponse> = healthyTableResponse,
  rpcResolver: (call: RpcCall) => Partial<RpcResponse> = () => ({}),
): { admin: SupabaseClient; calls: QueryCall[]; rpcCalls: RpcCall[] } {
  const calls: QueryCall[] = [];
  const rpcCalls: RpcCall[] = [];
  const admin = {
    from: vi.fn((table: string) => ({
      select: vi.fn((columns: string, options?: { count?: string; head?: boolean }) => {
        const call: QueryCall = { table, columns, options, filters: [], order: null, limit: null };
        calls.push(call);
        const query: Record<string, unknown> = {};
        for (const method of ['eq', 'in', 'is']) {
          query[method] = (column: string, value: unknown) => {
            call.filters.push([method, column, value]);
            return query;
          };
        }
        query.order = (column: string, orderOptions: unknown) => {
          call.order = [column, orderOptions];
          return query;
        };
        query.limit = (value: number) => {
          call.limit = value;
          return query;
        };
        query.then = (
          resolve: (value: DbResponse) => unknown,
          reject?: (reason: unknown) => unknown,
        ) => {
          const defaults: DbResponse = {
            data: options?.head ? null : [],
            count: options?.count === 'exact' ? readMetric(call) : null,
            error: null,
          };
          return Promise.resolve({ ...defaults, ...resolver(call) }).then(resolve, reject);
        };
        return query;
      }),
    })),
    rpc: vi.fn((functionName: string, args?: unknown) => {
      const call = { functionName, args };
      rpcCalls.push(call);
      const defaults: RpcResponse = {
        data: functionName === LATE_SUCCESS_RPC
          ? [lateSuccessSummaryRow()]
          : [directSummaryRow()],
        error: null,
      };
      return Promise.resolve({ ...defaults, ...rpcResolver(call) });
    }),
  } as unknown as SupabaseClient;
  return { admin, calls, rpcCalls };
}

describe('read-only admin billing operations', () => {
  it('returns exact coarse summaries without selecting identifiers, payloads, metadata, or free-form errors', async () => {
    const { admin, calls, rpcCalls } = fakeAdmin();

    const report = await loadAdminBillingOperations(admin);

    expect(report.ledgers).toHaveLength(8);
    expect(report.ledgers.every((ledger) => ledger.availability === 'installed')).toBe(true);
    expect(report.ledgers.find((ledger) => ledger.id === 'subscription_events')).toMatchObject({
      oldestOpenAt: '2026-08-16T10:00:00.000Z',
      fixedErrorCodesSupported: false,
      metrics: expect.arrayContaining([
        { code: 'total', label: 'Receipts', count: 9 },
        { code: 'unresolved', label: 'Unresolved', count: 2 },
        { code: 'applied', label: 'Applied', count: 3 },
        { code: 'dead_letter', label: 'Terminal failures', count: 1 },
      ]),
    });
    expect(report.ledgers.find((ledger) => ledger.id === 'connected_expiration_events')?.metrics)
      .toContainEqual({ code: 'evidence', label: 'Expiration evidence', count: 9 });
    expect(report.ledgers.find((ledger) => ledger.id === 'direct_settlement_tasks')).toMatchObject({
      oldestOpenAt: OPENED_AT,
      fixedErrorCodesSupported: true,
      fixedErrorCodes: [{ code: 'worker_attempt_limit_reached', count: 2 }],
      fixedErrorCodesTruncated: false,
      metrics: expect.arrayContaining([
        { code: 'indeterminate', label: 'SMS indeterminate', count: 1 },
        { code: 'dead_letter', label: 'Dead letter', count: 2 },
      ]),
    });
    expect(report.ledgers.find((ledger) => ledger.id === 'direct_checkout_late_success')).toMatchObject({
      oldestOpenAt: OPENED_AT,
      fixedErrorCodesSupported: true,
      fixedErrorCodes: [{ code: 'successor_expired_unpaid', count: 6 }],
      fixedErrorCodesTruncated: false,
      metrics: expect.arrayContaining([
        { code: 'unresolved', label: 'Held payments', count: 4 },
        { code: 'worker_open', label: 'Active reconciliation', count: 2 },
        { code: 'successor_neutralized', label: 'Successor neutralized', count: 3 },
        { code: 'manual_review', label: 'Manual review', count: 3 },
        { code: 'evidence', label: 'Paid evidence verified', count: 7 },
      ]),
    });
    expect(report.ledgers.find((ledger) => ledger.id === 'quick_stop_late_refunds')?.metrics)
      .not.toContainEqual(expect.objectContaining({ code: 'indeterminate' }));
    expect(calls.some((call) => hasFilter(call, 'in', 'event_type', [
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
    ]))).toBe(true);

    const subscriptionStateCall = calls.find((call) => (
      call.table === 'billing_subscription_checkout_operations'
      && hasFilter(call, 'in', 'state')
    ));
    const directPaymentStateCall = calls.find((call) => (
      call.table === 'billing_payment_operations'
      && hasFilter(call, 'in', 'state')
    ));
    expect(subscriptionStateCall?.filters.find((filter) => filter[0] === 'in' && filter[1] === 'state')?.[2])
      .toEqual(['claimed', 'submitted', 'checkout_created', 'indeterminate']);
    expect(directPaymentStateCall?.filters.find((filter) => filter[0] === 'in' && filter[1] === 'state')?.[2])
      .toEqual(['claimed', 'submitted', 'indeterminate']);

    const selected = calls.map((call) => call.columns).join(', ');
    expect(selected).not.toMatch(/(^|[, ])(?:id|account_id|payment_id|job_id|invoice_id)(?:[, ]|$)/);
    expect(selected).not.toMatch(/payload|metadata|provider_|stripe_|last_error(?:,|$)/);
    expect(calls.filter((call) => call.columns === 'last_error_code, dead_lettered_at')).toHaveLength(1);
    expect(calls.filter((call) => call.table === 'billing_direct_payment_settlement_tasks')).toHaveLength(0);
    expect(calls.filter((call) => call.table === 'billing_direct_checkout_late_success_tasks')).toHaveLength(0);
    expect(calls).toHaveLength(22);
    expect(rpcCalls).toEqual([
      { functionName: LATE_SUCCESS_RPC, args: undefined },
      { functionName: DIRECT_SETTLEMENT_RPC, args: undefined },
    ]);
  });

  it.each(['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205'])(
    'shows missing schema code %s as not installed, never zero',
    async (code) => {
      const failure = {
        data: null,
        count: null,
        error: { code, message: 'should not reach the UI' },
      };
      const { admin, calls, rpcCalls } = fakeAdmin(
        () => failure,
        () => ({ data: null, error: failure.error }),
      );

      const report = await loadAdminBillingOperations(admin);

      expect(report.ledgers).toHaveLength(8);
      expect(report.ledgers.every((ledger) => (
        ledger.availability === 'not_installed'
        && ledger.metrics.length === 0
        && ledger.oldestOpenAt === null
      ))).toBe(true);
      expect(calls).toHaveLength(6);
      expect(rpcCalls).toHaveLength(2);
    },
  );

  it('shows unrelated database failures as unavailable without logging raw messages', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = { code: '57014', message: 'secret row value and provider identifier' };
    const { admin } = fakeAdmin(
      () => ({ data: null, count: null, error }),
      () => ({ data: null, error }),
    );

    const report = await loadAdminBillingOperations(admin);

    expect(report.ledgers.every((ledger) => (
      ledger.availability === 'unavailable'
      && ledger.metrics.length === 0
    ))).toBe(true);
    expect(JSON.stringify(consoleError.mock.calls)).toContain('57014');
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('secret row value');
    consoleError.mockRestore();
  });

  it('clears a partially readable event ledger when a required projection column is missing', async () => {
    const { admin } = fakeAdmin((call) => {
      if (hasFilter(call, 'eq', 'projection_applied', true)) {
        return { data: null, count: null, error: { code: '42703' } };
      }
      return healthyTableResponse(call);
    });

    const report = await loadAdminBillingOperations(admin);
    const eventLedgers = report.ledgers.slice(0, 3);

    expect(eventLedgers.every((ledger) => (
      ledger.availability === 'not_installed'
      && ledger.metrics.length === 0
    ))).toBe(true);
    expect(report.ledgers.slice(3).every((ledger) => ledger.availability === 'installed')).toBe(true);
  });

  it('does not let a missing-column response hide a concurrent non-schema failure', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { admin } = fakeAdmin((call) => {
      const subscription = hasFilter(call, 'eq', 'event_scope', 'platform_subscription');
      if (subscription && hasFilter(call, 'eq', 'projection_applied', true)) {
        return { data: null, count: null, error: { code: '42703' } };
      }
      if (subscription && hasFilter(call, 'eq', 'processing_status', 'failed')) {
        return { data: null, count: null, error: { code: '57014' } };
      }
      return healthyTableResponse(call);
    });

    const report = await loadAdminBillingOperations(admin);

    expect(report.ledgers[0]).toMatchObject({ availability: 'unavailable', metrics: [] });
    expect(JSON.stringify(consoleError.mock.calls)).toContain('42703');
    expect(JSON.stringify(consoleError.mock.calls)).toContain('57014');
    consoleError.mockRestore();
  });

  it('does not claim there is no oldest work when an exact count says work exists', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { admin } = fakeAdmin(
      (call) => {
        if (call.columns === 'received_at' || call.columns === 'updated_at' || call.columns === 'created_at') {
          return { data: [] };
        }
        return healthyTableResponse(call);
      },
      () => ({ data: [directSummaryRow({ oldest_open_at: null })] }),
    );

    const report = await loadAdminBillingOperations(admin);

    expect(report.ledgers.every((ledger) => ledger.availability === 'unavailable')).toBe(true);
    expect(report.ledgers.every((ledger) => ledger.oldestOpenAt === null && ledger.metrics.length === 0)).toBe(true);
    consoleError.mockRestore();
  });

  it('maps every nonallowlisted Quick Stop code to one fixed privacy-safe bucket', () => {
    const summary = summarizeBillingOperationsFixedCodes([
      { last_error_code: 'worker_attempt_limit_reached' },
      { last_error_code: 'worker_attempt_limit_reached' },
      { last_error_code: 'request_missing' },
      { last_error_code: 'customer_brett_marker' },
      { last_error_code: 'PII@example.com' },
      { last_error_code: null },
      null,
    ], 8);

    expect(summary).toEqual({
      codes: [
        { code: 'unrecognized_error_code', count: 4 },
        { code: 'worker_attempt_limit_reached', count: 2 },
        { code: 'request_missing', count: 1 },
      ],
      truncated: true,
    });
    expect(JSON.stringify(summary)).not.toMatch(/customer_brett_marker|PII@example\.com/);
  });

  it.each(['PGRST202', '42883'])('treats missing direct-settlement RPC code %s as not installed', async (code) => {
    const { admin } = fakeAdmin(
      healthyTableResponse,
      rpcOverride(DIRECT_SETTLEMENT_RPC, {
        data: null,
        error: { code, message: 'function is absent' },
      }),
    );

    const report = await loadAdminBillingOperations(admin);
    const direct = report.ledgers.find((ledger) => ledger.id === 'direct_settlement_tasks');

    expect(direct).toMatchObject({ availability: 'not_installed', metrics: [], fixedErrorCodes: [] });
    expect(report.ledgers.filter((ledger) => ledger.id !== 'direct_settlement_tasks')
      .every((ledger) => ledger.availability === 'installed')).toBe(true);
  });

  it('treats a direct-settlement RPC permission failure as unavailable without logging its message', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { admin } = fakeAdmin(
      healthyTableResponse,
      rpcOverride(DIRECT_SETTLEMENT_RPC, {
        data: null,
        error: { code: '42501', message: 'private provider detail' },
      }),
    );

    const report = await loadAdminBillingOperations(admin);
    const direct = report.ledgers.find((ledger) => ledger.id === 'direct_settlement_tasks');

    expect(direct).toMatchObject({ availability: 'unavailable', metrics: [], fixedErrorCodes: [] });
    expect(JSON.stringify(consoleError.mock.calls)).toContain('42501');
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('private provider detail');
    consoleError.mockRestore();
  });

  const malformedRpcRows: [string, unknown][] = [
    ['null data', null],
    ['empty rows', []],
    ['null row', [null]],
    ['scalar row', [42]],
    ['negative count', [directSummaryRow({ total_count: '-1' })]],
    ['fractional count', [directSummaryRow({ open_count: '1.5' })]],
    ['partition mismatch', [directSummaryRow({ total_count: '10' })]],
    ['SMS count beyond dead letters', [directSummaryRow({ sms_indeterminate_count: '3' })]],
    ['missing oldest-open timestamp', [directSummaryRow({ oldest_open_at: null })]],
    ['raw unknown code', [directSummaryRow({ fixed_error_code: 'customer_brett_marker' })]],
    ['zero grouped count', [directSummaryRow({ fixed_error_code_count: '0' })]],
    ['group-count sum mismatch', [directSummaryRow({ fixed_error_code_count: '1' })]],
    ['truncated exact result', [directSummaryRow({ fixed_error_codes_truncated: true })]],
    ['conflicting repeated totals', [
      directSummaryRow({ fixed_error_code_count: '1' }),
      directSummaryRow({
        total_count: '8',
        fixed_error_code: 'worker_contract_error',
        fixed_error_code_count: '1',
      }),
    ]],
    ['more than the bounded code set', Array.from({ length: 24 }, () => directSummaryRow())],
  ];

  it.each(malformedRpcRows)('fails the direct ledger closed for malformed RPC result: %s', async (_name, data) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { admin } = fakeAdmin(
      healthyTableResponse,
      rpcOverride(DIRECT_SETTLEMENT_RPC, { data }),
    );

    const report = await loadAdminBillingOperations(admin);
    const direct = report.ledgers.find((ledger) => ledger.id === 'direct_settlement_tasks');

    expect(direct).toMatchObject({
      availability: 'unavailable',
      metrics: [],
      oldestOpenAt: null,
      fixedErrorCodes: [],
    });
    expect(report.ledgers.filter((ledger) => ledger.id !== 'direct_settlement_tasks')
      .every((ledger) => ledger.availability === 'installed')).toBe(true);
    expect(JSON.stringify(report)).not.toContain('customer_brett_marker');
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('customer_brett_marker');
    consoleError.mockRestore();
  });

  it('accepts the single null-code aggregate row for a ledger with no dead letters', async () => {
    const { admin } = fakeAdmin(
      healthyTableResponse,
      rpcOverride(DIRECT_SETTLEMENT_RPC, {
        data: [directSummaryRow({
          total_count: '7',
          dead_letter_count: '0',
          sms_indeterminate_count: '0',
          fixed_error_code: null,
          fixed_error_code_count: '0',
        })],
      }),
    );

    const report = await loadAdminBillingOperations(admin);
    expect(report.ledgers.find((ledger) => ledger.id === 'direct_settlement_tasks')).toMatchObject({
      availability: 'installed',
      fixedErrorCodes: [],
      metrics: expect.arrayContaining([{ code: 'dead_letter', label: 'Dead letter', count: 0 }]),
    });
  });

  it('accepts every audited direct-settlement code plus the fixed fallback bucket', async () => {
    const codes = [...DIRECT_ERROR_CODES, 'unrecognized_error_code'];
    const { admin } = fakeAdmin(
      healthyTableResponse,
      rpcOverride(DIRECT_SETTLEMENT_RPC, {
        data: codes.map((code) => directSummaryRow({
          total_count: '28',
          completed_count: '2',
          dead_letter_count: '23',
          fixed_error_code: code,
          fixed_error_code_count: '1',
        })),
      }),
    );

    const report = await loadAdminBillingOperations(admin);
    const direct = report.ledgers.find((ledger) => ledger.id === 'direct_settlement_tasks');

    expect(direct?.availability).toBe('installed');
    expect(new Set(direct?.fixedErrorCodes.map((entry) => entry.code))).toEqual(new Set(codes));
    expect(direct?.fixedErrorCodes.every((entry) => entry.count === 1)).toBe(true);
  });

  it.each(['PGRST202', '42883'])(
    'treats missing direct Checkout late-success summary RPC code %s as not installed',
    async (code) => {
      const { admin } = fakeAdmin(
        healthyTableResponse,
        rpcOverride(LATE_SUCCESS_RPC, {
          data: null,
          error: { code, message: 'function is absent' },
        }),
      );

      const report = await loadAdminBillingOperations(admin);
      const late = report.ledgers.find((ledger) => ledger.id === 'direct_checkout_late_success');

      expect(late).toMatchObject({ availability: 'not_installed', metrics: [], fixedErrorCodes: [] });
      expect(report.ledgers.filter((ledger) => ledger.id !== 'direct_checkout_late_success')
        .every((ledger) => ledger.availability === 'installed')).toBe(true);
    },
  );

  const malformedLateSuccessRows: [string, unknown][] = [
    ['null data', null],
    ['empty rows', []],
    ['negative count', [lateSuccessSummaryRow({ total_count: '-1' })]],
    ['partition mismatch', [lateSuccessSummaryRow({ total_count: '9' })]],
    ['held payments beyond task count', [lateSuccessSummaryRow({ held_payment_count: '9' })]],
    ['evidence beyond total', [lateSuccessSummaryRow({ evidence_count: '9' })]],
    ['missing oldest-held timestamp', [lateSuccessSummaryRow({ oldest_held_at: null })]],
    ['oldest-held timestamp without a hold', [lateSuccessSummaryRow({
      held_payment_count: '0',
    })]],
    ['raw unknown reason', [lateSuccessSummaryRow({ fixed_reason_code: 'customer_brett_marker' })]],
    ['zero grouped count', [lateSuccessSummaryRow({ fixed_reason_code_count: '0' })]],
    ['group-count sum mismatch', [lateSuccessSummaryRow({ fixed_reason_code_count: '5' })]],
    ['truncated exact result', [lateSuccessSummaryRow({ fixed_reason_codes_truncated: true })]],
    ['conflicting repeated totals', [
      lateSuccessSummaryRow({ fixed_reason_code_count: '3' }),
      lateSuccessSummaryRow({
        total_count: '7',
        fixed_reason_code: 'successor_contract_mismatch',
        fixed_reason_code_count: '3',
      }),
    ]],
    ['more than the bounded reason set', Array.from({ length: 19 }, () => lateSuccessSummaryRow())],
  ];

  it.each(malformedLateSuccessRows)(
    'fails the late-success ledger closed for malformed RPC result: %s',
    async (_name, data) => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { admin } = fakeAdmin(
        healthyTableResponse,
        rpcOverride(LATE_SUCCESS_RPC, { data }),
      );

      const report = await loadAdminBillingOperations(admin);
      const late = report.ledgers.find((ledger) => ledger.id === 'direct_checkout_late_success');

      expect(late).toMatchObject({
        availability: 'unavailable',
        metrics: [],
        oldestOpenAt: null,
        fixedErrorCodes: [],
      });
      expect(report.ledgers.filter((ledger) => ledger.id !== 'direct_checkout_late_success')
        .every((ledger) => ledger.availability === 'installed')).toBe(true);
      expect(JSON.stringify(report)).not.toContain('customer_brett_marker');
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain('customer_brett_marker');
      consoleError.mockRestore();
    },
  );

  it('accepts a single null-reason aggregate row when every late-success task is still open', async () => {
    const { admin } = fakeAdmin(
      healthyTableResponse,
      rpcOverride(LATE_SUCCESS_RPC, {
        data: [lateSuccessSummaryRow({
          total_count: '2',
          held_payment_count: '1',
          worker_open_count: '2',
          successor_neutralized_count: '0',
          manual_review_count: '0',
          evidence_count: '1',
          fixed_reason_code: null,
          fixed_reason_code_count: '0',
        })],
      }),
    );

    const report = await loadAdminBillingOperations(admin);
    expect(report.ledgers.find((ledger) => ledger.id === 'direct_checkout_late_success')).toMatchObject({
      availability: 'installed',
      fixedErrorCodes: [],
      metrics: expect.arrayContaining([
        { code: 'unresolved', label: 'Held payments', count: 1 },
        { code: 'worker_open', label: 'Active reconciliation', count: 2 },
      ]),
    });
  });

  it('keeps the oldest unresolved age when only terminal task states retain a payment hold', async () => {
    const { admin } = fakeAdmin(
      healthyTableResponse,
      rpcOverride(LATE_SUCCESS_RPC, {
        data: [lateSuccessSummaryRow({
          total_count: '6',
          held_payment_count: '1',
          worker_open_count: '0',
          successor_neutralized_count: '3',
          manual_review_count: '3',
          evidence_count: '6',
        })],
      }),
    );

    const report = await loadAdminBillingOperations(admin);
    expect(report.ledgers.find((ledger) => ledger.id === 'direct_checkout_late_success')).toMatchObject({
      availability: 'installed',
      oldestOpenAt: OPENED_AT,
      metrics: expect.arrayContaining([
        { code: 'unresolved', label: 'Held payments', count: 1 },
        { code: 'worker_open', label: 'Active reconciliation', count: 0 },
      ]),
    });
  });

  it('accepts every audited late-success reason plus the fixed fallback bucket', async () => {
    const codes = [...LATE_SUCCESS_REASON_CODES, 'unrecognized_error_code'];
    const { admin } = fakeAdmin(
      healthyTableResponse,
      rpcOverride(LATE_SUCCESS_RPC, {
        data: codes.map((code) => lateSuccessSummaryRow({
          total_count: '20',
          held_payment_count: '10',
          worker_open_count: '2',
          successor_neutralized_count: '8',
          manual_review_count: '10',
          evidence_count: '18',
          fixed_reason_code: code,
          fixed_reason_code_count: '1',
        })),
      }),
    );

    const report = await loadAdminBillingOperations(admin);
    const late = report.ledgers.find((ledger) => ledger.id === 'direct_checkout_late_success');

    expect(late?.availability).toBe('installed');
    expect(new Set(late?.fixedErrorCodes.map((entry) => entry.code))).toEqual(new Set(codes));
    expect(late?.fixedErrorCodes.every((entry) => entry.count === 1)).toBe(true);
  });

  it('keeps the aggregate RPC least-privilege, exact, and free of activation behavior', () => {
    const migration = readFileSync(join(
      process.cwd(),
      'migrations',
      '20260816175955_admin_billing_operations_summary.sql',
    ), 'utf8');

    expect(migration).toMatch(/\bbegin;[\s\S]*\bcommit;/i);
    expect(migration).toMatch(/create or replace function public\.admin_billing_direct_payment_settlement_summary\(\)/i);
    expect(migration).toMatch(/language sql\s+stable\s+security definer\s+set search_path = ''/i);
    for (const column of [
      'total_count bigint',
      'open_count bigint',
      'completed_count bigint',
      'dead_letter_count bigint',
      'sms_indeterminate_count bigint',
      'oldest_open_at timestamptz',
      'fixed_error_code text',
      'fixed_error_code_count bigint',
      'fixed_error_codes_truncated boolean',
    ]) {
      expect(migration).toContain(column);
    }
    for (const code of DIRECT_ERROR_CODES) expect(migration).toContain(`'${code}'`);
    expect(migration).toMatch(/else 'unrecognized_error_code'[\s\S]*end as fixed_error_code/i);
    expect(migration).toMatch(/from public\.billing_direct_payment_settlement_tasks as task/i);
    expect(migration).toMatch(/with task_groups as materialized/i);
    expect(migration).toMatch(/end as fixed_error_code[\s\S]*group by\s+classified\.task_state,\s+classified\.sms_status,\s+classified\.fixed_error_code/i);
    expect(migration).toMatch(/group by groups\.fixed_error_code/i);
    expect(migration).not.toMatch(/\blimit\b/i);
    expect(migration).toMatch(/revoke all on table public\.billing_direct_payment_settlement_tasks\s+from public, anon, authenticated, service_role;/i);
    expect(migration).toMatch(/revoke all on function public\.admin_billing_direct_payment_settlement_summary\(\)\s+from public, anon, authenticated, service_role;/i);
    expect(migration).toMatch(/grant execute on function public\.admin_billing_direct_payment_settlement_summary\(\)\s+to service_role;/i);
    expect(migration).not.toMatch(/grant select on table public\.billing_direct_payment_settlement_tasks/i);
    expect(migration).not.toMatch(/grant execute[\s\S]*to (?:public|anon|authenticated)/i);
    expect(migration).not.toMatch(/\b(?:insert into|update\s+public\.|delete from|truncate|merge into)\b/i);
    expect(migration).not.toMatch(/cron|net\.|http_|webhook|alter role|set_config/i);
  });

  it('keeps the page behind admin auth and contains no mutation or activation controls', () => {
    const page = readFileSync(join(process.cwd(), 'src', 'app', 'admin', 'billing-operations', 'page.tsx'), 'utf8');
    const loader = readFileSync(join(process.cwd(), 'src', 'lib', 'admin-billing-operations.ts'), 'utf8');
    const nav = readFileSync(join(process.cwd(), 'src', 'app', 'admin', 'AdminNav.tsx'), 'utf8');

    expect(page).toContain('await requireAdmin()');
    expect(page).toContain('loadAdminBillingOperations(admin)');
    expect(page).not.toMatch(/<form|<button|action=/);
    expect(loader.match(/\.rpc\(/g)).toHaveLength(2);
    expect(loader).toContain("const DIRECT_SETTLEMENT_SUMMARY_RPC = 'admin_billing_direct_payment_settlement_summary'");
    expect(loader).toContain("const DIRECT_CHECKOUT_LATE_SUCCESS_SUMMARY_RPC = 'admin_billing_direct_checkout_late_success_summary'");
    expect(loader).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
    expect(page).toContain('Late-success holds');
    expect(nav).toContain("href: '/admin/billing-operations'");
  });
});
