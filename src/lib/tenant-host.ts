// Which contractor (if any) a request's Host header belongs to.
//
// The middleware has classified hosts inline since the beginning. A second
// caller needs the same answer now — the 404 page, which has to know whose site
// the visitor thought they were on — and this is exactly the shape of thing that
// goes wrong when it is written twice: the two tenant route trees drifted apart
// the same way and left /videos and /apple-icon 404ing on custom domains.
//
// Pure, no imports: the middleware runs on the edge runtime.

export type TenantHost =
  | { kind: 'subdomain'; subdomain: string }
  | { kind: 'customDomain'; domain: string }
  | { kind: 'platform' };

/** Strip the port and normalize case, the way a Host header arrives. */
export function normalizeHost(hostHeader: string | null | undefined): string {
  return String(hostHeader ?? '').split(':')[0].trim().toLowerCase();
}

export function resolveTenantHost(hostHeader: string | null | undefined, rootDomain: string): TenantHost {
  const hostname = normalizeHost(hostHeader);
  const root = String(rootDomain ?? '').trim().toLowerCase();
  if (!hostname || !root) return { kind: 'platform' };

  // Ours, not a contractor's: the marketing site and the app itself.
  const reserved = new Set([root, `www.${root}`, `app.${root}`]);
  if (reserved.has(hostname)) return { kind: 'platform' };

  // Any label under the root domain is treated as a subdomain site, INCLUDING a
  // nested one (a.b.letsgetquoted.com -> "a.b"). That looks sloppy and is
  // deliberate: it matches what the middleware has always done, and the
  // alternative — falling through to 'platform' — would serve Let's Get Quoted's
  // marketing site on a host under a contractor's namespace. A lookup miss and a
  // clean 404 is the better failure.
  if (hostname.endsWith(`.${root}`)) {
    const subdomain = hostname.slice(0, -(root.length + 1));
    return subdomain ? { kind: 'subdomain', subdomain } : { kind: 'platform' };
  }

  // Local development is the platform, not somebody's custom domain.
  if (hostname === 'localhost' || hostname === '127.0.0.1') return { kind: 'platform' };

  return { kind: 'customDomain', domain: hostname };
}

/**
 * Paths that only work while you are signed in — and so must live on exactly one
 * host.
 *
 * A session cookie is host-only. Sign in on letsgetquoted.com and you have no
 * session on app.letsgetquoted.com, which is fine right up until something
 * leaves the app and comes back to the OTHER one. QuickBooks did exactly that:
 * Connect was clicked on the apex, Intuit returned the owner to the subdomain
 * because that is what NEXT_PUBLIC_APP_URL says, and the callback arrived with
 * no session and no CSRF-state cookie and bounced to /login. Stripe returns and
 * magic links have the same shape.
 *
 * `/auth` is in here because it is where a magic link lands and mints the
 * cookie: send that to the wrong host and you are signed in on a host you will
 * then navigate away from.
 *
 * The public link surfaces — /book, /invoice, /pay, /portal, /review, /track —
 * are deliberately NOT here. They carry their own tokens, work with no session
 * at all, and a contractor may hand them out on any host we serve.
 */
const SESSION_PATHS = [
  '/dashboard',
  '/admin',
  '/field',
  '/login',
  '/auth',
  '/welcome',
  '/account-suspended',
];

export function needsCanonicalHost(pathname: string): boolean {
  return SESSION_PATHS.some((base) => pathname === base || pathname.startsWith(`${base}/`));
}

/**
 * Where a session-bearing request should actually be served, or null to leave it
 * where it is.
 *
 * `appUrl` is our own configured NEXT_PUBLIC_APP_URL, never a host read off the
 * request — the whole point is to stop trusting whichever host the caller
 * happened to use. Unset or unparseable means "no opinion", which keeps preview
 * deploys and local development working: on localhost the configured host and
 * the request host are the same, so nothing redirects.
 */
export function canonicalHostFor(appUrl: string | undefined | null, hostHeader: string | null | undefined): string | null {
  const configured = String(appUrl ?? '').trim();
  if (!configured) return null;
  let canonical: string;
  try {
    canonical = normalizeHost(new URL(configured).host);
  } catch {
    return null;
  }
  const here = normalizeHost(hostHeader);
  if (!canonical || !here || canonical === here) return null;
  return canonical;
}
