import { describe, it, expect, vi } from 'vitest';
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
    // Asserts the INTENT — no Supabase entry, and nothing stringified from a
    // missing value — rather than pinning the whole list. Pinning it meant that
    // adding an unrelated endpoint failed this test for a reason that had
    // nothing to do with Supabase.
    expect(connect).toContain("'self'");
    expect(connect.some((v) => v.includes('supabase'))).toBe(false);
    expect(connect.some((v) => v.includes('wss:'))).toBe(false);
    expect(connect.some((v) => v.includes('undefined') || v.includes('null'))).toBe(false);
  });

  /**
   * THE GOOGLE SDK HOSTS ARE NOT A LIST WE CAN KEEP.
   *
   * Enumerating them by hand failed twice in production, and both times the
   * failure was silent:
   *
   *   places.googleapis.com  Places (New) — every address field in the
   *                          dashboard and the Google Business search in the
   *                          builder. Only contacted once somebody types, so
   *                          loading the SDK and importing the library both
   *                          looked clean; enforcement blocked the request and
   *                          the suggestion list just never appeared.
   *   mapsresources-pa.googleapis.com
   *                          Where a Map ID's Cloud style comes from. Every map
   *                          in the app carries a mapId, so blocking it took the
   *                          dark theme off all of them at once — measured side
   *                          by side, the same map came back in Google's default
   *                          light with a vector-map failure in the console.
   *
   * A wildcard rather than a third entry, because the pattern is the finding.
   */
  it('lets the Google SDKs reach any of their own hosts', () => {
    const connect = parse(buildCsp({ nonce: 'n', supabaseOrigin: SUPABASE })).get('connect-src')!;
    expect(connect).toContain('https://*.googleapis.com');

    // The two that have actually broken, spelled out so the reason survives the
    // wildcard. A CSP host wildcard matches any subdomain, at any depth.
    const wildcard = /^https:\/\/\*\.googleapis\.com$/;
    for (const host of [
      'maps.googleapis.com',
      'places.googleapis.com',
      'mapsresources-pa.googleapis.com',
    ]) {
      const covered = connect.some(
        (value) => value === `https://${host}` || (wildcard.test(value) && host.endsWith('.googleapis.com')),
      );
      expect(covered, host).toBe(true);
    }
  });

  /**
   * gstatic serves map TILES, which are images — the SDK never XHRs there, and
   * img-src https: has always covered it. Listed here so a future reader does
   * not "fix" a gap that is not one.
   */
  it('does not widen connect-src to hosts nothing connects to', () => {
    const connect = parse(buildCsp({ nonce: 'n', supabaseOrigin: SUPABASE })).get('connect-src')!;
    expect(connect.some((value) => value.includes('gstatic'))).toBe(false);
  });

  it('never ships unsafe-eval in a production build', () => {
    // Development needs it — Next's Fast Refresh evaluates modules as strings,
    // and without it the dev server throws EvalError on every hot update. It
    // must not follow the code to production, which ships no eval at all.
    try {
      vi.stubEnv('NODE_ENV', 'production');
      expect(buildCsp({ nonce: 'n', supabaseOrigin: SUPABASE })).not.toContain("'unsafe-eval'");
      vi.stubEnv('NODE_ENV', 'development');
      expect(buildCsp({ nonce: 'n', supabaseOrigin: SUPABASE })).toContain("'unsafe-eval'");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('does not permit WebAssembly either, because nothing here compiles any', () => {
    /**
     * This token was added once, on the theory that Google's vector map is a
     * wasm module and this policy was what broke it. Driven on a real GPU with
     * WebAssembly.compile stubbed to throw, the vector map loads anyway; what
     * decides it is whether the browser has usable WebGL, which headless
     * Chromium does not. Nothing else in this app compiles wasm — no .wasm in
     * src or the bundle.
     *
     * So it is asserted absent rather than left unmentioned: the argument for
     * adding it is plausible enough that it will be made again, and this is
     * where to answer it. If something here genuinely needs wasm, change this
     * assertion and name that thing in the message.
     */
    try {
      vi.stubEnv('NODE_ENV', 'production');
      const script = parse(buildCsp({ nonce: 'n', supabaseOrigin: SUPABASE })).get('script-src')!;
      expect(script).not.toContain("'wasm-unsafe-eval'");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('lets analytics and ads tags report home, once consented', () => {
    // script-src needs no entry — the tags are injected by our own nonced
    // bundle, so 'strict-dynamic' covers them. These are only where they SEND.
    const connect = parse(buildCsp({ nonce: 'n', supabaseOrigin: SUPABASE })).get('connect-src')!;
    for (const host of [
      'https://www.googletagmanager.com',
      'https://www.google-analytics.com',
      'https://*.google-analytics.com',
      'https://www.googleadservices.com',
      'https://*.googleadservices.com',
      'https://googleads.g.doubleclick.net',
      'https://*.doubleclick.net',
      'https://www.google.com',
      'https://connect.facebook.net',
      'https://analytics.tiktok.com',
      'https://*.tiktok.com',
    ]) {
      expect(connect).toContain(host);
    }
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

  it('enforces, and the header name follows the flag', () => {
    // Report-only until 2026-08-03, flipped once every third-party the app
    // loads had been enumerated rather than assumed — see the note in lib/csp.
    // The assertion tracks the flag rather than pinning it, so setting
    // CSP_REPORT_ONLY back to true is a one-line revert that doesn't also have
    // to fight a red test.
    expect(typeof CSP_REPORT_ONLY).toBe('boolean');
    expect(cspHeaderName()).toBe(
      CSP_REPORT_ONLY ? 'content-security-policy-report-only' : 'content-security-policy',
    );
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
