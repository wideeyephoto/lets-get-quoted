import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => {
    throw new Error('unit tests inject the preparation store');
  },
}));

import {
  SupabaseDirectPaymentPreparationStore,
  prepareOneOffDirectInvoicePayment,
  type DirectPaymentPreparationInput,
} from '@/lib/billing/direct-payment-preparation';

const ACCOUNT_ID = '10000000-0000-4000-8000-000000000001';
const JOB_ID = '20000000-0000-4000-8000-000000000002';
const INVOICE_ID = '30000000-0000-4000-8000-000000000003';
const PAYMENT_ID = '40000000-0000-4000-8000-000000000004';

const input: DirectPaymentPreparationInput = {
  accountId: ACCOUNT_ID,
  jobId: JOB_ID,
  invoiceId: INVOICE_ID,
  paymentId: PAYMENT_ID,
};

function validRow(overrides: Record<string, unknown> = {}) {
  return {
    preparation_status: 'prepared',
    account_id: ACCOUNT_ID,
    job_id: JOB_ID,
    invoice_id: INVOICE_ID,
    payment_id: PAYMENT_ID,
    merchant_account_id: 'acct_merchant123',
    livemode: false,
    plan_code: 'growth',
    catalog_version: '2026-08-18-preview',
    fee_rate_bps: 25,
    fee_rate: '0.0025',
    gross_amount_cents: '10800',
    eligible_service_subtotal_cents: '10000',
    application_fee_cents: '25',
    reconciliation_status: 'pending',
    ...overrides,
  };
}

function adminReturning(row: Record<string, unknown> = validRow()) {
  const rpc = vi.fn().mockResolvedValue({ data: [row], error: null });
  return { rpc, admin: { rpc } as unknown as SupabaseClient };
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|js|mjs|cjs)$/.test(entry.name) ? [path] : [];
  });
}

beforeEach(() => vi.clearAllMocks());

describe('service-only direct payment preparation adapter', () => {
  it('passes identities only and returns the frozen database-owned snapshot', async () => {
    const { admin, rpc } = adminReturning();
    const store = new SupabaseDirectPaymentPreparationStore(admin);

    const result = await store.prepare(input);

    expect(rpc).toHaveBeenCalledWith('prepare_one_off_direct_invoice_payment', {
      p_account_id: ACCOUNT_ID,
      p_job_id: JOB_ID,
      p_invoice_id: INVOICE_ID,
      p_payment_id: PAYMENT_ID,
    });
    expect(Object.keys(rpc.mock.calls[0]![1]).sort()).toEqual([
      'p_account_id',
      'p_invoice_id',
      'p_job_id',
      'p_payment_id',
    ]);
    expect(result).toEqual({
      status: 'prepared',
      accountId: ACCOUNT_ID,
      jobId: JOB_ID,
      invoiceId: INVOICE_ID,
      paymentId: PAYMENT_ID,
      merchantAccountId: 'acct_merchant123',
      livemode: false,
      reconciliationStatus: 'pending',
      feeSnapshot: {
        planCode: 'growth',
        catalogVersion: '2026-08-18-preview',
        feeRateBps: 25,
        feeRate: 0.0025,
        grossAmountCents: 10_800,
        eligibleServiceSubtotalCents: 10_000,
        applicationFeeCents: 25,
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.feeSnapshot)).toBe(true);
  });

  it('accepts an exact database replay without resnapshotting in TypeScript', async () => {
    const { admin } = adminReturning(validRow({ preparation_status: 'replay' }));

    const result = await prepareOneOffDirectInvoicePayment(
      input,
      new SupabaseDirectPaymentPreparationStore(admin),
    );

    expect(result.status).toBe('replay');
    expect(result.feeSnapshot.applicationFeeCents).toBe(25);
  });

  it.each([
    ['identity drift', { payment_id: '50000000-0000-4000-8000-000000000005' }, /different immutable row identity/i],
    ['unknown status', { preparation_status: 'partial' }, /unsupported status/i],
    ['unknown plan', { plan_code: 'enterprise' }, /unsupported plan/i],
    ['stale catalog', { catalog_version: '2026-07-legacy' }, /unsupported catalog/i],
    ['wrong bps', { fee_rate_bps: 50, fee_rate: '0.005' }, /canonical plan fee/i],
    ['fee basis exceeds gross', { eligible_service_subtotal_cents: '10801', application_fee_cents: '27' }, /invalid fee allocation/i],
    ['wrong fee cents', { application_fee_cents: '26' }, /canonical plan fee/i],
    ['missing mode', { livemode: null }, /explicit stripe mode/i],
    ['not pending', { reconciliation_status: 'reconciled' }, /reconciliation pending/i],
  ])('fails closed on %s returned by the RPC', async (_label, overrides, message) => {
    const { admin } = adminReturning(validRow(overrides));
    const store = new SupabaseDirectPaymentPreparationStore(admin);

    await expect(store.prepare(input)).rejects.toThrow(message);
  });

  it('rejects malformed identities before the RPC', async () => {
    const { admin, rpc } = adminReturning();
    const store = new SupabaseDirectPaymentPreparationStore(admin);

    await expect(store.prepare({ ...input, invoiceId: 'not-a-uuid' })).rejects.toThrow(/invoiceId/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('preserves the database error and never synthesizes a fallback snapshot', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '55000', message: 'invoice has a competing open payment' },
    });
    const store = new SupabaseDirectPaymentPreparationStore({ rpc } as unknown as SupabaseClient);

    await expect(store.prepare(input)).rejects.toThrow(/competing open payment/i);
  });

  it('rejects an empty or ambiguous RPC result set', async () => {
    for (const data of [[], [validRow(), validRow()]]) {
      const rpc = vi.fn().mockResolvedValue({ data, error: null });
      const store = new SupabaseDirectPaymentPreparationStore({ rpc } as unknown as SupabaseClient);
      await expect(store.prepare(input)).rejects.toThrow(/exactly one snapshot row/i);
    }
  });

  it('stays unreferenced by active payment routes and has no activation setting', () => {
    const adapter = join(process.cwd(), 'src', 'lib', 'billing', 'direct-payment-preparation.ts');
    const activeFiles = sourceFiles(join(process.cwd(), 'src')).filter((file) => file !== adapter);
    activeFiles.push(join(process.cwd(), '.env.example'), join(process.cwd(), 'vercel.json'));
    // A silent zero passes every assertion below it. The walk is the thing most
    // likely to break, and its failure looks exactly like success.
    expect(activeFiles.length).toBeGreaterThan(1_000);

    for (const file of activeFiles) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toContain('direct-payment-preparation');
      expect(source).not.toContain('prepare_one_off_direct_invoice_payment');
      expect(source).not.toContain('DIRECT_PAYMENT_PREPARATION');
    }
  });
});
