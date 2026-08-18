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

  it('normalises CRLF on both sides before matching', () => {
    // The gate migration is a CRLF file and stored bodies here have held a mix.
    const normalisations = gate.match(/chr\(13\) \|\| pg_catalog\.chr\(10\)/g) ?? [];
    expect(normalisations.length).toBeGreaterThanOrEqual(6);
  });

  it('adds the purchased sum rather than replacing the plan allowance', () => {
    expect(gate).toContain(
      'v_limit := v_limit_numeric::bigint\n'
      + "    + public.workspace_purchased_capacity_units(p_account_id, 'crew_users');",
    );
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

describe('the SKU stays withheld', () => {
  it('keeps crew_user unsellable while its ledger has no filler and no emptier', () => {
    // The ledger and both gates now exist, but nothing writes a row on payment
    // and nothing cancels one when the subscription lapses. Selling at this
    // point charges $5 a month and grants no seat.
    expect(TOP_UPS_WITHHELD.crew_user).toBeTruthy();
    expect(SELLABLE_TOP_UP_IDS).not.toContain('crew_user');
    expect(SELLABLE_TOP_UP_IDS).toHaveLength(5);
  });

  it('states the reason that is actually true, not the superseded one', () => {
    // The old reason blamed the rollout gate. That was never the blocker: the
    // gate enforces correctly, it just had nothing to count.
    const reason = TOP_UPS_WITHHELD.crew_user ?? '';
    expect(reason).not.toContain('exact-1 rollout gate');
    expect(reason).toMatch(/ledger/i);
    expect(reason.length).toBeGreaterThan(20);
  });
});
