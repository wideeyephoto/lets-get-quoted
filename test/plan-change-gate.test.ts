import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { stripComments } from './helpers/source-text';

/**
 * THE SECOND GATE THAT DID NOT BITE.
 *
 * On 2026-08-23 the plan-change panel was withheld by a constant in
 * `settings/page.tsx`, which stops it rendering. It does not stop it running.
 * `ChangePlanPanel.tsx` is still imported by `PlanUsageSection.tsx`, so
 * `plan-change-actions.ts` is still compiled and its server-action IDs are
 * still registered in the build -- and a server action is a public endpoint.
 * Any authenticated owner could still POST `changeBasePlanAction`, have
 * `proration_behavior: 'always_invoice'` take the proration off their card, and
 * then watch every event for their subscription dead-letter for ever.
 *
 * That is the same shape as the cancellation flag that was checked in the
 * action and not the operation. So this file never calls an action: it
 * exercises `changeBasePlan` itself, and pins the caller list so a third route
 * has to be a decision rather than an accident.
 *
 * WHY THE FLAG IS OFF AND WHAT WOULD TURN IT ON. Not an unfinished surface -- a
 * missing rail. A plan change must write a
 * `billing_subscription_checkout_operations` row with purpose
 * `base_plan_plan_change` BEFORE calling Stripe, or the binding resolves the
 * original checkout, still holding the old price. Nothing can write one today:
 * writes to that table are revoked from service_role,
 * `record_base_plan_recurring_consent` refuses any workspace not on active
 * Flex, and `claim_stripe_billing_subscription_checkout` refuses one with
 * existing subscription history -- errcode 0A000, message "existing
 * subscription history requires the future plan-change flow".
 */

const stripe = { update: vi.fn(async () => ({ id: 'sub_1' })) };
const accountEvents: Array<Record<string, unknown>> = [];

vi.mock('@/lib/stripe', () => ({ getStripeClient: () => ({ subscriptions: stripe }) }));
vi.mock('@/lib/account-events', () => ({
  recordAccountEvent: vi.fn(async (input: Record<string, unknown>) => { accountEvents.push(input); }),
}));

/** The plan-change consent recorder runs as the signed-in owner, so the gate
 * tests need one even though the flag refuses before it is ever used. */
const OWNER = { supabase: null, accountId: 'acct_1', userId: 'user_1' } as never;

const {
  BASE_PLAN_SUBSCRIPTION_PLAN_CHANGE_FLAG: FLAG,
  PLAN_CHANGE_DISABLED_MESSAGE,
  basePlanSubscriptionPlanChangeEnabled,
  changeBasePlan,
  clearScheduledPlanChange,
} = await import('@/lib/billing/plan-change');

/** Throws on ANY property access, so "did it touch the database" is provable. */
const exploding = new Proxy({}, {
  get(_target, prop) {
    throw new Error(`supabase touched: ${String(prop)}`);
  },
}) as unknown as SupabaseClient;

const upgrade = () => changeBasePlan({
  admin: exploding,
  owner: OWNER,
  accountId: '00000000-0000-0000-0000-000000000001',
  targetPlanCode: 'growth',
  targetBillingInterval: 'monthly',
});

let saved: string | undefined;
beforeEach(() => {
  saved = process.env[FLAG];
  stripe.update.mockClear();
  accountEvents.length = 0;
});
afterEach(() => {
  if (saved === undefined) delete process.env[FLAG];
  else process.env[FLAG] = saved;
});

describe('the flag decides the operation, not the panel', () => {
  it('refuses a paid move before touching the database at all', async () => {
    delete process.env[FLAG];
    // Ordering IS the assertion. If the check sat anywhere after the read, the
    // exploding client throws and this fails.
    await expect(upgrade()).resolves.toEqual({ ok: false, error: PLAN_CHANGE_DISABLED_MESSAGE });
  });

  it('never reaches Stripe, so no card is charged for a change that cannot be recorded', async () => {
    delete process.env[FLAG];
    await upgrade();
    expect(stripe.update).not.toHaveBeenCalled();
  });

  it('writes no plan_change_requested event for an upgrade that will not happen', async () => {
    delete process.env[FLAG];
    // recordAccountEvent runs before the Stripe call by design, so the record
    // of the request survives a crash mid-write. A refusal has to land ahead of
    // it, or the account timeline grows evidence of an upgrade nobody performed.
    await upgrade();
    expect(accountEvents).toHaveLength(0);
  });

  it('gets past the gate and reaches the read once the flag is on', async () => {
    process.env[FLAG] = '1';
    await expect(upgrade()).rejects.toThrow(/supabase touched/);
  });

  it('treats every value other than the exact string 1 as off', async () => {
    for (const value of ['0', '', 'true', 'TRUE', 'yes', '1 ', ' 1', '01']) {
      process.env[FLAG] = value;
      await expect(upgrade(), `value ${JSON.stringify(value)}`)
        .resolves.toEqual({ ok: false, error: PLAN_CHANGE_DISABLED_MESSAGE });
    }
  });

  it('reads the environment it is given rather than a cached value', () => {
    expect(basePlanSubscriptionPlanChangeEnabled({ [FLAG]: '1' })).toBe(true);
    expect(basePlanSubscriptionPlanChangeEnabled({ [FLAG]: 'true' })).toBe(false);
    expect(basePlanSubscriptionPlanChangeEnabled({})).toBe(false);
  });
});

