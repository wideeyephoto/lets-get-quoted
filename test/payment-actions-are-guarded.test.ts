import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every action that touches a payment establishes an account first.
 *
 * retryPaymentAction did not. Its whole body was headers() and a call to
 * retryPayment(), which builds its own admin client and reads the row with
 * getPublicPayment -- unscoped by account. Nothing on the path checked who was
 * asking, in a file where all seven of its siblings open with
 * requireOwnerContext.
 *
 * BEING PRECISE ABOUT THE SEVERITY, because the audit that found it overstated
 * the case and the difference matters. What the action returns is a Stripe
 * Checkout URL, and /pay/[id] hands the same URL to anyone holding the payment
 * id -- deliberately, because the homeowner paying it has no account. So this
 * was not a privilege escalation; it granted what the public page already
 * grants. It was a dashboard control that had no idea whose row it was touching,
 * which is a different and smaller problem, and still one worth closing.
 */
const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

/** Code with the prose removed, so a comment naming a guard cannot vouch for it. */
const stripComments = (source: string) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !/^\s*\/\//.test(line))
  .join('\n');

describe('every exported action in payments-actions.ts proves who is asking', () => {
  const CODE = stripComments(read('src/app/dashboard/jobs/payments-actions.ts'));

  /** Each exported action's body, from its signature to the next export. */
  const bodies = (() => {
    const found: Array<{ name: string; body: string }> = [];
    const pattern = /export async function (\w+)/g;
    let match = pattern.exec(CODE);
    while (match) {
      const next = CODE.indexOf('\nexport ', match.index + 1);
      found.push({ name: match[1], body: CODE.slice(match.index, next === -1 ? CODE.length : next) });
      match = pattern.exec(CODE);
    }
    return found;
  })();

  it('finds every action, so an empty list cannot pass silently', () => {
    // Guards the guard: if the regex ever stopped matching, every assertion
    // below would iterate nothing and report success.
    expect(bodies.length).toBeGreaterThanOrEqual(7);
    expect(bodies.map((b) => b.name)).toContain('retryPaymentAction');
  });

  for (const { name } of bodies) {
    it(`${name} establishes an account before touching a payment`, () => {
      const body = bodies.find((b) => b.name === name)!.body;
      expect(body, `${name} runs no guard`).toContain('requireOwnerContext()');
    });
  }

  it('scopes the retry to the caller, not just to a signed-in session', () => {
    // The guard alone would only prove somebody is an owner SOMEWHERE. The
    // account-scoped read is what proves the payment is theirs, and it goes
    // through the session client so RLS is a second opinion rather than the
    // TypeScript check being trusted on its own.
    const body = bodies.find((b) => b.name === 'retryPaymentAction')!.body;
    expect(body).toContain('getPaymentDetails(supabase, accountId, paymentId)');
    expect(body).toContain('Payment not found for this account.');
  });
});
