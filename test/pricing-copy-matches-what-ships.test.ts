import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OVERAGE_RATE_MILLICENTS } from '../src/lib/billing/usage-overage';
import { OVERAGE_AUTHORIZATION_TEXT } from '../src/lib/billing/overage-consent';
import { formatOverageRate } from '../src/lib/billing/overage-summary';
import { stripComments } from './helpers/source-text';

/**
 * The pre-sale promise has to describe the product that exists.
 *
 * On 2026-08-19 the FAQ truthfully said there was "no automatic overage and no
 * setting that turns one on". On 2026-08-22 the setting shipped — the panel, the
 * consent, the accrual, and a cron writing real Stripe invoiceItems — and the
 * copy was not touched. For three days /pricing denied a live billing feature
 * while the authorization text told contractors they were charged "at the
 * published per-unit rates" that no page printed.
 *
 * These tests are deliberately keyed on the CODE existing, not on a phrase. A
 * copy guard that only greps for wording goes stale the same way the copy did.
 */

// Prose stripped, or this file fails against its own comments quoting the false
// sentences it exists to forbid. See test/helpers/source-text.ts.
const read = (...parts: string[]) => stripComments(readFileSync(join(process.cwd(), ...parts), 'utf8'));
const pricingCatalog = read('src', 'app', 'pricing', 'pricing-catalog.ts');
const pricingExperience = read('src', 'app', 'pricing', 'PricingExperience.tsx');

/** Does the opt-in overage mechanism actually ship? */
const overageShips = existsSync(
  join(process.cwd(), 'src', 'app', 'dashboard', 'settings', 'OverageAuthorizationPanel.tsx'),
) && existsSync(join(process.cwd(), 'src', 'lib', 'billing', 'overage-settlement-worker.ts'));

describe('pricing copy versus the shipped overage mechanism', () => {
  it('is testing against a product where the mechanism exists', () => {
    // If this ever fails the feature was removed, and the assertions below
    // should be inverted rather than deleted.
    expect(overageShips).toBe(true);
  });

  it('does not claim no setting can turn an overage on', () => {
    // The exact sentence that was false. Keyed on the claim, not the question.
    for (const source of [pricingCatalog, pricingExperience]) {
      expect(source).not.toMatch(/no setting that turns one on/i);
      expect(source).not.toMatch(/There is no automatic overage/i);
    }
  });

  it('does not promise a charge can never be automatic', () => {
    expect(pricingExperience).not.toMatch(/never an automatic charge/i);
  });

  it('says the two true things instead: opt-in, and capped by the contractor', () => {
    const faq = pricingCatalog.slice(pricingCatalog.indexOf('Can LGQ charge an overage automatically?'));
    const answer = faq.slice(0, 700);
    expect(answer).toMatch(/switch it on/i);
    expect(answer).toMatch(/limit/i);
    expect(answer).toMatch(/refused/i);
  });

  it('no longer carries the comment calling the mechanism nonexistent', () => {
    expect(pricingCatalog).not.toMatch(/does not exist anywhere in the product/i);
  });
});

describe('the rates the authorization text calls published', () => {
  const planUsage = read('src', 'app', 'dashboard', 'settings', 'PlanUsageSection.tsx');

  it('is still a text that claims they are published', () => {
    // The assertion below only matters while the consent makes this promise.
    expect(OVERAGE_AUTHORIZATION_TEXT).toMatch(/published per-unit rates/i);
  });

  it('renders the per-unit rate rather than computing and discarding it', () => {
    expect(planUsage).toContain('formatOverageRate(line.rateMillicents)');
  });

  it('formats a sub-cent rate as something other than $0.00', () => {
    // formatOverageTotal rounds to cents, so the cheapest rate would have
    // published as $0.00 — worse than not publishing it.
    expect(formatOverageRate(OVERAGE_RATE_MILLICENTS.marketing_email_sends)).toBe('$0.0034');
    expect(formatOverageRate(OVERAGE_RATE_MILLICENTS.text_segments)).toBe('$0.048');
    expect(formatOverageRate(OVERAGE_RATE_MILLICENTS.voice_minutes)).toBe('$0.35');
  });

  it('has a printable rate for every resource that can accrue', () => {
    for (const [resource, millicents] of Object.entries(OVERAGE_RATE_MILLICENTS)) {
      expect(formatOverageRate(millicents), `${resource} formats to nothing useful`).toMatch(/^\$\d/);
      expect(formatOverageRate(millicents), `${resource} rounds away to zero`).not.toBe('$0');
    }
  });
});
