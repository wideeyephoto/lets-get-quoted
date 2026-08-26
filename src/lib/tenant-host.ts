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

  // Neither is a Vercel deployment URL, and this one cost a working preview
  // environment. Every build is served from <project>-<hash>.vercel.app, which
  // fell through to customDomain — so the middleware rewrote EVERY request on a
  // preview to /site-domain/<that host>, no site matched, and the whole
  // deployment answered 404. Marketing pages, /login, the dashboard, all of it.
  //
  // Safe to reserve outright: vercel.app is Vercel's own domain and a
  // contractor cannot hold a name under it, so no real custom domain is being
  // shadowed here.
  if (hostname === 'vercel.app' || hostname.endsWith('.vercel.app')) return { kind: 'platform' };

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
  // The Intuit disconnect landing. It renders signed-out too, so it is not a
  // session path in the "you must be logged in" sense — but it tidies up the
  // stored connection when the visitor turns out to BE the owner, and on the
  // wrong host it would arrive with no cookie and silently never do it. Exactly
  // the shape of the callback bug described above, minus the visible bounce.
  '/quickbooks',
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
/**
 * THE PUBLIC SITE, AND ITS ONE ADDRESS.
 *
 * The mirror image of SESSION_PATHS above, and it was wrong in the same way for
 * the opposite reason. Both letsgetquoted.com and app.letsgetquoted.com serve
 * this app, so every marketing page answered on both hosts with a 200 — while
 * each page's own <link rel="canonical"> named the apex. That is duplicate
 * content with the duplicate advertised, and the sitemap made it worse by
 * listing 71 URLs on app.letsgetquoted.com: the file that is supposed to tell a
 * crawler which address is real was naming the other one.
 *
 * Deliberately an allowlist and not "everything that is not the app". The
 * public link surfaces — /book, /invoice, /pay, /portal, /review, /track — carry
 * their own tokens and a contractor may hand them out on any host we serve, so
 * they must not be moved.
 *
 * Every entry here is a route whose metadata already declares a canonical under
 * the apex; '/' is included because the root layout's metadataBase does the same.
 */
const MARKETING_PATHS = [
  '/features',
  '/how-it-works',
  '/for',
  '/pricing',
  '/compare',
  '/tools',
  '/faq',
  '/help',
  '/security',
  '/resources',
  '/contact',
  '/founder',
  '/privacy',
  '/terms',
  '/sms-terms',
];

/** Each entry claims its own path and its subtree — /features has five children. */
export function isMarketingPath(pathname: string): boolean {
  if (pathname === '/') return true;
  return MARKETING_PATHS.some((base) => pathname === base || pathname.startsWith(`${base}/`));
}

/**
 * Where the public site canonically lives — the apex, always.
 *
 * NOT derived from NEXT_PUBLIC_APP_URL, which is the app host and is the whole
 * bug. Read by the sitemap and robots.txt so the URLs they publish are the ones
 * the pages themselves claim.
 */
export function marketingOrigin(rootDomain: string | null | undefined): string {
  const root = String(rootDomain ?? '').trim().toLowerCase();
  return root ? `https://${root}` : '';
}

/**
 * The host a public-site request should be answered on, or null to leave it.
 *
 * Only ever moves a request off one of OUR OWN duplicate hosts — www and app.
 * A preview deploy, a localhost, or a contractor's domain gets no opinion,
 * which is what keeps this from hijacking anything it does not own.
 */
export function marketingHostFor(
  rootDomain: string | null | undefined,
  hostHeader: string | null | undefined,
): string | null {
  const root = String(rootDomain ?? '').trim().toLowerCase();
  const here = normalizeHost(hostHeader);
  if (!root || !here || here === root) return null;
  return here === `www.${root}` || here === `app.${root}` ? root : null;
}

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
