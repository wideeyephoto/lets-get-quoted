import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { normalizeSupabaseUrl } from '@/lib/supabase-url';

export async function middleware(request: NextRequest) {
  const hostname = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').split(':')[0].toLowerCase();
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'letsgetquoted.com';
  const reservedHosts = new Set([rootDomain, `www.${rootDomain}`, `app.${rootDomain}`]);

  if (request.nextUrl.pathname === '/__debug-host') {
    return new NextResponse(
      JSON.stringify({
        rawHost: request.headers.get('host'),
        xForwardedHost: request.headers.get('x-forwarded-host'),
        computedHostname: hostname,
        rootDomain,
        reservedHosts: Array.from(reservedHosts),
        matchesSubdomainBranch: hostname.endsWith(`.${rootDomain}`) && !reservedHosts.has(hostname),
      }, null, 2),
      { headers: { 'content-type': 'application/json' } }
    );
  }

  if (hostname.endsWith(`.${rootDomain}`) && !reservedHosts.has(hostname)) {
    const subdomain = hostname.slice(0, -(rootDomain.length + 1));
    const publicSiteUrl = request.nextUrl.clone();
    publicSiteUrl.pathname = `/site/${subdomain}`;
    return NextResponse.rewrite(publicSiteUrl);
  }

  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
  if (hostname && !isLocalHost && !reservedHosts.has(hostname)) {
    const customSiteUrl = request.nextUrl.clone();
    customSiteUrl.pathname = `/site-domain/${encodeURIComponent(hostname)}`;
    return NextResponse.rewrite(customSiteUrl);
  }

  let response = NextResponse.next({ request });

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
          response = NextResponse.next({ request });
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

  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
