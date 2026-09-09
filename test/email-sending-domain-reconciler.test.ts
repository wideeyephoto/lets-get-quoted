import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cronSummaryHasFailures } from '@/lib/cron-jobs';

/**
 * The reconciler is the answer to the one silent, customer-visible failure in
 * the sending-domain feature: a contractor verifies their domain, someone later
 * deletes the DKIM record, the provider starts refusing their mail, and our row
 * still says `verified` so every send keeps using the address.
 *
 * These tests drive the real worker against a fake Supabase and a fake
 * provider. The pure helpers (toStoredStatus, failureReasonFor,
 * filterSafeSendingDnsRecords) are deliberately NOT mocked — the mapping bug
 * they exist to prevent would otherwise be mocked out of reach.
 */

const getSendingDomain = vi.fn();
const deleteSendingDomain = vi.fn();
const listSendingDomains = vi.fn();
const isConfigured = vi.fn(() => true);
// Rest-typed on purpose: these stand in for functions with real signatures, and
// the mock has to accept whatever the worker passes without asserting a shape
// the test does not care about.
const sendSendingDomainFailedEmail = vi.fn(async (..._args: unknown[]): Promise<void> => {});
const getAccountOwnerEmail = vi.fn(async (..._args: unknown[]): Promise<string | null> => 'owner@example.com');

vi.mock('@/lib/resend-domains', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/resend-domains')>();
  return {
    ...actual,
    getSendingDomain: (...a: unknown[]) => getSendingDomain(...a),
    deleteSendingDomain: (...a: unknown[]) => deleteSendingDomain(...a),
    listSendingDomains: (...a: unknown[]) => listSendingDomains(...a),
    isSendingDomainProvisioningConfigured: () => isConfigured(),
  };
});

vi.mock('@/lib/email', () => ({
  sendSendingDomainFailedEmail: (...a: unknown[]) => sendSendingDomainFailedEmail(...a),
  getAccountOwnerEmail: (...a: unknown[]) => getAccountOwnerEmail(...a),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => {
    throw new Error('the worker must use the injected client in tests');
  },
}));

const { runEmailSendingDomainReconcile } = await import('@/lib/email-sending-domain-reconciler');

type Row = {
  id: string;
  account_id: string;
  domain: string;
  provider_domain_id: string | null;
  status: string;
  verified_at: string | null;
};

/** Records every update the worker attempts, and can make one vanish mid-run. */
function makeDb(rows: Row[], opts: { vanishing?: Set<string>; cleanup?: Row[]; cleanupReadError?: boolean; cleanupDeleteError?: boolean; cleanupVanished?: boolean } = {}) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];

  function builder(table: string) {
    const ctx: {
      table: string;
      op: 'select' | 'update' | 'delete';
      cols: string;
      filters: Record<string, unknown>;
      patch: Record<string, unknown> | null;
    } = { table, op: 'select', cols: '', filters: {}, patch: null };

    const resolve = () => {
      if (ctx.table === 'sites') return { data: { company_name: 'Elite Electricians' }, error: null };
      if (ctx.op === 'delete') {
        return { data: opts.cleanupVanished ? [] : [{ id: ctx.filters.id }], error: opts.cleanupDeleteError ? { message: 'database unavailable' } : null };
      }
      if (ctx.op === 'update') {
        const id = String(ctx.filters.id);
        updates.push({ id, patch: ctx.patch ?? {} });
        if (opts.vanishing?.has(id)) return { data: null, error: null };
        return { data: { id }, error: null };
      }
      if (ctx.cols.trim() === 'provider_domain_id') {
        return { data: rows.map((r) => ({ provider_domain_id: r.provider_domain_id })), error: null };
      }
      if (ctx.filters.status === 'disabled') {
        return { data: opts.cleanup ?? [], error: opts.cleanupReadError ? { message: 'cleanup query failed' } : null };
      }
      return { data: rows, error: null };
    };

    const b: Record<string, unknown> = {
      select(cols = '', _opts?: unknown) { ctx.cols = cols; return b; },
      update(patch: Record<string, unknown>) { ctx.op = 'update'; ctx.patch = patch; return b; },
      delete() { ctx.op = 'delete'; return b; },
      in() { return b; },
      order() { return b; },
      limit() { return b; },
      eq(col: string, val: unknown) { ctx.filters[col] = val; return b; },
      neq(col: string, val: unknown) { return b; },
      ilike(col: string, val: unknown) { return b; },
      maybeSingle() { return Promise.resolve(resolve()); },
      then(onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) {
        return Promise.resolve(resolve()).then(onOk, onErr);
      },
    };
    return b;
  }

  return {
    client: { from: (table: string) => builder(table) } as never,
    updates,
  };
}