describe('the paths deliberately NOT gated, so nobody gates them later', () => {
  it('lets a customer move to Flex regardless of this flag', async () => {
    delete process.env[FLAG];
    // Moving to Flex IS cancelling: pending_plan_code's CHECK admits only paid
    // codes, so changeBasePlan hands it to the cancellation path instead. That
    // path has its own flag and a rail that works. Gating it here would trap a
    // paying customer behind a switch about a feature they are not using --
    // which is the failure this area has already produced twice.
    // It reaches the read and dies there, which is the proof: a gated call
    // returns PLAN_CHANGE_DISABLED_MESSAGE without ever touching the client.
    await expect(changeBasePlan({
      admin: exploding,
      owner: OWNER,
      accountId: '00000000-0000-0000-0000-000000000001',
      targetPlanCode: 'flex',
      targetBillingInterval: 'none',
    })).rejects.toThrow(/supabase touched/);
  });

  it('lets a customer undo a scheduled change regardless of this flag', async () => {
    delete process.env[FLAG];
    // Somebody who scheduled a change while the flag was on must be able to
    // reverse it if the flag goes off. Gating the undo would trap them in a
    // change they no longer want, by a switch that was supposed to be about
    // whether NEW changes can be started.
    await expect(clearScheduledPlanChange({
      admin: exploding,
      accountId: '00000000-0000-0000-0000-000000000001',
    })).rejects.toThrow(/supabase touched/);
  });
});

describe('every route into a paid plan change is accounted for', () => {
  const SRC = join(process.cwd(), 'src');
  const OWN = join('lib', 'billing', 'plan-change.ts');

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
    // invokes it is not a route into anything.
    .filter((file) => new RegExp(`${symbol}\\s*\\(`).test(readFileSync(file, 'utf8')))
    .map((file) => file.slice(SRC.length + 1).replace(/\\/g, '/'))
    .sort();

  it('has exactly one caller, and this list is the decision point', () => {
    // A second caller should fail here and make somebody ask whether it needs
    // the gate. That question going unasked once is the whole bug.
    expect(callersOf('changeBasePlan')).toEqual([
      'app/dashboard/settings/plan-change-actions.ts',
    ]);
  });

  it('gates the renewal worker too, because it applies the change unattended', () => {
    // The worker calls subscriptions.update with the new price and no operation
    // row, so a renewal event meets the same binding and dead-letters the same
    // way -- weeks after the click, with nobody watching.
    const worker = readFileSync(join(SRC, 'lib', 'billing', 'plan-change-worker.ts'), 'utf8');
    expect(worker).toContain('basePlanSubscriptionPlanChangeEnabled()');
  });

  it('skips due rows rather than failing or clearing them', () => {
    // A pending row must survive the flag being off, or a change scheduled
    // while it was on is silently dropped and the customer is never moved.
    const worker = readFileSync(join(SRC, 'lib', 'billing', 'plan-change-worker.ts'), 'utf8');
    expect(worker).toMatch(/skippedDisabled \+= 1;\s*\r?\n\s*continue;/);
    expect(worker).toContain('skipped_disabled: skippedDisabled,');
  });

  it('states the refusal once, so two surfaces cannot drift apart', () => {
    // The lesson from CANCELLATION_DISABLED_MESSAGE: a paraphrase is how two
    // refusals start meaning different things. Assert there is no SECOND
    // literal saying the same thing, rather than counting references -- a count
    // passes for the wrong reason the moment somebody adds a mention.
    const source = stripComments(readFileSync(join(SRC, ...OWN.split(/[\\/]/)), 'utf8'));
    expect(source.match(/'[^']*not switched on[^']*'/g) ?? []).toHaveLength(1);
    expect(PLAN_CHANGE_DISABLED_MESSAGE).not.toMatch(/from here/);
  });

  it('has exactly one place that can refuse for the flag, so none of them is dead', () => {
    // The counterpart to the assertMetadataMatchesPrice deletion in the same
    // commit. Copies of this check inside activateAfterPayment or
    // scheduleAtRenewal would be UNREACHABLE: both are private, and both are
    // reached only for a paid target, which the one gate has already refused.
    // An unreachable guard reads like protection and provides none -- and a
    // mutation test cannot tell the difference, because killing an unreachable
    // guard changes no behaviour at all.
    const source = stripComments(readFileSync(join(SRC, ...OWN.split(/[\\/]/)), 'utf8'));
    expect(source.match(/basePlanSubscriptionPlanChangeEnabled\(\)/g) ?? []).toHaveLength(1);
  });

  it('does not tell somebody moving to Flex that their change is switched off', () => {
    // The one plan change that still works with the flag off is moving to Flex.
    // "Changing your plan is not switched on" would be false for them.
    expect(PLAN_CHANGE_DISABLED_MESSAGE).toMatch(/paid plans/i);
  });
});
