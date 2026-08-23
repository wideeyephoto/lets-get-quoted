import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/auth', () => ({ createAdminClient: () => ({ rpc: (...a: unknown[]) => rpc(...a) }) }));

const retrieveDirectCharge = vi.fn();
const retrieveApplicationFee = vi.fn();
vi.mock('@/lib/billing/stripe-direct', () => ({
  retrieveDirectCharge: (...a: unknown[]) => retrieveDirectCharge(...a),
  retrieveApplicationFee: (...a: unknown[]) => retrieveApplicationFee(...a),
}));

const {
  REFUND_RECONCILIATION_WORKER_FLAG,
  refundReconciliationWorkerEnabled,
  runRefundReconciliationSweep,
} = await import('@/lib/billing/refund-reconciliation-worker');

const PAYMENT = '22222222-2222-4222-8222-222222222222';
const row = (over: Record<string, unknown> = {}) => ({
  payment_id: PAYMENT,
  stripe_account_id: 'acct_x',
  stripe_charge_id: 'ch_abc',
  stripe_application_fee_id: 'fee_1',
  ...over,
});

beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation((name: string) => {
    if (name === 'direct_payments_pending_reconciliation') {
      return Promise.resolve({ data: [row()], error: null });
    }
    return Promise.resolve({ data: 'reconciled', error: null });
  });
  retrieveDirectCharge.mockReset();
  retrieveDirectCharge.mockResolvedValue({ amount_refunded: 5_500, disputed: false });
  retrieveApplicationFee.mockReset();
  retrieveApplicationFee.mockResolvedValue({ amount_refunded: 63 });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('the flag', () => {
  it('is off unless exactly 1', () => {
    for (const value of [undefined, '', '0', 'true', ' 1']) {
      expect(refundReconciliationWorkerEnabled({ [REFUND_RECONCILIATION_WORKER_FLAG]: value })).toBe(false);
    }
    expect(refundReconciliationWorkerEnabled({ [REFUND_RECONCILIATION_WORKER_FLAG]: '1' })).toBe(true);
  });

  it('is checked before the route does anything', () => {
    const route = readFileSync(
      join(process.cwd(), 'src', 'app', 'api', 'cron', 'refund-reconciliation', 'route.ts'), 'utf8');
    expect(route.indexOf('refundReconciliationWorkerEnabled()'))
      .toBeLessThan(route.indexOf('authenticatedGET(request)'));
  });
});

describe('reading the two objects Stripe keeps apart', () => {
  it('reads the charge on the connected account and the fee on the platform', async () => {
    // An Application Fee is the PLATFORM's object -- it is the money that came
    // to LGQ -- while the charge belongs to the merchant. Reading either on the
    // wrong account finds nothing.
    await runRefundReconciliationSweep();
    expect(retrieveDirectCharge).toHaveBeenCalledWith({
      merchantAccountId: 'acct_x', chargeId: 'ch_abc',
    });
    expect(retrieveApplicationFee).toHaveBeenCalledWith({ applicationFeeId: 'fee_1' });
  });

  it('passes Stripe\'s figures to the database and decides nothing itself', async () => {
    await runRefundReconciliationSweep();
    expect(rpc).toHaveBeenCalledWith('reconcile_direct_payment', {
      p_payment_id: PAYMENT,
      p_observed_refunded_cents: 5_500,
      p_observed_fee_refunded_cents: 63,
      p_observed_charge_id: 'ch_abc',
      p_observed_disputed: false,
    });
  });

  it('treats a payment with no fee id as having refunded no fee', async () => {
    rpc.mockImplementation((name: string) => (name === 'direct_payments_pending_reconciliation'
      ? Promise.resolve({ data: [row({ stripe_application_fee_id: null })], error: null })
      : Promise.resolve({ data: 'reconciled', error: null })));
    await runRefundReconciliationSweep();
    expect(retrieveApplicationFee).not.toHaveBeenCalled();
    expect(rpc.mock.calls[1][1].p_observed_fee_refunded_cents).toBe(0);
  });

  it('carries a dispute through rather than reasoning about it', async () => {
    retrieveDirectCharge.mockResolvedValue({ amount_refunded: 5_500, disputed: true });
    rpc.mockImplementation((name: string) => (name === 'direct_payments_pending_reconciliation'
      ? Promise.resolve({ data: [row()], error: null })
      : Promise.resolve({ data: 'disputed', error: null })));
    const summary = await runRefundReconciliationSweep();
    expect(rpc.mock.calls[1][1].p_observed_disputed).toBe(true);
    expect(summary.disputed).toBe(1);
  });
});

describe('what it does when it cannot be sure', () => {
  it('decides nothing when Stripe cannot be read', async () => {
    // A failed provider read is not evidence. The payment stays pending and the
    // next sweep asks again -- writing a mismatch here would make a network
    // blip permanently unrefundable, which is the bug this worker exists for.
    retrieveDirectCharge.mockRejectedValue(new Error('connection reset'));
    const summary = await runRefundReconciliationSweep();
    expect(summary).toMatchObject({ examined: 1, providerErrors: 1, mismatched: 0, reconciled: 0 });
    expect(rpc).toHaveBeenCalledTimes(1); // the work list only
  });

  it('decides nothing when Stripe answers without the number', async () => {
    retrieveDirectCharge.mockResolvedValue({ disputed: false });
    const summary = await runRefundReconciliationSweep();
    expect(summary.providerErrors).toBe(1);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('reports an unreadable work list as nothing done, not as work', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'down' } });
    expect(await runRefundReconciliationSweep())
      .toMatchObject({ examined: 0, reconciled: 0, failures: 1 });
  });

  it('counts a mismatch and keeps going', async () => {
    rpc.mockImplementation((name: string) => (name === 'direct_payments_pending_reconciliation'
      ? Promise.resolve({ data: [row(), row({ payment_id: 'other' })], error: null })
      : Promise.resolve({ data: 'mismatch', error: null })));
    const summary = await runRefundReconciliationSweep();
    expect(summary).toMatchObject({ examined: 2, mismatched: 2 });
  });

  it('says out loud when a full batch means more are waiting', async () => {
    rpc.mockImplementation((name: string) => (name === 'direct_payments_pending_reconciliation'
      ? Promise.resolve({ data: [row(), row({ payment_id: 'b' })], error: null })
      : Promise.resolve({ data: 'reconciled', error: null })));
    expect((await runRefundReconciliationSweep({ batchSize: 2 })).truncated).toBe(true);
    expect((await runRefundReconciliationSweep({ batchSize: 9 })).truncated).toBe(false);
  });
});

describe('every billing flag is documented', () => {
  it('names each one in .env.example', () => {
    // Nine flags existed only in code. A flag nobody can find is a feature
    // nobody can turn on, and worse, one nobody knows is off -- which is how
    // the capacity lifecycle ended up scheduled hourly into a 404.
    const dir = join(process.cwd(), 'src', 'lib', 'billing');
    const flags = new Set<string>();
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.ts')) continue;
      const source = readFileSync(join(dir, file), 'utf8');
      for (const match of source.matchAll(/'(LGQ_[A-Z0-9_]+)'/g)) flags.add(match[1]);
    }
    expect(flags.size).toBeGreaterThan(10);

    const env = readFileSync(join(process.cwd(), '.env.example'), 'utf8');
    const missing = [...flags].filter((flag) => !env.includes(flag)).sort();
    expect(missing, `undocumented flags: ${missing.join(', ')}`).toEqual([]);
  });
});
