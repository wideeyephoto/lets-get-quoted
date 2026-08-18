import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ACH_MIN_AMOUNT } from '@/lib/pricing';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
const SCRIPT = read('scripts/verify-ach-readiness.mjs');
const PRICING = read('src/lib/pricing.ts');
const PAYMENTS = read('src/lib/payments.ts');

// scripts/verify-ach-readiness.mjs is plain ESM run by node, so it cannot import
// the TypeScript modules. It parses the threshold out of pricing.ts instead —
// deliberately, because a duplicated copy would drift from the one the payment
// rail actually reads, which is the class of fault the script exists to catch.
function parseThresholdAsScriptDoes(source: string): number | null {
  const match = source.match(/export const ACH_MIN_AMOUNT = (\d+);/);
  return match ? Number(match[1]) : null;
}

describe('the ACH readiness script', () => {
  it('parses exactly the threshold the pricing module exports', () => {
    expect(parseThresholdAsScriptDoes(PRICING)).toBe(ACH_MIN_AMOUNT);
  });

  it('refuses to guess when the declaration has been reshaped', () => {
    // If someone computes the constant, the parse must fail loudly rather than
    // report a threshold nobody applies.
    expect(parseThresholdAsScriptDoes('export const ACH_MIN_AMOUNT = compute();')).toBeNull();
    expect(SCRIPT).toContain('Refusing to guess the threshold');
  });

  it('checks that the rail still gates on the constant it reports', () => {
    // The threshold is only meaningful if payments.ts consults it. This is the
    // assertion the script makes at runtime; here we confirm it currently holds.
    expect(PAYMENTS).toMatch(/payment\.amount >= ACH_MIN_AMOUNT/);
    expect(SCRIPT).toContain('railUsesThreshold');
  });

  it('reads the capability on the account the key belongs to, not a connected one', () => {
    // Destination charge: the Session and Charge are created on the PLATFORM, so
    // the platform's capability decides. Passing an account id here would answer
    // a question nobody asked.
    expect(SCRIPT).toContain('stripe.accounts.retrieve()');
    expect(SCRIPT).toContain('us_bank_account_ach_payments');
  });

  it('treats a pending capability as not active', () => {
    // Stripe reports active | inactive | pending. Only 'active' can take a
    // payment, and 'pending' must never read as a pass.
    expect(SCRIPT).toContain("capability === 'active'");
  });

  it('treats a test-mode key as inconclusive rather than as a pass', () => {
    expect(SCRIPT).toContain("if (keyMode !== 'live')");
    expect(SCRIPT).toContain('says nothing about production');
  });

  it('does not print a bare pass verdict on a non-live key', () => {
    // Observed on the first run: the human-readable verdict said "ACH is ACTIVE"
    // and the exit-2 caveat came four lines later, so a skim took away the exact
    // opposite of the truth. The verdict itself now carries the mode.
    expect(SCRIPT).toContain('TEST ACCOUNT ONLY');
    expect(SCRIPT).toContain('the production answer is UNKNOWN');
    // The unqualified pass must sit on the live branch, after the mode check.
    const modeBranch = SCRIPT.indexOf("if (keyMode !== 'live') {");
    const barePass = SCRIPT.indexOf('ACH is ACTIVE.');
    expect(modeBranch).toBeGreaterThan(-1);
    expect(barePass).toBeGreaterThan(modeBranch);
  });

  it('never writes to Stripe', () => {
    for (const mutation of [
      'checkout.sessions.create',
      'accounts.update',
      'accounts.create',
      'paymentIntents.create',
    ]) {
      expect(SCRIPT).not.toContain(mutation);
    }
  });
});
