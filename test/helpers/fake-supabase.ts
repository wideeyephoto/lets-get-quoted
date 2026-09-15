/**
 * A tiny in-memory stand-in for the Supabase query builder.
 *
 * The existing Quick Stop sweep test drives the real code through a chain of
 * `mockReturnThis()` stubs and decides what each query returns by counting how
 * many queries have gone past. That works until the code under test adds or
 * removes a query — which it did, twice, in the course of these fixes — and then
 * every fixture silently lands on the wrong call. Worse, a counter cannot express
 * the thing these particular tests need to assert: that a row was filtered out
 * *because of its own values*.
 *
 * So this evaluates the filters instead of ignoring them. Fixtures are plain rows
 * keyed by table; `select` returns whatever actually matches, and `update` mutates
 * the rows in place so a later query in the same run sees the new state — which is
 * what makes the compare-and-set claims in the sweep and in
 * resolveQuickStopCancellation testable at all.
 *
 * Supports only the operators the Quick Stop code uses. Anything else should throw
 * loudly rather than quietly match everything.
 */

export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;

type Filter =
  | { op: 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte'; col: string; val: unknown }
  | { op: 'in'; col: string; val: unknown[] }
  | { op: 'is'; col: string; val: null }
  | { op: 'notIs'; col: string };

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    const v = row[f.col];
    switch (f.op) {
      case 'eq':
        return v === f.val;
      case 'neq':
        return v !== f.val;
      // Null never satisfies an ordering comparison, matching SQL — this is what
      // makes `.lt('response_deadline_at', now)` skip a row that has no deadline.
      case 'lt':
        return v != null && (v as never) < (f.val as never);
      case 'lte':
        return v != null && (v as never) <= (f.val as never);
      case 'gt':
        return v != null && (v as never) > (f.val as never);
      case 'gte':
        return v != null && (v as never) >= (f.val as never);
      case 'in':
        return f.val.includes(v);
      case 'is':
        return v == null;
      case 'notIs':
        return v != null;
    }
  });
}

export type FakeAdmin = {
  from: (table: string) => unknown;
  /** Live rows, so a test can assert on the end state of the table. */
  tables: Tables;
  /** Every table touched by a write, in order — handy for "did it even try?". */
  writes: Array<{ table: string; patch: Row; count: number }>;
};

export function makeFakeAdmin(tables: Tables): FakeAdmin {
  const store: Tables = {};
  for (const [name, rows] of Object.entries(tables)) store[name] = rows.map((r) => ({ ...r }));
  const writes: FakeAdmin['writes'] = [];

  function builder(table: string) {
    const filters: Filter[] = [];
    let mode: 'select' | 'update' | 'insert' = 'select';
    let patch: Row = {};
    let limit: number | null = null;
    let orderBy: { col: string; asc: boolean } | null = null;

    const rowsNow = () => (store[table] ??= []);

    const resolve = () => {
      let hits = rowsNow().filter((r) => matches(r, filters));
      if (mode === 'update') {
        for (const r of hits) Object.assign(r, patch);
        writes.push({ table, patch: { ...patch }, count: hits.length });
      }
      if (orderBy) {
        const { col, asc } = orderBy;
        hits = [...hits].sort((a, b) => {
          const x = a[col] as never;
          const y = b[col] as never;
          return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1);
        });
      }
      if (limit != null) hits = hits.slice(0, limit);
      return hits.map((r) => ({ ...r }));
    };

    const q = {
      select: () => q,
      update: (p: Row) => {
        mode = 'update';
        patch = p;
        return q;
      },
      insert: (p: Row) => {
        mode = 'insert';
        rowsNow().push({ ...p });
        writes.push({ table, patch: { ...p }, count: 1 });
        return q;
      },
      eq: (col: string, val: unknown) => (filters.push({ op: 'eq', col, val }), q),
      neq: (col: string, val: unknown) => (filters.push({ op: 'neq', col, val }), q),
      lt: (col: string, val: unknown) => (filters.push({ op: 'lt', col, val }), q),
      lte: (col: string, val: unknown) => (filters.push({ op: 'lte', col, val }), q),
      gt: (col: string, val: unknown) => (filters.push({ op: 'gt', col, val }), q),
      gte: (col: string, val: unknown) => (filters.push({ op: 'gte', col, val }), q),
      in: (col: string, val: unknown[]) => (filters.push({ op: 'in', col, val }), q),
      is: (col: string, val: null) => (filters.push({ op: 'is', col, val }), q),
      not: (col: string, op: string, val: unknown) => {
        if (op !== 'is' || val !== null) throw new Error(`fake-supabase: unsupported .not(${col}, ${op})`);
        filters.push({ op: 'notIs', col });
        return q;
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        orderBy = { col, asc: opts?.ascending !== false };
        return q;
      },
      limit: (n: number) => {
        limit = n;
        return q;
      },
      maybeSingle: async () => ({ data: resolve()[0] ?? null, error: null }),
      single: async () => {
        const hits = resolve();
        return hits.length === 1
          ? { data: hits[0], error: null }
          : { data: null, error: { message: 'no rows' } };
      },
      then: (onOk: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: resolve(), error: null }).then(onOk),
    };
    return q;
  }

  return { from: (table: string) => builder(table), tables: store, writes };
}