const verifiedRow = (over: Partial<Row> = {}): Row => ({
  id: 'row-1',
  account_id: 'acct-1',
  domain: 'eliteelectricians.com',
  provider_domain_id: 'rsd_1',
  status: 'verified',
  verified_at: '2026-09-01T00:00:00.000Z',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  isConfigured.mockReturnValue(true);
  deleteSendingDomain.mockResolvedValue(true);
  listSendingDomains.mockResolvedValue([]);
  getAccountOwnerEmail.mockResolvedValue('owner@example.com');
  sendSendingDomainFailedEmail.mockResolvedValue(undefined);
});

describe('Custom sending domain reconciler', () => {
  it('downgrades a verified domain whose DKIM record was removed, and tells the owner once', async () => {
    getSendingDomain.mockResolvedValue({ id: 'rsd_1', name: 'eliteelectricians.com', status: 'failed', records: [] });
    const db = makeDb([verifiedRow()]);

    const summary = await runEmailSendingDomainReconcile(db.client);

    expect(summary.downgraded).toBe(1);
    expect(summary.ownersNotified).toBe(1);
    expect(summary.errors).toBe(0);
    expect(db.updates[0].patch.status).toBe('failed');
    expect(db.updates[0].patch.verified_at).toBeNull();
    expect(db.updates[0].patch.failure_reason).toMatch(/DKIM/);
    expect(sendSendingDomainFailedEmail).toHaveBeenCalledTimes(1);
  });

  it('does not re-notify on later runs, because the row is no longer verified', async () => {
    getSendingDomain.mockResolvedValue({ id: 'rsd_1', name: 'eliteelectricians.com', status: 'failed', records: [] });
    // The state the previous test left behind: already downgraded.
    const db = makeDb([verifiedRow({ status: 'failed', verified_at: null })]);

    const summary = await runEmailSendingDomainReconcile(db.client);

    expect(summary.downgraded).toBe(0);
    expect(summary.ownersNotified).toBe(0);
    expect(sendSendingDomainFailedEmail).not.toHaveBeenCalled();
  });

  it('treats a domain deleted at the provider as a downgrade, not as nothing to do', async () => {
    // getSendingDomain returns null on a 404. Skipping here would leave a row
    // marked verified while the provider refuses every send.
    getSendingDomain.mockResolvedValue(null);
    const db = makeDb([verifiedRow()]);

    const summary = await runEmailSendingDomainReconcile(db.client);

    expect(summary.downgraded).toBe(1);
    expect(db.updates[0].patch.status).toBe('failed');
    expect(db.updates[0].patch.failure_reason).toMatch(/no longer registered/i);
  });

  it('stores a provider status the column allows, never the raw provider value', async () => {
    // not_started is what Resend returns for a freshly created domain and is
    // NOT a legal value for email_sending_domains.status.
    getSendingDomain.mockResolvedValue({ id: 'rsd_1', name: 'x.com', status: 'not_started', records: [] });
    const db = makeDb([verifiedRow({ status: 'pending', verified_at: null })]);

    await runEmailSendingDomainReconcile(db.client);

    expect(db.updates[0].patch.status).toBe('pending');
    expect(['pending', 'verified', 'failed', 'disabled']).toContain(db.updates[0].patch.status);
  });

  it('counts a row that vanished mid-run instead of reporting it reconciled', async () => {
    getSendingDomain.mockResolvedValue({ id: 'rsd_1', name: 'x.com', status: 'verified', records: [] });
    const db = makeDb([verifiedRow()], { vanishing: new Set(['row-1']) });

    const summary = await runEmailSendingDomainReconcile(db.client);

    expect(summary.vanishedMidRun).toBe(1);
    expect(summary.updated).toBe(0);
    expect(summary.errors).toBe(0);
  });

  it('counts a recovery when a failed domain verifies again', async () => {
    getSendingDomain.mockResolvedValue({ id: 'rsd_1', name: 'x.com', status: 'verified', records: [] });
    const db = makeDb([verifiedRow({ status: 'failed', verified_at: null })]);

    const summary = await runEmailSendingDomainReconcile(db.client);

    expect(summary.recovered).toBe(1);
    expect(db.updates[0].patch.status).toBe('verified');
    expect(db.updates[0].patch.failure_reason).toBeNull();
    expect(db.updates[0].patch.verified_at).toBeTruthy();
  });

  it('never reports the platform domain as an orphan at the provider', async () => {
    // The Resend account holds letsgetquoted.com itself. Counting it would put a
    // permanent, meaningless orphan count on every single run.
    getSendingDomain.mockResolvedValue({ id: 'rsd_1', name: 'x.com', status: 'verified', records: [] });
    listSendingDomains.mockResolvedValue([
      { id: 'rsd_platform', name: 'letsgetquoted.com' },
      { id: 'rsd_sub', name: 'mail.letsgetquoted.com' },
      { id: 'rsd_1', name: 'eliteelectricians.com' },
      { id: 'rsd_stray', name: 'someone-elses.com' },
    ]);
    const db = makeDb([verifiedRow()]);

    const summary = await runEmailSendingDomainReconcile(db.client);

    expect(summary.orphanedAtProvider).toBe(1);
  });

  it('does not treat a failed provider listing as "everything is orphaned"', async () => {
    getSendingDomain.mockResolvedValue({ id: 'rsd_1', name: 'x.com', status: 'verified', records: [] });
    listSendingDomains.mockResolvedValue(null);
    const db = makeDb([verifiedRow()]);

    const summary = await runEmailSendingDomainReconcile(db.client);

    expect(summary.orphanedAtProvider).toBe(0);
  });

  it('still returns a summary when the provider is not configured, so the run is recorded', async () => {
    isConfigured.mockReturnValue(false);
    const db = makeDb([verifiedRow()]);

    const summary = await runEmailSendingDomainReconcile(db.client);

    expect(summary.skipped).toBe(true);
    expect(summary.checked).toBe(0);
    expect(summary.reason).toMatch(/RESEND_API_KEY/);
    expect(getSendingDomain).not.toHaveBeenCalled();
  });

  describe('the summary drives the cron health machinery', () => {
    it.each(['provider', 'database', 'read'] as const)('reports %s cleanup failure to cron health', async (failure) => {
      deleteSendingDomain.mockResolvedValue(failure !== 'provider');
      const db = makeDb([], {
        cleanup: [verifiedRow({ status: 'disabled' })],
        cleanupDeleteError: failure === 'database',
        cleanupReadError: failure === 'read',
      });
      const summary = await runEmailSendingDomainReconcile(db.client);
      expect(summary.updated).toBe(0);
      expect(summary.errors).toBe(1);
      expect(cronSummaryHasFailures(summary)).toBe(true);
    });

    it('counts only confirmed cleanup deletions', async () => {
      const db = makeDb([], { cleanup: [verifiedRow({ status: 'disabled' })] });
      const summary = await runEmailSendingDomainReconcile(db.client);
      expect(summary.updated).toBe(1);
      expect(summary.errors).toBe(0);
      expect(deleteSendingDomain).toHaveBeenCalledWith('rsd_1');
    });

    it('does not call a vanished cleanup row a successful deletion', async () => {
      const db = makeDb([], { cleanup: [verifiedRow({ status: 'disabled' })], cleanupVanished: true });
      const summary = await runEmailSendingDomainReconcile(db.client);
      expect(summary.updated).toBe(0);
      expect(summary.vanishedMidRun).toBe(1);
    });

    it('reports missing management access and unavailable inventory as unhealthy', async () => {
      isConfigured.mockReturnValue(false);
      expect(cronSummaryHasFailures(await runEmailSendingDomainReconcile(makeDb([]).client))).toBe(true);
      isConfigured.mockReturnValue(true);
      listSendingDomains.mockResolvedValue(null);
      expect(cronSummaryHasFailures(await runEmailSendingDomainReconcile(makeDb([]).client))).toBe(true);
    });

    it('reads as healthy on a clean run', async () => {
      getSendingDomain.mockResolvedValue({ id: 'rsd_1', name: 'x.com', status: 'verified', records: [] });
      const db = makeDb([verifiedRow()]);

      const summary = await runEmailSendingDomainReconcile(db.client);

      // A domain legitimately going verified is the job working, not failing.
      expect(cronSummaryHasFailures(summary as unknown as Record<string, unknown>)).toBe(false);
    });

    it('reads as failing when a domain could not be reached', async () => {
      getSendingDomain.mockRejectedValue(new Error('provider timeout'));
      const db = makeDb([verifiedRow()]);

      const summary = await runEmailSendingDomainReconcile(db.client);

      expect(summary.errors).toBe(1);
      // The `errors` key is what makes cronRoute write ok=false plus a reason.
      // Renaming it would silently turn this job's failures green.
      expect(cronSummaryHasFailures(summary as unknown as Record<string, unknown>)).toBe(true);
    });

    it('reads as failing when a downgraded owner could not be told', async () => {
      getSendingDomain.mockResolvedValue({ id: 'rsd_1', name: 'x.com', status: 'failed', records: [] });
      getAccountOwnerEmail.mockResolvedValue(null);
      const db = makeDb([verifiedRow()]);

      const summary = await runEmailSendingDomainReconcile(db.client);

      expect(summary.downgraded).toBe(1);
      expect(summary.ownersNotified).toBe(0);
      expect(cronSummaryHasFailures(summary as unknown as Record<string, unknown>)).toBe(true);
    });
  });
});
