import { beforeEach, describe, expect, it, vi } from 'vitest';
import { releaseClosureDomains, releaseProductionClosureDomain } from '@/lib/account-closure-domains';
import { processClosureJob } from '@/lib/account-closure-orchestrator';

const { removeWebsite, readEmail, removeEmail, invalidate } = vi.hoisted(() => ({
  removeWebsite: vi.fn(), readEmail: vi.fn(), removeEmail: vi.fn(), invalidate: vi.fn(),
}));
vi.mock('@/lib/vercel-domains', () => ({ removeDomainFromVercel: removeWebsite }));
vi.mock('@/lib/resend-domains', () => ({ getSendingDomain: readEmail, deleteSendingDomain: removeEmail }));
vi.mock('@/lib/cached-sites', () => ({ revalidatePublicSiteCache: invalidate }));
const website = { kind: 'website' as const, domain: 'fixture.contractor.com', bindingId: 'site-1', subdomain: 'fixture' };
const email = { kind: 'email' as const, domain: 'contractor.com', bindingId: 'email-1', providerId: 'provider-1' };

beforeEach(() => vi.clearAllMocks());

describe('account closure domain release', () => {
  it('reauthorizes every provider request and uses only captured targets', async () => {
    const admin = { rpc: vi.fn().mockResolvedValue({ data: [website, email], error: null }) };
    const release = vi.fn().mockResolvedValue(true);
    await releaseClosureDomains(admin as never, 'job', 'lease', 4, release);
    expect(admin.rpc).toHaveBeenCalledTimes(2);
    expect(release.mock.calls).toEqual([[website], [email]]);
  });

  it('stops if the lease or ownership changes between provider calls', async () => {
    const admin = { rpc: vi.fn().mockResolvedValueOnce({ data: [website, email] })
      .mockResolvedValueOnce({ error: { message: 'lease invalid' } }) };
    const release = vi.fn().mockResolvedValue(true);
    await expect(releaseClosureDomains(admin as never, 'job', 'lease', 4, release)).rejects.toThrow('lease invalid');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it.each([null, [], [{ ...email, providerId: null }], [{ ...website, domain: 'app.letsgetquoted.com' }],
    [{ ...website, domain: 'https://foreign.com/path' }]])('rejects incomplete or unsafe captured targets %j', async targets => {
    const release = vi.fn();
    const admin = { rpc: vi.fn().mockResolvedValue({ data: targets }) };
    await expect(releaseClosureDomains(admin as never, 'job', 'lease', 4, release)).rejects.toThrow();
    expect(release).not.toHaveBeenCalled();
  });

  it('does not infer success when the adapter is absent or returns false', async () => {
    const admin = { rpc: vi.fn().mockResolvedValue({ data: [website] }) };
    await expect(releaseClosureDomains(admin as never, 'job', 'lease', 4)).rejects.toThrow('not configured');
    expect(admin.rpc).not.toHaveBeenCalled();
    await expect(releaseClosureDomains(admin as never, 'job', 'lease', 4, async () => false)).rejects.toThrow('Could not release');
  });

  it('invalidates the removed website route even when Vercel cannot release it', async () => {
    removeWebsite.mockResolvedValue(false);
    expect(await releaseProductionClosureDomain(website)).toBe(false);
    expect(invalidate).toHaveBeenCalledWith({ customDomain: website.domain, subdomain: 'fixture' });
    expect(removeWebsite).toHaveBeenCalledWith(website.domain);
  });

  it('treats a confirmed absent email provider ID as released', async () => {
    readEmail.mockResolvedValue(null);
    expect(await releaseProductionClosureDomain(email)).toBe(true);
    expect(removeEmail).not.toHaveBeenCalled();
  });

  it('refuses a mismatched email provider binding and propagates inspection failure', async () => {
    readEmail.mockResolvedValue({ name: 'another-contractor.com' });
    await expect(releaseProductionClosureDomain(email)).rejects.toThrow('different domain');
    expect(removeEmail).not.toHaveBeenCalled();
    readEmail.mockRejectedValue(new Error('provider unavailable'));
    await expect(releaseProductionClosureDomain(email)).rejects.toThrow('unavailable');
  });

  it('deletes exactly the saved email ID after matching its domain', async () => {
    readEmail.mockResolvedValue({ name: email.domain }); removeEmail.mockResolvedValue(true);
    expect(await releaseProductionClosureDomain(email)).toBe(true);
    expect(removeEmail).toHaveBeenCalledWith(email.providerId);
  });
});

function closureDatabase(overrides: Record<string, unknown> = {}, failure?: string) {
  const job: Record<string, any> = {
    id: 'job', closure_subject_id: 'account', closure_state: 'processing', version: 2,
    lease_token: 'lease', lease_expires_at: new Date(Date.now() + 300_000).toISOString(),
    local_disposal_state: 'completed', domain_cleanup_state: 'pending', domain_cleanup_targets: [website, email],
    stripe_state: 'not_applicable', quickbooks_state: 'not_applicable', storage_state: 'not_applicable', auth_cleanup_state: 'not_applicable',
    ...overrides,
  };
  const rpc = vi.fn(async (fn: string, args: Record<string, any>) => {
    if (fn === 'prepare_closure_domain_cleanup') return { data: job.domain_cleanup_targets };
    if (fn === 'update_closure_job_stage') {
      if (failure === 'ack' && args.p_status === 'success') return { data: false };
      job[`${args.p_stage}_state`] = args.p_status;
      return { data: true };
    }
    if (fn === 'complete_closure_job') return { data: true };
    throw new Error(`Unexpected RPC ${fn}`);
  });
  const client = {
    rpc,
    from: vi.fn((table: string) => ({ select: () => ({ eq: () => ({ single: async () => ({
      data: table === 'accounts' ? { legal_hold: false } : { ...job },
    }) }) }) })),
  };
  return { job, rpc, client: client as never };
}

describe('closure completion gates', () => {
  it('retains both domain targets after partial provider failure and succeeds on a later retry', async () => {
    const db = closureDatabase();
    const release = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await processClosureJob(db.client, 'job', { domainRelease: release }, 'lease')).toMatchObject({ success: false, completed: false });
    expect(db.job.domain_cleanup_state).toBe('retry');
    expect(db.job.domain_cleanup_targets).toEqual([website, email]);
    expect(db.rpc.mock.calls.some(([fn]) => fn === 'complete_closure_job')).toBe(false);
    release.mockResolvedValue(true);
    expect(await processClosureJob(db.client, 'job', { domainRelease: release }, 'lease')).toMatchObject({ success: true, completed: true });
  });

  it('does not complete after losing the acknowledgement lease', async () => {
    const db = closureDatabase({}, 'ack');
    expect((await processClosureJob(db.client, 'job', { domainRelease: async () => true }, 'lease')).completed).toBe(false);
    expect(db.job.domain_cleanup_targets).toEqual([website, email]);
    expect(db.rpc.mock.calls.some(([fn]) => fn === 'complete_closure_job')).toBe(false);
  });

  it.each([
    { lease_token: 'another-worker' }, { lease_expires_at: new Date(0).toISOString() },
    { recoverable_until: new Date(Date.now() + 86400_000).toISOString() },
    { legal_hold: true }, { domain_cleanup_state: 'operator_review' },
  ])('does not release domains for an ineligible job %j', async override => {
    const db = closureDatabase(override); const release = vi.fn();
    expect((await processClosureJob(db.client, 'job', { domainRelease: release }, 'lease')).completed).toBe(false);
    expect(release).not.toHaveBeenCalled(); expect(db.rpc).not.toHaveBeenCalled();
  });
});
