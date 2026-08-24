import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOP_UPS, SELLABLE_TOP_UP_IDS } from '../src/lib/billing/catalog';

/**
 * Nothing recurring may be sold until something can stop it.
 *
 * `crew_user` is a recurring SKU in the catalog: $5/month,
 * `fulfillment: 'recurring_capacity'`, eligible on Solo and up. Buying one
 * opens a real Stripe subscription — top-up-purchase.ts sets
 * `mode: sku.recurring ? 'subscription' : 'payment'`.
 *
 * The cancel path exists in `subscription-cancellation.ts` via
 * `cancelPurchasedCapacitySubscriptionAtPeriodEnd`, exposed via
 * `cancelPurchasedCapacitySubscriptionAction` in settings, and
 * `cancelSubscriptionForAccountDeletion` cleans up all active
 * `workspace_purchased_capacity` subscriptions when an account is deleted.
 */

const src = (...p: string[]) => readFileSync(join(process.cwd(), 'src', ...p), 'utf8');

describe('recurring top-ups', () => {
  it('is a catalog that contains at least one recurring SKU', () => {
    const recurring = Object.values(TOP_UPS).filter((sku) => sku.recurring);
    expect(recurring.length).toBeGreaterThan(0);
  });

  it('crew_user is sellable because a cancel path exists', () => {
    const sellableRecurring = SELLABLE_TOP_UP_IDS.filter((id) => TOP_UPS[id].recurring);
    expect(sellableRecurring).toContain('crew_user');
  });
});

describe('the recurring cancellation path', () => {
  it('creates a SUBSCRIPTION for a recurring sku', () => {
    expect(src('lib', 'billing', 'top-up-purchase.ts'))
      .toContain("mode: sku.recurring ? 'subscription' : 'payment'");
  });

  it('restricts Stripe subscription writes to billing modules', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.next') continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(tsx?|mjs)$/.test(entry.name)) files.push(path);
      }
    };
    walk(join(process.cwd(), 'src'));
    walk(join(process.cwd(), 'scripts'));

    const WRITE = /\.subscriptions\.(cancel|update|create|del)\s*\(/;
    const writers = files.filter((file) => WRITE.test(readFileSync(file, 'utf8')));
    const allowed = ['plan-change.ts', 'plan-change-worker.ts', 'subscription-cancellation.ts'];
    const unexpected = writers.filter((file) => !allowed.some((name) => file.endsWith(name)));

    expect(writers.length, 'no subscription writes found at all; the search broke').toBeGreaterThan(0);
    expect(
      unexpected.map((f) => f.replace(process.cwd(), '.')),
      'a new Stripe subscription write appeared outside allowed billing modules',
    ).toEqual([]);
  });

  it('records the subscription id on workspace_purchased_capacity', () => {
    expect(src('lib', 'billing', 'top-up-event-projector.ts')).toContain('stripe_subscription_id');
  });

  it('implements cancelPurchasedCapacitySubscriptionAtPeriodEnd', () => {
    const cancellation = src('lib', 'billing', 'subscription-cancellation.ts');
    expect(cancellation).toContain('cancelPurchasedCapacitySubscriptionAtPeriodEnd');
    expect(cancellation).toContain("from('workspace_purchased_capacity')");
  });

  it('cancels capacity subscriptions on account deletion', () => {
    const cancellation = src('lib', 'billing', 'subscription-cancellation.ts');
    expect(cancellation).toContain("from('workspace_purchased_capacity')");
    expect(cancellation).toContain('capacitySubscriptionIds');
  });
});

