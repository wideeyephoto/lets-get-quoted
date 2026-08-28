import { cspHeaderName } from '@/lib/csp';

declare const __non_webpack_require__: any;

// Deliberately NOT in lib/csp.ts. That module is imported by middleware, which
// runs in the Edge runtime, and next/headers is a server-only API — putting this
// beside buildCsp() would drag it into the middleware bundle.

// The nonce for THIS request, read back out of the CSP header the middleware
// already set.
//
// Returns undefined rather than throwing when there's no header (a route the
// middleware matcher skips, or a test). React drops an undefined attribute, and
// under report-only that's the status quo either way.
export function cspNonce(): string | undefined {
  if (typeof window !== 'undefined') return undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req: any = typeof __non_webpack_require__ !== 'undefined' ? __non_webpack_require__ : eval('require');
    const { headers } = req('next/headers');
    const header = headers().get(cspHeaderName());
    return header?.match(/'nonce-([^']+)'/)?.[1];
  } catch {
    return undefined;
  }
}

