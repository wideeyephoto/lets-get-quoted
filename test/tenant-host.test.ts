import { describe, it, expect } from 'vitest';
import { normalizeHost, resolveTenantHost } from '../src/lib/tenant-host';

const ROOT = 'letsgetquoted.com';

describe('normalizeHost', () => {
  it('strips the port and lowercases', () => {
    expect(normalizeHost('ThisIsIt.LetsGetQuoted.com:3010')).toBe('thisisit.letsgetquoted.com');
  });
  it('survives a missing header', () => {
    expect(normalizeHost(null)).toBe('');
    expect(normalizeHost(undefined)).toBe('');
  });
});

describe('resolveTenantHost', () => {
  it('reads a contractor subdomain', () => {
    expect(resolveTenantHost('thisisit.letsgetquoted.com', ROOT)).toEqual({ kind: 'subdomain', subdomain: 'thisisit' });
  });

  it('treats our own hosts as the platform', () => {
    for (const host of [ROOT, `www.${ROOT}`, `app.${ROOT}`]) {
      expect(resolveTenantHost(host, ROOT)).toEqual({ kind: 'platform' });
    }
  });

  it('reads a custom domain', () => {
    expect(resolveTenantHost('brokepipes.com', ROOT)).toEqual({ kind: 'customDomain', domain: 'brokepipes.com' });
  });

  it('treats local development as the platform, not a custom domain', () => {
    expect(resolveTenantHost('localhost:3010', ROOT)).toEqual({ kind: 'platform' });
    expect(resolveTenantHost('127.0.0.1:3010', ROOT)).toEqual({ kind: 'platform' });
  });

  it('routes a nested label to a subdomain lookup, not the marketing site', () => {
    // Matches what the middleware has always done. The lookup misses and the
    // visitor gets a 404 — better than serving our marketing site on a host
    // inside a contractor's namespace.
    expect(resolveTenantHost('a.b.letsgetquoted.com', ROOT)).toEqual({ kind: 'subdomain', subdomain: 'a.b' });
  });

  it('is the platform when there is no host at all', () => {
    expect(resolveTenantHost('', ROOT)).toEqual({ kind: 'platform' });
    expect(resolveTenantHost(null, ROOT)).toEqual({ kind: 'platform' });
  });

  it('a lookalike suffix is not our subdomain', () => {
    // "notletsgetquoted.com" ends with the root domain as a STRING but is a
    // different domain entirely; only a real label boundary counts.
    expect(resolveTenantHost('notletsgetquoted.com', ROOT)).toEqual({ kind: 'customDomain', domain: 'notletsgetquoted.com' });
  });
});
