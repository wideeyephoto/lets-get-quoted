import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { normalizeSupabaseUrl } from '@/lib/supabase-url';
import { buildCsp, cspHeaderName, generateNonce } from '@/lib/csp';
import { safeNextPath } from '@/lib/app-origin';
import {
  canonicalHostFor,
  isMarketingPath,
  marketingHostFor,
  needsCanonicalHost,
  resolveTenantHost,
} from '@/lib/tenant-host';

export async function middleware(request: NextRequest) {
  // One nonce per request. It goes on the REQUEST headers so Next can read it
  // back out and stamp it onto every script it renders, and on the RESPONSE so
  // the browser enforces (or, for now, reports on) the same policy.
  const nonce = generateNonce();
  let supabaseOrigin: string | null = null;
  try {
    supabaseOrigin = new URL(normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)).origin;
  } catch {
    // Missing or garbled env var — omit the origin rather than emit a broken policy.
  }
  const csp = buildCsp({ nonce, supabaseOrigin });
  const cspHeader = cspHeaderName();
  const applyCsp = <T extends { headers: Headers }>(res: T): T => {
    res.headers.set(cspHeader, csp);
    return res;
  };
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';
  // Shared with the 404 page, which has to reach the same verdict about whose
  // host this is — see lib/tenant-host.
  const tenant = resolveTenantHost(
    request.headers.get('x-forwarded-host') || request.headers.get('host'),
    rootDomain,
  );

  if (tenant.kind === 'subdomain') {
    const subdomain = tenant.subdomain;
    const publicSiteUrl = request.nextUrl.clone();
    // Preserve sub-paths (e.g. /blog/[slug]) so a tenant host serves more than
    // just the homepage; '/' maps to the /site/[subdomain] index route.
    const suffix = request.nextUrl.pathname === '/' ? '' : request.nextUrl.pathname;
    publicSiteUrl.pathname = `/site/${subdomain}${suffix}`;
    // Strip any client-supplied value first — these headers gate internal
    // rendering behavior and must only ever reflect this middleware's own
    // trusted checks, never something an external request could spoof.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete('x-lgq-standalone-site');
    requestHeaders.set('x-lgq-standalone-site', '1');
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('content-security-policy', csp);
    requestHeaders.set(cspHeader, csp);
    return applyCsp(NextResponse.rewrite(publicSiteUrl, { request: { headers: requestHeaders } }));
  }

  if (tenant.kind === 'customDomain') {
    const customSiteUrl = request.nextUrl.clone();
    // Preserve sub-paths (e.g. /blog/[slug]); '/' maps to the site-domain index.
    const suffix = request.nextUrl.pathname === '/' ? '' : request.nextUrl.pathname;
    customSiteUrl.pathname = `/site-domain/${encodeURIComponent(tenant.domain)}${suffix}`;
    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete('x-lgq-standalone-site');
    requestHeaders.set('x-lgq-standalone-site', '1');
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('content-security-policy', csp);
    requestHeaders.set(cspHeader, csp);
    return applyCsp(NextResponse.rewrite(customSiteUrl, { request: { headers: requestHeaders } }));
  }

  // ── One host for anything that carries a session ──────────────────────────
  // Both letsgetquoted.com and app.letsgetquoted.com serve this app, and a
  // session cookie belongs to exactly one of them. Anything that leaves the app
  // and comes back — a QuickBooks callback, a Stripe return, a magic link —
  // arrives at whichever host we configured, and if you signed in on the other
  // one it arrives with no cookie and looks logged out. See needsCanonicalHost.
  //
  // GET and HEAD only. A redirect drops a request body, and every server action
  // in the app is a POST to the page's own URL — bouncing one would silently
  // throw the submission away.
  //
  // The target host comes from our own NEXT_PUBLIC_APP_URL, never from the
  // request. Unset (preview deploys) means no opinion and nothing moves.
  if (request.method === 'GET' || request.method === 'HEAD') {
    const canonical = needsCanonicalHost(request.nextUrl.pathname)
      ? canonicalHostFor(process.env.NEXT_PUBLIC_APP_URL, request.headers.get('x-forwarded-host') || request.headers.get('host'))
      : null;
    if (canonical) {
      const target = new URL(request.nextUrl.pathname + request.nextUrl.search, `https://${canonical}`);
      // 307, not 308: browsers cache a permanent redirect hard, and a canonical
      // host is exactly the kind of decision you want to be able to reverse.
      return applyCsp(NextResponse.redirect(target, 307));
    }
  }

  // The site builder's bare live-preview route renders the raw public
  // template with no dashboard chrome (it's embedded in an iframe) — tag it
  // so the dashboard layout knows to skip the Stripe onboarding banner there.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete('x-lgq-bare-preview');
  requestHeaders.delete('x-lgq-standalone-site');
  if (request.nextUrl.pathname === '/dashboard/sites/preview') {
    requestHeaders.set('x-lgq-bare-preview', '1');
  }
  requestHeaders.set('x-pathname', request.nextUrl.pathname);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);
  requestHeaders.set(cspHeader, csp);

  let response = applyCsp(NextResponse.next({ request: { headers: requestHeaders } }));

  // FAST PATH: If there is no Supabase auth token cookie in the request, the user
  // cannot be signed in, so there is nothing to read and no client worth building.
  // Skips the session read entirely on public marketing pages and bounces
  // unauthenticated dashboard requests immediately.
  const hasAuthCookie = request.cookies.getAll().some(
    (cookie) => cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token')
  );

  let signedIn = false;
  let verifiedSignedIn = false;

  if (hasAuthCookie) {
    const supabase = createServerClient(
      normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );
            response = applyCsp(NextResponse.next({ request: { headers: requestHeaders } }));
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    // ── getSession, NOT getUser ─────────────────────────────────────────────
    // getUser() calls /auth/v1/user over the network EVERY time. This middleware
    // runs on every request the matcher accepts, and that includes the RSC
    // prefetches the App Router fires for the links in the viewport — the sidebar
    // alone has 22 of them — so opening one dashboard page was worth a burst of
    // round trips to Supabase Auth before any of its own data was read.
    //
    // getSession() reads the session out of the cookie and makes NO network call
    // while the access token is still inside its expiry margin. The cookie refresh
    // survives: both entry points go through the same __loadSession(), which calls
    // _callRefreshToken() once the token is near expiry, and the setAll handler
    // above writes the rotated cookies onto the response exactly as before. That
    // refresh is load-bearing — supabase-server.ts cannot write cookies from a
    // Server Component render and relies on this middleware for it.
    //
    // This sits INSIDE the no-cookie fast path above, and the two compose: a
    // request with no auth cookie never builds a client at all, and a request
    // with one is answered from the cookie. Between them the common case costs
    // no round trip to Supabase Auth either way.
    //
    // What is given up is JWT signature verification, and it costs little here
    // because none of the REMAINING decisions below is a security boundary. Each
    // only picks a destination, and every destination re-checks for itself. Both
    // dashboard guards route through verifiedUser() in lib/auth, which checks the
    // ES256 signature against the cached key set.
    //
    // Counted rather than remembered, on 2026-08-29: of the 56 pages under
    // /dashboard, 43 call requireOfficeContext and 11 call requireOwnerContext;
    // the 6 calling neither sit under a layout whose requireDashboardShellContext
    // does. (The claim this replaced said "42 of the 44 pages call
    // requireOwnerContext directly" — written before office seats landed, and
    // wrong in both the count and the function it named.) Server actions call a
    // guard themselves, which is the check that actually matters, since an action
    // is a public endpoint no middleware verdict protects.
    //
    // So a forged cookie buys a redirect to a page that then rejects it. The one
    // exception is /login, where "rejects it" means redirecting back here — which
    // is why that single decision pays to verify, immediately below.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    // Presence only. Reading session.user.<prop> on the server trips supabase-js's
    // "insecure user object" warning proxy, and nothing here needs a claim.
    signedIn = Boolean(session);

    // ── /login is the one redirect here that can close a loop ───────────────
    // getSession() proves the cookie PARSES and has not expired. It verifies no
    // signature, so a corrupt, foreign-project or forged sb-*-auth-token reads
    // as signed in — and every dashboard guard disagrees, because verifiedUser()
    // checks the ES256 signature and sends the visitor to /login. Forwarding
    // them off /login on presence alone makes that /login -> /dashboard ->
    // /login forever, and there is no way out: the sign-in form is the page
    // being redirected away from, and /auth/signout is POST-only so a looping
    // browser can never reach it. On main today getUser() rejects such a token
    // over the network, so this trap is created by the pairing rather than by
    // either change alone.
    //
    // So this ONE decision pays for certainty. getClaims() verifies locally
    // against auth-js's module-scoped JWKS cache, costing no network after the
    // first request in the isolate, and it runs only on /login rather than on
    // every request. Every other decision below stays on presence, where being
    // wrong only picks a destination that re-checks for itself.
    if (signedIn && request.nextUrl.pathname === '/login') {
      const { data: verified, error: verifyError } = await supabase.auth.getClaims();
      verifiedSignedIn = Boolean(!verifyError && verified?.claims?.sub);

      // A token that cannot be verified is dead weight: it will never satisfy a
      // guard, and while the browser keeps presenting it the no-cookie fast path
      // above can never go cold for this visitor. Drop it on the way past.
      if (!verifiedSignedIn) {
        for (const cookie of request.cookies.getAll()) {
          if (cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token')) {
            response.cookies.delete(cookie.name);
          }
        }
      }
    }
  }

  // A signed-in contractor who lands on the marketing homepage wants their
  // workspace, not the sales page — send them straight to the dashboard so the
  // nav, live Leads/Jobs counts and website status are all there immediately,
  // instead of relying on a client-side rail swap on a statically-served page.
  if (signedIn && request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // A signed-in contractor requesting /login (or /login?intent=signup) is already
  // authenticated. Forward them to next, welcome with intent params, or dashboard.
  if (verifiedSignedIn && request.nextUrl.pathname === '/login') {
    const rawNext = request.nextUrl.searchParams.get('next');
    const plan = request.nextUrl.searchParams.get('plan');
    const billing = request.nextUrl.searchParams.get('billing');
    const trade = request.nextUrl.searchParams.get('trade');
    const city = request.nextUrl.searchParams.get('city');

    let destination = '/dashboard';
    const sanitizedNext = rawNext ? safeNextPath(rawNext, '') : '';
    if (sanitizedNext) {
      destination = sanitizedNext;
    } else if (plan || trade || city) {
      const p = new URLSearchParams();
      if (plan) p.set('plan', plan);
      if (billing) p.set('billing', billing);
      if (trade) p.set('trade', trade);
      if (city) p.set('city', city);
      destination = `/welcome?${p.toString()}`;
    }
    return NextResponse.redirect(new URL(destination, request.url));
  }

  // ── One host for the public site ──────────────────────────────────────────
  // The other half of the rule above. Every marketing page answered 200 on both
  // letsgetquoted.com and app.letsgetquoted.com while declaring a canonical on
  // the apex, so search engines were offered two copies of each page and told,
  // in the sitemap, to prefer the copy the pages themselves disowned.
  //
  // 308 rather than the 307 used for session paths, and the difference is the
  // point: that one is reversible policy about where a cookie lives, this one is
  // a statement that the app host is not where the public site is. A temporary
  // redirect tells a crawler to keep both.
  //
  // AFTER the session lookup, and skipped when there is one. A signed-in owner
  // opening Pricing from inside the app would otherwise cross to a host their
  // cookie does not reach and be shown "Build my free site" — the marketing
  // header reads the session client-side, and a session cookie is host-only.
  // Crawlers are never signed in, so they always get the redirect.
  if (!signedIn && (request.method === 'GET' || request.method === 'HEAD') && isMarketingPath(request.nextUrl.pathname)) {
    const apex = marketingHostFor(rootDomain, request.headers.get('x-forwarded-host') || request.headers.get('host'));
    if (apex) {
      const target = new URL(request.nextUrl.pathname + request.nextUrl.search, `https://${apex}`);
      return applyCsp(NextResponse.redirect(target, 308));
    }
  }

  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    if (!signedIn) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // Legacy: the blog list used to open a post in place via ?post=<id>. Editing
  // has its own route now.
  //
  // Forwarded HERE rather than with redirect() inside the page. A redirect
  // thrown during a Server Component's render happens after the shell has begun
  // streaming, so Next finishes the partial tree and then swaps it — which in
  // dev throws "Rendered more hooks than during the previous render" and in
  // production is a visible flash of the wrong page. At this layer it is an
  // ordinary 307 and nothing renders twice.
  if (request.nextUrl.pathname === '/dashboard/marketing/blog') {
    const legacyPost = request.nextUrl.searchParams.get('post')?.trim();
    if (legacyPost) {
      const target = request.nextUrl.clone();
      target.pathname = `/dashboard/marketing/blog/${encodeURIComponent(legacyPost.slice(0, 80))}`;
      target.searchParams.delete('post');
      return applyCsp(NextResponse.redirect(target, 307));
    }
  }

  // Legacy: Calendar used to be its own tab; its function moved into Campaigns.
  if (request.nextUrl.pathname === '/dashboard/marketing/calendar') {
    return applyCsp(
      NextResponse.redirect(new URL('/dashboard/marketing/campaigns#seasonal', request.url), 307)
    );
  }

  if (!signedIn && isMarketingPath(request.nextUrl.pathname)) {
    response.headers.set(
      'Cache-Control',
      'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400'
    );
  }

  return applyCsp(response);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
