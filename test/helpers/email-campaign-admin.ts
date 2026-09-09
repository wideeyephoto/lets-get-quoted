export function emailCampaignAdmin(tables: Record<string, any[]> = {}, failures: Record<string, string> = {}) {
  const queries: Array<{ table: string; filters: Array<[string, string, unknown]> }> = [];
  const admin = {
    queries,
    rpc: async () => ({ data: tables.owners ?? [], error: failures.owners ? { message: failures.owners } : null }),
    from: (table: string) => {
      let rows = [...(tables[table] ?? [])];
      let single = false;
      const query = { table, filters: [] as Array<[string, string, unknown]> };
      queries.push(query);
      const q: any = {
        select: () => q,
        order: () => q,
        eq: (column: string, value: unknown) => { query.filters.push(['eq', column, value]); rows = rows.filter(r => r[column] === value); return q; },
        is: (column: string, value: unknown) => { rows = rows.filter(r => value === null ? r[column] == null : r[column] === value); return q; },
        in: (column: string, values: unknown[]) => { rows = rows.filter(r => values.includes(r[column])); return q; },
        gt: (column: string, value: number) => { rows = rows.filter(r => r[column] > value); return q; },
        gte: (column: string, value: string) => { rows = rows.filter(r => r[column] >= value); return q; },
        contains: (column: string, value: Record<string, unknown>) => { rows = rows.filter(r => Object.entries(value).every(([key, val]) => r[column]?.[key] === val)); return q; },
        limit: (limit: number) => { rows = rows.slice(0, limit); return q; },
        range: (start: number, end: number) => { rows = rows.slice(start, end + 1); return q; },
        maybeSingle: () => { single = true; return q; },
        then: (resolve: (result: unknown) => unknown) => resolve({ data: single ? rows[0] ?? null : rows, count: rows.length, error: failures[table] ? { message: failures[table] } : null }),
      };
      return q;
    },
  };
  return admin;
}
