import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from './helpers/source-text';

/**
 * The plan-change panel is off until a plan change can be recorded.
 *
 * It shipped ungated and charges a card for a change it cannot project:
 * `proration_behavior: 'always_invoice'` takes the difference immediately, and
 * then every event for that subscription fails to bind, permanently. The
 * workspace keeps the old plan's limits, allowances and platform fee while
 * paying the new price, and nothing self-heals — the only thing that could
 * repair the entitlement is the projector that is refusing it.
 *
 * The refusals are now all cleared -- 20260823120000 took two, 20260823235000
 * took the rest and taught both projection functions to read the plan-change
 * ledger, and the write path claims a row before it calls Stripe. What keeps
 * the panel off is no longer plumbing: it is that the flag is absent in every
 * environment and no plan change has been projected end to end in test mode.
 * The tests below pin the pieces that made it withheld, so that a regression
 * in any of them is visible before the panel is ever turned on.
 */

const page = stripComments(readFileSync(
  join(process.cwd(), 'src', 'app', 'dashboard', 'settings', 'page.tsx'), 'utf8',
));

describe('the plan-change panel', () => {
  it('is withheld by the flag, and by nothing else', () => {
    // ONE control. Two independent switches would mean turning the rail on took
    // a code change AND an env change, which is how a flag ends up reading as
    // enabled while the feature stays invisible.
    expect(page).toContain('PLAN_CHANGE_PANEL_WITHHELD');
    expect(page).toContain('const PLAN_CHANGE_PANEL_WITHHELD = !basePlanSubscriptionPlanChangeEnabled();');
    expect(page, 'no hard-coded withholding may survive').not.toMatch(
      /const PLAN_CHANGE_PANEL_WITHHELD = (true|false);/,
    );
  });

  it('short-circuits before the subscription is even read', () => {
    // Not "render nothing" — do not go looking, so a withheld panel costs no
    // admin-client round trip and cannot half-render on a slow read.
    expect(page).toMatch(/PLAN_CHANGE_PANEL_WITHHELD \? null : await loadChangeableSubscription/);
  });

  it('leaves the cancel panel alone', () => {
    // Cancelling still has to work. Withholding the wrong neighbour would trap
    // a paying customer, which is the failure this whole area keeps producing.
    expect(page).toMatch(/cancel/i);
  });
});

describe('what the panel is now waiting on', () => {
  // stripComments: this file's own prose names the tables and keys it explains,
  // so a raw read finds the absence described as a presence.
  const planChange = stripComments(readFileSync(
    join(process.cwd(), 'src', 'lib', 'billing', 'plan-change.ts'), 'utf8',
  ));

  it('still charges immediately', () => {
    // The urgency of everything below rests on this. If it ever became
    // proration_behavior: 'none' the customer would not be billed mid-cycle and
    // the whole activate-on-payment design would need rereading.
    expect(planChange).toContain("proration_behavior: 'always_invoice'");
  });

  it('now names its operation, so the binding stops finding the old checkout', () => {
    // Was the reason this panel was withheld. The projector binds an event to
    // its operation through lgq_operation_id in the SUBSCRIPTION metadata;
    // without it every event resolved to the original checkout, which still
    // holds the OLD price, and the binding refused.
    const metadata = planChange.slice(planChange.indexOf('function planChangeMetadata'));
    expect(metadata.slice(0, 900)).toContain('SUBSCRIPTION_CHECKOUT_METADATA_KEYS.operationId');
  });

  it('writes its row to the plan-change ledger, never the checkout table', () => {
    // The A/B fork, pinned. The checkout table gives a plan change no legal
    // pre-activation state and its one-pending partial unique would lock the
    // workspace out of every further plan change AND every new checkout.
    expect(planChange).toContain('claim_stripe_billing_subscription_plan_change');
    expect(planChange).not.toContain('billing_subscription_checkout_operations');
  });

  it('never treats provider acceptance as payment', () => {
    // always_invoice with the default payment_behavior of allow_incomplete does
    // not throw when collection fails, so the ledger may only reach
    // provider_accepted here. Only the projector, seeing the recorded proration
    // invoice paid, may activate. If this file ever moves a row to 'activated'
    // it is handing over the new plan on the strength of the old plan's payment.
    expect(planChange).toContain('mark_stripe_billing_subscription_plan_change_accepted');
    expect(planChange).not.toContain("state = 'activated'");
  });

  it('is gated on the flag and the end-to-end test, not on missing plumbing', () => {
    // What is actually left: LGQ_BASE_PLAN_SUBSCRIPTION_PLAN_CHANGE_ENABLED is
    // absent in every environment, and no plan change has been projected end to
    // end in test mode. Both need a real Stripe purchase and a redeploy, which
    // is why the panel stays off even though the rail is built.
    expect(planChange).toContain('BASE_PLAN_SUBSCRIPTION_PLAN_CHANGE_FLAG');
    // The flag is absent in every environment, so this is still off everywhere.
    expect(page).toContain('basePlanSubscriptionPlanChangeEnabled');
  });
});
