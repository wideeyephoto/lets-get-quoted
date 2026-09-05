import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { normalizeDomain, parseDomainParts, validateCustomDomain, verifyDomain } from '@/lib/domains';
import * as provider from '@/lib/vercel-domains';
import { checkDomainTls } from '@/lib/domain-tls';

const dns = vi.hoisted(() => ({ cname: vi.fn(), ips: vi.fn() }));
vi.mock('dns/promises', () => ({
  Resolver: class { resolveCname = dns.cname; resolve4 = dns.ips; },
}));
vi.mock('@/lib/vercel-domains');
vi.mock('@/lib/domain-tls');
const domain = 'www.mycontractor.com';
const binding = { name: domain, apexName: 'mycontractor.com', projectId: 'prj_123', verified: true };

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  dns.cname.mockResolvedValue(['domains.letsgetquoted.com.']);
  dns.ips.mockResolvedValue(['76.76.21.21']);
  vi.mocked(provider.isVercelDomainProvisioningConfigured).mockReturnValue(true);
  vi.mocked(provider.addDomainToVercel).mockResolvedValue(binding);
  vi.mocked(provider.getProjectDomain).mockResolvedValue(binding);
  vi.mocked(provider.verifyVercelDomain).mockResolvedValue(binding);
  vi.mocked(provider.getVercelDomainConfig).mockResolvedValue({ configured: true, misconfigured: false });
  vi.mocked(checkDomainTls).mockResolvedValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe('domain normalization and parsing', () => {
  it('normalizes URL input and parses apex/subdomains', () => {
    expect(normalizeDomain('https://WWW.Example.com/about')).toBe('www.example.com');
    expect(normalizeDomain('  sub.mybiz.pro. ')).toBe('sub.mybiz.pro');
    expect(parseDomainParts('mycontractor.com')).toMatchObject({ isApex: true, subdomain: null });
    expect(parseDomainParts(domain)).toMatchObject({ isApex: false, subdomain: 'www', apexDomain: 'mycontractor.com' });
  });

  it.each(['', 'not-a-domain', 'user@mycontractor.com', 'mycontractor.com:443', '-bad.com'])('rejects malformed input %s', (value) => {
    expect(() => validateCustomDomain(value)).toThrow('Enter a valid domain');
  });

  it.each(['letsgetquoted.com', 'app.letsgetquoted.com', 'tenant.letsgetquoted.com', 'deployment.vercel.app', 'metadata.google.internal'])('protects reserved host %s from provisioning or cleanup', async (value) => {
    await expect(verifyDomain(value)).rejects.toThrow('Use a domain you own');
    expect(provider.addDomainToVercel).not.toHaveBeenCalled();
  });
});

