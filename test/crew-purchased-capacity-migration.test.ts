import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  PRICING_CATALOG_VERSION,
  SELLABLE_TOP_UP_IDS,
  TOP_UPS,
  TOP_UPS_WITHHELD,
  type TopUpId,
} from '@/lib/billing/catalog';

/**
 * The purchased-capacity ledger and the gate that reads it.
 *
 * These are source assertions, not execution — there is no PostgreSQL in this
 * suite. They catch shape and contract mistakes; they cannot catch a statement
 * that parses and then fails at runtime. See the note on `coalesce` below for
 * the one case of that already caught by hand here.
 */

const MIGRATIONS = join(process.cwd(), 'migrations');
const STORE_FILE = '20260818210000_workspace_purchased_capacity.sql';
const GATE_FILE = '20260818220000_crew_seat_limit_includes_purchased_capacity.sql';

function read(file: string): string {
  return readFileSync(join(MIGRATIONS, file), 'utf8').replace(/\r\n/g, '\n');
}

const store = read(STORE_FILE);
const gate = read(GATE_FILE);
const storeCompact = store.replace(/\s+/g, ' ').toLowerCase();

/**
 * Executable SQL only. These files explain what they are NOT doing as much as
 * what they are, so a naive substring search hits the prose — this test's own
 * `pg_catalog.coalesce` assertion failed first time against the comment warning
 * against `pg_catalog.coalesce`.
 */
