import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MAX_PAYMENT_DOLLARS, parsePaymentAmount, paymentAmountError } from '@/lib/money-input';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

/**
 * `createDepositRequestAction` read its amount with `Number()`, and the guard
 * beneath it is `if (amount <= 0) throw`.
 *
 * **NaN <= 0 is false.** So every unparseable amount walked through, supabase-js
 * serialised NaN to null, and it landed on a `numeric NOT NULL` column -- so the
 * contractor got a raw Postgres not-null violation through the dashboard error
 * boundary, and lost the form.
 *
 * The inputs that do it are ordinary: `$500`, `1,200`, `12,50`.
 */

describe('the guard that let NaN through', () => {
  it('is false for NaN, which is the whole bug', () => {
    // Stated as an executable fact rather than a comment, because it is the
    // kind of thing that reads as obviously wrong and is easy to write anyway.
    expect(NaN <= 0).toBe(false);
    expect(Number('$500')).toBeNaN();
    expect(Number('1,200')).toBeNaN();
  });

  it('is now checked for finiteness at the library boundary too', () => {
    // Callers parse properly, but createDepositRequest must hold whether or not
    // a future one remembers to.
    expect(read('src/lib/payments.ts')).toContain('!Number.isFinite(input.amount) || input.amount <= 0');
  });
});

describe('what a person can type', () => {
  it('accepts the plain cases', () => {
    expect(parsePaymentAmount('1250')).toEqual({ ok: true, amount: 1250 });
    expect(parsePaymentAmount('1250.50')).toEqual({ ok: true, amount: 1250.5 });
    expect(parsePaymentAmount('0.99')).toEqual({ ok: true, amount: 0.99 });
  });

  it('accepts a dollar sign, because the field is labelled with one', () => {
    expect(parsePaymentAmount('$500')).toEqual({ ok: true, amount: 500 });
    expect(parsePaymentAmount('$ 1,250.50')).toEqual({ ok: true, amount: 1250.5 });
  });

  it('accepts thousands commas in the right places', () => {
    expect(parsePaymentAmount('1,250')).toEqual({ ok: true, amount: 1250 });
    expect(parsePaymentAmount('12,500.25')).toEqual({ ok: true, amount: 12500.25 });
    expect(parsePaymentAmount('1,234,567')).toEqual({ ok: true, amount: 1234567 });
  });

  it('trims surrounding whitespace', () => {
    expect(parsePaymentAmount('  750.00  ')).toEqual({ ok: true, amount: 750 });
  });
});

