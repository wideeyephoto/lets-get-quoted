import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOP_UPS, TOP_UPS_WITHHELD, SELLABLE_TOP_UP_IDS } from '../src/lib/billing/catalog';

/**
 * Nothing recurring may be sold until something can stop it.
 *
 * `crew_user` went on sale 2026-08-20 as the only recurring SKU in the catalog:
 * $5/month, `fulfillment: 'recurring_capacity'`, eligible on Solo and up. Buying
 * one opens a real Stripe subscription — top-up-purchase.ts sets
 * `mode: sku.recurring ? 'subscription' : 'payment'`.
 *
 * And nothing could cancel it. Every Stripe subscription write in the codebase
 * resolves its target through `billing_subscriptions`, which holds the BASE PLAN
 * only: two in plan-change, three in subscription-cancellation. No remove-seat
 * control, no admin action, and account deletion cancels the base plan while
 * leaving this one billing. The contractor's remaining lever was a card dispute.
 *
 * This is the general rule, not a note about one SKU: if a recurring SKU becomes
 * sellable again, that has to happen in the same change as the thing that
 * cancels it.
 */

const src = (...p: string[]) => readFileSync(join(process.cwd(), 'src', ...p), 'utf8');

describe('recurring top-ups', () => {
  it('is a catalog that still contains at least one, so this guard is awake', () => {
    const recurring = Object.values(TOP_UPS).filter((sku) => sku.recurring);
    expect(recurring.length, 'no recurring SKU exists; re-read this guard before deleting it').toBeGreaterThan(0);
  });

  it('are none of them sellable while no cancel path exists', () => {
    const sellableRecurring = SELLABLE_TOP_UP_IDS.filter((id) => TOP_UPS[id].recurring);
    expect(
      sellableRecurring,
      `recurring SKU(s) on sale with nothing able to cancel them: ${sellableRecurring.join(', ')}`,
    ).toEqual([]);
  });

  it('says WHY crew_user is withheld, not just that it is', () => {
    // The withheld list is read by humans deciding what to turn on next. "no"
    // is not a handover.
    const reason = TOP_UPS_WITHHELD.crew_user ?? '';
    expect(reason).toMatch(/cancel/i);
    expect(reason.length).toBeGreaterThan(80);
  });
});

describe('the reason it had to be withheld', () => {
  it('still creates a SUBSCRIPTION for a recurring sku', () => {
    // If this ever becomes a one-time payment, the whole finding changes.
    expect(src('lib', 'billing', 'top-up-purchase.ts'))
      .toContain("mode: sku.recurring ? 'subscription' : 'payment'");
  });

  it('still has no Stripe subscription write outside the base-plan modules', () => {
    // The search that established there is no cancel path. If a new write site
    // appears, it must be checked against this finding rather than assumed safe.
    const roots = [join(process.cwd(), 'src', 'lib'), join(process.cwd(), 'src', 'app')];
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name)) files.push(path);
      }
    };
    for (const root of roots) walk(root);

    const writers = files.filter((file) => /stripe\.subscriptions\.(cancel|update)\(/.test(readFileSync(file, 'utf8')));
    const allowed = ['plan-change.ts', 'plan-change-worker.ts', 'subscription-cancellation.ts'];
    const unexpected = writers.filter((file) => !allowed.some((name) => file.endsWith(name)));

    expect(writers.length, 'no subscription writes found at all; the search broke').toBeGreaterThan(0);
    expect(
      unexpected.map((f) => f.replace(process.cwd(), '.')),
      'a new Stripe subscription write appeared: does it cancel top-up subscriptions?',
    ).toEqual([]);
  });

  it('still cancels only the base plan on account deletion', () => {
    // cancelSubscriptionForAccountDeletion resolves through
    // loadCancellableSubscription, which reads billing_subscriptions.
    const cancellation = src('lib', 'billing', 'subscription-cancellation.ts');
    expect(cancellation).toContain("from('billing_subscriptions')");
    expect(cancellation).not.toContain('billing_top_up_purchase_operations');
  });
});