describe('custom-domain activation', () => {
  it('does not activate matched DNS when provisioning credentials are missing', async () => {
    vi.mocked(provider.isVercelDomainProvisioningConfigured).mockReturnValue(false);
    expect(await verifyDomain(domain)).toMatchObject({ verified: false, dnsVerified: true, sslStatus: 'unconfigured', vercelConfigured: false });
    expect(provider.addDomainToVercel).not.toHaveBeenCalled();
    expect(checkDomainTls).not.toHaveBeenCalled();
  });

  it('activates only after attachment, provider DNS confirmation, and trusted TLS', async () => {
    expect(await verifyDomain(domain)).toMatchObject({ verified: true, dnsVerified: true, sslStatus: 'issued' });
    expect(provider.addDomainToVercel).toHaveBeenCalledWith(domain);
    expect(checkDomainTls).toHaveBeenCalledWith(domain);
    expect(provider.verifyVercelDomain).not.toHaveBeenCalled();
  });

  it('does not interpret DNS eligibility as an issued certificate', async () => {
    vi.mocked(checkDomainTls).mockResolvedValue(false);
    const result = await verifyDomain(domain);
    expect(result).toMatchObject({ verified: false, dnsVerified: true, sslStatus: 'pending' });
    expect(result.message).toContain('secure connection is not available');
  });

  it('rejects provider DNS misconfiguration even when local legacy DNS matches', async () => {
    vi.mocked(provider.getVercelDomainConfig).mockResolvedValue({ configured: false, misconfigured: true });
    expect(await verifyDomain(domain)).toMatchObject({ verified: false, dnsVerified: false, sslStatus: 'pending' });
    expect(checkDomainTls).not.toHaveBeenCalled();
  });

  it('accepts project-specific/flattened DNS and returns current provider recommendations', async () => {
    dns.cname.mockResolvedValue([]);
    dns.ips.mockResolvedValue(['216.198.79.1']);
    vi.mocked(provider.getVercelDomainConfig).mockResolvedValue({ configured: true, misconfigured: false, recommendedCname: 'project.vercel-dns.com', recommendedIp: '216.198.79.1' });
    expect(await verifyDomain(domain)).toMatchObject({ verified: true, expectedCname: 'project.vercel-dns.com', expectedIp: '216.198.79.1' });
  });

  it('returns ownership challenges without activating the domain', async () => {
    const challenge = { type: 'TXT', domain: '_vercel.mycontractor.com', value: 'vc-domain-verify=value' };
    const pending = { ...binding, verified: false, verification: [challenge] };
    vi.mocked(provider.addDomainToVercel).mockResolvedValue(pending);
    vi.mocked(provider.verifyVercelDomain).mockResolvedValue(pending);
    expect(await verifyDomain(domain)).toMatchObject({ verified: false, verification: [challenge], sslStatus: 'pending' });
    expect(checkDomainTls).not.toHaveBeenCalled();
  });

  it('continues provisioning after ownership verification succeeds', async () => {
    vi.mocked(provider.addDomainToVercel).mockResolvedValue({ ...binding, verified: false });
    expect(await verifyDomain(domain)).toMatchObject({ verified: true });
    expect(provider.verifyVercelDomain).toHaveBeenCalledWith(domain);
  });

  it.each(['redirect', 'gitBranch', 'customEnvironmentId'] as const)('rejects a domain bound to %s', async (field) => {
    vi.mocked(provider.addDomainToVercel).mockResolvedValue({ ...binding, [field]: 'other-target' });
    expect(await verifyDomain(domain)).toMatchObject({ verified: false, sslStatus: 'error' });
    expect(checkDomainTls).not.toHaveBeenCalled();
  });

  it.each(['addDomainToVercel', 'getVercelDomainConfig'] as const)('fails closed on %s API errors', async (method) => {
    vi.mocked(provider[method]).mockRejectedValue(new Error('Provider unavailable'));
    expect(await verifyDomain(domain)).toMatchObject({ verified: false, sslStatus: 'error' });
    expect(checkDomainTls).not.toHaveBeenCalled();
  });

  it('fails closed when attachment returns no binding', async () => {
    vi.mocked(provider.addDomainToVercel).mockResolvedValue(null);
    expect(await verifyDomain(domain)).toMatchObject({ verified: false, sslStatus: 'error' });
  });

  it('inspects status without registering or verifying a domain', async () => {
    expect(await verifyDomain(domain, { provision: false })).toMatchObject({ verified: true });
    expect(provider.getProjectDomain).toHaveBeenCalledWith(domain);
    expect(provider.addDomainToVercel).not.toHaveBeenCalled();
    expect(provider.verifyVercelDomain).not.toHaveBeenCalled();
  });

  it('uses the provider apex for multi-label public suffixes', async () => {
    const uk = { ...binding, name: 'quotes.builder.co.uk', apexName: 'builder.co.uk' };
    vi.mocked(provider.addDomainToVercel).mockResolvedValue(uk);
    expect(await verifyDomain(uk.name)).toMatchObject({ apexDomain: 'builder.co.uk', subdomain: 'quotes', isApex: false });
  });
});
