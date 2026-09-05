import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyCustomDomainAction, updateSiteAction, type SiteEditableInput } from '@/app/dashboard/sites/actions';
import { verifyDomain, type DomainVerification } from '@/lib/domains';
import { removeDomainFromVercel } from '@/lib/vercel-domains';
import { requireOfficeContext } from '@/lib/auth';
import { updateSite } from '@/lib/sites';

const state = vi.hoisted(() => ({
  domain: 'www.contractor.com', conflict: false, readError: false, saved: true,
  verifiedAt: '2026-08-01T00:00:00Z' as string | null,
  writes: [] as Array<Record<string, unknown>>,
  filters: [] as Array<[string, unknown]>,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/domains', async (original) => ({ ...await original<typeof import('@/lib/domains')>(), verifyDomain: vi.fn() }));
vi.mock('@/lib/vercel-domains', () => ({ removeDomainFromVercel: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/sites', () => ({ updateSite: vi.fn(), publishSite: vi.fn(), getOrCreateSite: vi.fn() }));
vi.mock('@/lib/auth', () => ({
  requireOfficeContext: vi.fn(),
  createAdminClient: () => ({
    from: () => {
      let mutation: Record<string, unknown> | undefined;
      const filters: Array<[string, unknown]> = [];
      let conflict = false;
      const query = {
        select: () => query,
        update: (values: Record<string, unknown>) => { mutation = values; return query; },
        eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
        neq: () => { conflict = true; return query; },
        maybeSingle: async () => {
          if (state.readError && !mutation) return { data: null, error: new Error('Database unavailable') };
          if (conflict) return { data: state.conflict ? { account_id: 'other-account' } : null, error: null };
          const matches = state.saved && filters.some(([key, value]) => key === 'custom_domain' && value === state.domain);
          if (mutation) {
            state.writes.push(mutation);
            state.filters = filters;
            if (matches) state.verifiedAt = mutation.custom_domain_verified_at as string | null;
          }
          return { data: matches ? { id: 'site-1' } : null, error: null };
        },
      };
      return query;
    },
  }),
}));
const result: DomainVerification = {
  verified: true, dnsVerified: true, records: [], expectedCname: 'domains.letsgetquoted.com',
  expectedIp: '76.76.21.21', isApex: false, apexDomain: 'contractor.com', subdomain: 'www',
  sslStatus: 'issued', vercelConfigured: true, verification: [], message: 'Connected',
};
beforeEach(() => {
  vi.clearAllMocks();
  state.domain = 'www.contractor.com';
  state.conflict = false; state.readError = false; state.saved = true;
  state.verifiedAt = '2026-08-01T00:00:00Z'; state.writes = []; state.filters = [];
  vi.mocked(requireOfficeContext).mockResolvedValue({ accountId: 'account-1' } as Awaited<ReturnType<typeof requireOfficeContext>>);
  vi.mocked(verifyDomain).mockResolvedValue(result);
});

describe('custom-domain activation persistence', () => {
  it('requires settings permission and a domain saved by this account before provisioning', async () => {
    state.saved = false;
    await expect(verifyCustomDomainAction(state.domain)).rejects.toThrow('Save this custom domain');
    expect(requireOfficeContext).toHaveBeenCalledWith('settings.write');
    expect(verifyDomain).not.toHaveBeenCalled();
  });

  it('does not provision on an authorization failure', async () => {
    vi.mocked(requireOfficeContext).mockRejectedValue(new Error('Forbidden'));
    await expect(verifyCustomDomainAction(state.domain)).rejects.toThrow('Forbidden');
    expect(verifyDomain).not.toHaveBeenCalled();
  });

  it('rejects a conflict before provisioning externally', async () => {
    state.conflict = true;
    await expect(verifyCustomDomainAction(state.domain)).rejects.toThrow('another account');
    expect(verifyDomain).not.toHaveBeenCalled();
  });

  it('fails closed when ownership lookup fails', async () => {
    state.readError = true;
    await expect(verifyCustomDomainAction(state.domain)).rejects.toThrow('Database unavailable');
    expect(verifyDomain).not.toHaveBeenCalled();
  });

  it.each(['pending', 'error', 'unconfigured'] as const)('clears stale verification when SSL is %s', async (sslStatus) => {
    vi.mocked(verifyDomain).mockResolvedValue({ ...result, verified: false, sslStatus });
    const checked = await verifyCustomDomainAction(state.domain);
    expect(checked.verifiedAt).toBeNull();
    expect(state.verifiedAt).toBeNull();
    expect(state.writes).toEqual([{ custom_domain_verified_at: null }]);
  });

  it('does not persist a DNS-only legacy success', async () => {
    vi.mocked(verifyDomain).mockResolvedValue({ ...result, verified: true, sslStatus: 'pending' });
    expect(await verifyCustomDomainAction(state.domain)).toMatchObject({ verified: false, verifiedAt: null });
  });

  it('persists and returns verification only for the exact account/site/domain', async () => {
    const checked = await verifyCustomDomainAction(state.domain);
    expect(checked.verifiedAt).toEqual(expect.any(String));
    expect(state.verifiedAt).toBe(checked.verifiedAt);
    expect(state.filters).toEqual([['id', 'site-1'], ['account_id', 'account-1'], ['custom_domain', 'www.contractor.com']]);
    expect(state.writes[0]).not.toHaveProperty('custom_domain');
  });

  it('does not resurrect a domain changed while the network check was in flight', async () => {
    vi.mocked(verifyDomain).mockImplementation(async () => {
      state.domain = 'new.contractor.com'; state.verifiedAt = null;
      return result;
    });
    await expect(verifyCustomDomainAction('www.contractor.com')).rejects.toThrow('domain changed during verification');
    expect(state.domain).toBe('new.contractor.com');
    expect(state.verifiedAt).toBeNull();
  });

  it('keeps the old binding when saving a replacement fails', async () => {
    const query = { select: () => query, eq: () => query, limit: async () => ({ data: [{ id: 'site-1', custom_domain: state.domain, content: {}, published: false }] }) };
    vi.mocked(requireOfficeContext).mockResolvedValue({ accountId: 'account-1', supabase: { from: () => query } } as unknown as Awaited<ReturnType<typeof requireOfficeContext>>);
    vi.mocked(updateSite).mockRejectedValue(new Error('Save failed'));
    await expect(updateSiteAction({ custom_domain: 'replacement.contractor.com', content: {} } as SiteEditableInput)).rejects.toThrow('Save failed');
    expect(removeDomainFromVercel).not.toHaveBeenCalled();
  });
});
