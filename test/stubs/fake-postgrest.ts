/**
 * An in-memory PostgREST, only as clever as the dispatch tests need.
 *
 * WHY THIS EXISTS RATHER THAN A PILE OF vi.fn()s. The thing under test in
 * subcontractor-acceptance.test.ts is a RACE: two people tapping Accept at the
 * same moment must produce one winner. You cannot assert that against a mock
 * that returns canned values, because the property being tested is what happens
 * when a conditional UPDATE is evaluated against a row another statement has
 * already changed. So the fake has to actually hold rows and actually apply the
 * filters at write time.
 *
 * THE ONE GUARANTEE IT MAKES, and the only reason it is trustworthy for that
 * test: the filter-and-mutate step of an update runs synchronously, in one go,
 * with no await inside it. That is the fake's stand-in for Postgres taking a row
 * lock — the second update sees the first one's result, exactly as READ
 * COMMITTED re-evaluates a WHERE clause after the lock is released. Awaiting
 * anything mid-mutation would make the fake more forgiving than the database,
 * which is the one way a test like this can lie.
 *
 * Deliberately NOT a general-purpose emulator. It supports the operators this
 * feature uses (eq, neq, is, in, gt, gte, lt, not-in, order, limit) and nothing
 * else; an unsupported call throws rather than silently matching everything,
 * because a filter that quietly does nothing is how a test passes while the
 * code it covers is wrong.
 */

export type Row = Record<string, unknown>;
export type Store = Record<string, Row[]>;

type Filter = (row: Row) => boolean;

