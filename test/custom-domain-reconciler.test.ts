import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cronSummaryHasFailures } from '@/lib/cron-jobs';

/**
 * The reconciler exists for the gap between "DNS is right" and "the certificate
 * exists": the contractor did everything correctly, closed the tab, and the
 * domain went live with nothing to notice it.
 *
 * The two properties worth defending here are the ones a careless later edit
 * would break: it must never clear a stamp (that is a live website going dark),
 * and it must never stamp a domain the owner replaced while a slow check was in
 * flight.
 */

const verifyDomain = vi.fn();
const listProjectDomains = vi.fn();
const isConfigured = vi.fn(() => true);
const sendCustomDomainConnectedEmail = vi.fn(async (..._args: unknown[]): Promise<string> => 'provider-1');
const getAccountOwnerEmail = vi.fn(async (..._args: unknown[]): Promise<string | null> => 'owner@example.com');
const revalidatePublicSiteCache = vi.fn();

vi.mock('@/lib/domains', () => ({
  verifyDomain: (...a: unknown[]) => verifyDomain(...a),
}));

vi.mock('@/lib/vercel-domains', () => ({
  isVercelDomainProvisioningConfigured: () => isConfigured(),
  listProjectDomains: (...a: unknown[]) => listProjectDomains(...a),
  removeDomainFromVercel: vi.fn(async () => true),
}));

vi.mock('@/lib/email', () => ({
  sendCustomDomainConnectedEmail: (...a: unknown[]) => sendCustomDomainConnectedEmail(...a),
  getAccountOwnerEmail: (...a: unknown[]) => getAccountOwnerEmail(...a),
}));

vi.mock('@/lib/cached-sites', () => ({
  revalidatePublicSiteCache: (...a: unknown[]) => revalidatePublicSiteCache(...a),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => {
    throw new Error('the worker must use the injected client in tests');
  },
}));

const { runCustomDomainReconcile } = await import('@/lib/custom-domain-reconciler');

type Row = {
  id: string;
  account_id: string;
  custom_domain: string | null;
  subdomain: string | null;
  company_name: string | null;
  custom_domain_verified_at?: string;
};

const pendingRow = (over: Partial<Row> = {}): Row => ({
  id: 'site-1',
  account_id: 'acct-1',
  custom_domain: 'www.eliteelectricians.com',
  subdomain: 'elite-electricians',
  company_name: 'Elite Electricians',
  ...over,
});

const connected = {
  verified: true,
  sslStatus: 'issued' as const,
  dnsVerified: true,
  message: 'Custom domain connected with active SSL.',
};
const stillProvisioning = {
  verified: false,
  sslStatus: 'pending' as const,
  dnsVerified: true,
  message: 'DNS is ready, but a secure connection is not available yet.',
};

/**
 * Records every filter and patch the worker applies, and can make a row vanish
 * mid-run the way a concurrent disconnect would.
 */
