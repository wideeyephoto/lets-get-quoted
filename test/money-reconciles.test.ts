import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatMoney, formatMoneyExact } from '@/lib/jobs';
import { buildPlanSchedule, planSchedulePreview } from '@/lib/payment-plan-math';
import { paymentText } from '@/lib/sms-templates';

/**
 * A homeowner opened a $3,500 payment plan, read "$1,750 deposit" and four rows
 * of "$438", added them up, got $3,502, and stopped trusting the page — under a
 * sentence promising "this splits the same total, nothing more".
 *
 * Nothing was wrong with the money. The plan math is integer cents and sums
 * exactly. What was wrong was that every amount was printed through a formatter
 * that rounds to whole dollars, so the numbers on screen were not the numbers
 * being charged, and did not add up to each other.
 *
 * These tests are about the DISPLAYED strings, because that is what a customer
 * checks our arithmetic with.
 */

/** Read a rendered amount back as a number, the way a customer adds them up. */
const parse = (shown: string) => Number(shown.replace(/[$,]/g, ''));

const strip = (source: string) =>
  source
    .replace(/\r\n/g, '\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const read = (...parts: string[]) => strip(readFileSync(join(process.cwd(), ...parts), 'utf8'));

describe('formatMoneyExact', () => {
  it('keeps the cents', () => {
    expect(formatMoneyExact(437.5)).toBe('$437.50');
    expect(formatMoneyExact(99.94)).toBe('$99.94');
    expect(formatMoneyExact(0.05)).toBe('$0.05');
  });

  it('still groups thousands and still puts the sign outside the symbol', () => {
    expect(formatMoneyExact(1750)).toBe('$1,750.00');
    expect(formatMoneyExact(3500)).toBe('$3,500.00');
    expect(formatMoneyExact(-120.4)).toBe('-$120.40');
  });

  it('survives zero and nonsense without printing NaN at a customer', () => {
    expect(formatMoneyExact(0)).toBe('$0.00');
    expect(formatMoneyExact(Number.NaN)).toBe('$0.00');
    expect(formatMoneyExact(Number.POSITIVE_INFINITY)).toBe('$0.00');
  });

  it('is a different function from formatMoney, which still rounds for summaries', () => {
    expect(formatMoney(437.5)).toBe('$438');
    expect(formatMoneyExact(437.5)).toBe('$437.50');
  });
});

describe('a payment plan adds up on the page', () => {
  it('the reported $3,500 plan: deposit plus installments is exactly the total', () => {
    const total = 350000;
    const { depositCents } = buildPlanSchedule(total, 50, 4);
    const schedule = planSchedulePreview({
      total_cents: total,
      deposit_cents: depositCents,
      installment_count: 4,
      frequency: 'monthly',
      first_installment_date: '2026-09-01',
    });

    const shownDeposit = formatMoneyExact(depositCents / 100);
    const shownInstallments = schedule.map((entry) => formatMoneyExact(entry.amountCents / 100));
    expect(shownDeposit).toBe('$1,750.00');
    expect(shownInstallments).toEqual(['$437.50', '$437.50', '$437.50', '$437.50']);

    const addedUp = parse(shownDeposit) + shownInstallments.reduce((sum, shown) => sum + parse(shown), 0);
    expect(addedUp).toBe(3500);
    expect(formatMoneyExact(addedUp)).toBe(formatMoneyExact(total / 100));
  });

  it('the rounded formatter is what produced $3,502 — kept here so the bug stays named', () => {
    const roundedDeposit = parse(formatMoney(1750));
    const roundedInstallments = [437.5, 437.5, 437.5, 437.5].map((amount) => parse(formatMoney(amount)));
    expect(roundedDeposit + roundedInstallments.reduce((sum, n) => sum + n, 0)).toBe(3502);
  });

  it('adds up for every plan shape a contractor can pick', () => {
    const totals = [9994, 25000, 100000, 175025, 350000, 999999, 100];
    const deposits = [0, 10, 25, 33, 50, 75];
    const counts = [1, 2, 3, 4, 6, 12];

    for (const total of totals) {
      for (const percent of deposits) {
        for (const count of counts) {
          const { depositCents } = buildPlanSchedule(total, percent, count);
          const schedule = planSchedulePreview({
            total_cents: total,
            deposit_cents: depositCents,
            installment_count: count,
            frequency: 'monthly',
            first_installment_date: '2026-09-01',
          });
          const addedUp =
            parse(formatMoneyExact(depositCents / 100)) +
            schedule.reduce((sum, entry) => sum + parse(formatMoneyExact(entry.amountCents / 100)), 0);
          // Compared in cents: the whole point is that no rounding creeps in.
          expect(Math.round(addedUp * 100)).toBe(total);
        }
      }
    }
  });
});

describe('every surface that names a charge names it to the cent', () => {
  it('the pay page button says what the card is charged', () => {
    const source = read('src', 'app', 'pay', '[id]', 'page.tsx');
    expect(source).toContain('formatMoneyExact');
    // The local rounding helper this page used to carry.
    expect(source).not.toMatch(/Math\.round\(n\)\.toLocaleString/);
  });

  it('the invoice page totals to the cent', () => {
    const source = read('src', 'app', 'invoice', '[id]', 'page.tsx');
    expect(source).toContain('formatMoneyExact');
    expect(source).not.toMatch(/Math\.round\(n\)\.toLocaleString/);
  });

  it('the client job page does, including the plan schedule', () => {
    const source = read('src', 'app', 'client', 'jobs', '[token]', 'page.tsx');
    expect(source).toContain('formatMoneyExact as formatMoney');
    expect(source).not.toMatch(/import \{ formatMoney \}/);
  });

  it('the texts do — a receipt for a different number than was taken is worse than none', () => {
    const requested = paymentText({ contractor: 'Evergreen', label: 'deposit', amount: 437.5, link: 'lgq.co/x', eventType: 'payment_requested' });
    expect(requested).toContain('$437.50');
    expect(requested).not.toContain('$438');

    const paid = paymentText({ contractor: 'Evergreen', label: 'installment', amount: 99.94, link: 'lgq.co/x', eventType: 'payment_paid' });
    expect(paid).toContain('$99.94');
  });
});
