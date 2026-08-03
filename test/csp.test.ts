import { describe, it, expect } from 'vitest';
import { buildCsp, cspHeaderName, generateNonce, CSP_REPORT_ONLY, CSP_REPORT_PATH } from '@/lib/csp';

const parse = (policy: string) => {
  const map = new Map<string, string[]>();
  for (const part of policy.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) map.set(name, values);
  }
  return map;
};

const SUPABASE = 'https://abc123.supabase.co';

describe('buildCsp', () => {
  it('carries the per-request nonce and strict-dynamic on scripts', () => {
    const directives = parse(buildCsp({ nonce: 'TESTNONCE', supabaseOrigin: SUPABASE }));
    const script = directives.get('script-src')!;
    expect(script).toContain("'nonce-TESTNONCE'");
    expect(script).toContain("'strict-dynamic'");
    // The fallback pair for browsers that don't understand the above. Modern
    // browsers ignore both once a nonce is present.
    expect(script).toContain('https:');
    expect(script).toContain("'unsafe-inline'");
  });

  it('lets the browser reach Supabase over https and websocket', () => {
    const connect = parse(buildCsp({ nonce: 'n', supabaseOrigin: SUPABASE })).get('connect-src')!;
    expect(connect).toContain(SUPABASE);
    expect(connect).toContain('wss://abc123.supabase.co');
    expect(connect).toContain("'self'");
  });

  it('omits Supabase rather than emitting a broken directive when the origin is unknown', () => {
    const connect = parse(buildCsp({ nonce: 'n', supabaseOrigin: null })).get('connect-src')!;
    expect(connect).toEqual(["'self'", 'https://maps.googleapis.com']);
    expect(connect.some((v) => v.includes('undefined') || v.includes('null'))).toBe(false);
  });

  it('allows the Google Maps SDK its own fonts and stylesheets', () => {
    // Found by the report-only rollout against a real browser: the Maps SDK pulls
    // stylesheets from fonts.googleapis.com and font files from fonts.gstatic.com.
    // Without these, enforcing would break every map in the app.
    const directives = parse(buildCsp({ nonce: 'n', supabaseOrigin: SUPABASE }));
    expect(directives.get('style-src')).toContain('https://fonts.googleapis.com');
    expect(directives.get('font-src')).toContain('https://fonts.gstatic.com');
  });

  it('allows the Turnstile iframe and keeps framing to our own origin', () => {
    const directives = parse(buildCsp({ nonce: 'n', supabaseOrigin: SUPABASE }));
    expect(directives.get('frame-src')).toContain('https://challenges.cloudflare.com');
    // Preserved from the header this replaces — the builder frames its own preview.
    expect(directives.get('frame-ancestors')).toEqual(["'self'"]);
  });

  it('locks down the directives an injection would reach for', () => {
    const directives = parse(buildCsp({ nonce: 'n', supabaseOrigin: SUPABASE }));
    expect(directives.get('object-src')).toEqual(["'none'"]);
    expect(directives.get('base-uri')).toEqual(["'self'"]);
    expect(directives.get('form-action')).toEqual(["'self'"]);
    expect(directives.get('default-src')).toEqual(["'self'"]);
  });

  it('points violations at the report endpoint', () => {
    expect(buildCsp({ nonce: 'n', supabaseOrigin: SUPABASE })).toContain(`report-uri ${CSP_REPORT_PATH}`);
  });

  it('reports before it enforces', () => {
    // Guards the rollout: this stays report-only until the reports are quiet.
    // Flipping CSP_REPORT_ONLY is what makes the policy real.
    expect(CSP_REPORT_ONLY).toBe(true);
    expect(cspHeaderName()).toBe('content-security-policy-report-only');
  });

  it('declares media-src, so uploaded videos survive the flip', () => {
    // REGRESSION. There was no media-src at all, so it fell back to
    // default-src 'self' and the enforcing policy blocked every uploaded video
    // on every contractor site — hero backdrops and video bands alike. Found by
    // running the enforcing policy against a real contractor site; unfindable by
    // reading the policy, because a missing directive shows up as a silent
    // fallback rather than as anything wrong on the page.
    const policy = buildCsp({ nonce: 'n', supabaseOrigin: SUPABASE });
    expect(policy).toContain('media-src');
    const mediaSrc = policy.split('; ').find((d) => d.startsWith('media-src '))!;
    // Supabase storage is where uploads live; blob: is the builder reading a
    // just-picked file to grab its poster; https: because a contractor may link
    // a clip they host elsewhere, exactly as img-src already allows for photos.
    expect(mediaSrc).toContain("'self'");
    expect(mediaSrc).toContain('blob:');
    expect(mediaSrc).toContain('https:');
  });
});

describe('generateNonce', () => {
  it('produces a fresh base64 nonce each call', () => {
    const nonces = new Set(Array.from({ length: 50 }, () => generateNonce()));
    expect(nonces.size).toBe(50); // no repeats
    for (const nonce of nonces) {
      expect(nonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
      expect(nonce.length).toBeGreaterThanOrEqual(16);
    }
  });

  it('never emits a value that would break out of the quoted directive', () => {
    for (let i = 0; i < 25; i++) {
      const nonce = generateNonce();
      expect(nonce).not.toContain("'");
      expect(nonce).not.toContain(';');
      expect(nonce).not.toContain(' ');
    }
  });
});
