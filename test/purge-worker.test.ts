import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The purge worker, behind the daily `purge-expired` cron.
 *
 * It is the only code in the product that destroys data permanently: it hard
 * deletes rows whose 30-day trash window has expired, removes their quarantined
 * storage files, and finalises closed accounts. Nothing it deletes comes back,
 * and until now neither the route nor the worker executed under any test.
 *
 * So the cases here are the ones where a wrong answer is unrecoverable: a legal
 * hold that must stop a deletion, a delete that must be narrowed to one account,
 * an entity type that must not resolve to somebody else's table, and a failure
 * on one item that must not leave the rest of the batch locked.
 */

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  recordTenantAuditEvent: vi.fn(),
  claimClosureJob: vi.fn(),
  processClosureJob: vi.fn(),
  buildProductionClosureAdapters: vi.fn(),
  storageRemove: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ createAdminClient: () => admin }));
vi.mock('@/lib/tenant-audit', () => ({ recordTenantAuditEvent: mocks.recordTenantAuditEvent }));
vi.mock('@/lib/account-closure-orchestrator', () => ({
  claimClosureJob: mocks.claimClosureJob,
  processClosureJob: mocks.processClosureJob,
  buildProductionClosureAdapters: mocks.buildProductionClosureAdapters,
}));

import { runPurgeWorker } from '@/lib/purge-worker';

type Write = {
  table: string;
  op: 'select' | 'update' | 'delete';
  patch?: Record<string, unknown>;
  filters: [string, unknown][];
};

let writes: Write[];
let rows: Record<string, unknown>;
let storageRemovals: { bucket: string; paths: string[] }[];

const admin = {
  rpc: (...args: unknown[]) => mocks.rpc(...args),
  storage: {
    from: (bucket: string) => ({
      remove: async (paths: string[]) => {
        storageRemovals.push({ bucket, paths });
        return mocks.storageRemove(bucket, paths);
      },
    }),
  },
  from: (table: string) => {
    const entry: Write = { table, op: 'select', filters: [] };
    const chain: any = {
      select: () => {
        entry.op = 'select';
        writes.push(entry);
        return chain;
      },
      update: (patch: Record<string, unknown>) => {
        entry.op = 'update';
        entry.patch = patch;
        writes.push(entry);
        return chain;
      },
      delete: () => {
        entry.op = 'delete';
        writes.push(entry);
        return chain;
      },
      eq: (column: string, value: unknown) => {
        entry.filters.push([column, value]);
        return Object.assign(Promise.resolve({ data: null, error: null }), chain);
      },
      single: async () => ({ data: rows[table] ?? null, error: null }),
      maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
    };
    return chain;
  },
};

function claimed(overrides: Record<string, unknown> = {}) {
  return {
    id: 'deletion-1',
    account_id: 'workspace-a',
    entity_type: 'lead',
    entity_id: 'lead-1',
    storage_manifest: [],
    ...overrides,
  };
}

const deletesOf = (table?: string) =>
  writes.filter((write) => write.op === 'delete' && (table === undefined || write.table === table));
const updatesOf = (table: string) => writes.filter((write) => write.op === 'update' && write.table === table);

beforeEach(() => {
  vi.clearAllMocks();
  writes = [];
  storageRemovals = [];
  rows = { accounts: { legal_hold: false } };
  mocks.rpc.mockResolvedValue({ data: [], error: null });
  mocks.recordTenantAuditEvent.mockResolvedValue('audit-1');
  mocks.claimClosureJob.mockResolvedValue(null);
  mocks.processClosureJob.mockResolvedValue({ success: true, completed: true, errors: [] });
  mocks.buildProductionClosureAdapters.mockReturnValue({});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('claiming the batch', () => {
  it('asks for a bounded batch, and honours a caller-chosen size', async () => {
    await runPurgeWorker();
    expect(mocks.rpc).toHaveBeenCalledWith('claim_recoverable_deletions_for_purge', { p_batch_size: 50 });

    mocks.rpc.mockClear();
    await runPurgeWorker(5);
    expect(mocks.rpc).toHaveBeenCalledWith('claim_recoverable_deletions_for_purge', { p_batch_size: 5 });
  });

  it('reports a claim failure instead of returning a clean run', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'lock timeout' } });

    const result = await runPurgeWorker();

    // A silent zero here reads as "nothing to purge" on the health page.
    expect(result.errors).toContainEqual(expect.stringContaining('lock timeout'));
    expect(result.purgedDeletionsCount).toBe(0);
    expect(deletesOf()).toEqual([]);
  });

  it('does nothing, and says nothing failed, when there is nothing to purge', async () => {
    const result = await runPurgeWorker();

    expect(result).toEqual({ purgedDeletionsCount: 0, processedClosureJobsCount: 0, errors: [] });
    expect(deletesOf()).toEqual([]);
  });
});

