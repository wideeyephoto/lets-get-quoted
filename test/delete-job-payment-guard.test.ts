import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deleteJob } from '../src/lib/jobs';

/**
 * Deleting a job must not delete the money that was taken for it.
 *
 * `payments.job_id` is ON DELETE **CASCADE** — one of twenty-three tables that
 * cascade off `jobs` — so a bare delete took the payment rows and their invoices
 * with it while Stripe carried on holding the money. Nothing was logged and the
 * row simply stopped existing, in the portal, in Insights and in the tax
 * worksheet.
 *
 * The reachable path was not the danger zone. "Edit & resend quote" on a lead
 * calls unconvertLeadFromJob, which calls deleteJob, and its confirmation named
 * "costs, invoices or schedule requests" while never mentioning payments.
 */

type Row = { status: string };

/** Records what was asked for, so the test can prove the delete never ran. */
function client(payments: Row[], opts: { paymentsError?: boolean } = {}) {
  const calls = { deleted: false, statusFilter: null as string[] | null, table: [] as string[] };
  const api = {
    from(table: string) {
      calls.table.push(table);
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      Object.assign(chain, {
        select: self,
        eq: self,
        in: (_column: string, values: string[]) => { calls.statusFilter = values; return chain; },
        limit: () => Promise.resolve(
          opts.paymentsError
            ? { data: null, error: { message: 'permission denied' } }
            : { data: payments, error: null },
        ),
        delete: () => {
          calls.deleted = true;
          return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
        },
      });
      return chain;
    },
  };
  return { supabase: api as unknown as SupabaseClient, calls };
}

const ACCOUNT = 'acct-1';
const JOB = 'job-1';

describe('deleteJob refuses to take money with it', () => {
  it.each(['paid', 'processing', 'refunded', 'disputed', 'failed'])(
    'refuses when a %s payment is attached',
    async (status) => {
      const { supabase, calls } = client([{ status }]);
      await expect(deleteJob(supabase, ACCOUNT, JOB)).rejects.toThrow(/payment/i);
      expect(calls.deleted, `a ${status} payment did not stop the delete`).toBe(false);
    },
  );

  it('names voiding or refunding, because that is the actual way out', async () => {
    const { supabase } = client([{ status: 'paid' }]);
    await expect(deleteJob(supabase, ACCOUNT, JOB)).rejects.toThrow(/void or refund/i);
  });

  it('still allows the ordinary quote correction, where nothing was ever paid', async () => {
    // A `requested` payment is an unpaid ask, and converting a lead to a quote
    // can create one. Blocking on it would make "Edit & resend quote" impossible
    // in exactly the case it exists for.
    const { supabase, calls } = client([]);
    await expect(deleteJob(supabase, ACCOUNT, JOB)).resolves.toBeUndefined();
    expect(calls.deleted).toBe(true);
    expect(calls.statusFilter).not.toContain('requested');
    expect(calls.statusFilter).not.toContain('canceled');
  });

  it('FAILS CLOSED when the payment ledger cannot be read', async () => {
    // Not knowing whether money is attached is not permission to proceed. The
    // cascade is irreversible; a refused edit is not.
    const { supabase, calls } = client([], { paymentsError: true });
    await expect(deleteJob(supabase, ACCOUNT, JOB)).rejects.toThrow(/could not check/i);
    expect(calls.deleted).toBe(false);
  });

  it('checks payments BEFORE touching jobs', async () => {
    const { supabase, calls } = client([{ status: 'paid' }]);
    await expect(deleteJob(supabase, ACCOUNT, JOB)).rejects.toThrow();
    expect(calls.table[0]).toBe('payments');
    expect(calls.table).not.toContain('jobs');
  });
});

describe('every path that deletes a job goes through the guard', () => {
  const jobs = readFileSync(join(process.cwd(), 'src', 'lib', 'jobs.ts'), 'utf8');
  const leads = readFileSync(join(process.cwd(), 'src', 'lib', 'leads.ts'), 'utf8');
  const jobActions = readFileSync(
    join(process.cwd(), 'src', 'app', 'dashboard', 'jobs', 'actions.ts'), 'utf8',
  );
  const undoButton = readFileSync(
    join(process.cwd(), 'src', 'app', 'dashboard', 'leads', '[leadId]', 'UndoQuoteButton.tsx'), 'utf8',
  );

  it('keeps the guard inside deleteJob, not at the call sites', () => {
    // Three entry points reach it today. A fourth must inherit the guard rather
    // than have to remember it.
    expect(jobs).toContain('PAYMENT_STATES_BLOCKING_JOB_DELETE');
    const fn = jobs.slice(jobs.indexOf('export async function deleteJob('));
    expect(fn).toContain("from('payments')");
  });

  it('has no path that deletes from jobs while bypassing deleteJob', () => {
    // leads.ts and the job actions must not issue their own delete.
    for (const [name, src] of [['leads.ts', leads], ['jobs/actions.ts', jobActions]] as const) {
      expect(src, `${name} deletes from jobs directly`).not.toMatch(/from\('jobs'\)\s*\.\s*delete\(/);
    }
  });

  it('tells the owner the truth in the confirmation dialog', () => {
    // The old copy listed invoices and omitted payments, though both cascade.
    expect(undoButton).toMatch(/payment has already been taken/i);
    expect(undoButton).toMatch(/nothing is deleted/i);
  });
});
