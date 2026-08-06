import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * An in-memory stand-in for the Supabase client, over demo fixtures.
 *
 * WHY THIS EXISTS. The logged-out demo used to be a set of hand-drawn replicas
 * of the real screens — separate markup, separate copy, separate numbers. They
 * were correct on the day they were written and wrong within a fortnight, every
 * time, because nothing links a replica to the page it imitates. An audit on
 * 2026-08-06 found thirteen of seventeen areas stale, two of them showing a
 * product that no longer exists.
 *
 * The fix is to stop imitating and start RUNNING the real thing. Most of the
 * dashboard's server pages are a data read followed by real components; the only
 * part a logged-out visitor cannot have is the read. So: give those builders a
 * client that answers out of fixtures instead of Postgres, and the demo renders
 * the same components, through the same maths, as a signed-in owner. When a card
 * is redesigned the demo gets the redesign for free — there is no second copy to
 * update, which is the only property that actually holds over time.
 *
 * This is the same trick test/campaign-recommendations.test.ts already plays to
 * assert against a fake PostgREST chain; it is promoted here because the demo
 * needs it on a dozen pages.
 *
 * WHAT IT IS NOT. Not a database. It filters, sorts, limits and counts, because
 * that is what the callers use — enough that a builder written against Postgres
 * behaves the same way here. It does not parse `select()` projections (rows come
 * back whole, and embedded children are simply pre-nested on the fixture), does
 * not join, and does not enforce RLS. Nothing secret is in here to protect: it
 * is one invented landscaping company.
 *
 * Everything is synchronous under the promise. There is no network, so a demo
 * page costs no round trips at all.
 */

export type DemoRow = Record<string, unknown>;
export type DemoTables = Record<string, DemoRow[]>;

type Filter = (row: DemoRow) => boolean;

function value(row: DemoRow, column: string): unknown {
  return row[column];
}

/** PostgREST compares as text for most operators; match loosely but predictably. */
function looseEquals(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === null || left === undefined || right === null || right === undefined) return false;
  return String(left) === String(right);
}

function compare(left: unknown, right: unknown): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left ?? '').localeCompare(String(right ?? ''));
}

/**
 * One query in progress.
 *
 * Thenable rather than a real Promise so the chain can keep collecting filters
 * until somebody awaits it — which is exactly how the Supabase builder behaves,
 * and why `await supabase.from(x).select(y).eq(a, b)` works at all.
 */
class DemoQuery implements PromiseLike<{ data: unknown; error: null; count: number | null }> {
  private filters: Filter[] = [];
  private sort: { column: string; ascending: boolean } | null = null;
  private max: number | null = null;
  private mode: 'many' | 'maybeSingle' | 'single' = 'many';
  private headOnly = false;
  private wantCount = false;

  constructor(private rows: DemoRow[]) {}

  select(_columns?: string, options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) {
    // The projection is ignored on purpose — see the note at the top. `count`
    // and `head` are not: a head-only count read returns no rows at all, and a
    // caller that got rows back when it asked for none would quietly double a
    // "3 past jobs" figure somewhere.
    if (options?.count) this.wantCount = true;
    if (options?.head) this.headOnly = true;
    return this;
  }

  eq(column: string, target: unknown) {
    this.filters.push((row) => looseEquals(value(row, column), target));
    return this;
  }

  neq(column: string, target: unknown) {
    this.filters.push((row) => !looseEquals(value(row, column), target));
    return this;
  }

  in(column: string, targets: unknown[]) {
    this.filters.push((row) => targets.some((target) => looseEquals(value(row, column), target)));
    return this;
  }

  gt(column: string, target: unknown) {
    this.filters.push((row) => compare(value(row, column), target) > 0);
    return this;
  }

  gte(column: string, target: unknown) {
    this.filters.push((row) => compare(value(row, column), target) >= 0);
    return this;
  }

  lt(column: string, target: unknown) {
    this.filters.push((row) => compare(value(row, column), target) < 0);
    return this;
  }

  lte(column: string, target: unknown) {
    this.filters.push((row) => compare(value(row, column), target) <= 0);
    return this;
  }

  is(column: string, target: null | boolean) {
    this.filters.push((row) => (value(row, column) ?? null) === target);
    return this;
  }

  /** Only the `not(col, 'is', null)` form is used in this codebase. */
  not(column: string, operator: string, target: unknown) {
    if (operator === 'is') {
      this.filters.push((row) => (value(row, column) ?? null) !== target);
    }
    return this;
  }

  // No `or()`. Nothing the demo reads through uses it, and a no-op stub would
  // silently widen a filter somebody later added — better to fail loudly with
  // "or is not a function" than to quietly show rows a real query excluded.

  order(column: string, options?: { ascending?: boolean }) {
    this.sort = { column, ascending: options?.ascending !== false };
    return this;
  }

  limit(count: number) {
    this.max = count;
    return this;
  }

  range(from: number, to: number) {
    this.filters.push(() => true);
    this.max = to - from + 1;
    return this;
  }

  maybeSingle() {
    this.mode = 'maybeSingle';
    return this;
  }

  single() {
    this.mode = 'single';
    return this;
  }

  private resolve() {
    let rows = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
    if (this.sort) {
      const { column, ascending } = this.sort;
      rows = [...rows].sort((a, b) => (ascending ? 1 : -1) * compare(value(a, column), value(b, column)));
    }
    const count = this.wantCount ? rows.length : null;
    if (this.max !== null) rows = rows.slice(0, this.max);

    if (this.headOnly) return { data: null, error: null, count };
    if (this.mode === 'many') return { data: rows, error: null, count };
    return { data: rows[0] ?? null, error: null, count };
  }

  then<TResult1 = { data: unknown; error: null; count: number | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null; count: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.resolve()).then(onfulfilled, onrejected);
  }
}

/**
 * A client backed by fixtures.
 *
 * An unknown table returns no rows rather than throwing — the same shape a
 * builder already handles for an un-migrated database (`?? []`), so a demo page
 * that reaches for something the fixtures do not model degrades to an empty
 * section instead of a 500.
 *
 * Writes are refused loudly. The demo is read-only by design and a page that
 * appears to save something a logged-out visitor cannot save is worse than one
 * that does not offer it.
 */
export function createDemoSupabase(tables: DemoTables): SupabaseClient {
  const client = {
    from(table: string) {
      return new DemoQuery(tables[table] ?? []);
    },
    rpc() {
      return Promise.resolve({ data: null, error: null });
    },
    // Some dashboard readers ask who is signed in — the home page counts linked
    // sign-in methods to decide whether to nudge about adding one. Nobody is
    // signed in here, and saying so plainly is the honest answer; without this
    // those pages throw on `supabase.auth` being undefined.
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      getUserIdentities: () => Promise.resolve({ data: { identities: [] }, error: null }),
    },
    insert: refuseWrite,
    update: refuseWrite,
    delete: refuseWrite,
  };
  return client as unknown as SupabaseClient;
}

function refuseWrite(): never {
  throw new Error('The demo is read-only — nothing here writes to a database.');
}
