import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { suppressEmail } from '@/lib/email-suppression';

type Row = { id: string; account_id: string; email: string; reason: string };

// Apply query predicates to stored rows so tests catch missing tenant/recipient
// filters and accidental replacement of a stronger delivery reason.
function suppressionStore(initial: Row[], options: { updateError?: boolean; concurrentInsert?: Row } = {}) {
  const rows = structuredClone(initial);
  const admin = {
    from: vi.fn((table: string) => {
      expect(table).toBe('email_suppression');
      const predicates: Array<(row: Row) => boolean> = [];
      let change: Partial<Row> | undefined;
      const query: any = {
        select: () => query,
        limit: () => query,
        eq: (column: keyof Row, value: string) => { predicates.push(row => row[column] === value); return query; },
        in: (column: keyof Row, values: string[]) => { predicates.push(row => values.includes(row[column])); return query; },
        update: (value: Partial<Row>) => { change = value; return query; },
        maybeSingle: async () => ({ data: rows.find(row => predicates.every(test => test(row))) ?? null, error: null }),
        insert: async (value: Omit<Row, 'id'>) => {
          if (options.concurrentInsert) {
            rows.push(options.concurrentInsert);
            return { error: { code: '23505', message: 'duplicate key' } };
          }
          rows.push({ id: 'new', ...value });
          return { error: null };
        },
        then: (resolve: (value: unknown) => unknown) => {
          if (options.updateError) return resolve({ error: { message: 'write unavailable' } });
          if (change) rows.filter(row => predicates.every(test => test(row))).forEach(row => Object.assign(row, change));
          return resolve({ error: null });
        },
      };
      return query;
    }),
  };
  return { rows, admin: admin as unknown as SupabaseClient };
}

const row = (reason: string, account_id = 'workspace-a', email = 'client@example.com'): Row => ({ id: `${account_id}/${email}`, account_id, email, reason });

describe('suppression reasons survive replay and opt-out ordering', () => {
  it('constructs a scoped conditional PATCH with the installed Supabase client', async () => {
    const requests: Request[] = [];
    const admin = createClient('https://suppression-fixture.supabase.co', 'synthetic-secret', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return request.method === 'GET'
          ? Response.json([{ id: 'existing' }])
          : new Response(null, { status: 204 });
      } },
    });
    expect(await suppressEmail(admin, 'workspace-a', ' Client@Example.com ', 'hard_bounce')).toBe(true);
    expect(requests.map(request => request.method)).toEqual(['GET', 'PATCH']);
    const patch = requests[1];
    const url = new URL(patch.url);
    expect(url.pathname).toBe('/rest/v1/email_suppression');
    expect(url.searchParams.get('account_id')).toBe('eq.workspace-a');
    expect(url.searchParams.get('email')).toBe('eq.client@example.com');
    expect(url.searchParams.get('reason')).toBe('in.(unsubscribe_link,one_click_unsubscribe,provider_suppressed)');
    expect(await patch.json()).toEqual({ reason: 'hard_bounce' });
  });

  it.each(['hard_bounce', 'complaint', 'provider_suppressed'])('promotes a marketing opt-out to %s', async reason => {
    const store = suppressionStore([row('unsubscribe_link')]);
    expect(await suppressEmail(store.admin, 'workspace-a', ' Client@Example.com ', reason)).toBe(true);
    expect(store.rows).toEqual([row(reason)]);
  });

  it('only changes the intended workspace and exact recipient', async () => {
    const otherTenant = row('one_click_unsubscribe', 'workspace-b');
    const otherRecipient = row('one_click_unsubscribe', 'workspace-a', 'other@example.com');
    const store = suppressionStore([row('one_click_unsubscribe'), otherTenant, otherRecipient]);
    await suppressEmail(store.admin, 'workspace-a', 'client@example.com', 'hard_bounce');
    expect(store.rows).toEqual([row('hard_bounce'), otherTenant, otherRecipient]);
  });

  it.each(['unsubscribe_link', 'one_click_unsubscribe', 'hard_bounce', 'provider_suppressed', 'complaint'])('never downgrades a complaint on later %s', async reason => {
    const store = suppressionStore([row('complaint')]);
    expect(await suppressEmail(store.admin, 'workspace-a', 'client@example.com', reason)).toBe(true);
    expect(store.rows).toEqual([row('complaint')]);
  });

  it('promotes a provider block to the more specific permanent bounce and complaint', async () => {
    const store = suppressionStore([row('provider_suppressed')]);
    await suppressEmail(store.admin, 'workspace-a', 'client@example.com', 'hard_bounce');
    expect(store.rows[0].reason).toBe('hard_bounce');
    await suppressEmail(store.admin, 'workspace-a', 'client@example.com', 'complaint');
    expect(store.rows[0].reason).toBe('complaint');
  });

  it('still promotes when an unsubscribe wins a concurrent insert race', async () => {
    const store = suppressionStore([], { concurrentInsert: row('one_click_unsubscribe') });
    expect(await suppressEmail(store.admin, 'workspace-a', 'client@example.com', 'hard_bounce')).toBe(true);
    expect(store.rows).toEqual([row('hard_bounce')]);
  });

  it('does not acknowledge a failed delivery-reason write just because an opt-out exists', async () => {
    const store = suppressionStore([row('unsubscribe_link')], { updateError: true });
    expect(await suppressEmail(store.admin, 'workspace-a', 'client@example.com', 'hard_bounce')).toBe(false);
    expect(store.rows).toEqual([row('unsubscribe_link')]);
  });
});