describe('legal hold', () => {
  beforeEach(() => {
    mocks.rpc.mockResolvedValue({ data: [claimed()], error: null });
  });

  it('destroys nothing for an account under legal hold', async () => {
    rows.accounts = { legal_hold: true };

    const result = await runPurgeWorker();

    expect(deletesOf()).toEqual([]);
    expect(storageRemovals).toEqual([]);
    expect(mocks.recordTenantAuditEvent).not.toHaveBeenCalled();
    expect(result.purgedDeletionsCount).toBe(0);
  });

  it('releases the claim and marks the hold, so the item is neither purged nor stuck', async () => {
    rows.accounts = { legal_hold: true };

    await runPurgeWorker();

    const [release] = updatesOf('recoverable_deletions');
    expect(release.patch).toEqual({ purge_locked: false, legal_hold: true });
    expect(release.filters).toContainEqual(['id', 'deletion-1']);
  });

  it('re-reads the hold from the account itself rather than trusting the claimed row', async () => {
    rows.accounts = { legal_hold: true };
    mocks.rpc.mockResolvedValue({ data: [claimed({ legal_hold: false })], error: null });

    await runPurgeWorker();

    const accountRead = writes.find((write) => write.table === 'accounts');
    expect(accountRead?.filters).toContainEqual(['id', 'workspace-a']);
    expect(deletesOf()).toEqual([]);
  });

  it('proceeds when the hold is off', async () => {
    rows.accounts = { legal_hold: false };

    const result = await runPurgeWorker();

    expect(result.purgedDeletionsCount).toBe(1);
    expect(deletesOf('leads')).toHaveLength(1);
  });
});

