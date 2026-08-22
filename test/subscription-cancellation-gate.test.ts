import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  BASE_PLAN_SUBSCRIPTION_CANCELLATION_FLAG as FLAG,
  CANCELLATION_DISABLED_MESSAGE,
  cancelBasePlanSubscriptionAtPeriodEnd,
  cancelSubscriptionForAccountDeletion,
  resumeBasePlanSubscription,
} from '@/lib/billing/subscription-cancellation';

/**
 * THE GATE THAT DID NOT BITE.
 *
 * `LGQ_BASE_PLAN_SUBSCRIPTION_CANCELLATION_ENABLED` was checked in exactly one
 * place: the server action behind the Cancel panel. It read like a gate on
 * cancelling. It was a gate on ONE ROUTE to cancelling.
 *
 * The other route is `changeBasePlan`. Downgrading to Flex IS cancelling --
 * `pending_plan_code`'s CHECK admits only paid codes, so a scheduled "change to
 * Flex" cannot be stored and the function calls the cancellation path directly
 * instead. That reasoning is correct. But `changeBasePlanAction` checks no flag
 * at all, so with the switch off a customer could still cancel: pick Flex in
 * the change-plan dropdown and Stripe gets `cancel_at_period_end: true`.
 *
 * This file exists to stop that shape coming back. Testing the flag through the
 * ACTION would have passed the whole time the bug existed, so nothing here
 * calls an action -- the operation itself is exercised, and the caller list is
 * pinned so a third route has to be a decision rather than an accident.
 */

/** Throws on ANY property access, so "did it touch the database" is provable. */
const exploding = new Proxy({}, {
  get(_target, prop) {
    throw new Error(`supabase touched: ${String(prop)}`);
  },
}) as unknown as SupabaseClient;

const call = () => cancelBasePlanSubscriptionAtPeriodEnd({
  admin: exploding,
  accountId: '00000000-0000-0000-0000-000000000001',
});

let saved: string | undefined;
beforeEach(() => { saved = process.env[FLAG]; });
afterEach(() => {
  if (saved === undefined) delete process.env[FLAG];
  else process.env[FLAG] = saved;
});

describe('the flag decides the operation, not the button', () => {
  it('refuses before touching the database at all', async () => {
    delete process.env[FLAG];
    // If the check sat anywhere after the read, the exploding client throws and
    // this fails. Ordering is the assertion.
    await expect(call()).resolves.toEqual({ ok: false, error: CANCELLATION_DISABLED_MESSAGE });
  });

  it('writes no cancellation-requested event for a cancellation that will not happen', async () => {
    delete process.env[FLAG];
    // recordAccountEvent runs before the Stripe call by design, so that the
    // record of the request survives a crash mid-write. A refusal must land
    // ahead of it, or the account timeline grows evidence of a cancellation
    // nobody performed.
    const result = await call();
    expect(result.ok).toBe(false);
  });

  it('gets past the gate and reaches the read once the flag is on', async () => {
    process.env[FLAG] = '1';
    await expect(call()).rejects.toThrow(/supabase touched/);
  });

  it('treats every value other than the exact string 1 as off', async () => {
    for (const value of ['0', '', 'true', 'TRUE', 'yes', '1 ', ' 1', '01']) {
      process.env[FLAG] = value;
      await expect(call(), `value ${JSON.stringify(value)}`)
        .resolves.toEqual({ ok: false, error: CANCELLATION_DISABLED_MESSAGE });
    }
  });
});

describe('every route into the cancellation path is accounted for', () => {
  const SRC = join(process.cwd(), 'src');
  const OWN = join('lib', 'billing', 'subscription-cancellation.ts');

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
    return out;
  }

  const callersOf = (symbol: string) => walk(SRC)
    .filter((file) => !file.endsWith(OWN))
    // The CALL, not the import. A file that imports the symbol and never
    // invokes it is not a route into anything, and matching the bare name
    // would have counted the re-export line as a second caller.
    .filter((file) => new RegExp(`${symbol}\\s*\\(`).test(readFileSync(file, 'utf8')))
    .map((file) => file.slice(SRC.length + 1).replace(/\\/g, '/'))
    .sort();

  it('has exactly two callers, and this list is the decision point', () => {
    // Adding a third caller should fail here and make somebody ask whether it
    // needs the gate. That question going unasked once is the whole bug.
    expect(callersOf('cancelBasePlanSubscriptionAtPeriodEnd')).toEqual([
      'app/dashboard/settings/subscription-cancellation-actions.ts',
      'lib/billing/plan-change.ts',
    ]);
  });

  it('surfaces the refusal to the customer rather than swallowing it', () => {
    // plan-change must propagate the error, or picking Flex with the flag off
    // would report a scheduled change that never got scheduled.
    const planChange = readFileSync(join(SRC, 'lib', 'billing', 'plan-change.ts'), 'utf8');
    expect(planChange).toContain('if (!cancelled.ok) return { ok: false, error: cancelled.error };');
  });

  it('states the refusal once, so two surfaces cannot drift apart', () => {
    const actions = readFileSync(
      join(SRC, 'app', 'dashboard', 'settings', 'subscription-cancellation-actions.ts'), 'utf8',
    );
    expect(actions).toContain('CANCELLATION_DISABLED_MESSAGE');
    // The old wording said "from here", which is a different place depending on
    // which of the two routes the customer took.
    expect(CANCELLATION_DISABLED_MESSAGE).not.toMatch(/from here/);
  });
});

describe('the two paths deliberately NOT gated, so nobody gates them later', () => {
  it('cancels for account deletion regardless of the flag', async () => {
    delete process.env[FLAG];
    const result = await cancelSubscriptionForAccountDeletion({
      admin: exploding,
      accountId: '00000000-0000-0000-0000-000000000001',
    });
    // It attempted the read, which means it did not refuse. Gating this would
    // leave a deleted account still billing a card, which is worse in every
    // direction than a rollout switch being honoured.
    expect(result.error).toMatch(/supabase touched/);
    expect(result.error).not.toBe(CANCELLATION_DISABLED_MESSAGE);
  });

  it('lets a customer undo a scheduled cancellation regardless of the flag', async () => {
    delete process.env[FLAG];
    // The ACTION gates resume, and that is a rollout decision about a button.
    // The operation must not: somebody who scheduled a cancellation while the
    // flag was on would otherwise be unable to reverse it if the flag went off,
    // trapped by a switch that was supposed to be about visibility.
    await expect(resumeBasePlanSubscription({
      admin: exploding,
      accountId: '00000000-0000-0000-0000-000000000001',
    })).rejects.toThrow(/supabase touched/);
  });
});
