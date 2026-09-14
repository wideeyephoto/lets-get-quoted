export function emailCampaignAdmin(tables: Record<string, any[]> = {}, failures: Record<string, string> = {}) {
  const queries: Array<{ table: string; filters: Array<[string, string, unknown]> }> = [];
  const admin = {
    queries,
    rpc: async (name: string, input: any) => {
      if (name === 'owner_emails_for_accounts') return { data: tables.owners ?? [], error: failures.owners ? { message: failures.owners } : null };
      if (failures[name]) return { data: null, error: { message: failures[name] } };
      const sends = tables.contractor_lifecycle_sends ??= [];
      if (name === 'claim_contractor_lifecycle_send') {
        const existing = sends.find(row => row.account_id === input.p_account_id && row.step_id === input.p_step_id);
        if (existing) return { data: { action: existing.state === 'accepted' ? 'already_sent' : 'busy' }, error: null };
        const row = { id: `send-${sends.length}`, account_id: input.p_account_id, step_id: input.p_step_id, state: 'sending' };
        sends.push(row);
        return { data: { action: 'send', id: row.id, token: 'claim-token', payload: input.p_payload,
          key: `contractor-lifecycle/${input.p_account_id}/${input.p_step_id}`,
          retry_before: new Date(Date.now() + 23 * 3600000).toISOString() }, error: null };
      }
      if (name === 'finish_contractor_lifecycle_send') {
        const row = sends.find(row => row.id === input.p_id && row.account_id === input.p_account_id);
        if (!row) return { data: false, error: null };
        Object.assign(row, { state: input.p_provider_id ? 'accepted' : 'retry_wait', provider_id: input.p_provider_id,
          accepted_at: input.p_provider_id ? new Date().toISOString() : null });
        return { data: true, error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
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
