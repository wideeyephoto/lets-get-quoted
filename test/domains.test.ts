import { describe, expect, it, vi } from 'vitest';
import { normalizeDomain, parseDomainParts, verifyDomain } from '@/lib/domains';

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

describe('verifyDomain resolution', () => {
  it('verifies CNAME records for subdomains', async () => {
    const result = await verifyDomain('www.mycontractor.com');
    expect(result.verified).toBe(true);
    expect(result.isApex).toBe(false);
    expect(result.expectedCname).toBe('domains.letsgetquoted.com');
    expect(result.sslStatus).toBe('issued');
  });

  it('verifies A-records for root apex domains', async () => {
    const result = await verifyDomain('mycontractor.com');
    expect(result.verified).toBe(true);
    expect(result.isApex).toBe(true);
    expect(result.expectedIp).toBe('76.76.21.21');
    expect(result.sslStatus).toBe('issued');
  });

  it('reports unverified on unmatched DNS records', async () => {
    const result = await verifyDomain('unconfigured-domain.org');
    expect(result.verified).toBe(false);
    expect(result.sslStatus).toBe('unconfigured');
  });
});
