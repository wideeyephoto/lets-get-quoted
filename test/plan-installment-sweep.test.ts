import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The payment-plan installment sweep, behind the daily `plan-installments` cron.
 *
 * It charges saved cards off-session, unattended, once a day. Neither the route
 * nor the worker executed under any test, and `src/lib/payment-plans.ts` was at
 * 12.38%. The failure modes here are charging a card that should not have been
 * charged, charging it twice, and dunning a payment that was quietly settling.
 *
 * The module's own comments name the guards that prevent each of those: the
 * claim that only one run can win, an idempotency key stable within an attempt
 * and unique across attempts, and the rule that a `processing` intent is never
 * recorded as a failure. Those are what these tests hold.
 */

const mocks = vi.hoisted(() => ({
  paymentIntentsCreate: vi.fn(),
  getQuotedFee: vi.fn(),
  createPaymentFeedEvent: vi.fn(),
  sendPaymentSmsEvent: vi.fn(),
  createJobFeedEvent: vi.fn(),
  canCreateConnectCharge: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ createAdminClient: () => admin }));
vi.mock('@/lib/stripe', () => ({
  getStripeClient: () => ({ paymentIntents: { create: mocks.paymentIntentsCreate } }),
  toCents: (value: number) => Math.round(value * 100),
  fromCents: (value: number) => value / 100,
  canCreateConnectCharge: mocks.canCreateConnectCharge,
  CONNECT_CHARGE_COLUMNS: 'stripe_connect_id, charges_enabled',
}));
vi.mock('@/lib/payments', () => ({ getQuotedFee: mocks.getQuotedFee, createDepositRequest: vi.fn() }));
vi.mock('@/lib/job-feed', () => ({
  createPaymentFeedEvent: mocks.createPaymentFeedEvent,
  createJobFeedEvent: mocks.createJobFeedEvent,
}));
vi.mock('@/lib/sms', () => ({ sendPaymentSmsEvent: mocks.sendPaymentSmsEvent }));

import { runDuePlanInstallments } from '@/lib/payment-plans';
import { cronSummaryHasFailures } from '@/lib/cron-jobs';

type Query = {
  table: string;
  op: 'select' | 'update';
  patch?: Record<string, unknown>;
  eq: [string, unknown][];
  lte: [string, unknown][];
  lt: [string, unknown][];
  in: [string, unknown][];
  not: string[];
  limit?: number;
};

let queries: Query[];
let dueRows: Record<string, unknown>[] | null;
let dueError: { message: string } | null;
let planRow: Record<string, unknown> | null;
let accountRow: Record<string, unknown> | null;
/** Whether the claim update finds a row to take. */
let claimWins: boolean;

const admin = {
  from: (table: string) => {
    const entry: Query = { table, op: 'select', eq: [], lte: [], lt: [], in: [], not: [] };
    queries.push(entry);
    const chain: any = {
      select: () => {
        if (entry.op !== 'update') entry.op = 'select';
        return chain;
      },
      update: (patch: Record<string, unknown>) => {
        entry.op = 'update';
        entry.patch = patch;
        return chain;
      },
      eq: (column: string, value: unknown) => {
        entry.eq.push([column, value]);
        return chain;
      },
      lte: (column: string, value: unknown) => {
        entry.lte.push([column, value]);
        return chain;
      },
      lt: (column: string, value: unknown) => {
        entry.lt.push([column, value]);
        return chain;
      },
      in: (column: string, value: unknown) => {
        entry.in.push([column, value]);
        return chain;
      },
      not: (column: string) => {
        entry.not.push(column);
        return chain;
      },
      order: () => chain,
      limit: async (count: number) => {
        entry.limit = count;
        return { data: dueError ? null : dueRows, error: dueError };
      },
      maybeSingle: async () => {
        if (entry.table === 'payment_plans') return { data: planRow, error: null };
        if (entry.table === 'accounts') return { data: accountRow, error: null };
        // The claim: an update ... in(status) ... select().maybeSingle().
        if (entry.table === 'payments' && entry.op === 'update') {
          return { data: claimWins ? { id: 'payment-1' } : null, error: null };
        }
        return { data: null, error: null };
      },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve),
    };
    return chain;
  },
};

function installment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'payment-1',
    amount: 250,
    label: 'Installment 2',
    installment_seq: 2,
    charge_attempts: 0,
    homeowner_phone: '+15550000000',
    sms_consent: false,
    payment_plan_id: 'plan-1',
    status: 'requested',
    ...overrides,
  };
}

