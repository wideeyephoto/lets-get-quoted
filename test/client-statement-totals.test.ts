import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { getClientStatement } from '@/lib/clients';

describe('client statement aggregate payment totals', () => {
  it('keeps totals and balances consistent with refunded job payments and excludes visit fees', async () => {
    const rows: Record<string, unknown[]> = {
      jobs: [
        { id: 'job-a', ref: 'A', status: 'in_progress', quoted_amount: 100, created_at: '2026-09-01' },
        { id: 'job-b', ref: 'B', status: 'in_progress', quoted_amount: 200, created_at: '2026-09-02' },
      ],
      payments: [
        { id: 'payment-a', job_id: 'job-a', amount: 80, refunded_amount: 20, status: 'paid' },
        { id: 'visit-fee', job_id: 'job-a', amount: 15, refunded_amount: 0, status: 'paid' },
        { id: 'payment-b', job_id: 'job-b', amount: 50, refunded_amount: 0, status: 'paid' },
        { id: 'pending', job_id: 'job-b', amount: 150, refunded_amount: 0, status: 'pending' },
      ],
      extra_stop_requests: [{ payment_id: 'visit-fee' }],
    };
    const client = createClient('https://fixture.supabase.co', 'test-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async (input) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        expect(url.searchParams.get('account_id')).toBe('eq.account-a');
        const table = url.pathname.split('/').at(-1)!;
        expect(rows).toHaveProperty(table);
        return new Response(JSON.stringify(rows[table]), { headers: { 'Content-Type': 'application/json' } });
      } },
    });

    const statement = await getClientStatement(client, 'account-a', 'client-a');
    expect(statement.jobs.map(job => job.paid)).toEqual([60, 50]);
    expect(statement.totalPaid).toBe(110);
    expect(statement.totalQuoted).toBe(300);
    expect(statement.outstanding).toBe(190);
  });
});
