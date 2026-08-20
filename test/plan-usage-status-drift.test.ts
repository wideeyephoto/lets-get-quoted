import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { billingStatusLabel, collectionNote } from '@/app/dashboard/settings/PlanUsageSection';
import { ADMIN_BILLING_STATUSES, ADMIN_ENTITLEMENT_STATES } from '@/lib/admin-plan-authority';
import { normalizeWorkspacePlan } from '@/lib/billing/plan-usage';

/**
 * A VALID STATUS THE READER DOES NOT KNOW IS NOT A CORRUPT ROW.
 *
 * normalizeWorkspacePlan answers `unavailable` for anything it cannot place, and
 * the dashboard renders that as "Plan details are unavailable right now. Refresh
 * in a moment, or contact support if this continues." That is the right answer
 * for a mangled row and the wrong one for a value the database was told to
 * write: refreshing will never help, because nothing failed.
 *
 * 20260816060000 widened workspace_entitlements_billing_status_check to admit
 * 'incomplete' and 'unpaid' -- the states a subscriber lands in when the first
 * payment needs a 3-D Secure confirmation, or when an invoice goes
 * uncollectible -- and both TypeScript readers kept the old six. So the two
 * moments where somebody most needs to be told what is wrong were the two that
 * showed them nothing, on the customer's page AND on the admin page that would
 * have diagnosed it.
 *
 * This test reads the constraint out of the migrations rather than restating it,
 * so the next widening fails here instead of in production.
 */

const MIGRATIONS = join(process.cwd(), 'migrations');

/** The last constraint wins: later migrations drop and re-add it. */
function allowedValues(column: string): string[] {
  const named = new RegExp(
    String.raw`workspace_entitlements_${column}_check\s+check\s*\(\s*${column}\s+in\s*\(([^)]*)\)`,
    'g',
  );
  const inline = new RegExp(
    String.raw`${column}\s+text\s+not\s+null\s+check\s*\(\s*${column}\s+in\s*\(([^)]*)\)`,
    'g',
  );

  let last: string[] | null = null;
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8').replace(/\r\n/g, '\n');
    for (const pattern of [inline, named]) {
      pattern.lastIndex = 0;
      for (const match of sql.matchAll(pattern)) {
        last = [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
      }
    }
  }
  if (!last) throw new Error(`no check constraint found for ${column}`);
  return last;
}

describe('the readers know every status the database may store', () => {
  const statuses = allowedValues('billing_status');
  const states = allowedValues('entitlement_state');

  it('found a real constraint, not an empty match', () => {
    // Guards the guard: a regex that stopped matching would make every
    // assertion below compare two empty lists and pass.
    expect(statuses).toContain('active');
    expect(statuses).toContain('incomplete');
    expect(statuses).toContain('unpaid');
    expect(statuses.length).toBeGreaterThanOrEqual(8);
    expect(states).toEqual(['active', 'grace', 'restricted', 'archived']);
  });

  it('the customer-facing reader accepts each of them', () => {
    for (const status of statuses) {
      const plan = normalizeWorkspacePlan({
        account_id: 'acct', plan_code: 'growth', billing_interval: 'monthly',
        billing_status: status, entitlement_state: 'restricted',
        catalog_version: 'v1', platform_fee_bps: 25, period_end: null,
        next_allowance_reset_at: null, feature_limits: {},
      }, 'acct');
      expect(plan.kind, `billing_status=${status}`).toBe('ready');
    }
  });

  it('the admin reader accepts each of them too', () => {
    expect([...ADMIN_BILLING_STATUSES].sort()).toEqual([...statuses].sort());
    expect([...ADMIN_ENTITLEMENT_STATES].sort()).toEqual([...states].sort());
  });

  it('still refuses a status the database could not have written', () => {
    const plan = normalizeWorkspacePlan({
      account_id: 'acct', plan_code: 'growth', billing_interval: 'monthly',
      billing_status: 'incompletee', entitlement_state: 'active',
      catalog_version: 'v1', platform_fee_bps: 25, period_end: null,
      next_allowance_reset_at: null, feature_limits: {},
    }, 'acct');
    expect(plan.kind).toBe('unavailable');
  });
});

describe('what a subscriber is told when Stripe is not collecting', () => {
  it('names the payment, not the record', () => {
    // "Incomplete" alone reads as a form somebody forgot to finish.
    expect(billingStatusLabel('incomplete')).toBe('Payment incomplete');
    expect(billingStatusLabel('unpaid')).toBe('Unpaid');
    expect(billingStatusLabel('past_due')).toBe('Past due');
  });

  it('gives every uncollected status something to do', () => {
    for (const status of ['incomplete', 'past_due', 'unpaid'] as const) {
      const note = collectionNote(status);
      expect(note, status).toBeTruthy();
      expect(note!.length, status).toBeGreaterThan(60);
    }
  });

  it('says nothing extra when billing is fine', () => {
    for (const status of ['free', 'trialing', 'active'] as const) {
      expect(collectionNote(status), status).toBeNull();
    }
  });

  it('promises no self-serve portal, because there is not one', () => {
    // The app has a client portal for the contractor's OWN customers. It has
    // nothing that lets a contractor re-run their own subscription payment, so
    // no copy here may imply otherwise.
    for (const status of ['incomplete', 'past_due', 'unpaid'] as const) {
      expect(collectionNote(status)!).not.toMatch(/billing portal|update your card|manage (your )?subscription/i);
    }
  });
});
