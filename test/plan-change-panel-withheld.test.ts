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
 * Two of the three refusals were cleared by migration 20260823120000. What is
 * left is not small: a plan change needs its own consent acceptance, because
 * `recurring_consent_acceptance_id` is NOT NULL and UNIQUE, and BOTH functions
 * that could record one are hard-gated to an active Flex workspace with the
 * purpose pinned to `base_plan_subscription`.
 */

const page = stripComments(readFileSync(
  join(process.cwd(), 'src', 'app', 'dashboard', 'settings', 'page.tsx'), 'utf8',
));

describe('the plan-change panel', () => {
  it('is withheld', () => {
    expect(page).toContain('PLAN_CHANGE_PANEL_WITHHELD');
    expect(page).toMatch(/const PLAN_CHANGE_PANEL_WITHHELD = true;/);
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

describe('the reason it is withheld is still true', () => {
  // stripComments: the operation gate landed on 2026-08-23 and its comment
  // NAMES the operations table in order to explain why no row is written yet.
  // Read raw, the prose explaining the absence reads as the presence.
  const planChange = stripComments(readFileSync(
    join(process.cwd(), 'src', 'lib', 'billing', 'plan-change.ts'), 'utf8',
  ));

  it('still charges immediately', () => {
    // If this ever became proration_behavior: 'none' the urgency changes, but
    // the projection would still fail — so the panel stays off either way until
    // the operation row exists.
    expect(planChange).toContain("proration_behavior: 'always_invoice'");
  });

  it('still sends no operation id, so the binding looks up the old checkout', () => {
    const metadata = planChange.slice(planChange.indexOf('function planChangeMetadata'));
    expect(metadata.slice(0, 600)).not.toContain('operationId');
  });

  it('still writes no operation row', () => {
    expect(planChange).not.toContain('billing_subscription_checkout_operations');
  });
});
