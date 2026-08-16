import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  adminPaymentFeeState,
  getPaymentForAdmin,
  listAdminPayments,
  refundBlockedReason,
  stripeAdminLinks,
  stripePaymentUrl,
  type AdminPaymentDetail,
} from '@/lib/admin-payments';
import { getOpenDisputes } from '@/lib/admin-alerts';
import { fetchFeeWindow } from '@/lib/platform-fees';

type DbResponse = {
  data: unknown;
  count?: number | null;
  error: { code?: string; message?: string } | null;
};

type QueryCall = {
  columns: string;
  options: unknown;
  filters: Array<[string, ...unknown[]]>;
};

function queuedAdmin(responses: DbResponse[]) {
  const calls: QueryCall[] = [];
  const admin = {
    from: vi.fn(() => ({
      select: vi.fn((columns: string, options?: unknown) => {
        const response = responses.shift() ?? { data: [], count: 0, error: null };
        const call: QueryCall = { columns, options, filters: [] };
        calls.push(call);
        const chain: Record<string, unknown> = {};
        for (const method of ['is', 'not', 'gte', 'lt', 'gt', 'eq', 'or', 'ilike', 'order', 'range', 'limit']) {
          chain[method] = (...args: unknown[]) => {
            call.filters.push([method, ...args]);
            return chain;
          };
        }
        chain.then = (
          resolve: (value: DbResponse) => unknown,
          reject?: (reason: unknown) => unknown,
        ) => Promise.resolve(response).then(resolve, reject);
        return chain;
      }),
    })),
  } as unknown as SupabaseClient;
  return { admin, calls };
}

function payment(overrides: Partial<AdminPaymentDetail> = {}): AdminPaymentDetail {
  return {
    id: 'pay_reporting_123',
    account_id: '11111111-1111-4111-8111-111111111111',
    job_id: null,
    invoice_id: null,
    kind: 'final',
    label: 'Final payment',
    amount: 1000,
    status: 'paid',
    platform_fee: 12.5,
    fee_rate: 0.0125,
    refunded_amount: 0,
    platform_fee_refunded: 0,
    refunded_at: null,
    stripe_payment_intent: 'pi_direct123',
    stripe_checkout_session: 'cs_direct123',
    stripe_dispute_id: 'dp_direct123',
    disputed_at: null,
    dispute_reason: null,
    dispute_status: null,
    dispute_due_by: null,
    dunning_state: null,
    failure_message: null,
    failed_at: null,
    requested_at: '2026-08-10T10:00:00.000Z',
    paid_at: '2026-08-10T10:01:00.000Z',
    created_at: '2026-08-10T10:00:00.000Z',
    ...overrides,
  };
}