function makeDb(rows: Row[], opts: { vanishing?: Set<string>; claimed?: string[]; prepareFails?: boolean; finishFails?: boolean } = {}) {
  const updates: Array<{ patch: Record<string, unknown>; filters: Record<string, unknown>; nullFilters: string[] }> = [];
  const selects: Array<{ cols: string; nullFilters: string[]; notNull: string[] }> = [];
  const notices: Array<Record<string, any>> = [];
  const rpc = vi.fn(async (name: string, params: Record<string, any>) => {
    if (name === 'claim_website_domain_connection_notices') {
      for (const n of notices) if (n.state === 'sending' && n.expired) { n.state = 'manual_review'; n.last_error = 'send_outcome_unknown'; }
      const pending = notices.filter(n => n.state === 'pending').slice(0,5);
      for (const n of pending) { n.state = 'sending'; n.attempted_at = new Date().toISOString(); }
      return { data: pending.map(n => ({ ...n })), error: null };
    }
    const n = notices.find(n => n.id === params.p_id);
    if (name === 'prepare_website_domain_connection_notice') {
      if (opts.prepareFails) return { data: false, error: null };
      if (n) n.recipient = params.p_recipient;
      return { data: true, error: null };
    }
    if (name === 'finish_website_domain_connection_notice') {
      if (opts.finishFails && params.p_provider_id) return { data: false, error: { message: 'unavailable' } };
      if (n) Object.assign(n, params.p_provider_id ? { state: 'accepted', provider_id: params.p_provider_id }
        : { state: 'manual_review', last_error: params.p_error });
      return { data: true, error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  });

  function builder(table: string) {
    const ctx = {
      table,
      op: 'select' as 'select' | 'update',
      cols: '',
      filters: {} as Record<string, unknown>,
      nullFilters: [] as string[],
      notNull: [] as string[],
      patch: null as Record<string, unknown> | null,
    };

    const resolve = () => {
      if (table === 'website_domain_connection_notices') {
        const matches = notices.filter(n => Object.entries(ctx.filters).every(([k,v]) => n[k] === v));
        return { data: matches, count: matches.length, error: null };
      }
      if (ctx.cols === 'company_name') return { data: rows.find(r => r.id === ctx.filters.id) ?? null, error: null };
      if (ctx.op === 'update') {
        updates.push({ patch: ctx.patch ?? {}, filters: ctx.filters, nullFilters: ctx.nullFilters });
        const id = String(ctx.filters.id);
        if (opts.vanishing?.has(id)) return { data: null, error: null };
        const site = rows.find(r => r.id === id);
        if (site) {
          site.custom_domain_verified_at = ctx.patch?.custom_domain_verified_at as string;
          notices.push({ id: `notice-${id}`, account_id: site.account_id, site_id: site.id, domain: site.custom_domain, state: 'pending' });
        }
        return { data: { id }, error: null };
      }
      selects.push({ cols: ctx.cols, nullFilters: ctx.nullFilters, notNull: ctx.notNull });
      // The orphan sweep's read: every claimed domain, no other columns.
      if (ctx.cols.trim() === 'custom_domain') {
        const claimed = opts.claimed ?? rows.map((r) => r.custom_domain);
        return { data: claimed.map((custom_domain) => ({ custom_domain })), error: null };
      }
      return { data: rows.filter(r => !r.custom_domain_verified_at), error: null };
    };

    const b: Record<string, unknown> = {
      select(cols = '') { ctx.cols = cols; return b; },
      update(patch: Record<string, unknown>) { ctx.op = 'update'; ctx.patch = patch; return b; },
      eq(col: string, val: unknown) { ctx.filters[col] = val; return b; },
      is(col: string, val: unknown) { if (val === null) ctx.nullFilters.push(col); return b; },
      not(col: string, _op: string, val: unknown) { if (val === null) ctx.notNull.push(col); return b; },
      gte(col: string, val: unknown) { ctx.filters[`gte:${col}`] = val; return b; },
      order() { return b; },
      limit() { return b; },
      maybeSingle() { return Promise.resolve(resolve()); },
      then(onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) {
        return Promise.resolve(resolve()).then(onOk, onErr);
      },
    };
    return b;
  }

  return { client: { from: (table: string) => builder(table), rpc } as never, updates, selects, notices, rpc };
}

beforeEach(() => {
  vi.clearAllMocks();
  isConfigured.mockReturnValue(true);
  listProjectDomains.mockResolvedValue([]);
  getAccountOwnerEmail.mockResolvedValue('owner@example.com');
  sendCustomDomainConnectedEmail.mockResolvedValue('provider-1');
});

describe('Custom domain certificate reconciler', () => {
  it('retains a failed notification on later runs even though the site is already connected', async () => {
    verifyDomain.mockResolvedValue(connected); sendCustomDomainConnectedEmail.mockRejectedValueOnce(new Error('timeout'));
    const db = makeDb([pendingRow()]);
    await runCustomDomainReconcile(db.client);
    const later = await runCustomDomainReconcile(db.client);
    expect(later.checked).toBe(0); expect(later.notificationReviews).toBe(1); expect(later.errors).toBe(1);
    expect(db.notices[0].last_error).toBe('send_failed_or_outcome_unknown');
    expect(sendCustomDomainConnectedEmail).toHaveBeenCalledTimes(1);
  });
  it('stops before provider submission when notice preparation fails', async () => {
    verifyDomain.mockResolvedValue(connected); const db = makeDb([pendingRow()], { prepareFails: true });
    expect((await runCustomDomainReconcile(db.client)).notificationReviews).toBe(1);
    expect(db.notices[0].last_error).toBe('notice_prepare_failed'); expect(sendCustomDomainConnectedEmail).not.toHaveBeenCalled();
  });
  it('never resends after provider acceptance could not be saved', async () => {
    verifyDomain.mockResolvedValue(connected); const db = makeDb([pendingRow()], { finishFails: true });
    await expect(runCustomDomainReconcile(db.client)).rejects.toThrow('persist');
    db.notices[0].expired = true;
    expect((await runCustomDomainReconcile(db.client)).notificationReviews).toBe(1);
    expect(sendCustomDomainConnectedEmail).toHaveBeenCalledTimes(1);
  });
  it('continues to report notice incidents when domain provisioning credentials disappear', async () => {
    verifyDomain.mockResolvedValue(connected); getAccountOwnerEmail.mockResolvedValueOnce(null);
    const db = makeDb([pendingRow()]); await runCustomDomainReconcile(db.client); isConfigured.mockReturnValue(false);
    const later = await runCustomDomainReconcile(db.client);
    expect(later.notificationReviews).toBe(1); expect(cronSummaryHasFailures(later)).toBe(true);
  });
  it('processes already queued notices without domain provisioning credentials and does not label that work skipped', async () => {
    const db = makeDb([pendingRow()]);
    db.notices.push({ id: 'notice-existing', account_id: 'acct-1', site_id: 'site-1', domain: 'www.eliteelectricians.com', state: 'pending' });
    isConfigured.mockReturnValue(false);
    const result = await runCustomDomainReconcile(db.client);
    expect(result.ownersNotified).toBe(1); expect(result.skipped).toBeUndefined(); expect(verifyDomain).not.toHaveBeenCalled();
  });
  it('stamps a domain whose certificate finished, and tells the owner it is connected', async () => {
    verifyDomain.mockResolvedValue(connected);
    const db = makeDb([pendingRow()]);

    const summary = await runCustomDomainReconcile(db.client);

    expect(summary.connected).toBe(1);
    expect(summary.stillPending).toBe(0);
    expect(summary.ownersNotified).toBe(1);
    expect(summary.errors).toBe(0);
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0].patch.custom_domain_verified_at).toEqual(expect.any(String));
    expect(db.updates[0].patch.custom_domain_notice_requested_at).toBe(db.updates[0].patch.custom_domain_verified_at);
    expect(sendCustomDomainConnectedEmail).toHaveBeenCalledTimes(1);
    expect(sendCustomDomainConnectedEmail.mock.calls[0][0]).toMatchObject({
      recipientEmail: 'owner@example.com',
      domain: 'www.eliteelectricians.com',
      siteUrl: 'https://www.eliteelectricians.com',
    });
    // Cached per host: without this the domain keeps serving the not-found it
    // was cached with while it was still unverified.
    expect(revalidatePublicSiteCache).toHaveBeenCalledWith({
      subdomain: 'elite-electricians',
      customDomain: 'www.eliteelectricians.com',
    });
  });

  it('leaves a still-provisioning domain alone and writes nothing', async () => {
    verifyDomain.mockResolvedValue(stillProvisioning);
    const db = makeDb([pendingRow()]);

    const summary = await runCustomDomainReconcile(db.client);

    expect(summary.stillPending).toBe(1);
    expect(summary.connected).toBe(0);
    expect(db.updates).toHaveLength(0);
    expect(sendCustomDomainConnectedEmail).not.toHaveBeenCalled();
  });

  // Vercel reports `verified` for ownership, which is not the same as a
  // certificate existing. Promoting on that alone is the original defect.
  it('refuses to promote on ownership verification without an issued certificate', async () => {
    verifyDomain.mockResolvedValue({ ...stillProvisioning, verified: true, sslStatus: 'pending' });
    const db = makeDb([pendingRow()]);

    const summary = await runCustomDomainReconcile(db.client);

    expect(summary.connected).toBe(0);
    expect(db.updates).toHaveLength(0);
  });

  it('only ever reads rows that are pending, so a live domain can never be demoted', async () => {
    verifyDomain.mockResolvedValue(connected);
    const db = makeDb([pendingRow()]);

    await runCustomDomainReconcile(db.client);

    const rowRead = db.selects[0];
    expect(rowRead.nullFilters).toContain('custom_domain_verified_at');
    expect(rowRead.notNull).toContain('custom_domain');
    // Nothing this worker writes may clear the stamp.
    for (const update of db.updates) {
      expect(update.patch.custom_domain_verified_at).not.toBeNull();
    }
  });

  it('cannot stamp a domain the owner replaced while the check was running', async () => {
    verifyDomain.mockResolvedValue(connected);
    const db = makeDb([pendingRow()], { vanishing: new Set(['site-1']) });

    const summary = await runCustomDomainReconcile(db.client);

    expect(summary.vanishedMidRun).toBe(1);
    expect(summary.connected).toBe(0);
    expect(sendCustomDomainConnectedEmail).not.toHaveBeenCalled();
    // The write is tied to the account and the exact domain, not just the id.
    expect(db.updates[0].filters).toMatchObject({
      id: 'site-1',
      account_id: 'acct-1',
      custom_domain: 'www.eliteelectricians.com',
    });
    expect(db.updates[0].nullFilters).toContain('custom_domain_verified_at');
  });

  it('counts a connected domain nobody could be told about as an error', async () => {
    verifyDomain.mockResolvedValue(connected);
    getAccountOwnerEmail.mockResolvedValue(null);
    const db = makeDb([pendingRow()]);

    const summary = await runCustomDomainReconcile(db.client);

    expect(summary.connected).toBe(1);
    expect(summary.ownersNotified).toBe(0);
    expect(summary.errors).toBe(1);
    expect(cronSummaryHasFailures(summary as unknown as Record<string, unknown>)).toBe(true);
  });

  it('keeps going when one domain throws, and reports the failure', async () => {
    verifyDomain
      .mockRejectedValueOnce(new Error('provider timeout'))
      .mockResolvedValueOnce(connected);
    const db = makeDb([pendingRow(), pendingRow({ id: 'site-2', custom_domain: 'www.midwestglass.com' })]);

    const summary = await runCustomDomainReconcile(db.client);

    expect(summary.checked).toBe(2);
    expect(summary.errors).toBe(1);
    expect(summary.connected).toBe(1);
  });

  it('skips with a reason when the provider credentials are absent', async () => {
    isConfigured.mockReturnValue(false);
    const db = makeDb([pendingRow()]);

    const summary = await runCustomDomainReconcile(db.client);

    expect(summary.skipped).toBe(true);
    expect(summary.reason).toMatch(/VERCEL/);
    expect(summary.checked).toBe(0);
    expect(verifyDomain).not.toHaveBeenCalled();
    // A skipped run is not a failed one; the health page must not cry wolf.
    expect(cronSummaryHasFailures(summary as unknown as Record<string, unknown>)).toBe(false);
  });

  describe('orphan sweep', () => {
    it('reports a binding with no site row behind it, and deletes nothing', async () => {
      verifyDomain.mockResolvedValue(stillProvisioning);
      listProjectDomains.mockResolvedValue(['www.eliteelectricians.com', 'www.deletedcustomer.com']);
      const db = makeDb([pendingRow()], { claimed: ['www.eliteelectricians.com'] });

      const summary = await runCustomDomainReconcile(db.client);

      expect(summary.orphanedAtProject).toBe(1);
      // An orphan is a standing condition for a human to clear, not a failed
      // run — grading it as a failure would leave the job permanently red.
      expect(cronSummaryHasFailures(summary as unknown as Record<string, unknown>)).toBe(false);
    });

    it('never counts the platform domain or a preview host as an orphan', async () => {
      verifyDomain.mockResolvedValue(stillProvisioning);
      listProjectDomains.mockResolvedValue([
        'letsgetquoted.com',
        'www.letsgetquoted.com',
        'domains.letsgetquoted.com',
        'lgq-web-git-main.vercel.app',
      ]);
      const db = makeDb([pendingRow()], { claimed: [] });

      const summary = await runCustomDomainReconcile(db.client);

      expect(summary.orphanedAtProject).toBe(0);
    });
  });
});
