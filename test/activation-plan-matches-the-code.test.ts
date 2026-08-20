import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * AN ACTIVATION RUNBOOK IS ONLY WORTH HAVING IF FOLLOWING IT WORKS.
 *
 * The ordered table listed five steps and omitted two flags, both of which fail
 * SILENTLY when missed:
 *
 *   LGQ_PRICING_DASHBOARD_ENABLED gates whether planUsage is loaded at all, and
 *   showSubscriptionCheckout requires it. With the checkout flag on and this one
 *   off there is no buy button anywhere and no error -- which reads as a failed
 *   deploy, not a missing switch. The doc actively said it was "independent".
 *
 *   LGQ_PAID_PLAN_ALLOWANCE_RESET_WORKER_ENABLED is the only thing that re-grants
 *   credits to an ANNUAL subscriber. A monthly plan re-grants from its next
 *   invoice; an annual plan has no next invoice for a year.
 *
 * These assertions are deliberately two-sided: they check the doc says it AND
 * that the code still behaves that way. If somebody decouples the surfaces, this
 * fails and tells you the runbook can be simplified, rather than quietly leaving
 * a stale warning in place.
 */

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8');
const PLAN = read('docs', 'subscription-activation-plan-2026-08-17.md');
const PAGE = read('src', 'app', 'dashboard', 'settings', 'page.tsx');
const ENV = read('.env.example');

/** The ordered table only — a mention in prose elsewhere is not a step. */
const orderedTable = () => {
  const start = PLAN.indexOf('| # | step | why this order |');
  expect(start, 'the ordered activation table is gone').toBeGreaterThan(-1);
  const end = PLAN.indexOf('\n\n', start);
  return PLAN.slice(start, end === -1 ? undefined : end);
};

describe('the activation runbook lists every flag the checkout actually needs', () => {
  const table = orderedTable();

  it('names the pricing dashboard flag as a step', () => {
    expect(table).toContain('LGQ_PRICING_DASHBOARD_ENABLED');
  });

  it('names the allowance reset worker as a step', () => {
    expect(table).toContain('LGQ_PAID_PLAN_ALLOWANCE_RESET_WORKER_ENABLED');
  });

  it('still puts the customer-charging flag last', () => {
    const checkout = table.indexOf('LGQ_BASE_PLAN_SUBSCRIPTION_CHECKOUT_ENABLED');
    expect(checkout).toBeGreaterThan(table.indexOf('LGQ_PRICING_DASHBOARD_ENABLED'));
    expect(checkout).toBeGreaterThan(table.indexOf('LGQ_STRIPE_BILLING_WEBHOOK_ENABLED'));
    expect(checkout).toBeGreaterThan(table.indexOf('LGQ_STRIPE_SUBSCRIPTION_PROJECTION_WORKER_ENABLED'));
  });

  it('documents every flag it asks an operator to set', () => {
    for (const flag of [...table.matchAll(/LGQ_[A-Z0-9_]+/g)].map((m) => m[0])) {
      expect(ENV, `${flag} is a step but is undocumented in .env.example`).toContain(flag);
    }
  });
});

describe('the dependency the runbook now warns about is real', () => {
  it('loads plan usage only when the pricing dashboard flag is on', () => {
    // If this stops being true, step 4b can be dropped from the runbook.
    expect(PAGE).toContain('pricingDashboardEnabled ? loadWorkspacePlanUsage(supabase, accountId) : Promise.resolve(null)');
  });

  it('gates the buy button on that same plan usage', () => {
    const block = PAGE.slice(
      PAGE.indexOf('const showSubscriptionCheckout'),
      PAGE.indexOf('const showTopUpPurchase'),
    );
    expect(block).toContain('subscriptionCheckoutEnabled');
    expect(block).toContain("planUsage?.plan.kind === 'ready'");
  });

  it('gates the top-up surface the same way, which the runbook also says', () => {
    const block = PAGE.slice(PAGE.indexOf('const showTopUpPurchase'));
    expect(block.slice(0, 300)).toContain("planUsage?.plan.kind === 'ready'");
  });
});

describe('the blocker that no flag in the table can clear', () => {
  it('warns that the live Prices carry the wrong catalog version', () => {
    // Every plan checkout fails closed until the Prices are recreated, and the
    // customer-facing error deliberately says nothing useful -- so the runbook
    // has to, or the first activation attempt reads as a deploy failure.
    expect(PLAN).toContain('2026-08-18-preview');
    expect(PLAN).toMatch(/fails closed/i);
  });

  it('still describes the check that causes it', async () => {
    const checkout = read('src', 'lib', 'billing', 'stripe-billing-subscription-checkout.ts');
    expect(checkout).toContain('price.catalogVersion !== PRICING_CATALOG_VERSION');
    const { PRICING_CATALOG_VERSION } = await import('@/lib/billing/catalog');
    expect(PLAN, 'the runbook names a stale catalog version')
      .toContain(PRICING_CATALOG_VERSION);
  });
});
