// The seeded-record filter, keyed on a column the writers set themselves.
//
// WHY THIS IS NOT src/lib/test-data-markers.ts. That file guesses, carefully,
// from a name, an email, a phone and a job reference, and it has to: it is the
// only thing that can classify the rows already sitting in the database. But it
// cannot be what the owner's lists filter on. An invoice has no name and no
// phone, a payment has neither, and the seeder writes plenty of both — so a
// heuristic silently under-counts exactly the tables where the money is. And it
// is a guess about real people: a customer whose surname is Test would vanish
// from the history of the business that served them.
//
// So the writers mark their own rows instead. `test_marker` is set by the
// seeding and probe scripts to their own name and by nothing else — the
// application never writes it, so a row created by a real customer cannot
// acquire one. See migrations/2026-08-24-test-record-marker.sql.
//
// NULL IS THE ONLY THING THAT MEANS REAL, and the predicate below is `is null`
// with no trimming or emptiness rule, because the SQL filter is literally
// `test_marker is null` and the two must not be able to disagree about a row.
// A JS helper that forgave an empty string while Postgres did not would give
// the count and the list different answers, which is the failure mode
// scripts/remove-demo-data.mjs has a paragraph about.
//
// DEFAULTS TO OFF. Every read helper here takes the option and does nothing
// unless it is explicitly true. The column has to land in the database before
// any deployed code selects it — a select naming a missing column errors rather
// than degrading — so the wiring ships first and inert, and turning it on is a
// separate, reversible change.

/** The column the seeding and probe scripts stamp. */
export const TEST_MARKER_COLUMN = 'test_marker';

/** Any row from a table carrying the marker column. */
export type TestMarkedRow = {
  test_marker?: string | null;
};

/**
 * The read-path option, spelled the same way everywhere it is threaded.
 *
 * Named for what it does when true rather than for a mode, so a call site reads
 * as an instruction: `{ excludeTestRecords: true }`. Absent and false both mean
 * "list everything", which is what every caller does today.
 */
export type TestRecordOptions = {
  excludeTestRecords?: boolean;
};

/** Which script wrote this row, or null when it is a real record. */
export function testRecordSource(row: TestMarkedRow | null | undefined): string | null {
  return row?.test_marker ?? null;
}

/** True only for a row a script marked as its own. */
export function isTestRecord(row: TestMarkedRow | null | undefined): boolean {
  return testRecordSource(row) !== null;
}

/**
 * Drop marked rows from an already-fetched list.
 *
 * For the places that cannot push the filter into the query — a list assembled
 * from two tables, or one already in memory. Same predicate as the SQL below.
 */
export function withoutTestRecords<T extends TestMarkedRow>(rows: readonly T[]): T[] {
  return rows.filter((row) => !isTestRecord(row));
}

/**
 * How many of these are marked.
 *
 * So a surface can say what it left out. A number the owner can see and dispute
 * is honest; a total that quietly shrinks while claiming to have read
 * everything is the same failure this file exists to fix, pointed the other way.
 */
export function countTestRecords(rows: readonly TestMarkedRow[]): number {
  return rows.reduce((total, row) => total + (isTestRecord(row) ? 1 : 0), 0);
}

/**
 * The subset of a PostgREST builder this needs.
 *
 * Structural rather than an import of PostgrestFilterBuilder so the tests can
 * hand it a recorder and assert on the filter that was actually applied.
 *
 * The return type is `unknown` and the calls below cast it back. Writing the
 * truth — `is()` returns `this`, so it returns the builder you passed in —
 * needs a self-referential constraint, and instantiating one against
 * PostgrestFilterBuilder's generics is deep enough that the compiler gives up
 * (TS2589). The cast restates what the builder already guarantees.
 */
type MarkerFilterable = {
  is(column: string, value: null): unknown;
};

/** Add `test_marker is null` to a query. Unconditional — see applyTestRecordFilter. */
export function excludeTestRecords<Q extends MarkerFilterable>(query: Q): Q {
  return query.is(TEST_MARKER_COLUMN, null) as Q;
}

/**
 * The one read paths call: filters only when asked, and returns the query
 * untouched otherwise.
 *
 * The untouched path matters more than the filtering one right now. It is what
 * makes this safe to deploy before the migration is applied — no caller passes
 * the option yet, so no deployed query names the column at all.
 */
export function applyTestRecordFilter<Q extends MarkerFilterable>(query: Q, options?: TestRecordOptions): Q {
  return options?.excludeTestRecords ? excludeTestRecords(query) : query;
}
