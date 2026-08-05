import { describe, it, expect } from 'vitest';
import { canonicalHostFor, needsCanonicalHost, normalizeHost, resolveTenantHost } from '../src/lib/tenant-host';

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

const APP = `https://app.${ROOT}`;

describe('needsCanonicalHost', () => {
  it('claims every surface that only works signed in', () => {
    for (const path of [
      '/dashboard',
      '/dashboard/settings',
      '/admin/accounts',
      '/field/pay',
      '/login',
      '/auth/callback',
      '/welcome',
      '/account-suspended',
    ]) {
      expect(needsCanonicalHost(path), path).toBe(true);
    }
  });

  it('leaves the public link surfaces alone', () => {
    // These carry their own token, work with no session, and a contractor may
    // have handed the URL out on any host we serve. Moving one would break a
    // link somebody already texted a homeowner.
    for (const path of ['/', '/pricing', '/book/thisisit', '/invoice/abc', '/pay/abc', '/portal', '/review/abc', '/track/abc']) {
      expect(needsCanonicalHost(path), path).toBe(false);
    }
  });

  it('matches on a path segment, not a prefix string', () => {
    // /logins and /fieldwork are not /login and /field.
    expect(needsCanonicalHost('/logins')).toBe(false);
    expect(needsCanonicalHost('/fieldwork/x')).toBe(false);
  });
});

describe('canonicalHostFor', () => {
  it('moves the apex and www onto the configured app host', () => {
    expect(canonicalHostFor(APP, ROOT)).toBe(`app.${ROOT}`);
    expect(canonicalHostFor(APP, `www.${ROOT}`)).toBe(`app.${ROOT}`);
  });

  it('leaves a request that is already on the app host', () => {
    expect(canonicalHostFor(APP, `app.${ROOT}`)).toBeNull();
    expect(canonicalHostFor(APP, `APP.${ROOT}:443`)).toBeNull();
  });

  it('has no opinion in local development', () => {
    // The configured host and the request host are the same once the port is
    // stripped, so nothing redirects and `next dev` is untouched.
    expect(canonicalHostFor('http://localhost:3010', 'localhost:3010')).toBeNull();
  });

  it('has no opinion when nothing is configured', () => {
    // Preview deploys have no NEXT_PUBLIC_APP_URL. Redirecting them to a
    // guessed host would send a reviewer to production.
    expect(canonicalHostFor(undefined, ROOT)).toBeNull();
    expect(canonicalHostFor('', ROOT)).toBeNull();
    expect(canonicalHostFor('   ', ROOT)).toBeNull();
  });

  it('has no opinion when the configured value is not a URL', () => {
    expect(canonicalHostFor('app.letsgetquoted.com', ROOT)).toBeNull();
  });

  it('has no opinion when the request carries no host at all', () => {
    expect(canonicalHostFor(APP, null)).toBeNull();
    expect(canonicalHostFor(APP, '')).toBeNull();
  });
});