describe('destroying one expired item', () => {
  it('narrows the delete to the owning account as well as the row', async () => {
    mocks.rpc.mockResolvedValue({ data: [claimed()], error: null });

    await runPurgeWorker();

    const [remove] = deletesOf('leads');
    // Without the account filter this deletes by id alone, across tenants.
    expect(remove.filters).toContainEqual(['account_id', 'workspace-a']);
    expect(remove.filters).toContainEqual(['id', 'lead-1']);
  });

  it.each([
    ['lead', 'leads'],
    ['crew', 'crew'],
    ['service', 'services'],
    ['job', 'jobs'],
    ['attachment', 'account_attachments'],
  ])('deletes a %s from %s and from no other table', async (entityType, table) => {
    mocks.rpc.mockResolvedValue({ data: [claimed({ entity_type: entityType, entity_id: 'entity-1' })], error: null });

    await runPurgeWorker();

    expect(deletesOf().map((write) => write.table)).toEqual([table]);
  });

  it('refuses an entity type it does not recognise, and deletes nothing', async () => {
    mocks.rpc.mockResolvedValue({ data: [claimed({ entity_type: 'invoice' })], error: null });

    const result = await runPurgeWorker();

    expect(deletesOf()).toEqual([]);
    expect(result.purgedDeletionsCount).toBe(0);
    expect(result.errors.join(' ')).toContain('Unsupported entity type');
  });

  it('removes the quarantined files before the row they belong to', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        claimed({
          storage_manifest: [
            { bucket: 'lead-photos', path: 'workspace-a/lead-1/one.jpg' },
            { bucket: 'account-attachments', path: 'workspace-a/two.pdf' },
          ],
        }),
      ],
      error: null,
    });

    await runPurgeWorker();

    expect(storageRemovals).toEqual([
      { bucket: 'lead-photos', paths: ['workspace-a/lead-1/one.jpg'] },
      { bucket: 'account-attachments', paths: ['workspace-a/two.pdf'] },
    ]);
    expect(deletesOf('leads')).toHaveLength(1);
  });

  it('skips a manifest entry missing its bucket or path rather than guessing', async () => {
    mocks.rpc.mockResolvedValue({
      data: [claimed({ storage_manifest: [{ bucket: 'lead-photos' }, { path: 'orphan.jpg' }, {}] })],
      error: null,
    });

    await runPurgeWorker();

    expect(storageRemovals).toEqual([]);
    expect(deletesOf('leads')).toHaveLength(1);
  });

  it('still deletes the row when storage removal throws', async () => {
    mocks.rpc.mockResolvedValue({
      data: [claimed({ storage_manifest: [{ bucket: 'lead-photos', path: 'gone.jpg' }] })],
      error: null,
    });
    mocks.storageRemove.mockRejectedValue(new Error('bucket unavailable'));

    const result = await runPurgeWorker();

    // The row is the record of the data; an orphaned file is the lesser problem
    // and is visible in the log.
    expect(deletesOf('leads')).toHaveLength(1);
    expect(result.purgedDeletionsCount).toBe(1);
  });

  it('marks the manifest row purged and releases its lock', async () => {
    mocks.rpc.mockResolvedValue({ data: [claimed()], error: null });

    await runPurgeWorker();

    const [mark] = updatesOf('recoverable_deletions');
    expect(mark.patch).toMatchObject({ status: 'purged', purge_locked: false });
    expect(mark.patch?.updated_at).toEqual(expect.any(String));
  });

  it('writes an audit event naming the cron as the actor', async () => {
    mocks.rpc.mockResolvedValue({ data: [claimed()], error: null });

    await runPurgeWorker();

    expect(mocks.recordTenantAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'workspace-a',
        entityType: 'lead',
        entityId: 'lead-1',
        action: 'lead.purged',
        source: 'cron',
        deleteOperationId: 'deletion-1',
        actor: { role: 'system_cron', authType: 'service_role' },
      }),
    );
  });
});

describe('a batch where one item fails', () => {
  it('releases the failed item lock and carries on with the rest', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        claimed({ id: 'deletion-1', entity_type: 'invoice' }),
        claimed({ id: 'deletion-2', entity_id: 'lead-2' }),
      ],
      error: null,
    });

    const result = await runPurgeWorker();

    expect(result.purgedDeletionsCount).toBe(1);
    expect(result.errors).toHaveLength(1);
    // The failed item must not stay locked, or it can never be retried.
    const release = updatesOf('recoverable_deletions').find(
      (write) => write.filters.some(([, value]) => value === 'deletion-1'),
    );
    expect(release?.patch).toEqual({ purge_locked: false });
  });

  it('names the item in the error it reports', async () => {
    mocks.rpc.mockResolvedValue({ data: [claimed({ id: 'deletion-7', entity_type: 'invoice' })], error: null });

    const result = await runPurgeWorker();

    expect(result.errors[0]).toContain('deletion-7');
  });

  it('counts every item it did destroy', async () => {
    mocks.rpc.mockResolvedValue({
      data: [claimed({ id: 'd1', entity_id: 'lead-1' }), claimed({ id: 'd2', entity_id: 'lead-2' }), claimed({ id: 'd3', entity_id: 'lead-3' })],
      error: null,
    });

    const result = await runPurgeWorker();

    expect(result.purgedDeletionsCount).toBe(3);
    expect(deletesOf('leads')).toHaveLength(3);
    expect(result.errors).toEqual([]);
  });
});

