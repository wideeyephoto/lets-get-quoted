import { describe, it, expect } from 'vitest';
import {
  canonicalHostFor,
  isMarketingPath,
  marketingHostFor,
  marketingOrigin,
  needsCanonicalHost,
  normalizeHost,
  resolveTenantHost,
} from '../src/lib/tenant-host';

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

  /**
   * A deployment URL is us, not a contractor. Classified as a customDomain it
   * made the middleware rewrite every request on a preview build to
   * /site-domain/<the vercel host>, which matches no site — so preview
   * deployments answered 404 on every route, marketing pages included.
   *
   * This is the second time it has bitten: the fix landed on another branch on
   * 2026-08-15 and never reached this line, so the subscription rehearsal hit
   * the identical 404 on 2026-08-18.
   */
  it('treats a Vercel deployment URL as the platform', () => {
    expect(resolveTenantHost('lets-get-quoted-git-subscription-rehearsal-lets-get-quoted.vercel.app', ROOT)).toEqual({
      kind: 'platform',
    });
    expect(resolveTenantHost('vercel.app', ROOT)).toEqual({ kind: 'platform' });
    expect(resolveTenantHost('lets-get-quoted.vercel.app:443', ROOT)).toEqual({ kind: 'platform' });
  });

  it('does not reserve a lookalike of the deployment domain', () => {
    // Only a real label boundary counts here too — "notvercel.app" is somebody
    // else's domain and must still resolve as one.
    expect(resolveTenantHost('notvercel.app', ROOT)).toEqual({ kind: 'customDomain', domain: 'notvercel.app' });
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

/**
 * The public site's one address.
 *
 * Every marketing page declares a canonical on the apex and every one of them
 * also answered 200 on app.letsgetquoted.com, with the sitemap listing the app
 * copies. These three functions are what stopped that, and the way they fail is
 * silent in both directions — too narrow and the duplicates stay, too wide and
 * a payment link a contractor handed out gets moved off the host it was issued
 * on.
 */
describe('isMarketingPath', () => {
  it('claims the public site and its subtrees', () => {
    for (const path of [
      '/',
      '/features',
      '/features/website-builder',
      '/how-it-works',
      '/for',
      '/for/plumbers',
      '/pricing',
      '/compare',
      '/compare/jobber-alternative',
      '/tools',
      '/tools/hourly-rate-calculator',
      '/faq',
      '/security',
      '/resources',
      '/resources/how-to-price-a-job',
      '/contact',
      '/founder',
      '/privacy',
      '/terms',
      '/sms-terms',
    ]) {
      expect(isMarketingPath(path), `${path} is the public site`).toBe(true);
    }
  });

  // The ones a contractor hands to a homeowner. They carry their own tokens,
  // work with no session, and may legitimately be opened on any host we serve —
  // moving one is breaking a link somebody already sent.
  it('does NOT claim the public link surfaces or the app', () => {
    for (const path of [
      '/book/acme',
      '/invoice/tok',
      '/pay/tok',
      '/portal/acme',
      '/review/tok',
      '/track/tok',
      '/dashboard',
      '/dashboard/leads',
      '/login',
      '/welcome',
      '/demo',
      '/api/public/leads',
    ]) {
      expect(isMarketingPath(path), `${path} must stay where it is`).toBe(false);
    }
  });

  // A path that merely starts with a listed one is not part of it.
  it('does not let an entry swallow a sibling by prefix', () => {
    expect(isMarketingPath('/foundering')).toBe(false);
    expect(isMarketingPath('/pricing-beta')).toBe(false);
    expect(isMarketingPath('/terms-of-nothing')).toBe(false);
  });
});

describe('marketingHostFor', () => {
  it('moves our own duplicate hosts to the apex', () => {
    expect(marketingHostFor(ROOT, `app.${ROOT}`)).toBe(ROOT);
    expect(marketingHostFor(ROOT, `www.${ROOT}`)).toBe(ROOT);
    expect(marketingHostFor(ROOT, `APP.${ROOT}:443`)).toBe(ROOT);
  });

  it('leaves a request already on the apex', () => {
    expect(marketingHostFor(ROOT, ROOT)).toBeNull();
    expect(marketingHostFor(ROOT, `${ROOT}:443`)).toBeNull();
  });

  // The guard that keeps this from hijacking anything it does not own: a
  // contractor's subdomain, their custom domain, a preview deploy, localhost.
  it('has no opinion about a host that is not ours', () => {
    expect(marketingHostFor(ROOT, `acme.${ROOT}`)).toBeNull();
    expect(marketingHostFor(ROOT, 'acmeplumbing.com')).toBeNull();
    expect(marketingHostFor(ROOT, 'localhost')).toBeNull();
    expect(marketingHostFor(ROOT, 'lgq-git-branch.vercel.app')).toBeNull();
    expect(marketingHostFor(ROOT, null)).toBeNull();
    expect(marketingHostFor('', `app.${ROOT}`)).toBeNull();
  });
});

describe('marketingOrigin', () => {
  it('is the apex, never the app host', () => {
    expect(marketingOrigin(ROOT)).toBe('https://letsgetquoted.com');
    expect(marketingOrigin(' LetsGetQuoted.com ')).toBe('https://letsgetquoted.com');
  });
  it('returns empty rather than a guess when nothing is configured', () => {
    expect(marketingOrigin('')).toBe('');
    expect(marketingOrigin(null)).toBe('');
  });
});
