import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = {
  entitlement: null as { plan_code: string; platform_fee_bps: number | null; entitlement_state?: string } | null,
  quickStopRequest: null as { id: string; payment_id: string } | null,
  invoice: null as { total: number; discount_percent: number; tax_rate: number } | null,
  invoiceItems: [] as Array<{ amount: number }>,
  siblings: [] as Array<{ id: string; amount: number; refunded_amount: number; status: string }>,
  error: null as { message: string } | null,
};

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const result = (data: unknown, error: unknown = null) => {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data, error }),
          then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data, error }).then(resolve),
        };
        return chain;
      };
      if (table === 'workspace_entitlements') {
        const row = state.entitlement === null ? null : { entitlement_state: 'active', ...state.entitlement };
        return result(row, state.error);
      }
      if (table === 'extra_stop_requests') return result(state.quickStopRequest);
      if (table === 'invoices') return result(state.invoice);
      if (table === 'invoice_items') return result(state.invoiceItems);
      if (table === 'payments') return result(state.siblings);
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const {
  isQuickStopPayment,
  resolvePaymentFeeRate,
  getWorkspaceFeeRate,
} = await import('@/lib/billing/workspace-fee-rate');
const { quoteFeeForPayment } = await import('@/lib/payments');
const { QUICK_STOP_PLATFORM_FEE_BPS, QUICK_STOP_PLATFORM_FEE_RATE } = await import('@/lib/billing/catalog');

beforeEach(() => {
  state.entitlement = null;
  state.quickStopRequest = null;
  state.invoice = null;
  state.invoiceItems = [];
  state.siblings = [];
  state.error = null;
});

describe('10% platform fee on Quick Stop priority visit fees', () => {
  it('identifies Quick Stop deposit payments linked in extra_stop_requests', async () => {
    const admin = (await import('@/lib/auth')).createAdminClient();

    state.quickStopRequest = { id: 'req_1', payment_id: 'pay_qs_1' };
    expect(await isQuickStopPayment(admin as never, { id: 'pay_qs_1', kind: 'deposit' })).toBe(true);

    // Non-deposit payments skip the extra_stop_requests round trip
    expect(await isQuickStopPayment(admin as never, { id: 'pay_stage_1', kind: 'stage' })).toBe(false);
    expect(await isQuickStopPayment(admin as never, { id: 'pay_final_1', kind: 'final' })).toBe(false);

    // Deposit not linked in extra_stop_requests
    state.quickStopRequest = null;
    expect(await isQuickStopPayment(admin as never, { id: 'pay_other_deposit', kind: 'deposit' })).toBe(false);
  });

  it('charges 10% (1,000 bps) on Quick Stop priority visit fees across all plans', async () => {
    const admin = (await import('@/lib/auth')).createAdminClient();
    state.quickStopRequest = { id: 'req_1', payment_id: 'pay_qs_1' };

    for (const plan of ['flex', 'solo', 'growth', 'scale']) {
      state.entitlement = { plan_code: plan, platform_fee_bps: null };
      const feeRate = await resolvePaymentFeeRate(admin as never, {
        id: 'pay_qs_1',
        account_id: 'acct_1',
        kind: 'deposit',
      });

      expect(feeRate.feeRateBps).toBe(QUICK_STOP_PLATFORM_FEE_BPS);
      expect(feeRate.feeRateBps).toBe(1_000);
      expect(feeRate.feeRate).toBe(QUICK_STOP_PLATFORM_FEE_RATE);
      expect(feeRate.feeRate).toBe(0.10);
      expect(feeRate.source).toBe('quick_stop');
    }
  });

  it('quotes exactly 10% platform fee on a Quick Stop priority visit payment', async () => {
    state.quickStopRequest = { id: 'req_1', payment_id: 'pay_qs_1' };
    state.entitlement = { plan_code: 'scale', platform_fee_bps: 10 };

    // $145 Quick Stop priority visit fee -> 10% platform fee = $14.50
    const quote = await quoteFeeForPayment({
      id: 'pay_qs_1',
      account_id: 'acct_1',
      amount: 145,
      invoice_id: null,
      kind: 'deposit',
    });

    expect(quote.feeRate).toBe(0.10);
    expect(quote.platformFee).toBe(14.50);
  });

  it('charges the normal plan rate (e.g. 0.10% on Scale, 1.25% on Flex) on the subsequent service invoice', async () => {
    state.quickStopRequest = null; // regular payment / service invoice

    // Scale contractor: 0.10% (10 bps)
    state.entitlement = { plan_code: 'scale', platform_fee_bps: 10 };
    state.invoice = { total: 500, discount_percent: 0, tax_rate: 0 };
    state.invoiceItems = [{ amount: 500 }];

    const scaleQuote = await quoteFeeForPayment({
      id: 'pay_invoice_1',
      account_id: 'acct_1',
      amount: 500,
      invoice_id: 'inv_1',
      kind: 'final',
    });
    expect(scaleQuote.feeRate).toBe(0.001); // 0.10%
    expect(scaleQuote.platformFee).toBe(0.50); // $500 * 0.1% = $0.50

    // Flex contractor: 1.25% (125 bps)
    state.entitlement = { plan_code: 'flex', platform_fee_bps: 125 };
    const flexQuote = await quoteFeeForPayment({
      id: 'pay_invoice_2',
      account_id: 'acct_1',
      amount: 500,
      invoice_id: 'inv_1',
      kind: 'final',
    });
    expect(flexQuote.feeRate).toBe(0.0125); // 1.25%
    expect(flexQuote.platformFee).toBe(6.25); // $500 * 1.25% = $6.25
  });
});

describe('codebase wiring integrity for Quick Stop platform fees', () => {
  const read = (...parts: string[]): string =>
    readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

  it('wires resolvePaymentFeeRate into createCheckoutSessionForPayment and quoteFeeForPayment', () => {
    const payments = read('src', 'lib', 'payments.ts');
    expect(payments).toContain('resolvePaymentFeeRate');
    expect(payments).toContain('const { feeRate } = await resolvePaymentFeeRate(admin, payment);');
  });

  it('exports canonical Quick Stop platform fee constants in catalog.ts', () => {
    const catalog = read('src', 'lib', 'billing', 'catalog.ts');
    expect(catalog).toContain('export const QUICK_STOP_PLATFORM_FEE_BPS = 1_000');
    expect(catalog).toContain('export const QUICK_STOP_PLATFORM_FEE_RATE = 0.10');
  });
});