function statementsOf(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

const storeStatements = statementsOf(store);

const CAPACITY_SKUS: readonly TopUpId[] = ['crew_user', 'office_user', 'storage_100gb'];

describe('the purchased capacity ledger', () => {
  it('is one exact timestamped, transactional migration', () => {
    expect(STORE_FILE).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    expect(store).toContain('begin;');
    expect(store.trimEnd().endsWith('commit;')).toBe(true);
  });

  it('can be applied twice, which PostgreSQL proved it could not', () => {
    // The first real-engine run failed the re-apply with 42P07 "relation
    // already exists". Guarding only the table would have surfaced the two
    // indexes next, one round trip later.
    expect(storeStatements).toContain('create table if not exists public.workspace_purchased_capacity');
    const unguardedIndexes = storeStatements.match(/^create index (?!if not exists)/gm) ?? [];
    expect(unguardedIndexes).toEqual([]);
    expect(storeStatements.match(/create index if not exists/g) ?? []).toHaveLength(2);
  });

  it('binds every capacity SKU to the published price book', () => {
    // All three are bound, not just the one heading for sale. The price book is
    // settled; which may be SOLD is TOP_UPS_WITHHELD's decision, not a shape the
    // database should need a migration to change.
    for (const id of CAPACITY_SKUS) {
      const sku = TOP_UPS[id];
      expect(sku.fulfillment, `${id} must be recurring capacity`).toBe('recurring_capacity');
      expect(storeCompact, `${id} must be bound to its published price`).toContain(
        `(top_up_id = '${id}' and resource_code = '${sku.resourceCode}'`
        + ` and units = ${sku.units} and unit_amount_cents = ${sku.priceCents})`,
      );
    }
  });

  it('pins the catalog version the code is currently on', () => {
    expect(store).toContain(`check (catalog_version = '${PRICING_CATALOG_VERSION}')`);
  });

  it('makes one Stripe subscription mean one row', () => {
    // Two rows for one subscription would be two seats for one payment, which is
    // exactly what a replayed receipt or a redelivered lifecycle event produces
    // without this.
    expect(storeCompact).toContain(
      'constraint workspace_purchased_capacity_subscription_unique unique (livemode, stripe_subscription_id)',
    );
  });

  it('lets only a canceled row carry a cancellation time, and always', () => {
    expect(storeCompact).toContain(
      "(status in ('active', 'past_due') and canceled_at is null)"
      + " or (status = 'canceled' and canceled_at is not null)",
    );
  });

  it('is service-role only, with row level security on and no policy', () => {
    expect(store).toContain('alter table public.workspace_purchased_capacity enable row level security;');
    expect(store).not.toMatch(/create policy/i);
  });

  it('counts active and past_due, and stops counting a cancelled seat', () => {
    // past_due counts on purpose: it mirrors the grace the base plan already
    // gives a failed renewal. Dropping a seat the instant a card fails would
    // lock an employee out to recover $5 Stripe is still trying to collect.
    const fn = store.slice(store.indexOf('create or replace function public.workspace_purchased_capacity_units'));
    expect(fn).toContain("c.status in ('active', 'past_due')");
    expect(fn).not.toContain("c.status = 'active'");
  });

  it('uses bare coalesce, because pg_catalog.coalesce does not exist', () => {
    // COALESCE is a grammar construct, not a function in pg_catalog — the same
    // trap as nullif, and it fails at RUNTIME rather than at parse time, so no
    // amount of reading catches it. pg_catalog.sum IS a real aggregate.
    expect(storeStatements).not.toContain('pg_catalog.coalesce');
    expect(storeStatements).toContain('coalesce(pg_catalog.sum(c.units), 0)');
  });

  it('cannot be deleted from, and its identity cannot be edited', () => {
    expect(store).toContain('purchased capacity cannot be deleted');
    expect(store).toContain('purchased capacity identity is immutable');
    for (const column of [
      'account_id', 'top_up_id', 'resource_code', 'units', 'unit_amount_cents',
      'catalog_version', 'livemode', 'stripe_subscription_id', 'created_at',
    ]) {
      expect(store, `${column} must be immutable`).toContain(`old.${column} is distinct from new.${column}`);
    }
  });

  it('treats cancellation as terminal', () => {
    // A resumed subscription is a NEW Stripe subscription with a new id, so it
    // gets its own row rather than resurrecting a cancelled one.
    expect(storeCompact).toContain("(old.status = 'active' and new.status in ('past_due', 'canceled'))");
    expect(storeCompact).toContain("(old.status = 'past_due' and new.status in ('active', 'canceled'))");
    expect(storeCompact).not.toContain("old.status = 'canceled' and new.status");
  });

  it('revokes the counting function from every client role', () => {
    expect(store).toContain(
      'revoke all on function public.workspace_purchased_capacity_units(uuid, text)\n'
      + '  from public, anon, authenticated, service_role;',
    );
    expect(store).toContain(
      'grant execute on function public.workspace_purchased_capacity_units(uuid, text)\n  to service_role;',
    );
  });

  it('agrees with the purchase ledger about what a crew seat costs', () => {
    // billing_top_up_purchase_operations pins the same SKU. Two ledgers that
    // disagree on the price of a seat is a reconciliation nobody can finish.
    const operations = read('20260818190000_top_up_purchase_operations.sql').replace(/\s+/g, ' ').toLowerCase();
    const binding = "(top_up_id = 'crew_user' and resource_code = 'crew_users' and units = 1 and unit_amount_cents = 500)";
    expect(operations).toContain(binding);
    expect(storeCompact).toContain(binding);
  });
});

describe('the crew seat gate patch', () => {
  it('is one exact timestamped, transactional migration', () => {
    expect(GATE_FILE).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    expect(gate).toContain('begin;');
    expect(gate.trimEnd().endsWith('commit;')).toBe(true);
  });

  it('patches both gates from live source rather than restating them', () => {
    // Restating a body wholesale silently discards whatever another migration
    // changed in it.
    expect(gate).not.toMatch(/create or replace function public\.(create|reactivate)_crew/i);
    const definitionReads = gate.match(/pg_get_functiondef\(/g) ?? [];
    // Two patches plus the two reads in the post-check.
    expect(definitionReads.length).toBeGreaterThanOrEqual(4);
    expect(gate).toContain(
      'public.create_crew_member_with_seat_entitlement(uuid,text,text,text,text,text,numeric,text,numeric,numeric,text)',
    );
    expect(gate).toContain('public.reactivate_crew_member_with_seat_entitlement(uuid,uuid)');
  });

  it('asserts exactly-once separately for each function', () => {
    // The two gates carry byte-identical limit ladders. One global replace could
    // fix one and miss the other, and two gates that disagree about the cap is
    // worse than one that is simply wrong.
    const drifts = gate.match(/source contract drifted/g) ?? [];
    expect(drifts.length).toBe(2);
    expect(gate).toContain('crew seat create limit source contract drifted');
    expect(gate).toContain('crew seat reactivate limit source contract drifted');
    const exactlyOnce = gate.match(/is distinct from pg_catalog\.length\(v_old\)/g) ?? [];
    expect(exactlyOnce.length).toBe(2);
  });

  it('normalises the stored function bodies before matching newline-stable literals', () => {
    // pg_get_functiondef output has held mixed line endings. The replacement
    // literals use explicit E-string newlines, so only the stored bodies need
    // normalising now.
    const normalisations = gate.match(/chr\(13\) \|\| pg_catalog\.chr\(10\)/g) ?? [];
    expect(normalisations.length).toBeGreaterThanOrEqual(2);
  });

  it('adds the purchased sum after either supported plan-allowance shape', () => {
    const legacyAdditions = gate.match(
      /v_limit := v_limit_numeric::bigint\\n    \+ public\.workspace_purchased_capacity_units\(p_account_id, ''crew_users''\)/g,
    ) ?? [];
    const truncatedAdditions = gate.match(
      /v_limit := trunc\(v_limit_numeric\)::bigint\\n    \+ public\.workspace_purchased_capacity_units\(p_account_id, ''crew_users''\)/g,
    ) ?? [];
    expect(legacyAdditions.length).toBe(2);
    expect(truncatedAdditions.length).toBe(2);
  });

  it('is idempotent on the new call', () => {
    const skips = gate.match(/strpos\(v_before, 'workspace_purchased_capacity_units'\) > 0/g) ?? [];
    expect(skips.length).toBe(2);
  });

  it('proves afterwards that neither gate lost what makes it safe', () => {
    expect(gate).toContain('crew seat create gate does not read purchased capacity');
    expect(gate).toContain('crew seat reactivate gate does not read purchased capacity');
    expect(gate).toContain('crew seat gate lost its entitlement lock');
    expect(gate).toContain('crew seat gate lost a cap outcome');
    expect(gate).toContain('crew seat gate lost its counting predicate');
  });

  it('never archives or deactivates anybody', () => {
    // A lapsed seat leaves the roster over its cap, and the existing
    // remediation message tells the owner how many to archive. Deactivating an
    // employee is a decision, not a side effect of billing.
    expect(gate).not.toMatch(/set active = false/i);
    expect(gate).not.toMatch(/delete from public\.crew/i);
    expect(gate).not.toMatch(/update public\.crew/i);
  });
});

describe('the SKU is sellable, and every reason it was not is closed', () => {
  /**
   * This block used to assert the opposite, and the flip is the point.
   *
   * It withheld crew_user because the ledger "has no filler and no emptier" --
   * true when it was written, and false since 20260819010000 (fills on payment)
   * and the capacity lifecycle sweep (empties on lapse). A withheld reason is a
   * claim about the code, and a claim about the code goes stale silently. So
   * rather than delete the block, it now pins the three things that had to
   * become true, each of which was read out of production before this edit.
   */
  /**
   * AND IT FLIPPED BACK, for a reason that was never on the original list.
   *
   * The block above enumerates what had to become true before crew_user could
   * be sold, and every item is about FULFILMENT: the ledger gained a filler
   * (20260819010000, fills on payment) and an emptier (the capacity lifecycle
   * sweep, empties on lapse). All of that is still true. None of it was wrong.
   *
   * What the list never contained was CANCELLATION. crew_user is the only
   * recurring SKU in the catalog — top-up-purchase.ts opens a Stripe
   * subscription for it via `mode: sku.recurring ? 'subscription' : 'payment'` —
   * and no code in the product can end one. Every Stripe subscription write
   * resolves its target through `billing_subscriptions`, which holds the base
   * plan only: two writes in plan-change, three in subscription-cancellation.
   * There is no remove-seat control, no admin action, and account deletion
   * cancels the base plan while leaving this one billing.
   *
   * "Empties on lapse" is the tell in hindsight. Something reclaims the capacity
   * WHEN the subscription lapses; nothing lets the contractor make it lapse.
   *
   * So the lesson the comment above draws — that a withheld reason is a claim
   * about the code and goes stale silently — has a mirror image it did not
   * anticipate. A SELLABLE decision rests on an enumeration of blockers, and an
   * enumeration can be incomplete from the day it is written. Nothing went
   * stale here. The list was short.
   */
  it('makes crew_user sellable once the cancel path and account deletion cleanup exist', () => {
    expect(TOP_UPS_WITHHELD).not.toHaveProperty('crew_user');
    expect(SELLABLE_TOP_UP_IDS).toContain('crew_user');
    expect(SELLABLE_TOP_UP_IDS).toHaveLength(10);
  });

  it('still withholds the other two capacity SKUs, each for its own reason', () => {
    // crew_user leaving must not take its neighbours with it. They are held by
    // different blockers, so they do not lift together.
    //
    // THIS ASSERTION USED TO PIN A CLAIM THAT HAD GONE FALSE -- the exact
    // failure the comment above warns about, happening to the neighbour it was
    // warning for. It required the reason to say office users hold "no
    // permissions at all": true when written, false once thirteen capabilities
    // were enabled, and false twice over once the leads board opened on
    // 2026-08-21. A test can hold a stale reason in place as surely as it can
    // catch one.
    //
    // What actually holds office_user now is the Price, read out of LIVE Stripe
    // rather than assumed: inspect:live-top-ups reports NO LIVE PRICE for it.
    // The second assertion is the tripwire -- if that sentence comes back, so
    // has the stale claim.
    expect(TOP_UPS_WITHHELD.office_user).toMatch(/No live recurring Price exists/);
    expect(TOP_UPS_WITHHELD.office_user).not.toMatch(/no permissions at all/);
    expect(TOP_UPS_WITHHELD.storage_100gb).toMatch(/LGQ_STORAGE_CAP_ENFORCED/);
    expect(SELLABLE_TOP_UP_IDS).not.toContain('office_user');
    expect(SELLABLE_TOP_UP_IDS).not.toContain('storage_100gb');
  });
});
