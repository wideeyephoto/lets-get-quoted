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
