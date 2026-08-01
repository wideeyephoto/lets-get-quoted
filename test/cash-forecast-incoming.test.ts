import { describe, it, expect } from 'vitest';
import {
  buildIncomingEvents,
  isRetrying,
  type ForecastJobRow,
  type IncomingInput,
  type PendingPaymentRow,
} from '@/lib/cash-forecast-incoming';

const TODAY = '2026-08-01';
const HORIZON = '2026-08-30';

const job = (over: Partial<ForecastJobRow> = {}): ForecastJobRow => ({
  id: 'job-1',
  ref: 'J-1001',
  client_name: 'Damon Pryce',
  quoted_amount: 5000,
  status: 'in_progress',
  scheduled_for: '2026-08-10',
  scheduled_until: null,
  recurring_plan_id: null,
  recurring_visit_date: null,
  ...over,
});

const payment = (over: Partial<PendingPaymentRow> = {}): PendingPaymentRow => ({
  id: 'pay-1',
  job_id: 'job-1',
  kind: 'deposit',
  label: null,
  amount: 2000,
  status: 'requested',
  due_date: null,
  requested_at: '2026-07-30T12:00:00.000Z',
  ...over,
});

const build = (over: Partial<IncomingInput> = {}) =>
  buildIncomingEvents({
    payments: [],
    jobs: [],
    settled: [],
    pendingPlans: [],
    recurringPlans: [],
    todayKey: TODAY,
    horizonKey: HORIZON,
    lagDays: 7,
    ...over,
  });

/** Every dollar the forecast expects, however it got there. */
const total = (result: ReturnType<typeof build>) =>
  Math.round(result.events.reduce((sum, event) => sum + event.amount, 0) * 100) / 100;

describe('the netting rules — the same dollar must never be drawn twice', () => {
  it('a job with a deposit requested contributes only the balance', () => {
    const result = build({
      jobs: [job({ quoted_amount: 5000 })],
      payments: [payment({ amount: 2000 })],
      settled: [{ job_id: 'job-1', amount: 2000 }],
    });
    // $2,000 as the deposit request + $3,000 as the rest. Not $7,000.
    expect(total(result)).toBe(5000);
    expect(result.events.find((e) => e.id === 'job:job-1')?.amount).toBe(3000);
  });

  it('a declined charge awaiting retry is drawn ONCE, not also inside the job', () => {
    const result = build({
      jobs: [job({ quoted_amount: 5000 })],
      payments: [
        payment({
          id: 'pay-fail',
          amount: 1200,
          status: 'failed',
          dunning_state: 'scheduled',
          next_retry_at: '2026-08-05T09:00:00.000Z',
        }),
      ],
      // A failed row is NOT in the settled query (that one is paid/processing/
      // requested), so without the extra rule the job would carry it too.
      settled: [],
    });
    expect(total(result)).toBe(5000);
    expect(result.events.find((e) => e.id === 'pay:pay-fail')?.amount).toBe(1200);
    expect(result.events.find((e) => e.id === 'job:job-1')?.amount).toBe(3800);
  });

  it("a pending-deposit plan's installments replace the job's lump, exactly", () => {
    const result = build({
      jobs: [job({ quoted_amount: 6000 })],
      pendingPlans: [
        {
          id: 'plan-1',
          job_id: 'job-1',
          total_cents: 600_000,
          deposit_cents: 300_000,
          installment_count: 3,
          frequency: 'monthly',
          first_installment_date: '2026-08-05',
        },
      ],
      settled: [{ job_id: 'job-1', amount: 3000 }], // the deposit request
      payments: [payment({ amount: 3000 })],
    });
    // Deposit 3,000 + three 1,000 installments = the whole 6,000 quote, once.
    // Only the first installment is inside the 30-day window; the other two are
    // still netted off the job so they don't reappear as a lump.
    expect(result.events.filter((e) => e.kind === 'installment')).toHaveLength(1);
    expect(result.events.find((e) => e.id === 'job:job-1')).toBeUndefined();
    expect(total(result)).toBe(4000); // 3,000 deposit + 1,000 first installment
  });

  it('a recurring visit that already became a job is not projected as well', () => {
    const plan = {
      id: 'plan-r',
      title: 'Weekly mow',
      client_name: 'Nina',
      amount: 99,
      frequency: 'weekly' as const,
      next_run_date: '2026-08-03',
      active: true,
      remaining_cycles: null,
      auto_charge: true,
      card_last4: '4242',
    };
    const withoutJob = build({ recurringPlans: [plan] });
    const withJob = build({
      recurringPlans: [plan],
      jobs: [job({ id: 'visit-job', quoted_amount: 0, recurring_plan_id: 'plan-r', recurring_visit_date: '2026-08-03' })],
    });
    expect(withoutJob.events.some((e) => e.id === 'visit:plan-r:2026-08-03')).toBe(true);
    expect(withJob.events.some((e) => e.id === 'visit:plan-r:2026-08-03')).toBe(false);
    // …and the rest of the cadence still projects.
    expect(withJob.events.length).toBe(withoutJob.events.length - 1);
  });

  it('a fully-paid job adds nothing at all', () => {
    const result = build({
      jobs: [job({ quoted_amount: 5000 })],
      settled: [{ job_id: 'job-1', amount: 5000 }],
    });
    expect(result.events).toHaveLength(0);
  });

  it('ignores a few cents of rounding left on a job rather than drawing them', () => {
    const result = build({
      jobs: [job({ quoted_amount: 5000 })],
      settled: [{ job_id: 'job-1', amount: 4999.7 }],
    });
    expect(result.events).toHaveLength(0);
  });
});