describe('reconciliation-aware fee window reads', () => {
  const start = '2026-08-01T00:00:00.000Z';
  const end = '2026-09-01T00:00:00.000Z';

  it('keeps processed count on paid_at while recognizing direct fees on reconciled_at only', async () => {
    const { admin, calls } = queuedAdmin([
      {
        data: [
          { platform_fee: 3, charge_model: 'destination', reconciliation_status: null, reconciled_at: null },
          { platform_fee: 8, charge_model: 'direct', reconciliation_status: 'pending', reconciled_at: null },
          { platform_fee: 10, charge_model: 'direct', reconciliation_status: 'reconciled', reconciled_at: '2026-08-12T00:00:00.000Z' },
          { platform_fee: 99, charge_model: 'mystery', reconciliation_status: 'reconciled', reconciled_at: '2026-08-12T00:00:00.000Z' },
        ],
        error: null,
      },
      {
        data: [
          { platform_fee: 10, charge_model: 'direct', reconciliation_status: 'reconciled', reconciled_at: '2026-08-12T00:00:00.000Z' },
        ],
        error: null,
      },
      {
        data: [{
          id: 'pay_refund', account_id: 'acct', label: null, amount: 100,
          refunded_amount: 20, platform_fee_refunded: 2, refunded_at: '2026-08-20T00:00:00.000Z',
        }],
        error: null,
      },
    ]);

    const result = await fetchFeeWindow(admin, start, end);

    expect(result).toMatchObject({
      paymentsProcessed: 4,
      grossFees: 13,
      feesReversed: 2,
      netFees: 11,
      refunds: 20,
      availability: { payments: true, fees: true, refunds: true },
    });
    expect(calls[0].filters).toContainEqual(['gte', 'paid_at', start]);
    expect(calls[1].filters).toContainEqual(['eq', 'reconciliation_status', 'reconciled']);
    expect(calls[1].filters).toContainEqual(['gte', 'reconciled_at', start]);
    expect(calls[2].filters).toContainEqual(['gte', 'refunded_at', start]);
  });

  it.each(['42703', 'PGRST204'])('retries the unchanged legacy paid-at query on an old %s schema', async (code) => {
    const { admin, calls } = queuedAdmin([
      { data: null, error: { code } },
      { data: null, error: { code } },
      { data: [], error: null },
      // The charge_model-only probe must also fail before the reader is
      // allowed to omit the discriminator.
      { data: null, error: { code } },
      { data: [{ platform_fee: 4 }, { platform_fee: 6 }], error: null },
    ]);

    const result = await fetchFeeWindow(admin, start, end);

    expect(result).toMatchObject({
      paymentsProcessed: 2,
      grossFees: 10,
      netFees: 10,
      availability: { payments: true, fees: true, refunds: true },
    });
    expect(calls).toHaveLength(5);
    expect(calls[3].columns).toBe('platform_fee, charge_model');
    expect(calls[4].columns).toBe('platform_fee');
    expect(calls[4].filters).toContainEqual(['gte', 'paid_at', start]);
  });

  it('does not reinterpret a partially available or unrelated schema failure as legacy revenue', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { admin, calls } = queuedAdmin([
      { data: null, error: { code: '42703' } },
      { data: [], error: null },
      { data: [], error: null },
    ]);

    const result = await fetchFeeWindow(admin, start, end);

    expect(result.availability).toEqual({ payments: false, fees: false, refunds: true });
    expect(result.grossFees).toBe(0);
    expect(calls).toHaveLength(3);
    consoleError.mockRestore();
  });

  it('keeps charge_model on a partial schema instead of recognizing direct expectations as legacy fees', async () => {
    const missingReconciliation = {
      code: '42703',
      message: 'column payments.reconciliation_status does not exist',
    };
    const { admin, calls } = queuedAdmin([
      { data: null, error: missingReconciliation },
      { data: null, error: missingReconciliation },
      { data: [], error: null },
      {
        data: [
          { platform_fee: 3, charge_model: 'destination' },
          { platform_fee: 99, charge_model: 'direct' },
        ],
        error: null,
      },
    ]);

    const result = await fetchFeeWindow(admin, start, end);

    expect(result).toMatchObject({
      paymentsProcessed: 2,
      grossFees: 3,
      availability: { payments: true, fees: false, refunds: true },
    });
    expect(calls).toHaveLength(4);
    expect(calls[3].columns).toBe('platform_fee, charge_model');
  });
});

