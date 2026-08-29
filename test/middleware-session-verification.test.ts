import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The middleware's session read, and the one place it is not allowed to guess.
 *
 * Nothing in the suite executed a SIGNED-IN request through this middleware
 * before: every existing case builds a cookie-less NextRequest, so only the
 * signed-out branch was ever covered. That is how a redirect loop reachable by
 * anyone holding a stale cookie could be assembled out of two individually
 * correct changes without a single test going red.
 */
const state = vi.hoisted(() => ({
  session: null as unknown,
  claims: null as unknown,
  claimsError: null as unknown,
  getClaimsCalls: 0,
  createClientCalls: 0,
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, _opts: unknown) => {
    state.createClientCalls += 1;
    return {
      auth: {
        getSession: () => Promise.resolve({ data: { session: state.session }, error: null }),
        getClaims: () => {
          state.getClaimsCalls += 1;
          return Promise.resolve({ data: state.claims, error: state.claimsError });
        },
      },
    };
  },
}));

const { middleware } = await import('@/middleware');

const AUTH_COOKIE = 'sb-mfuvvtrkipkigwqqtcal-auth-token';

/** A cookie that PARSES and has not expired — which is all getSession checks. */
function withAuthCookie(url: string, cookieName = AUTH_COOKIE) {
  const req = new NextRequest(url, { headers: { host: 'localhost:3010' } });
  req.cookies.set(cookieName, 'base64-whatever');
  return req;
}

function signedInSession() {
  return { access_token: 'a.b.c', refresh_token: 'r', expires_at: 4102444800 };
}

beforeEach(() => {
  state.session = null;
  state.claims = null;
  state.claimsError = null;
  state.getClaimsCalls = 0;
  state.createClientCalls = 0;
});

describe('the /login forward requires a VERIFIED session, not a present one', () => {
  it('does not bounce a visitor off /login when the token cannot be verified', async () => {
    // The loop, in one test. getSession() accepts the cookie because it parses
    // and has not expired; getClaims() rejects it because the signature is not
    // ours. Every dashboard guard agrees with getClaims and redirects here, so
    // if this redirected onward the visitor could never reach a sign-in form.
    state.session = signedInSession();
    state.claimsError = { name: 'AuthError', message: 'invalid signature' };

    const res = await middleware(withAuthCookie('http://localhost:3010/login'));

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('drops the dead cookie so the no-cookie fast path can go cold again', async () => {
    // While the browser keeps presenting an unverifiable token, hasAuthCookie
    // stays true and every request pays for a client it can never use.
    state.session = signedInSession();
    state.claimsError = { name: 'AuthError', message: 'invalid signature' };

    const res = await middleware(withAuthCookie('http://localhost:3010/login'));

    const setCookie = res.headers.getSetCookie().join('; ');
    expect(setCookie).toContain(AUTH_COOKIE);
    expect(setCookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
  });

  it('still forwards a genuinely signed-in visitor off /login', async () => {
    state.session = signedInSession();
    state.claims = { claims: { sub: 'user-1', email: 'owner@example.com' } };

    const res = await middleware(withAuthCookie('http://localhost:3010/login'));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3010/dashboard');
  });

  it('honors ?next= for a verified visitor', async () => {
    state.session = signedInSession();
    state.claims = { claims: { sub: 'user-1' } };

    const res = await middleware(
      withAuthCookie('http://localhost:3010/login?next=/dashboard/jobs'),
    );

    expect(res.headers.get('location')).toBe('http://localhost:3010/dashboard/jobs');
  });
});

describe('verification is bought only where it is needed', () => {
  it('does not verify on a dashboard request — the guard there re-checks anyway', async () => {
    // The deliberate asymmetry. Presence is enough to pick a destination when
    // that destination verifies for itself; requireOwnerContext does. Paying
    // for a signature check on every request would give this back.
    state.session = signedInSession();

    const res = await middleware(withAuthCookie('http://localhost:3010/dashboard/jobs'));

    expect(state.getClaimsCalls).toBe(0);
    expect(res.status).toBe(200);
  });

  it('bounces a cookie-less dashboard request without building a client at all', async () => {
    const req = new NextRequest('http://localhost:3010/dashboard/jobs', {
      headers: { host: 'localhost:3010' },
    });

    const res = await middleware(req);

    expect(state.createClientCalls).toBe(0);
    expect(state.getClaimsCalls).toBe(0);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3010/login');
  });

  it('treats a chunked auth cookie as present', async () => {
    // supabase-js splits a large session across sb-<ref>-auth-token.0 / .1.
    // A predicate that only matched the unsuffixed name would send a signed-in
    // owner to /login on every request.
    const req = new NextRequest('http://localhost:3010/dashboard', {
      headers: { host: 'localhost:3010' },
    });
    req.cookies.set(`${AUTH_COOKIE}.0`, 'chunk-one');
    state.session = signedInSession();

    const res = await middleware(req);

    expect(state.createClientCalls).toBe(1);
    expect(res.status).toBe(200);
  });
});