describe('the account closure half of the run', () => {
  it('claims a job with its own lease token and a ten-minute lease', async () => {
    mocks.claimClosureJob.mockResolvedValue({ id: 'closure-1' });

    await runPurgeWorker();

    expect(mocks.claimClosureJob).toHaveBeenCalledWith(admin, expect.any(String), 600);
    const [, leaseToken] = mocks.claimClosureJob.mock.calls[0];
    // The same token has to reach processClosureJob, or the lease it holds is
    // not the lease it releases.
    expect(mocks.processClosureJob).toHaveBeenCalledWith(admin, 'closure-1', expect.anything(), leaseToken);
  });

  it('counts a completed closure, and nothing when there was no job to claim', async () => {
    mocks.claimClosureJob.mockResolvedValue({ id: 'closure-1' });
    await expect(runPurgeWorker()).resolves.toMatchObject({ processedClosureJobsCount: 1 });

    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    mocks.claimClosureJob.mockResolvedValue(null);
    await expect(runPurgeWorker()).resolves.toMatchObject({ processedClosureJobsCount: 0 });
    expect(mocks.processClosureJob).not.toHaveBeenCalled();
  });

  it('does not count a job that ran without completing', async () => {
    mocks.claimClosureJob.mockResolvedValue({ id: 'closure-1' });
    mocks.processClosureJob.mockResolvedValue({ success: false, completed: false, errors: ['stripe unreachable'] });

    const result = await runPurgeWorker();

    expect(result.processedClosureJobsCount).toBe(0);
    expect(result.errors).toContain('stripe unreachable');
  });

  it('reports a thrown closure error without losing the deletions it already made', async () => {
    mocks.rpc.mockResolvedValue({ data: [claimed()], error: null });
    mocks.claimClosureJob.mockRejectedValue(new Error('lease table missing'));

    const result = await runPurgeWorker();

    expect(result.purgedDeletionsCount).toBe(1);
    expect(result.errors.join(' ')).toContain('lease table missing');
  });

  it('runs the closure half even when the deletions half failed to claim', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'lock timeout' } });
    mocks.claimClosureJob.mockResolvedValue({ id: 'closure-1' });

    const result = await runPurgeWorker();

    expect(result.processedClosureJobsCount).toBe(1);
    expect(result.errors.join(' ')).toContain('lock timeout');
  });
});

/**
 * The route's POST handler checks `CRON_SECRET` itself rather than going through
 * `cronRoute`, so its authorisation is a second, hand-rolled copy. A copy that
 * drifts is how an endpoint that permanently deletes data ends up reachable.
 */
describe('POST /api/cron/purge-expired', () => {
  const post = (headers: Record<string, string> = {}) =>
    new Request('https://app.letsgetquoted.com/api/cron/purge-expired', { method: 'POST', headers });

  let POST: (req: any) => Promise<Response>;

  beforeEach(async () => {
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');
    ({ POST } = await import('@/app/api/cron/purge-expired/route'));
  });

  it('refuses a request with no authorization header, and purges nothing', async () => {
    const response = await POST(post());

    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['the wrong secret', { authorization: 'Bearer not-the-secret' }],
    ['a bare secret with no scheme', { authorization: 'test-cron-secret' }],
    ['the wrong scheme', { authorization: 'Basic test-cron-secret' }],
    ['an empty bearer', { authorization: 'Bearer ' }],
  ])('refuses %s', async (_label, headers) => {
    const response = await POST(post(headers));

    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('refuses every request when no secret is configured, rather than letting all of them through', async () => {
    vi.stubEnv('CRON_SECRET', '');

    const response = await POST(post({ authorization: 'Bearer ' }));

    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('runs the worker and reports its counts for a correctly signed request', async () => {
    mocks.rpc.mockResolvedValue({ data: [claimed()], error: null });

    const response = await POST(post({ authorization: 'Bearer test-cron-secret' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, purgedDeletionsCount: 1, processedClosureJobsCount: 0 });
  });

  /**
   * The worker catches its own per-item failures and returns them, so a broken
   * claim function comes back as a populated `errors` array rather than a
   * throw. This route used to answer `ok: true` regardless, which reported a
   * run that purged nothing and errored on everything as a success.
   */
  it('reports not-ok when the worker collected errors', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'claim function missing' } });

    const response = await POST(post({ authorization: 'Bearer test-cron-secret' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.errors.join(' ')).toContain('claim function missing');
  });

  it('reports ok on a run that collected nothing to complain about', async () => {
    const response = await POST(post({ authorization: 'Bearer test-cron-secret' }));

    expect((await response.json())).toMatchObject({ ok: true, errors: [] });
  });
})
