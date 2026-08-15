import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TEST_MARKER_COLUMN,
  applyTestRecordFilter,
  countTestRecords,
  excludeTestRecords,
  isTestRecord,
  testRecordSource,
  withoutTestRecords,
} from '@/lib/test-records';

/** Stands in for a PostgREST builder and remembers what was asked of it. */
class RecordingQuery {
  readonly filters: { column: string; value: null }[] = [];

  is(column: string, value: null): this {
    this.filters.push({ column, value });
    return this;
  }
}

describe('the marker predicate', () => {
  it('treats an unmarked row as real, however the column arrives', () => {
    expect(isTestRecord({ test_marker: null })).toBe(false);
    expect(isTestRecord({ test_marker: undefined })).toBe(false);
    // Selected with a narrower `select(...)` that never asked for the column.
    expect(isTestRecord({})).toBe(false);
    expect(isTestRecord(null)).toBe(false);
    expect(isTestRecord(undefined)).toBe(false);
  });

  it('treats any marked row as a test record and reports which script wrote it', () => {
    expect(isTestRecord({ test_marker: 'seed-customers' })).toBe(true);
    expect(testRecordSource({ test_marker: 'seed-showcase' })).toBe('seed-showcase');
    expect(testRecordSource({ test_marker: null })).toBeNull();
    expect(testRecordSource(undefined)).toBeNull();
  });

  it('does not forgive an empty marker, because Postgres would not either', () => {
    // The SQL side is `test_marker is null`. An empty string is not null, so it
    // is excluded there — and this has to agree, or a count and the list it
    // describes end up disagreeing about the same row.
    expect(isTestRecord({ test_marker: '' })).toBe(true);
    expect(isTestRecord({ test_marker: '   ' })).toBe(true);
  });

  it('never guesses from a name, an email or a phone', () => {
    // The whole point of the column. A real customer whose surname is Test, on
    // a 555 number, is a real customer.
    const realCustomer = { test_marker: null, name: 'Damon Test', phone: '(248) 555-0143' };
    expect(isTestRecord(realCustomer)).toBe(false);
  });
});

describe('filtering rows already in memory', () => {
  const rows = [
    { id: 'a', test_marker: null },
    { id: 'b', test_marker: 'seed-customers' },
    { id: 'c' },
    { id: 'd', test_marker: 'test-rls' },
  ];

  it('keeps the real rows in their original order', () => {
    expect(withoutTestRecords(rows).map((row) => row.id)).toEqual(['a', 'c']);
  });

  it('counts what it left out, so a surface can say so', () => {
    expect(countTestRecords(rows)).toBe(2);
    expect(countTestRecords([])).toBe(0);
  });

  it('does not mutate the list it was given', () => {
    const original = [...rows];
    withoutTestRecords(rows);
    expect(rows).toEqual(original);
  });
});

describe('filtering in the query', () => {
  it('asks for null on the marker column and nothing else', () => {
    const query = excludeTestRecords(new RecordingQuery());
    expect(query.filters).toEqual([{ column: 'test_marker', value: null }]);
  });

  it('returns the same builder so it can be chained', () => {
    const query = new RecordingQuery();
    expect(excludeTestRecords(query)).toBe(query);
  });
});

// The default moved from off to on once migrations/2026-08-24-test-record-marker.sql
// was applied and scripts/backfill-test-markers.mjs stamped the rows that
// predated it. It shipped off for one release only because a select naming a
// column the database lacks errors rather than degrading, so the wiring had to
// be able to land before the column. These assertions pin the new direction.
describe('applyTestRecordFilter defaults to on', () => {
  it('filters when the option is absent or empty', () => {
    for (const options of [undefined, {}]) {
      const query = applyTestRecordFilter(new RecordingQuery(), options);
      expect(query.filters).toEqual([{ column: 'test_marker', value: null }]);
    }
  });

  it('filters on an explicit true', () => {
    const query = applyTestRecordFilter(new RecordingQuery(), { excludeTestRecords: true });
    expect(query.filters).toEqual([{ column: 'test_marker', value: null }]);
  });

  // Only a deliberate `false` opts out. An options object threaded through for
  // an unrelated reason — `{ todayKey }` on listClients — must not be able to
  // switch the filter off by merely not mentioning it, which a truthiness test
  // would have allowed.
  it('leaves the query alone only on an explicit false', () => {
    const query = new RecordingQuery();
    expect(applyTestRecordFilter(query, { excludeTestRecords: false })).toBe(query);
    expect(query.filters).toEqual([]);
  });
});

describe('the column the writers stamp', () => {
  it('is the one the migration adds, on all five tables', () => {
    expect(TEST_MARKER_COLUMN).toBe('test_marker');

    // The helper is worthless against a column that was never added, and the
    // scripts now write it on all five. A rename that lands in one place and
    // not the other is exactly the failure this pins.
    const migration = readFileSync(
      join(process.cwd(), 'migrations', '2026-08-24-test-record-marker.sql'),
      'utf8',
    );
    for (const table of ['clients', 'leads', 'jobs', 'invoices', 'payments']) {
      expect(migration).toMatch(
        new RegExp(`alter table\\s+${table}\\s+add column if not exists ${TEST_MARKER_COLUMN} text`),
      );
    }
  });
});