describe('schema-compatible admin payment reads', () => {
  it.each(['42703', 'PGRST204'])('retries the legacy list columns on %s', async (code) => {
    const legacyRow = {
      id: 'pay_legacy', account_id: 'acct_legacy', label: null, amount: 20,
      status: 'paid', paid_at: '2026-08-10T00:00:00.000Z', refunded_at: null,
      refunded_amount: 0, platform_fee: 1, platform_fee_refunded: 0,
      stripe_payment_intent: 'pi_legacy123', stripe_dispute_id: null,
    };
    const { admin, calls } = queuedAdmin([
      { data: null, count: null, error: { code } },
      { data: null, count: null, error: { code } },
      { data: [legacyRow], count: 1, error: null },
    ]);

    const result = await listAdminPayments(admin, {
      startIso: '2026-08-01T00:00:00.000Z',
      endIso: '2026-09-01T00:00:00.000Z',
    });

    expect(result).toEqual({ rows: [legacyRow], total: 1, available: true });
    expect(calls[0].columns).toContain('reconciliation_status');
    expect(calls[0].columns).toContain('stripe_account_id');
    expect(calls[1].columns).toContain('charge_model');
    expect(calls[1].columns).not.toContain('reconciliation_status');
    expect(calls[2].columns).not.toContain('charge_model');
  });

  it('reads every direct reference on the detail path without weakening its legacy fallback', async () => {
    const row = payment({
      charge_model: 'direct',
      stripe_account_id: 'acct_Merchant123',
      stripe_livemode: false,
      stripe_charge_id: 'ch_direct123',
      stripe_application_fee_id: 'fee_direct123',
      stripe_balance_transaction_id: 'txn_direct123',
      reconciliation_status: 'reconciled',
      reconciled_at: '2026-08-10T10:02:00.000Z',
    });
    const selections: string[] = [];
    const admin = {
      from: vi.fn(() => ({
        select: vi.fn((columns: string) => {
          selections.push(columns);
          const query = {
            eq: vi.fn(() => query),
            maybeSingle: vi.fn(async () => ({ data: row, error: null })),
          };
          return query;
        }),
      })),
    } as unknown as SupabaseClient;

    await expect(getPaymentForAdmin(admin, row.id)).resolves.toEqual(row);
    expect(selections[0]).toContain('stripe_livemode');
    expect(selections[0]).toContain('stripe_charge_id');
    expect(selections[0]).toContain('stripe_application_fee_id');
    expect(selections[0]).toContain('stripe_balance_transaction_id');
    expect(selections[0]).toContain('reconciled_at');
  });

  it('retains the rail discriminator when a later list/detail column is missing', async () => {
    const partial = payment({
      charge_model: 'direct',
      stripe_account_id: undefined,
      stripe_livemode: undefined,
      reconciliation_status: undefined,
      reconciled_at: undefined,
    });
    const listClient = queuedAdmin([
      {
        data: null,
        count: null,
        error: { code: 'PGRST204', message: "Could not find the 'stripe_livemode' column" },
      },
      { data: [partial], count: 1, error: null },
    ]);

    const listed = await listAdminPayments(listClient.admin, {
      startIso: '2026-08-01T00:00:00.000Z',
      endIso: '2026-09-01T00:00:00.000Z',
    });

    expect(listed.rows[0]?.charge_model).toBe('direct');
    expect(adminPaymentFeeState(listed.rows[0] as AdminPaymentDetail).code).toBe('unrecognized');
    expect(listClient.calls[1].columns).toContain('charge_model');
    expect(listClient.calls[1].columns).not.toContain('reconciliation_status');

    const selections: string[] = [];
    const responses: DbResponse[] = [
      {
        data: null,
        error: { code: '42703', message: 'column payments.stripe_livemode does not exist' },
      },
      { data: partial, error: null },
    ];
    const detailAdmin = {
      from: vi.fn(() => ({
        select: vi.fn((columns: string) => {
          selections.push(columns);
          const response = responses.shift() ?? { data: null, error: null };
          const query = {
            eq: vi.fn(() => query),
            maybeSingle: vi.fn(async () => response),
          };
          return query;
        }),
      })),
    } as unknown as SupabaseClient;

    const detailed = await getPaymentForAdmin(detailAdmin, partial.id);
    expect(detailed?.charge_model).toBe('direct');
    expect(detailed && refundBlockedReason(detailed)).toMatch(/direct-charge rail/i);
    expect(detailed && stripeAdminLinks(detailed)).toEqual([]);
    expect(selections[1]).toContain('charge_model');
    expect(selections[1]).not.toContain('stripe_livemode');
  });

  it.each(['42703', 'PGRST204'])('keeps dispute alerts working before the direct columns exist (%s)', async (code) => {
    const legacyDispute = {
      id: 'pay_dispute', account_id: 'acct_legacy', amount: 20, label: null,
      disputed_at: '2026-08-10T00:00:00.000Z', dispute_reason: 'fraudulent',
      dispute_status: 'needs_response', stripe_dispute_id: 'dp_legacy123', dispute_due_by: null,
    };
    const { admin, calls } = queuedAdmin([
      { data: null, error: { code } },
      { data: null, error: { code } },
      { data: [legacyDispute], error: null },
    ]);

    await expect(getOpenDisputes(admin)).resolves.toEqual([legacyDispute]);
    expect(calls[0].columns).toContain('stripe_livemode');
    expect(calls[1].columns).toContain('charge_model');
    expect(calls[2].columns).not.toContain('charge_model');
  });

  it('does not build a platform dispute link when only the direct account columns are missing', async () => {
    const directDispute = {
      id: 'pay_direct_dispute', account_id: 'acct_workspace', amount: 20, label: null,
      disputed_at: '2026-08-10T00:00:00.000Z', dispute_reason: 'fraudulent',
      dispute_status: 'needs_response', stripe_dispute_id: 'dp_direct123', dispute_due_by: null,
      charge_model: 'direct',
    };
    const { admin, calls } = queuedAdmin([
      {
        data: null,
        error: { code: '42703', message: 'column payments.stripe_livemode does not exist' },
      },
      { data: [directDispute], error: null },
    ]);

    const disputes = await getOpenDisputes(admin);
    expect(disputes).toEqual([directDispute]);
    expect(stripeAdminLinks(disputes[0])).toEqual([]);
    expect(calls[1].columns).toContain('charge_model');
    expect(calls[1].columns).not.toContain('stripe_livemode');
  });
});