let sequence = 0;
/** Deterministic ids: a test asserting on one should be able to name it. */
function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${String(sequence).padStart(4, '0')}`;
}

export function resetFakeIds(): void {
  sequence = 0;
}

export type FakeLog = Array<{ table: string; op: 'insert' | 'update' | 'delete'; values?: Row; matched: number }>;

class FakeQuery implements PromiseLike<{ data: unknown; error: unknown; count?: number }> {
  private filters: Filter[] = [];
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: Row | Row[] = {};
  private wantsSingle: 'single' | 'maybeSingle' | null = null;
  private returning = false;
  private sort: { column: string; ascending: boolean } | null = null;
  private max: number | null = null;
  private conflictTarget: string | null = null;

  constructor(
    private readonly store: Store,
    private readonly table: string,
    private readonly log: FakeLog,
  ) {}

  private rows(): Row[] {
    return this.store[this.table] ?? (this.store[this.table] = []);
  }

  // -- filters ---------------------------------------------------------------

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }

  is(column: string, value: null | boolean) {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }

  in(column: string, values: readonly unknown[]) {
    const set = new Set(values);
    this.filters.push((row) => set.has(row[column]));
    return this;
  }

  gt(column: string, value: string | number) {
    this.filters.push((row) => (row[column] as string | number) > value);
    return this;
  }

  gte(column: string, value: string | number) {
    this.filters.push((row) => (row[column] as string | number) >= value);
    return this;
  }

  lt(column: string, value: string | number) {
    this.filters.push((row) => (row[column] as string | number) < value);
    return this;
  }

  /** Only the `not('status', 'in', '("a","b")')` shape the job read uses. */
  not(column: string, operator: string, value: string) {
    if (operator !== 'in') throw new Error(`fake-postgrest: not(${operator}) is not supported`);
    const set = new Set(
      value
        .replace(/^\(|\)$/g, '')
        .split(',')
        .map((entry) => entry.trim().replace(/^"|"$/g, '')),
    );
    this.filters.push((row) => !set.has(row[column] as string));
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.sort = { column, ascending: options?.ascending !== false };
    return this;
  }

  limit(count: number) {
    this.max = count;
    return this;
  }

  // -- operations ---------------------------------------------------------------

  select(_columns?: string, _options?: unknown) {
    if (this.op === 'select') return this;
    // .insert(...).select(...) / .update(...).select(...) — ask for the rows back.
    this.returning = true;
    return this;
  }

  insert(values: Row | Row[]) {
    this.op = 'insert';
    this.payload = values;
    return this;
  }

  upsert(values: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.op = 'insert';
    this.payload = values;
    this.conflictTarget = options?.onConflict ?? null;
    return this;
  }

  update(values: Row) {
    this.op = 'update';
    this.payload = values;
    return this;
  }

  delete() {
    this.op = 'delete';
    return this;
  }

  single() {
    this.wantsSingle = 'single';
    return this;
  }

  maybeSingle() {
    this.wantsSingle = 'maybeSingle';
    return this;
  }

  // -- running it -------------------------------------------------------------

  private matches(row: Row): boolean {
    return this.filters.every((filter) => filter(row));
  }

  /**
   * The whole operation, synchronously. Nothing in here awaits — see the note
   * at the top of this file about why that is the point.
   */
  private run(): { data: unknown; error: unknown } {
    const rows = this.rows();

    if (this.op === 'insert') {
      const incoming = Array.isArray(this.payload) ? this.payload : [this.payload];
      const created: Row[] = [];
      for (const values of incoming) {
        if (this.conflictTarget) {
          const keys = this.conflictTarget.split(',').map((key) => key.trim());
          const existing = rows.find((row) => keys.every((key) => row[key] === values[key]));
          if (existing) {
            Object.assign(existing, values);
            created.push(existing);
            continue;
          }
        }
        // Unique constraints the tests rely on: a duplicate token_hash and a
        // duplicate (request_id, crew_id) are both errors in the real schema.
        if (values.token_hash && rows.some((row) => row.token_hash === values.token_hash)) {
          return { data: null, error: { code: '23505', message: 'duplicate token_hash' } };
        }
        if (
          this.table === 'subcontractor_offers' &&
          rows.some((row) => row.request_id === values.request_id && row.crew_id === values.crew_id)
        ) {
          return { data: null, error: { code: '23505', message: 'duplicate offer' } };
        }
        if (
          this.table === 'crew_assignments' &&
          rows.some((row) => row.job_id === values.job_id && row.crew_id === values.crew_id)
        ) {
          return { data: null, error: { code: '23505', message: 'duplicate assignment' } };
        }
        const row: Row = { id: values.id ?? nextId(this.table.slice(0, 3)), ...values };
        rows.push(row);
        created.push(row);
      }
      this.log.push({ table: this.table, op: 'insert', values: incoming[0], matched: created.length });
      return { data: this.shape(created), error: null };
    }

    const matched = rows.filter((row) => this.matches(row));

    if (this.op === 'update') {
      // ONE PASS, NO AWAIT. This is the row lock.
      for (const row of matched) Object.assign(row, this.payload);
      this.log.push({ table: this.table, op: 'update', values: this.payload as Row, matched: matched.length });
      return { data: this.shape(matched), error: null };
    }

    if (this.op === 'delete') {
      for (const row of matched) {
        const at = rows.indexOf(row);
        if (at >= 0) rows.splice(at, 1);
      }
      this.log.push({ table: this.table, op: 'delete', matched: matched.length });
      return { data: this.shape(matched), error: null };
    }

    let result = [...matched];
    if (this.sort) {
      const { column, ascending } = this.sort;
      result.sort((a, b) => {
        const left = String(a[column] ?? '');
        const right = String(b[column] ?? '');
        return ascending ? left.localeCompare(right) : right.localeCompare(left);
      });
    }
    if (this.max !== null) result = result.slice(0, this.max);
    return { data: this.shape(result), error: null };
  }

  private shape(rows: Row[]): unknown {
    // Rows are COPIED out. A caller mutating what it read must not reach into
    // the store — which is exactly the bug a fake that hands back live objects
    // hides.
    const copies = rows.map((row) => ({ ...row }));
    if (this.wantsSingle === 'single') {
      return copies[0] ?? null;
    }
    if (this.wantsSingle === 'maybeSingle') {
      return copies[0] ?? null;
    }
    if (this.op !== 'select' && !this.returning) return null;
    return copies;
  }

  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    let outcome: { data: unknown; error: unknown };
    try {
      outcome = this.run();
    } catch (error) {
      return Promise.resolve().then(() => (onrejected ? onrejected(error) : Promise.reject(error))) as PromiseLike<TResult2>;
    }
    if (this.wantsSingle === 'single' && outcome.data === null && !outcome.error) {
      outcome = { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    }
    return Promise.resolve(outcome).then(onfulfilled, onrejected);
  }
}

export function fakeClient(store: Store, log: FakeLog = []) {
  return {
    client: { from: (table: string) => new FakeQuery(store, table, log) } as never,
    log,
    store,
  };
}
