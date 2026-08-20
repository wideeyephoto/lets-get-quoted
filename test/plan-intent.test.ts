import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { safeNextPath } from '@/lib/app-origin';
import { BILLING_PLAN_IDS } from '@/lib/billing/catalog';
import {
  PLAN_CHECKOUT_ANCHOR,
  parsePlanIntent,
  planCheckoutPath,
  planIntentQuery,
  welcomePathWithPlanIntent,
} from '@/lib/plan-intent';

/**
 * /pricing has always appended `plan=` and `billing=` to its signup links, and
 * nothing read either one. The choice died at src/app/login/page.tsx, which asks
 * for `intent` and `next` and nothing else -- so "Choose Scale" and "Start with
 * Flex" created identical accounts.
 *
 * The failure was a contract between two halves that never met: the emitter and
 * the consumer. Most of what is pinned here is that contract, because a parser
 * that is merely correct in isolation is exactly what was missing.
 */

const read = (...parts: string[]): string =>
  readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

describe('parsing what /pricing put in the URL', () => {
  it('accepts each paid plan on either billing cycle', () => {
    expect(parsePlanIntent('solo', 'monthly')).toEqual({ planCode: 'solo', billingInterval: 'monthly' });
    expect(parsePlanIntent('growth', 'annual')).toEqual({ planCode: 'growth', billingInterval: 'annual' });
    expect(parsePlanIntent('scale', 'annual')).toEqual({ planCode: 'scale', billingInterval: 'annual' });
  });

  it('treats Flex as no intent rather than as an error', () => {
    // Two CTAs on /pricing emit plan=flex, and Flex is free. There is nothing to
    // buy, so the far side must not be handed something it would have to guess
    // about -- the same rule the page already applies to AI Voice.
    expect(parsePlanIntent('flex', 'annual')).toBeNull();
    expect(parsePlanIntent('free', 'annual')).toBeNull();
  });

  it('refuses anything that is not a plan', () => {
    for (const value of ['', 'enterprise', 'SCALE', 'scale ', 'admin', '../../etc', null, undefined, 7, {}]) {
      expect(parsePlanIntent(value, 'monthly'), `accepted ${JSON.stringify(value)}`).toBeNull();
    }
  });

  it('falls back to monthly rather than voiding the whole intent', () => {
    // A pre-selection is not a purchase, and monthly is the smaller commitment
    // as well as the checkout form's own default.
    expect(parsePlanIntent('scale', null)?.billingInterval).toBe('monthly');
    expect(parsePlanIntent('scale', 'yearly')?.billingInterval).toBe('monthly');
    expect(parsePlanIntent('scale', 'ANNUAL')?.billingInterval).toBe('monthly');
  });

  it('resolves the legacy plan aliases the catalog still answers to', () => {
    expect(parsePlanIntent('pro', 'monthly')?.planCode).toBe('growth');
    expect(parsePlanIntent('crew_plus', 'monthly')?.planCode).toBe('scale');
  });

  it('has an answer for every plan id the pricing page can emit', () => {
    // The contract, stated directly. The CTA builds its link from plan.id, so
    // adding a plan to the catalog without teaching this parser about it is the
    // original bug returning: a new plan would parse to null and be dropped.
    const handled = BILLING_PLAN_IDS.map((id) => [id, parsePlanIntent(id, 'annual')] as const);
    expect(handled.length).toBeGreaterThan(3);
    for (const [id, intent] of handled) {
      if (id === 'flex') expect(intent, 'flex is free and carries no intent').toBeNull();
      else expect(intent, `plan id ${id} is emitted by /pricing but parses to nothing`).not.toBeNull();
    }
  });
});

describe('the path it turns into', () => {
  const intent = parsePlanIntent('growth', 'annual')!;

  it('round-trips through the query string', () => {
    expect(planIntentQuery(intent)).toBe('plan=growth&billing=annual');
    const params = new URLSearchParams(planIntentQuery(intent));
    expect(parsePlanIntent(params.get('plan'), params.get('billing'))).toEqual(intent);
  });

  it('survives safeNextPath, which is the whole reason it rides `next`', () => {
    // safeNextPath is the sanitizer every sign-in exit runs the destination
    // through, and it rejects anything that could leave this site. If it ever
    // stopped preserving the query string, the intent would be silently reset to
    // /dashboard and this feature would go quiet without failing.
    const welcome = welcomePathWithPlanIntent(intent);
    expect(safeNextPath(welcome)).toBe(welcome);
    expect(safeNextPath(planCheckoutPath(intent))).toBe(planCheckoutPath(intent));
  });

  it('only ever produces a rooted same-site path', () => {
    for (const path of [welcomePathWithPlanIntent(intent), planCheckoutPath(intent)]) {
      expect(path.startsWith('/')).toBe(true);
      expect(path.startsWith('//')).toBe(false);
      expect(path.startsWith('/\\')).toBe(false);
    }
  });

  it('points at a section the settings page actually renders', () => {
    // A deep link to an anchor that does not exist lands at the top of a long
    // page and looks like the choice was ignored.
    expect(planCheckoutPath(intent)).toContain(`#${PLAN_CHECKOUT_ANCHOR}`);
    expect(read('src', 'app', 'dashboard', 'settings', 'page.tsx')).toContain(`'${PLAN_CHECKOUT_ANCHOR}'`);
  });
});

describe('the wiring, end to end', () => {
  it('is read at the door, where it used to be dropped', () => {
    const login = read('src', 'app', 'login', 'page.tsx');
    expect(login).toContain('parsePlanIntent');
    expect(login).toContain('welcomePathWithPlanIntent');
    // An explicit next= must still win: an office invitation sends an anonymous
    // visitor to /login and needs them back at the invitation afterwards.
    expect(login).toMatch(/searchParams\.get\('next'\)\s*\?\?/);
  });

  it('is re-validated by the server action rather than trusted', () => {
    // A server action is a public endpoint. The file says so itself about
    // `accepted` and the terms version; the plan is no different.
    const actions = read('src', 'app', 'welcome', 'actions.ts');
    expect(actions).toContain('parsePlanIntent');
    expect(actions).toContain('plan_intent_recorded');
  });

  it('is recorded even while paid checkout is dark', () => {
    // The flags are 0. Recording is what makes this worth shipping now; routing
    // to the checkout is gated on the surface existing, so the two must not be
    // tangled into one condition.
    const actions = read('src', 'app', 'welcome', 'actions.ts');
    const recordAt = actions.indexOf('recordAccountEvent');
    const gateAt = actions.indexOf('planUsageDashboardEnabled()');
    expect(recordAt).toBeGreaterThan(-1);
    expect(gateAt).toBeGreaterThan(-1);
    expect(recordAt, 'the intent must be recorded before the flags decide anything').toBeLessThan(gateAt);
  });

  it('reaches the control it was collected for', () => {
    const checkout = read('src', 'app', 'dashboard', 'settings', 'BasePlanSubscriptionCheckout.tsx');
    expect(checkout).toContain('initialPlanCode');
    expect(checkout).toContain('initialBillingInterval');
    // Still a pre-selection, not a purchase: the state is seeded, not frozen.
    expect(checkout).toContain('useState<PaidPlanCode>(initialPlanCode ?? \'solo\')');
  });

  it('declares the account-event kind it writes', () => {
    // `kind` is free text in the database, so the union in account-events.ts is
    // the only thing keeping the audit vocabulary closed.
    expect(read('src', 'lib', 'account-events.ts')).toContain("'plan_intent_recorded'");
  });
});
