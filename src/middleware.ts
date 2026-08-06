import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { normalizeSupabaseUrl } from '@/lib/supabase-url';
import { buildCsp, cspHeaderName, generateNonce } from '@/lib/csp';
import { canonicalHostFor, needsCanonicalHost, resolveTenantHost } from '@/lib/tenant-host';

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
  requestHeaders.set(cspHeader, csp);

  let response = applyCsp(NextResponse.next({ request: { headers: requestHeaders } }));

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A signed-in contractor who lands on the marketing homepage wants their
  // workspace, not the sales page — send them straight to the dashboard so the
  // nav, live Leads/Jobs counts and website status are all there immediately,
  // instead of relying on a client-side rail swap on a statically-served page.
  if (user && request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    if (!user) {
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

  return applyCsp(response);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
