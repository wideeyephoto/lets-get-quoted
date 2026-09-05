import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isValidDomainFormat, checkCustomDomainDnsStatus } from '@/lib/website-domain-manager';
import { verifyDomain, type DomainVerification } from '@/lib/domains';
import { resolveTenantHost } from '@/lib/tenant-host';

vi.mock('@/lib/domains', () => ({ verifyDomain: vi.fn() }));
const pending: DomainVerification = {
  verified: false, dnsVerified: false, records: [], expectedCname: 'domains.letsgetquoted.com',
  expectedIp: '76.76.21.21', isApex: true, apexDomain: 'austinroofingpro.com', subdomain: null,
  sslStatus: 'pending', vercelConfigured: true, verification: [], message: 'Pending',
};
beforeEach(() => { vi.mocked(verifyDomain).mockReset().mockResolvedValue(pending); });

describe('Custom-Domain Lifecycle & Tenant Isolation', () => {
  it.each(['austinroofingpro.com', 'estimates.proplumber.com', 'clean-coat-painting.co', 'texas-hvac.build'])('accepts domain format %s', (domain) => {
    expect(isValidDomainFormat(domain)).toBe(true);
  });
  it.each(['', 'invalid_domain', 'http://austinroofingpro.com', 'austinroofingpro.com/path', '-leadinghyphen.com', 'trailinghyphen-.com', 'a'.repeat(255) + '.com'])('rejects invalid format %s', (domain) => {
    expect(isValidDomainFormat(domain)).toBe(false);
  });

  it('reports missing apex DNS and pending SSL without fabricating verification', async () => {
    const status = await checkCustomDomainDnsStatus('austinroofingpro.com', 'acc_123');
    expect(status).toMatchObject({ isConfigured: false, sslStatus: 'pending', dnsRecords: [{ type: 'A', name: '@', value: '76.76.21.21', status: 'missing' }] });
    expect(status.verifiedAt).toBeUndefined();
    expect(verifyDomain).toHaveBeenCalledWith('austinroofingpro.com', { provision: false });
  });

  it('reports a checked subdomain and current CNAME recommendation', async () => {
    vi.mocked(verifyDomain).mockResolvedValue({ ...pending, isApex: false, subdomain: 'quotes', expectedCname: 'project.vercel-dns.com', dnsVerified: true, verified: true, sslStatus: 'issued' });
    const status = await checkCustomDomainDnsStatus('quotes.austinroofingpro.com', 'acc_123');
    expect(status).toMatchObject({ isConfigured: true, sslStatus: 'active', dnsRecords: [{ type: 'CNAME', name: 'quotes', value: 'project.vercel-dns.com', status: 'verified' }] });
    expect(status.verifiedAt).toBeDefined();
  });

  it('keeps DNS success separate from a pending certificate', async () => {
    vi.mocked(verifyDomain).mockResolvedValue({ ...pending, dnsVerified: true });
    expect(await checkCustomDomainDnsStatus('austinroofingpro.com', 'acc_123')).toMatchObject({ isConfigured: false, sslStatus: 'pending' });
  });

  it('classifies custom domains and preserves the subdomain route', () => {
    expect(resolveTenantHost('austinroofingpro.com', 'letsgetquoted.com')).toEqual({ kind: 'customDomain', domain: 'austinroofingpro.com' });
    expect(resolveTenantHost('contractor.letsgetquoted.com', 'letsgetquoted.com')).toEqual({ kind: 'subdomain', subdomain: 'contractor' });
  });

  it.each(['letsgetquoted.com', 'www.letsgetquoted.com', 'app.letsgetquoted.com', 'preview-1234.vercel.app', 'localhost'])('protects platform host %s', (domain) => {
    expect(resolveTenantHost(domain, 'letsgetquoted.com').kind).toBe('platform');
  });
});
