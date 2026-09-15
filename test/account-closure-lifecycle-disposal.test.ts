import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { processClosureJob } from '../src/lib/account-closure-orchestrator';

const tables = ['messaging_lifecycle_notifications', 'messaging_lifecycle_email_evidence'];

function fixture(failingTable?: string) {
  const job = {
    id: 'closure-job', closure_subject_id: 'closing-account', version: 1,
    lease_token: 'current-lease', lease_expires_at: new Date(Date.now() + 300_000).toISOString(),
    closure_state: 'processing', local_disposal_state: 'pending', legal_hold: false,
    domain_cleanup_state: 'not_applicable', stripe_state: 'not_applicable',
    quickbooks_state: 'not_applicable', storage_state: 'not_applicable',
    auth_cleanup_state: 'not_applicable', encrypted_vendor_handles: null,
  };
  const rows = new Map(tables.map(table => [table, ['closing-account', 'neighbor-account']]));
  let failure = failingTable;
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === 'update_closure_job_stage' && args.p_stage === 'local_disposal') {
      job.local_disposal_state = String(args.p_status);
      job.version++;
    }
    return { data: true, error: null };
  });
  const admin = {
    from(table: string) {
      let deleting = false;
      let account: unknown;
      const response = () => {
        if (deleting && rows.has(table)) {
          // A missing/wrong tenant filter is a test failure, not a successful no-op.
          expect(account).toBe(job.closure_subject_id);
          if (failure === table) return { data: null, error: { code: '23514', message: 'closure disposal guard rejected the delete' } };
          rows.set(table, rows.get(table)!.filter(owner => owner !== account));
        }
        return { data: table === 'account_closure_jobs' ? job : table === 'accounts' ? { legal_hold: false } : [], error: null };
      };
      const query = {
        select() { return query; },
        delete() { deleting = true; return query; },
        update() { return query; },
        eq(column: string, value: unknown) { if (column === 'account_id') account = value; return query; },
        in() { return query; },
        single: async () => response(),
        then(resolve: (value: ReturnType<typeof response>) => unknown, reject: (error: unknown) => unknown) {
          return Promise.resolve().then(response).then(resolve, reject);
        },
      };
      return query;
    },
    rpc,
  } as unknown as SupabaseClient;
  return { admin, job, rows, rpc, recover() { failure = undefined; } };
}

describe('account closure lifecycle notification disposal', () => {
  it('removes only the closing account notifications and evidence before acknowledging completion', async () => {
    const f = fixture();
    const result = await processClosureJob(f.admin, f.job.id, undefined, 'current-lease');
    expect(result.completed).toBe(true);
    for (const table of tables) expect(f.rows.get(table)).toEqual(['neighbor-account']);
    expect(f.rpc).toHaveBeenCalledWith('update_closure_job_stage', expect.objectContaining({ p_stage: 'local_disposal', p_status: 'completed' }));
  });

  it.each(tables)('retains a failed %s disposal for retry without reporting completion', async failingTable => {
    const f = fixture(failingTable);
    const failed = await processClosureJob(f.admin, f.job.id, undefined, 'current-lease');
    expect(failed).toMatchObject({ success: false, completed: false });
    expect(failed.errors.join(' ')).toContain(failingTable);
    expect(f.rows.get(failingTable)).toEqual(['closing-account', 'neighbor-account']);
    expect(f.rpc).not.toHaveBeenCalledWith('complete_closure_job', expect.anything());
    expect(f.rpc).not.toHaveBeenCalledWith('update_closure_job_stage', expect.objectContaining({ p_stage: 'local_disposal', p_status: 'completed' }));

    f.recover();
    const recovered = await processClosureJob(f.admin, f.job.id, undefined, 'current-lease');
    expect(recovered).toMatchObject({ success: true, completed: true });
    for (const table of tables) expect(f.rows.get(table)).toEqual(['neighbor-account']);
  });
});
