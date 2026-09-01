import { headers } from 'next/headers';
import { cspHeaderName } from '@/lib/csp';

// Deliberately NOT in lib/csp.ts. That module is imported by middleware, which
// runs in the Edge runtime, and next/headers is a server-only API — putting this
// beside buildCsp() would drag it into the middleware bundle.

// The nonce for THIS request, read back out of the CSP header the middleware
// already set.
//
// Returns undefined rather than throwing when there's no header (a route the
// middleware matcher skips, or a test). React drops an undefined attribute, and
// under report-only that's the status quo either way.
export async function cspNonce(): Promise<string | undefined> {
  if (typeof window !== 'undefined') return undefined;
  try {
    const headerList = await headers();
    const xNonce = headerList.get('x-nonce');
    if (xNonce) return xNonce;
    const header = headerList.get(cspHeaderName()) || headerList.get('content-security-policy') || headerList.get('content-security-policy-report-only');
    return header?.match(/'nonce-([^']+)'/)?.[1];
  } catch {
    return undefined;
  }
}
