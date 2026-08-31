import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { normalizeDomain, parseDomainParts, verifyDomain } from '@/lib/domains';
import * as vercelDomains from '@/lib/vercel-domains';

vi.mock('dns/promises', () => ({
  resolveCname: vi.fn(async (domain: string) => {
    if (domain === 'www.mycontractor.com') return ['domains.letsgetquoted.com'];
    if (domain === 'sub.other.com') return ['domains.letsgetquoted.com.'];
    return [];
  }),
  resolve4: vi.fn(async (domain: string) => {
    if (domain === 'mycontractor.com') return ['76.76.21.21'];
    return [];
  }),
}));

describe('domain normalization and parsing', () => {
  it('normalizes domain strings reliably', () => {
    expect(normalizeDomain('https://www.example.com/')).toBe('www.example.com');
    expect(normalizeDomain('http://EXAMPLE.COM/about')).toBe('example.com');
    expect(normalizeDomain('  sub.mybiz.pro.  ')).toBe('sub.mybiz.pro');
  });

  it('correctly parses apex and subdomains', () => {
    const apex = parseDomainParts('mycontractor.com');
    expect(apex.isApex).toBe(true);
    expect(apex.apexDomain).toBe('mycontractor.com');
    expect(apex.subdomain).toBeNull();

    const sub = parseDomainParts('www.mycontractor.com');
    expect(sub.isApex).toBe(false);
    expect(sub.apexDomain).toBe('mycontractor.com');
    expect(sub.subdomain).toBe('www');
  });

  it('rejects malformed domains', async () => {
    await expect(verifyDomain('')).rejects.toThrow('Enter a valid domain');
    await expect(verifyDomain('not-a-domain')).rejects.toThrow('Enter a valid domain');
  });
});

describe('verifyDomain in unconfigured environment (no Vercel credentials)', () => {
  beforeEach(() => {
    vi.spyOn(vercelDomains, 'isVercelDomainProvisioningConfigured').mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports pending (not issued) when CNAME matches DNS but Vercel is unconfigured', async () => {
    const result = await verifyDomain('www.mycontractor.com');
    expect(result.verified).toBe(true);
    expect(result.isApex).toBe(false);
    expect(result.expectedCname).toBe('domains.letsgetquoted.com');
    expect(result.sslStatus).toBe('pending');
    expect(result.vercelConfigured).toBe(false);
  });

  it('reports pending (not issued) when A-record matches DNS but Vercel is unconfigured', async () => {
    const result = await verifyDomain('mycontractor.com');
    expect(result.verified).toBe(true);
    expect(result.isApex).toBe(true);
    expect(result.expectedIp).toBe('76.76.21.21');
    expect(result.sslStatus).toBe('pending');
    expect(result.vercelConfigured).toBe(false);
  });

  it('reports unverified and unconfigured on unmatched DNS records', async () => {
    const result = await verifyDomain('unconfigured-domain.org');
    expect(result.verified).toBe(false);
    expect(result.sslStatus).toBe('unconfigured');
    expect(result.vercelConfigured).toBe(false);
  });
});

describe('verifyDomain with Vercel API integration configured', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports sslStatus issued when Vercel confirms verified and configured', async () => {
    vi.spyOn(vercelDomains, 'isVercelDomainProvisioningConfigured').mockReturnValue(true);
    vi.spyOn(vercelDomains, 'addDomainToVercel').mockResolvedValue({
      name: 'www.mycontractor.com',
      apexName: 'mycontractor.com',
      projectId: 'prj_123',
      verified: true,
    });
    vi.spyOn(vercelDomains, 'verifyVercelDomain').mockResolvedValue({
      name: 'www.mycontractor.com',
      apexName: 'mycontractor.com',
      projectId: 'prj_123',
      verified: true,
    });
    vi.spyOn(vercelDomains, 'getVercelDomainConfig').mockResolvedValue({
      configured: true,
      misconfigured: false,
      ssl: { status: 'issued' },
    });

    const result = await verifyDomain('www.mycontractor.com');
    expect(result.verified).toBe(true);
    expect(result.sslStatus).toBe('issued');
    expect(result.vercelConfigured).toBe(true);
  });

  it('reports sslStatus pending when Vercel SSL is in progress', async () => {
    vi.spyOn(vercelDomains, 'isVercelDomainProvisioningConfigured').mockReturnValue(true);
    vi.spyOn(vercelDomains, 'addDomainToVercel').mockResolvedValue({
      name: 'www.mycontractor.com',
      apexName: 'mycontractor.com',
      projectId: 'prj_123',
      verified: false,
    });
    vi.spyOn(vercelDomains, 'verifyVercelDomain').mockResolvedValue({
      name: 'www.mycontractor.com',
      apexName: 'mycontractor.com',
      projectId: 'prj_123',
      verified: false,
    });
    vi.spyOn(vercelDomains, 'getVercelDomainConfig').mockResolvedValue({
      configured: false,
      misconfigured: true,
      ssl: { status: 'pending' },
    });

    const result = await verifyDomain('www.mycontractor.com');
    expect(result.verified).toBe(true);
    expect(result.sslStatus).toBe('pending');
    expect(result.vercelConfigured).toBe(true);
  });

  it('falls back to pending (not issued) when Vercel API throws', async () => {
    vi.spyOn(vercelDomains, 'isVercelDomainProvisioningConfigured').mockReturnValue(true);
    vi.spyOn(vercelDomains, 'addDomainToVercel').mockRejectedValue(new Error('Vercel API down'));

    const result = await verifyDomain('www.mycontractor.com');
    expect(result.verified).toBe(true);
    expect(result.sslStatus).toBe('pending');
    expect(result.vercelConfigured).toBe(true);
  });
});