describe('explicit admin fee state', () => {
  it('recognizes pre-migration and destination fees exactly as legacy paid rows', () => {
    expect(adminPaymentFeeState(payment())).toMatchObject({
      code: 'legacy_recognized', recognizedFee: 12.5, expectedFee: null,
    });
    expect(adminPaymentFeeState(payment({ charge_model: 'destination' }))).toMatchObject({
      code: 'legacy_recognized', recognizedFee: 12.5, expectedFee: null,
    });
  });

  it('recognizes direct fee net only with exact reconciled evidence', () => {
    expect(adminPaymentFeeState(payment({
      charge_model: 'direct',
      reconciliation_status: 'reconciled',
      reconciled_at: '2026-08-11T00:00:00.000Z',
      platform_fee_refunded: 2.5,
    }))).toMatchObject({
      code: 'direct_reconciled', recognizedFee: 10, expectedFee: null,
      recognizedAt: '2026-08-11T00:00:00.000Z',
    });
  });

  it.each([
    ['pending', 'direct_pending'],
    ['mismatch', 'direct_mismatch'],
    ['waived', 'direct_waived'],
  ] as const)('keeps direct %s as expected-only', (status, code) => {
    expect(adminPaymentFeeState(payment({
      charge_model: 'direct', reconciliation_status: status,
      reconciled_at: status === 'waived' ? '2026-08-11T00:00:00.000Z' : null,
    }))).toMatchObject({ code, recognizedFee: null, expectedFee: 12.5, recognizedAt: null });
  });

  it.each([
    { charge_model: 'mystery' },
    { charge_model: null },
    { charge_model: 'direct', reconciliation_status: 'reconciled', reconciled_at: null },
  ])('fails closed when model or reconciliation evidence is unrecognized', (overrides) => {
    expect(adminPaymentFeeState(payment(overrides))).toMatchObject({
      code: 'unrecognized', recognizedFee: null, expectedFee: null,
    });
  });
});