describe('which failed payments count', () => {
  it('only a scheduled retry — not one waiting on a card, not an exhausted one', () => {
    expect(isRetrying(payment({ status: 'failed', dunning_state: 'scheduled', next_retry_at: '2026-08-05T00:00:00Z' }))).toBe(true);
    expect(isRetrying(payment({ status: 'failed', dunning_state: 'needs_card', next_retry_at: null }))).toBe(false);
    expect(isRetrying(payment({ status: 'failed', dunning_state: 'exhausted', next_retry_at: null }))).toBe(false);
    // Scheduled but with no date is not a date.
    expect(isRetrying(payment({ status: 'failed', dunning_state: 'scheduled', next_retry_at: null }))).toBe(false);
  });

  it('drops an undated failure entirely — not drawn AND not netted off the job', () => {
    const result = build({
      jobs: [job({ quoted_amount: 5000 })],
      payments: [payment({ id: 'dead', amount: 1200, status: 'failed', dunning_state: 'needs_card' })],
    });
    expect(result.events.some((e) => e.id === 'pay:dead')).toBe(false);
    // The money is still owed, so the job still carries the whole quote.
    expect(result.events.find((e) => e.id === 'job:job-1')?.amount).toBe(5000);
  });

  it('never calls a retry confirmed — the card already said no once', () => {
    const result = build({
      payments: [
        payment({ id: 'r', job_id: null, kind: 'plan_installment', due_date: '2026-08-06', status: 'failed', dunning_state: 'scheduled', next_retry_at: '2026-08-06T00:00:00Z' }),
      ],
    });
    expect(result.events[0].confirmed).toBe(false);
    expect(result.events[0].detail).toContain('Card declined');
  });
});