function plan(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plan-1',
    account_id: 'workspace-a',
    job_id: 'job-1',
    status: 'active',
    payoff_locked_at: null,
    stripe_customer_id: 'cus_test',
    stripe_payment_method_id: 'pm_test',
    total_cents: 100_000,
    ...overrides,
  };
}

const dueQuery = () => queries.find((query) => query.table === 'payments' && query.op === 'select')!;
const claimUpdate = () => queries.find((query) => query.table === 'payments' && query.op === 'update');
const updatesTo = (table: string) => queries.filter((query) => query.table === table && query.op === 'update');
const intentArgs = () => mocks.paymentIntentsCreate.mock.calls[0];

beforeEach(() => {
  vi.clearAllMocks();
  queries = [];
  dueRows = [];
  dueError = null;
  planRow = plan();
  accountRow = { stripe_connect_id: 'acct_test', charges_enabled: true };
  claimWins = true;
  mocks.getQuotedFee.mockResolvedValue({ feeRate: 0.0125, platformFee: 3.13 });
  mocks.canCreateConnectCharge.mockReturnValue(true);
  mocks.paymentIntentsCreate.mockResolvedValue({ id: 'pi_test', status: 'succeeded' });
  mocks.createPaymentFeedEvent.mockResolvedValue(undefined);
  mocks.sendPaymentSmsEvent.mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('which installments the sweep picks up', () => {
  it('asks only for plan installments that are due, unpaid and under the attempt cap', async () => {
    await runDuePlanInstallments();

    const query = dueQuery();
    expect(query.eq).toContainEqual(['kind', 'plan_installment']);
    expect(query.not).toContain('payment_plan_id');
    expect(query.in).toContainEqual(['status', ['requested', 'failed']]);
    // Four lifetime attempts, then it stays failed and collectible by link
    // rather than being retried forever.
    expect(query.lt).toContainEqual(['charge_attempts', 4]);
    expect(query.lte[0][0]).toBe('due_date');
  });

  it('bounds one run to 300 installments', async () => {
    await runDuePlanInstallments();

    expect(dueQuery().limit).toBe(300);
  });

  it('asks for today or earlier, never for a future due date', async () => {
    await runDuePlanInstallments();

    const [[, today]] = dueQuery().lte;
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Date.parse(`${today}T00:00:00Z`)).toBeLessThanOrEqual(Date.now());
  });

  it('charges nothing when nothing is due', async () => {
    const result = await runDuePlanInstallments();

    expect(result).toEqual({ due: 0, charged: 0, failed: 0, skipped: 0 });
    expect(mocks.paymentIntentsCreate).not.toHaveBeenCalled();
  });
});

describe('plans the sweep refuses to charge against', () => {
  beforeEach(() => {
    dueRows = [installment()];
  });

  it.each(['pending_deposit', 'paid_off', 'canceled'])('skips a plan in %s', async (status) => {
    planRow = plan({ status });

    const result = await runDuePlanInstallments();

    expect(result).toMatchObject({ due: 1, charged: 0, failed: 0, skipped: 1 });
    expect(mocks.paymentIntentsCreate).not.toHaveBeenCalled();
  });

  /**
   * The payoff lock is how a client paying the balance in full stops the cron
   * from charging the same money again. Ignoring it double-charges.
   */
  it('skips a plan whose payoff lock is held', async () => {
    planRow = plan({ payoff_locked_at: new Date().toISOString() });

    const result = await runDuePlanInstallments();

    expect(result.skipped).toBe(1);
    expect(mocks.paymentIntentsCreate).not.toHaveBeenCalled();
    expect(claimUpdate()).toBeUndefined();
  });

  it('skips an installment whose plan row has gone', async () => {
    planRow = null;

    const result = await runDuePlanInstallments();

    expect(result.skipped).toBe(1);
    expect(mocks.paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it.each([
    ['no saved card', { stripe_payment_method_id: null }],
    ['no Stripe customer', { stripe_customer_id: null }],
  ])('skips a plan with %s', async (_label, overrides) => {
    planRow = plan(overrides);

    const result = await runDuePlanInstallments();

    expect(result.skipped).toBe(1);
    expect(mocks.paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it.each([0, -10])('skips an installment for %d', async (amount) => {
    dueRows = [installment({ amount })];

    const result = await runDuePlanInstallments();

    expect(result.skipped).toBe(1);
    expect(mocks.paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it('skips when the contractor account cannot take a Connect charge', async () => {
    mocks.canCreateConnectCharge.mockReturnValue(false);

    const result = await runDuePlanInstallments();

    expect(result.skipped).toBe(1);
    expect(mocks.paymentIntentsCreate).not.toHaveBeenCalled();
    // Checked before the claim, so the attempt counter is untouched.
    expect(claimUpdate()).toBeUndefined();
  });

  it('reads the same plan once for two installments that share it', async () => {
    dueRows = [installment({ id: 'p1' }), installment({ id: 'p2', installment_seq: 3 })];
    // Stop both before the charge, so the only payment_plans read in play is
    // the plan lookup itself rather than the post-payment reconciliation.
    mocks.canCreateConnectCharge.mockReturnValue(false);

    const result = await runDuePlanInstallments();

    expect(result.skipped).toBe(2);
    expect(queries.filter((query) => query.table === 'payment_plans')).toHaveLength(1);
  });
});

describe('charging it exactly once', () => {
  beforeEach(() => {
    dueRows = [installment()];
  });

  /**
   * The claim moves the row requested|failed -> processing and returns it. A
   * second run, or a re-entry, finds no row and bails before Stripe is called,
   * so the charge is issued once even before Stripe's own idempotency applies.
   */
  it('takes the installment out of requested before calling Stripe', async () => {
    await runDuePlanInstallments();

    const claim = claimUpdate();
    expect(claim?.patch).toMatchObject({ status: 'processing', charge_attempts: 1 });
    expect(claim?.in).toContainEqual(['status', ['requested', 'failed']]);
    expect(claim?.eq).toContainEqual(['id', 'payment-1']);
  });

  it('bails without charging when another run already claimed it', async () => {
    claimWins = false;

    const result = await runDuePlanInstallments();

    expect(result).toMatchObject({ charged: 0, failed: 0, skipped: 1 });
    expect(mocks.paymentIntentsCreate).not.toHaveBeenCalled();
  });

  it('counts the attempt from the row, so a retry increments rather than resets', async () => {
    dueRows = [installment({ charge_attempts: 2 })];

    await runDuePlanInstallments();

    expect(claimUpdate()?.patch).toMatchObject({ charge_attempts: 3 });
  });

  it('keys the charge to this attempt: stable within it, different across them', async () => {
    await runDuePlanInstallments();
    const [, first] = intentArgs();
    expect(first).toEqual({ idempotencyKey: 'plan_plan-1_inst_2_1' });

    vi.clearAllMocks();
    queries = [];
    mocks.paymentIntentsCreate.mockResolvedValue({ id: 'pi_test', status: 'succeeded' });
    mocks.getQuotedFee.mockResolvedValue({ feeRate: 0.0125, platformFee: 3.13 });
    mocks.canCreateConnectCharge.mockReturnValue(true);
    dueRows = [installment({ charge_attempts: 1 })];
    await runDuePlanInstallments();
    const [, second] = intentArgs();

    // A crash-safe re-run of the same attempt gets Stripe's cached result; a
    // real retry is a new key and re-hits the card.
    expect(second).toEqual({ idempotencyKey: 'plan_plan-1_inst_2_2' });
    expect(second).not.toEqual(first);
  });

  it('charges off-session against the saved card, as a destination charge with the platform fee', async () => {
    await runDuePlanInstallments();

    const [params] = intentArgs();
    expect(params).toMatchObject({
      amount: 25_000,
      currency: 'usd',
      customer: 'cus_test',
      payment_method: 'pm_test',
      off_session: true,
      confirm: true,
      application_fee_amount: 313,
      transfer_data: { destination: 'acct_test' },
      metadata: { payment_id: 'payment-1', payment_plan_id: 'plan-1' },
    });
  });
});

describe('what the sweep does with Stripe answer', () => {
  beforeEach(() => {
    dueRows = [installment()];
  });

  it('records a succeeded intent as paid, with the feed event', async () => {
    const result = await runDuePlanInstallments();

    expect(result).toMatchObject({ due: 1, charged: 1, failed: 0, skipped: 0 });
    const paid = updatesTo('payments').find((query) => query.patch?.status === 'paid');
    expect(paid?.patch).toMatchObject({ status: 'paid' });
    expect(paid?.patch?.paid_at).toEqual(expect.any(String));
    expect(mocks.createPaymentFeedEvent).toHaveBeenCalledWith(expect.anything(), 'payment-1', 'payment_paid');
  });

  it('texts the homeowner only when they consented', async () => {
    await runDuePlanInstallments();
    expect(mocks.sendPaymentSmsEvent).not.toHaveBeenCalled();

    vi.clearAllMocks();
    queries = [];
    mocks.paymentIntentsCreate.mockResolvedValue({ id: 'pi_test', status: 'succeeded' });
    mocks.getQuotedFee.mockResolvedValue({ feeRate: 0.0125, platformFee: 3.13 });
    mocks.canCreateConnectCharge.mockReturnValue(true);
    dueRows = [installment({ sms_consent: true })];
    await runDuePlanInstallments();

    expect(mocks.sendPaymentSmsEvent).toHaveBeenCalledWith('payment-1', 'payment_paid');
  });

  /**
   * A charge still settling is not a failure. Recording one would dun a
   * customer whose money is on its way, and the webhook is what reconciles it.
   */
  it.each(['processing', 'requires_capture'])('leaves a %s intent alone rather than failing it', async (status) => {
    mocks.paymentIntentsCreate.mockResolvedValue({ id: 'pi_test', status });

    const result = await runDuePlanInstallments();

    expect(result).toMatchObject({ charged: 0, failed: 0, skipped: 1 });
    expect(updatesTo('payments').some((query) => query.patch?.status === 'failed')).toBe(false);
    expect(updatesTo('payments').some((query) => query.patch?.status === 'paid')).toBe(false);
  });

  it.each(['requires_action', 'requires_payment_method'])(
    'records %s as a failure, because it needs the customer present',
    async (status) => {
      mocks.paymentIntentsCreate.mockResolvedValue({
        id: 'pi_test',
        status,
        last_payment_error: { code: 'authentication_required', message: 'Card needs 3DS.' },
      });

      const result = await runDuePlanInstallments();

      expect(result).toMatchObject({ charged: 0, failed: 1 });
    },
  );

  it('records a thrown Stripe error as a failure and keeps going', async () => {
    dueRows = [installment({ id: 'p1' }), installment({ id: 'p2', installment_seq: 3 })];
    mocks.paymentIntentsCreate
      .mockRejectedValueOnce(Object.assign(new Error('Your card was declined.'), { code: 'card_declined' }))
      .mockResolvedValueOnce({ id: 'pi_ok', status: 'succeeded' });

    const result = await runDuePlanInstallments();

    expect(result).toMatchObject({ due: 2, charged: 1, failed: 1 });
  });

  it('stores the intent id against the payment so the webhook can find it', async () => {
    await runDuePlanInstallments();

    expect(updatesTo('payments').some((query) => query.patch?.stripe_payment_intent === 'pi_test')).toBe(true);
  });

  it('stamps the quoted fee on the row before charging', async () => {
    await runDuePlanInstallments();

    const fee = updatesTo('payments').find((query) => query.patch?.platform_fee !== undefined);
    expect(fee?.patch).toMatchObject({ platform_fee: 3.13, fee_rate: 0.0125 });
  });
});

describe('what the run reports', () => {
  it('adds up to the number it read', async () => {
    dueRows = [
      installment({ id: 'p1' }),
      installment({ id: 'p2', amount: 0 }),
      installment({ id: 'p3', installment_seq: 4 }),
    ];

    const result = await runDuePlanInstallments();

    expect(result.due).toBe(3);
    expect(result.charged + result.failed + result.skipped).toBe(3);
  });

  it('is judged a failed run when any installment failed', async () => {
    dueRows = [installment()];
    mocks.paymentIntentsCreate.mockRejectedValue(new Error('card_declined'));

    const result = await runDuePlanInstallments();

    expect(result.failed).toBe(1);
    // This is what puts the job in a FAILED state on the health page.
    expect(cronSummaryHasFailures({ ...result })).toBe(true);
  });

  it('is judged healthy on a clean run', async () => {
    dueRows = [installment()];

    const result = await runDuePlanInstallments();

    expect(cronSummaryHasFailures({ ...result })).toBe(false);
  });

  /**
   * A read failure used to be the one outcome the summary could not express: it
   * returned zero counts and a `reason`, and no key in that shape names a
   * failure, so a daily card-charging sweep that could not reach the payments
   * table recorded a healthy run. It now also returns `errors`.
   */
  it('reports a read failure as failed work, and charges nothing', async () => {
    dueError = { message: 'relation payments does not exist' };

    const result = await runDuePlanInstallments();

    expect(result).toMatchObject({ due: 0, charged: 0, failed: 0, skipped: 0, reason: 'payment_plans not available' });
    expect(result.errors?.join(' ')).toContain('relation payments does not exist');
    expect(mocks.paymentIntentsCreate).not.toHaveBeenCalled();
    expect(cronSummaryHasFailures({ ...result })).toBe(true);
  });

  it('carries no errors key on a run that simply had nothing to do', async () => {
    const result = await runDuePlanInstallments();

    expect(result.errors).toBeUndefined();
    expect(cronSummaryHasFailures({ ...result })).toBe(false);
  });
});
