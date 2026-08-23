import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Two cards start a Stripe Checkout from the Account page, and they had drifted.
 *
 * `TopUpPurchaseCheckout` and `BasePlanSubscriptionCheckout` do the same job:
 * mint a browser operation id, submit a Server Action, verify the returned URL
 * really is a Stripe hosted checkout, then navigate. The top-up card handles two
 * situations the subscription card did not, and both are the kind that only
 * appear when something has already gone wrong -- which is why nobody noticed.
 *
 * This file asserts the two behave the same, rather than asserting each one is
 * right twice. Drift between two copies of a payment flow is the actual defect.
 */

const TOP_UP = readFileSync(
  join(process.cwd(), 'src/app/dashboard/settings/TopUpPurchaseCheckout.tsx'), 'utf8');
const SUBSCRIPTION = readFileSync(
  join(process.cwd(), 'src/app/dashboard/settings/BasePlanSubscriptionCheckout.tsx'), 'utf8');

const CARDS: ReadonlyArray<readonly [string, string]> = [
  ['top-up', TOP_UP],
  ['subscription', SUBSCRIPTION],
];

describe('both checkout cards freeze once a checkout URL exists', () => {
  for (const [name, source] of CARDS) {
    it(`${name}: the submit button takes a frozen flag, not just pending`, () => {
      // `pending` goes back to false the moment the action returns, while the
      // browser is still navigating to Stripe. A click in that window claims a
      // second intent nobody will ever pay.
      expect(source).toContain('frozen');
      expect(source).toContain('pending || frozen');
    });

    it(`${name}: freezing is conditional on the URL having verified`, () => {
      // A frozen button plus a failed verification would leave no way forward at
      // all. The card that could not verify its URL must stay usable.
      expect(source).toContain("Boolean(state?.ok) && !clientRedirectError");
    });
  }
});

describe('neither card says it is working while telling you it failed', () => {
  for (const [name, source] of CARDS) {
    it(`${name}: the success note is suppressed on a verification failure`, () => {
      // The subscription card rendered both. At the exact moment a subscription
      // checkout went wrong, the screen read "Opening Stripe's secure
      // checkout…" directly above "The checkout link could not be verified in
      // this browser… contact support".
      expect(source).toContain("state?.ok && !clientRedirectError");
    });

    it(`${name}: still warns when the URL cannot be verified`, () => {
      expect(source).toContain('could not be verified in this browser');
      expect(source).toContain('did not submit another request');
    });
  }
});

describe('both cards verify the URL the same way', () => {
  for (const [name, source] of CARDS) {
    it(`${name}: only a Stripe-hosted https checkout origin is followed`, () => {
      // A Server Action returning something else is the case this guards, and
      // navigating to it would be the whole point of the attack.
      expect(source).toContain("parsed.origin === 'https://checkout.stripe.com'");
      expect(source).toContain("parsed.protocol === 'https:'");
      expect(source).toContain('!parsed.username');
      expect(source).toContain('!parsed.password');
      expect(source).toContain("parsed.pathname !== '/'");
    });

    it(`${name}: mints the operation id after hydration, not during render`, () => {
      // Minting during render makes server and browser markup disagree, and
      // makes the id change under a retry of one visible intent.
      expect(source).toContain('newBrowserOperationId');
      expect(source).toContain('useEffect');
    });

    it(`${name}: never submits without an operation id`, () => {
      expect(source).toContain('Preparing secure checkout…');
    });
  }
});
