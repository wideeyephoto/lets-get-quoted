import { headers } from 'next/headers';
import { cspHeaderName } from '@/lib/csp';

// Deliberately NOT in lib/csp.ts. That module is imported by middleware, which
// runs in the Edge runtime, and next/headers is a server-only API — putting this
// beside buildCsp() would drag it into the middleware bundle.

// The nonce for THIS request, read back out of the CSP header the middleware
// already set.
//
// Next stamps its own <script> tags automatically, so the app looks fully
// covered — but a <script> written by hand in JSX gets nothing, and script-src
// governs EVERY script element, `application/ld+json` included. Measured on the
// running app: 19 of 20 scripts on the homepage carried a nonce, and the one
// that didn't was the structured data.
//
// That matters more than it sounds. JSON-LD failing is silent by construction:
// the page renders perfectly, nothing errors, and the only symptom is Google
// quietly losing the LocalBusiness markup on every published contractor site.
// It would be found weeks later, in the rankings.
//
// Returns undefined rather than throwing when there's no header (a route the
// middleware matcher skips, or a test). React drops an undefined attribute, and
// under report-only that's the status quo either way.
export function cspNonce(): string | undefined {
  try {
    const header = headers().get(cspHeaderName());
    return header?.match(/'nonce-([^']+)'/)?.[1];
  } catch {
    return undefined;
  }
}