describe('what it refuses, and why refusing beats guessing', () => {
  it('refuses a decimal comma rather than reading it as thousands', () => {
    // THE ONE THAT MATTERS. smart-import's parseMoney strips non-digits, so it
    // reads '12,50' as 1250 -- a hundredfold error, made silently, on a figure
    // a customer is about to be charged. There is no way to tell from the
    // string which was meant, so this refuses and says so.
    expect(parsePaymentAmount('12,50')).toEqual({ ok: false, reason: 'unreadable' });
    expect(parsePaymentAmount('1.250,50')).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('refuses commas in the wrong positions', () => {
    expect(parsePaymentAmount('1,2500')).toMatchObject({ ok: false });
    expect(parsePaymentAmount('12,34,567')).toMatchObject({ ok: false });
  });

  it('refuses letters and stray characters', () => {
    for (const bad of ['abc', '5oo', '1250!', '--50', '1250-']) {
      expect(parsePaymentAmount(bad), bad).toMatchObject({ ok: false });
    }
  });

  it('refuses an empty field distinctly, so the message can differ', () => {
    expect(parsePaymentAmount('')).toEqual({ ok: false, reason: 'empty' });
    expect(parsePaymentAmount('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(parsePaymentAmount(null)).toEqual({ ok: false, reason: 'empty' });
    expect(parsePaymentAmount(undefined)).toEqual({ ok: false, reason: 'empty' });
  });

  it('refuses zero and negatives', () => {
    expect(parsePaymentAmount('0')).toEqual({ ok: false, reason: 'not_positive' });
    expect(parsePaymentAmount('0.00')).toEqual({ ok: false, reason: 'not_positive' });
    expect(parsePaymentAmount('-50')).toMatchObject({ ok: false });
  });

  it('names a third decimal place as its own mistake', () => {
    // "cents only go to two places" is actionable; "unreadable" is not.
    expect(parsePaymentAmount('12.345')).toEqual({ ok: false, reason: 'too_precise' });
  });

  it('refuses an implausibly large amount as a likely typo', () => {
    expect(parsePaymentAmount(String(MAX_PAYMENT_DOLLARS + 1))).toEqual({ ok: false, reason: 'too_large' });
    expect(parsePaymentAmount(String(MAX_PAYMENT_DOLLARS))).toMatchObject({ ok: true });
  });

  it('never returns a non-finite amount', () => {
    // The failure mode the whole module exists for. Infinity also passes
    // `<= 0`, and JSON.stringify turns it into null exactly like NaN.
    for (const bad of ['Infinity', '-Infinity', 'NaN', '1e999']) {
      const result = parsePaymentAmount(bad);
      if (result.ok) expect(Number.isFinite(result.amount), bad).toBe(true);
    }
  });
});

describe('the message a person is shown', () => {
  it('says something different for each reason', () => {
    const reasons = ['empty', 'unreadable', 'not_positive', 'too_precise', 'too_large'] as const;
    const messages = reasons.map((r) => paymentAmountError(r));
    expect(new Set(messages).size).toBe(reasons.length);
    for (const message of messages) expect(message.length).toBeGreaterThan(20);
  });

  it('explains the comma rule, since that is the invisible one', () => {
    // Somebody who typed 12,50 is looking at a string that appears entirely
    // reasonable. The message has to name the actual rule.
    expect(paymentAmountError('unreadable')).toContain('thousands separator');
    expect(paymentAmountError('unreadable')).toContain('full stop');
  });
});

describe('the action uses it', () => {
  const ACTION = read('src/app/dashboard/jobs/payments-actions.ts');

  it('no longer coerces with Number()', () => {
    expect(ACTION).not.toContain("Number(formData.get('amount'))");
    expect(ACTION).toContain("parsePaymentAmount(formData.get('amount'))");
  });

  it('turns a refusal into a sentence rather than a throw nobody wrote', () => {
    expect(ACTION).toContain('paymentAmountError(parsedAmount.reason)');
  });
});

describe('every write guard on money is NaN-safe', () => {
  /**
   * Two idioms, and only one of them works.
   *
   *   amount <= 0        NaN passes. This is the bug.
   *   !(amount > 0)      NaN is caught.
   *   !Number.isFinite   NaN and Infinity are both caught.
   *
   * The codebase mostly knew: change-orders, milestones and the quickbooks map
   * all use the safe form for validating money somebody typed, and refundPayment
   * already tested isFinite. The two that did not were both INSERT guards
   * sitting in front of a `numeric NOT NULL` column, which is the one place the
   * failure turns into a Postgres error rather than a wrong number.
   */
  const WRITE_GUARDS = [
    ['createDepositRequest', 'src/lib/payments.ts', 'Payment amount must be greater than 0.'],
    ['addInvoiceItem', 'src/lib/invoices.ts', 'Line item amount must be greater than 0.'],
  ] as const;

  for (const [name, file, message] of WRITE_GUARDS) {
    it(`${name} checks finiteness before comparing`, () => {
      const source = read(file);
      const at = source.indexOf(message);
      expect(at, `${message} not found`).toBeGreaterThan(-1);
      // The guard is the `if` immediately above the throw.
      const guard = source.slice(Math.max(0, at - 400), at);
      expect(guard, name).toContain('Number.isFinite');
    });
  }

  it('leaves the read paths alone', () => {
    // The forecast and insights modules compare `amount <= 0` on values read
    // from NOT NULL numeric columns, where NaN cannot occur. Changing those
    // would be noise, and this file is not a blanket ban on the operator.
    const forecast = read('src/lib/cash-forecast-incoming.ts');
    expect(forecast).toContain('amount <= 0');
  });

  it('keeps the safe idiom where it was already used', () => {
    // !(x > 0) is NaN-safe and reads well next to a human-facing blocker string.
    expect(read('src/lib/milestones.ts')).toContain('!(milestone.amount > 0)');
    expect(read('src/lib/change-orders.ts')).toContain('!(order.amount > 0)');
  });

  it('is used by both actions that take a typed amount', () => {
    for (const file of [
      'src/app/dashboard/jobs/payments-actions.ts',
      'src/app/dashboard/jobs/invoices-actions.ts',
    ]) {
      const source = read(file);
      expect(source, file).toContain("parsePaymentAmount(formData.get('amount'))");
      expect(source, file).not.toContain("Number(formData.get('amount'))");
    }
  });
});
