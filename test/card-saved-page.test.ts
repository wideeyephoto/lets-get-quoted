import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The page that told people their card was saved without checking.
 *
 * It decided it had succeeded from one thing: whether `?status=cancelled` was
 * absent. Everything else -- including a setup that completed in Stripe and was
 * never recorded on our side -- was told "You're all set ✓ / Your card is saved
 * securely with Stripe. Each scheduled visit will be billed automatically."
 *
 * The card is recorded by storeSavedCardFromSetup, from the
 * checkout.session.completed webhook, and that can fail on its own: no payment
 * method on the SetupIntent, a webhook error, or -- much the commonest -- it has
 * simply not arrived yet, because Stripe redirects the browser and delivers the
 * webhook independently.
 *
 * So somebody could be told automatic billing was live, the plan would carry no
 * card, and the first anyone learned of it would be a failed installment weeks
 * later.
 */

const PAGE = readFileSync(join(process.cwd(), 'src/app/card-saved/page.tsx'), 'utf8');
const CARD_ON_FILE = readFileSync(join(process.cwd(), 'src/lib/card-on-file.ts'), 'utf8');

describe('the page checks before it claims', () => {
  it('reads the plan rather than inferring from the absence of a query param', () => {
    expect(PAGE).toContain("from('recurring_plans')");
    expect(PAGE).toContain('stripe_payment_method_id');
  });

  it('has the plan id to check with', () => {
    // The whole fix depends on this: the success_url carries ?plan=, so the page
    // has always been able to look and simply did not.
    expect(CARD_ON_FILE).toContain('success_url: `${origin}/card-saved?plan=${plan.id}`');
  });

  it('claims success only when a payment method is actually recorded', () => {
    // The saved branch must be gated on the column, not on anything derived
    // from the URL.
    expect(PAGE).toContain("!data?.stripe_payment_method_id");
    expect(PAGE).toContain("{ kind: 'not_yet' }");
  });

  it('treats a read failure as unconfirmed, not as success', () => {
    // An unreadable plan is not evidence a card was saved. Defaulting the other
    // way is how the original bug worked.
    expect(PAGE).toContain('if (error || !data?.stripe_payment_method_id)');
  });

  it('treats a missing plan id as unconfirmed too', () => {
    // Somebody landing on /card-saved with no query string at all used to be
    // congratulated.
    expect(PAGE).toContain('if (!planId) return');
  });
});

describe('the unconfirmed state does not read as a failure', () => {
  it('says it is waiting, not that anything went wrong', () => {
    // The likeliest cause is a webhook a second behind the redirect. Telling
    // somebody their card failed when it did not is its own defect.
    //
    // Checked against the RENDERED copy rather than the file: this file explains
    // the reasoning in prose that necessarily contains the phrase it forbids,
    // and the first version of this assertion caught its own comment.
    const rendered = PAGE
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//') && !line.trimStart().startsWith('/*'))
      .join('\n');
    expect(rendered).toContain('Just confirming your card');
    expect(rendered).not.toMatch(/card (setup )?failed/i);
    expect(rendered).not.toMatch(/went wrong/i);
  });

  it('says nothing was charged', () => {
    // True at every point in this flow -- it is a SetupIntent, there is no
    // charge -- and it is the question somebody in an unclear state has.
    expect(PAGE).toContain('Nothing has been charged');
  });

  it('offers a refresh, since refreshing is what actually resolves it', () => {
    expect(PAGE).toContain('Refresh');
    expect(PAGE).toContain('encodeURIComponent(searchParams.plan)');
  });

  it('tells them what to do if it persists', () => {
    expect(PAGE).toContain('reply to the message');
  });
});

describe('a confirmed card is named', () => {
  it('shows the brand and last four when they are known', () => {
    // "We have your Visa ending 4242" is worth considerably more than "it
    // worked" -- it is the difference between an assertion and evidence.
    expect(PAGE).toContain('state.brand && state.last4');
    expect(PAGE).toContain('ending ${state.last4}');
  });

  it('still confirms when the brand could not be read', () => {
    // storeSavedCardFromSetup catches its own paymentMethods.retrieve failure
    // and stores nulls, so the payment method can exist with no brand. That is
    // still a saved card and must still read as one.
    expect(PAGE).toContain('Your card is saved securely with Stripe.');
    expect(CARD_ON_FILE).toContain('Could not read saved card details');
  });
});