describe('dating', () => {
  it('lands a requested payment a payment-lag after it was asked for', () => {
    const result = build({ payments: [payment({ requested_at: '2026-08-02T12:00:00.000Z' })], lagDays: 7 });
    expect(result.events[0].dateKey).toBe('2026-08-09');
  });

  it('uses the scheduled charge date when there is one, with no lag', () => {
    const result = build({ payments: [payment({ kind: 'plan_installment', due_date: '2026-08-12' })] });
    expect(result.events[0].dateKey).toBe('2026-08-12');
    expect(result.events[0].confirmed).toBe(true);
  });

  it('pulls an overdue request onto today and says how late it is', () => {
    // Asked for on 20 Jul with a 7-day lag: expected 27 Jul, five days ago.
    const result = build({ payments: [payment({ requested_at: '2026-07-20T12:00:00.000Z' })] });
    expect(result.events[0].dateKey).toBe(TODAY);
    expect(result.events[0].detail).toContain('5 days past');
  });

  it('lands quoted work a lag after the LAST day it runs, not the first', () => {
    const result = build({ jobs: [job({ scheduled_for: '2026-08-10', scheduled_until: '2026-08-14' })] });
    expect(result.events[0].dateKey).toBe('2026-08-21');
  });

  it('charges an auto-charged visit on the day and invoices one a lag later', () => {
    const base = {
      id: 'p',
      title: 'Mow',
      client_name: 'Nina',
      amount: 99,
      frequency: 'weekly' as const,
      next_run_date: '2026-08-03',
      active: true,
      remaining_cycles: 1,
    };
    const auto = build({ recurringPlans: [{ ...base, auto_charge: true, card_last4: '4242' }] });
    const invoiced = build({ recurringPlans: [{ ...base, auto_charge: false, card_last4: null }] });
    expect(auto.events[0].dateKey).toBe('2026-08-03');
    expect(auto.events[0].confirmed).toBe(true);
    expect(invoiced.events[0].dateKey).toBe('2026-08-10');
    expect(invoiced.events[0].confirmed).toBe(false);
  });
});

describe('finished work nobody has invoiced', () => {
  it('is counted, never drawn — there is no honest date for it', () => {
    const result = build({
      jobs: [job({ status: 'complete', scheduled_for: '2026-07-20', quoted_amount: 4200 })],
    });
    expect(result.events).toHaveLength(0);
    expect(result.unbilled).toEqual({ count: 1, total: 4200 });
  });

  it('counts only what is actually still owed on it', () => {
    const result = build({
      jobs: [job({ status: 'complete', scheduled_for: '2026-07-20', quoted_amount: 4200 })],
      settled: [{ job_id: 'job-1', amount: 4000 }],
    });
    expect(result.unbilled).toEqual({ count: 1, total: 200 });
  });

  it('adds up across several jobs without drifting', () => {
    const result = build({
      jobs: [
        job({ id: 'a', status: 'complete', scheduled_for: '2026-07-20', quoted_amount: 100.1 }),
        job({ id: 'b', status: 'complete', scheduled_for: '2026-07-21', quoted_amount: 200.2 }),
        job({ id: 'c', status: 'complete', scheduled_for: '2026-07-22', quoted_amount: 300.3 }),
      ],
    });
    expect(result.unbilled).toEqual({ count: 3, total: 600.6 });
  });
});

describe('what stays off the curve', () => {
  it('work that finished before today', () => {
    expect(build({ jobs: [job({ scheduled_for: '2026-07-25' })] }).events).toHaveLength(0);
  });

  it('work with no date on it at all', () => {
    expect(build({ jobs: [job({ scheduled_for: null, scheduled_until: null })] }).events).toHaveLength(0);
  });

  it('a job with no price', () => {
    expect(build({ jobs: [job({ quoted_amount: 0 })] }).events).toHaveLength(0);
  });

  it('a zero or negative payment row', () => {
    expect(build({ payments: [payment({ amount: 0 }), payment({ id: 'neg', amount: -50 })] }).events).toHaveLength(0);
  });

  it('a paused recurring plan', () => {
    const result = build({
      recurringPlans: [
        { id: 'p', title: 'Mow', client_name: 'Nina', amount: 99, frequency: 'weekly', next_run_date: '2026-08-03', active: false, remaining_cycles: null, auto_charge: true, card_last4: '4242' },
      ],
    });
    expect(result.events).toHaveLength(0);
  });
});
