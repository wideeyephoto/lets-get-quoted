import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { normalizeSupabaseUrl } from '@/lib/supabase-url';
import { buildCsp, cspHeaderName, generateNonce } from '@/lib/csp';

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
  const hostname = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').split(':')[0].toLowerCase();
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';
  const reservedHosts = new Set([rootDomain, `www.${rootDomain}`, `app.${rootDomain}`]);

  if (hostname.endsWith(`.${rootDomain}`) && !reservedHosts.has(hostname)) {
    const subdomain = hostname.slice(0, -(rootDomain.length + 1));
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

  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
  if (hostname && !isLocalHost && !reservedHosts.has(hostname)) {
    const customSiteUrl = request.nextUrl.clone();
    // Preserve sub-paths (e.g. /blog/[slug]); '/' maps to the site-domain index.
    const suffix = request.nextUrl.pathname === '/' ? '' : request.nextUrl.pathname;
    customSiteUrl.pathname = `/site-domain/${encodeURIComponent(hostname)}${suffix}`;
    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete('x-lgq-standalone-site');
    requestHeaders.set('x-lgq-standalone-site', '1');
    requestHeaders.set(cspHeader, csp);
    return applyCsp(NextResponse.rewrite(customSiteUrl, { request: { headers: requestHeaders } }));
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

  return applyCsp(response);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