describe('account-aware Stripe Dashboard links', () => {
  it('preserves valid legacy platform URLs', () => {
    const legacy = payment();
    expect(stripePaymentUrl(legacy)).toBe('https://dashboard.stripe.com/payments/pi_direct123');
    expect(stripeAdminLinks(legacy).find((link) => link.kind === 'dispute')?.url)
      .toBe('https://dashboard.stripe.com/disputes/dp_direct123');
  });

  it.each([
    [false, 'https://dashboard.stripe.com/test/acct_Merchant123'],
    [true, 'https://dashboard.stripe.com/acct_Merchant123'],
  ] as const)('scopes direct objects to the connected account in livemode=%s', (livemode, base) => {
    const direct = payment({
      charge_model: 'direct',
      stripe_account_id: 'acct_Merchant123',
      stripe_livemode: livemode,
      stripe_charge_id: 'ch_direct123',
      stripe_application_fee_id: 'fee_direct123',
      reconciliation_status: 'reconciled',
      reconciled_at: '2026-08-11T00:00:00.000Z',
    });
    const links = stripeAdminLinks(direct);

    expect(links).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'payment_intent', url: `${base}/payments/pi_direct123`, scope: 'connected' }),
      expect.objectContaining({ kind: 'checkout_session', url: `${base}/checkout/sessions/cs_direct123`, scope: 'connected' }),
      expect.objectContaining({ kind: 'charge', url: `${base}/payments/ch_direct123`, scope: 'connected' }),
      expect.objectContaining({ kind: 'dispute', url: `${base}/disputes/dp_direct123`, scope: 'connected' }),
      expect.objectContaining({
        kind: 'application_fee',
        url: `https://dashboard.stripe.com/${livemode ? '' : 'test/'}connect/application_fees/fee_direct123`,
        scope: 'platform',
      }),
    ]));
    expect(refundBlockedReason(direct)).toMatch(/direct-charge rail/i);
    expect(stripePaymentUrl(direct)).toBe(`${base}/payments/pi_direct123`);
  });

  it('never falls back to platform context for a connected-account object', () => {
    const badAccount = payment({
      charge_model: 'direct',
      stripe_account_id: 'acct_bad/slash',
      stripe_livemode: false,
      stripe_charge_id: 'ch_direct123',
      stripe_application_fee_id: 'fee_direct123',
    });
    const links = stripeAdminLinks(badAccount);

    expect(links.filter((link) => link.scope === 'connected')).toEqual([]);
    expect(stripePaymentUrl(badAccount)).toBeNull();
    // The fee object belongs to LGQ's platform account and remains correctly scoped.
    expect(links).toEqual([
      expect.objectContaining({ kind: 'application_fee', scope: 'platform' }),
    ]);
  });

  it('requires explicit mode and validated object identifiers', () => {
    expect(stripeAdminLinks(payment({
      charge_model: 'direct',
      stripe_account_id: 'acct_Merchant123',
      stripe_livemode: null,
      stripe_application_fee_id: 'fee_direct123',
    }))).toEqual([]);
    expect(stripeAdminLinks(payment({
      charge_model: 'direct',
      stripe_account_id: 'acct_Merchant123',
      stripe_livemode: false,
      stripe_payment_intent: 'pi_bad/../platform',
      stripe_checkout_session: null,
      stripe_dispute_id: null,
    })).some((link) => link.kind === 'payment_intent')).toBe(false);
    expect(stripeAdminLinks(payment({ charge_model: 'unknown' }))).toEqual([]);
  });
});

describe('admin reporting copy', () => {
  it('labels recognized totals honestly and removes the unconditional merchant-of-record claim', () => {
    const money = readFileSync(join(process.cwd(), 'src', 'app', 'admin', 'money', 'page.tsx'), 'utf8');
    const command = readFileSync(join(process.cwd(), 'src', 'lib', 'admin-command-center.ts'), 'utf8');
    const list = readFileSync(join(process.cwd(), 'src', 'app', 'admin', 'payments', 'page.tsx'), 'utf8');
    const detail = readFileSync(join(process.cwd(), 'src', 'app', 'admin', 'payments', '[id]', 'page.tsx'), 'utf8');
    const commandPage = readFileSync(join(process.cwd(), 'src', 'app', 'admin', 'page.tsx'), 'utf8');

    expect(money).toContain('Reconciled LGQ fees');
    expect(command).toContain("label: 'Reconciled LGQ fees'");
    expect(list).toContain('Reconciled LGQ fee');
    expect(detail).toContain('Expected LGQ fee');
    expect(money).not.toContain('You&rsquo;re the merchant of record');
    expect(detail).toContain("stripeLinks.filter((link) => link.kind !== 'dispute')");
    expect(money).not.toContain('`https://dashboard.stripe.com/disputes/${row.stripe_dispute_id}`');
    expect(commandPage).not.toContain('`https://dashboard.stripe.com/disputes/${row.stripe_dispute_id}`');
  });
});
